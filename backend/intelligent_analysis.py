from typing import List, Dict, Optional
import pandas as pd
import numpy as np
from scipy import stats
from sklearn.ensemble import IsolationForest
from statsmodels.tsa.seasonal import STL
from scipy.stats import pearsonr
from statsmodels.stats.multitest import multipletests


class IntelligentAnalyzer:
    """
    Intelligent data analysis engine for automated insights generation.

    Provides:
    - Anomaly detection (z-score, IQR, Isolation Forest)
    - Time-series seasonality detection (STL decomposition)
    - Correlation analysis with statistical significance testing
    - Data profiling and visualization recommendations
    """

    def __init__(self, df: pd.DataFrame, llm_client=None):
        self.df = df
        self.llm = llm_client
        self.numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        self.categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
        self.temporal_cols = self._identify_temporal_columns()

    def analyze_quick_profile(self) -> Dict:
        """Quick analysis for automatic upload insights (< 3 seconds)"""
        return {
            "row_count": len(self.df),
            "column_count": len(self.df.columns),
            "numeric_columns": len(self.numeric_cols),
            "categorical_columns": len(self.categorical_cols),
            "temporal_columns": len(self.temporal_cols),
            "missing_values": self._count_missing_values(),
            "outliers_detected": self._quick_outlier_count(),
            "has_temporal_data": len(self.temporal_cols) > 0
        }

    def detect_anomalies(
        self,
        method: str = 'zscore',
        threshold: float = 3.0
    ) -> List[Dict]:
        """
        Comprehensive anomaly detection.

        Parameters:
        - method: 'zscore' (default) or 'iqr'
        - threshold: z-score threshold (default: 3.0)

        Returns:
        - List of anomaly dictionaries with row_index, column, value, severity

        Note: row_index uses spreadsheet numbering where:
        - Row 1 = header row
        - Row 2 = first data row (DataFrame index 0)
        - Row N = (N-2)th data row in DataFrame
        """
        anomalies = []

        for col in self.numeric_cols:
            data = self.df[col].dropna()
            if len(data) == 0:
                continue

            if method == 'zscore':
                z_scores = np.abs(stats.zscore(data))
                outlier_indices = np.where(z_scores > threshold)[0]

                for idx in outlier_indices:
                    anomalies.append({
                        "row_index": int(data.index[idx]) + 2,  # +2 to match spreadsheet (Row 1=headers, Row 2=first data)
                        "column": col,
                        "value": float(data.iloc[idx]),
                        "zscore": float(z_scores[idx]),
                        "severity": self._classify_severity(z_scores[idx]),
                        "description": f"{col} = {data.iloc[idx]:.2f} ({z_scores[idx]:.2f}σ from mean)"
                    })

            elif method == 'iqr':
                Q1 = data.quantile(0.25)
                Q3 = data.quantile(0.75)
                IQR = Q3 - Q1
                lower_bound = Q1 - 1.5 * IQR
                upper_bound = Q3 + 1.5 * IQR

                outlier_mask = (data < lower_bound) | (data > upper_bound)
                outlier_indices = data[outlier_mask].index

                for idx in outlier_indices:
                    value = data[idx]
                    distance = max(lower_bound - value, value - upper_bound, 0)
                    anomalies.append({
                        "row_index": int(idx) + 2,  # +2 to match spreadsheet (Row 1=headers, Row 2=first data)
                        "column": col,
                        "value": float(value),
                        "iqr_distance": float(distance),
                        "severity": "high" if distance > 3 * IQR else "medium",
                        "description": f"{col} = {value:.2f} (outside IQR bounds)"
                    })

        return sorted(anomalies, key=lambda x: x.get('zscore', 0), reverse=True)

    def detect_seasonality(
        self,
        temporal_col: str,
        value_col: str
    ) -> Optional[Dict]:
        """
        Time-series seasonality detection using STL decomposition.

        Parameters:
        - temporal_col: Date/time column name
        - value_col: Numeric column to analyze

        Returns:
        - Dictionary with seasonality metrics or None if detection fails
        """
        if temporal_col not in self.df.columns or value_col not in self.df.columns:
            return None

        # Prepare time series
        ts_data = self.df[[temporal_col, value_col]].copy()
        try:
            ts_data[temporal_col] = pd.to_datetime(ts_data[temporal_col])
        except:
            return None

        ts_data = ts_data.sort_values(temporal_col).set_index(temporal_col)
        ts_data = ts_data[value_col].dropna()

        if len(ts_data) < 14:  # Minimum data points for STL
            return None

        try:
            # STL decomposition (Seasonal-Trend-Loess)
            stl = STL(ts_data, seasonal=7)  # Assume weekly seasonality
            result = stl.fit()

            # Calculate seasonality strength
            seasonal_var = np.var(result.seasonal)
            residual_var = np.var(result.resid)
            seasonality_strength = seasonal_var / (seasonal_var + residual_var)

            return {
                "temporal_column": temporal_col,
                "value_column": value_col,
                "period": 7,  # Weekly
                "strength": float(seasonality_strength),
                "has_seasonality": seasonality_strength > 0.3,
                "description": self._describe_seasonality(seasonality_strength)
            }
        except Exception as e:
            print(f"Seasonality detection failed: {e}")
            return None

    def identify_correlations(
        self,
        threshold: float = 0.7
    ) -> List[Dict]:
        """
        Find statistically significant correlations.

        Parameters:
        - threshold: Minimum correlation coefficient (default: 0.7)

        Returns:
        - List of correlation dictionaries with statistical significance
        """
        correlations = []

        if len(self.numeric_cols) < 2:
            return correlations

        # Compute all pairwise correlations
        for i, col1 in enumerate(self.numeric_cols):
            for col2 in self.numeric_cols[i+1:]:
                data1 = self.df[col1].dropna()
                data2 = self.df[col2].dropna()

                # Need common indices
                common_idx = data1.index.intersection(data2.index)
                if len(common_idx) < 10:  # Minimum sample size
                    continue

                data1 = self.df.loc[common_idx, col1]
                data2 = self.df.loc[common_idx, col2]

                try:
                    # Pearson correlation + p-value
                    coef, pvalue = pearsonr(data1, data2)

                    # Filter by threshold and significance
                    if abs(coef) >= threshold and pvalue < 0.05:
                        correlations.append({
                            "var1": col1,
                            "var2": col2,
                            "coefficient": float(coef),
                            "pvalue": float(pvalue),
                            "sample_size": len(common_idx),
                            "significance": "high" if pvalue < 0.01 else "moderate"
                        })
                except:
                    continue

        # Apply Bonferroni correction for multiple testing
        if correlations:
            pvalues = [c['pvalue'] for c in correlations]
            try:
                _, corrected_pvalues, _, _ = multipletests(pvalues, method='bonferroni')
                for corr, corrected_p in zip(correlations, corrected_pvalues):
                    corr['corrected_pvalue'] = float(corrected_p)
            except:
                pass

        # Sort by absolute correlation strength
        return sorted(correlations, key=lambda x: abs(x['coefficient']), reverse=True)

    def suggest_visualizations(self) -> List[Dict]:
        """AI-driven chart recommendations based on data profile"""
        suggestions = []

        # Time-series data → line chart
        if self.temporal_cols:
            for temp_col in self.temporal_cols:
                for num_col in self.numeric_cols[:3]:  # Top 3 numeric columns
                    suggestions.append({
                        "chart_type": "line",
                        "x_axis": temp_col,
                        "y_axis": num_col,
                        "reason": f"Temporal trend analysis for {num_col}",
                        "priority": "high"
                    })

        # Categorical + numeric → bar chart
        if self.categorical_cols and self.numeric_cols:
            suggestions.append({
                "chart_type": "bar",
                "x_axis": self.categorical_cols[0],
                "y_axis": self.numeric_cols[0],
                "reason": f"Compare {self.numeric_cols[0]} across {self.categorical_cols[0]}",
                "priority": "medium"
            })

        # Two numeric columns → scatter plot
        if len(self.numeric_cols) >= 2:
            suggestions.append({
                "chart_type": "scatter",
                "x_axis": self.numeric_cols[0],
                "y_axis": self.numeric_cols[1],
                "reason": "Correlation analysis",
                "priority": "medium"
            })

        return suggestions

    def generate_executive_summary(
        self,
        anomalies: List[Dict],
        correlations: List[Dict],
        seasonality: Optional[Dict]
    ) -> str:
        """LLM-generated natural language summary of key findings"""

        summary_data = {
            "total_rows": len(self.df),
            "total_columns": len(self.df.columns),
            "anomaly_count": len(anomalies),
            "correlation_count": len(correlations),
            "has_seasonality": seasonality is not None,
            "seasonality_strength": seasonality.get('strength', 0) if seasonality else 0
        }

        # If LLM is available, generate smart summary
        if self.llm:
            prompt = f"""
            Summarize these data analysis findings in 2-3 sentences:

            Dataset: {summary_data['total_rows']} rows, {summary_data['total_columns']} columns
            Anomalies: {summary_data['anomaly_count']} detected
            Correlations: {summary_data['correlation_count']} strong relationships found
            Seasonality: {"Yes" if summary_data['has_seasonality'] else "No"}

            Focus on actionable insights and business value.
            Be concise and professional.
            """

            try:
                summary = self.llm.generate_content(prompt).text
                return summary.strip()
            except:
                pass

        # Fallback summary
        parts = []
        if summary_data['anomaly_count'] > 0:
            parts.append(f"{summary_data['anomaly_count']} anomalies detected")
        if summary_data['correlation_count'] > 0:
            parts.append(f"{summary_data['correlation_count']} strong correlations found")
        if summary_data['has_seasonality']:
            parts.append("seasonal patterns identified")

        if parts:
            return f"Data analysis complete. {', '.join(parts)}. Review detailed findings below."
        return "Data analysis complete. Review detailed findings below."

    # Helper methods
    def _identify_temporal_columns(self) -> List[str]:
        """Detect date/time columns"""
        temporal = []
        for col in self.df.columns:
            if pd.api.types.is_datetime64_any_dtype(self.df[col]):
                temporal.append(col)
            elif self.df[col].dtype == 'object':
                # Try parsing as datetime
                try:
                    pd.to_datetime(self.df[col].head(10), errors='raise')
                    temporal.append(col)
                except:
                    pass
        return temporal

    def _count_missing_values(self) -> int:
        return int(self.df.isnull().sum().sum())

    def _quick_outlier_count(self) -> int:
        """Fast outlier count using z-score"""
        count = 0
        for col in self.numeric_cols:
            data = self.df[col].dropna()
            if len(data) > 0:
                try:
                    z_scores = np.abs(stats.zscore(data))
                    count += int((z_scores > 3).sum())
                except:
                    pass
        return count

    def _classify_severity(self, zscore: float) -> str:
        """Classify anomaly severity"""
        if abs(zscore) > 5:
            return "critical"
        elif abs(zscore) > 4:
            return "high"
        elif abs(zscore) > 3:
            return "medium"
        else:
            return "low"

    def _describe_seasonality(self, strength: float) -> str:
        if strength > 0.7:
            return "Strong seasonal pattern detected"
        elif strength > 0.5:
            return "Moderate seasonal pattern detected"
        elif strength > 0.3:
            return "Weak seasonal pattern detected"
        else:
            return "No significant seasonality"
