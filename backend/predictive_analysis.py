"""
Predictive Analytics Engine for EDI.ai

Provides automated machine learning predictions with intelligent model selection:
- Time series forecasting (ARIMA, Prophet, Exponential Smoothing)
- Regression predictions (Linear, Ridge, RandomForest, GradientBoosting, XGBoost)
- Classification (Logistic, DecisionTree, RandomForest, GradientBoosting)
- Trend analysis and extrapolation with confidence intervals
"""

from typing import List, Dict, Optional, Tuple
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
import warnings
warnings.filterwarnings('ignore')

from backend.ml_models import (
    ModelSelector,
    ARIMAModel, ProphetModel, ExponentialSmoothingModel,
    LinearRegressionModel, RidgeRegressionModel,
    RandomForestRegressorModel, GradientBoostingRegressorModel, XGBoostRegressorModel,
    LogisticRegressionModel, DecisionTreeClassifierModel,
    RandomForestClassifierModel, GradientBoostingClassifierModel
)


class PredictiveAnalyzer:
    """
    Predictive analytics engine with automatic model selection.

    Provides:
    - Auto-detection of prediction type based on data characteristics
    - Time series forecasting with confidence intervals
    - Regression predictions with feature importance
    - Classification with probability scores
    - Trend analysis and extrapolation
    """

    def __init__(self, df: pd.DataFrame, llm_client=None):
        self.df = df
        self.llm = llm_client
        self.numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        self.categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
        self.temporal_cols = self._identify_temporal_columns()

    def auto_predict(
        self,
        target_column: str,
        prediction_type: str = 'auto',
        periods: int = 10,
        feature_cols: Optional[List[str]] = None
    ) -> Dict:
        """
        Automatically detect data structure and select best prediction approach.

        Parameters:
        - target_column: Column to predict
        - prediction_type: 'auto' | 'forecast' | 'regression' | 'classification' | 'trend'
        - periods: Number of future periods (for time series)
        - feature_cols: Predictor columns (auto-detected if None)

        Returns:
        {
            "prediction_type": str,
            "method": str,  # Best model selected
            "predictions": List[Dict],
            "model_performance": {...},
            "visualization_data": {...},
            "description": str
        }
        """
        print(f"🔮 Auto-predict for target: {target_column}")

        # Auto-detect prediction type if needed
        if prediction_type == 'auto':
            prediction_type = self._detect_prediction_type(target_column)
            print(f"   Detected prediction type: {prediction_type}")

        # Route to appropriate method
        if prediction_type == 'forecast':
            if not self.temporal_cols:
                return {"error": "No temporal column found for forecasting"}
            return self.forecast_timeseries(
                temporal_col=self.temporal_cols[0],
                value_col=target_column,
                periods=periods
            )
        elif prediction_type == 'regression':
            return self.predict_regression(
                target_col=target_column,
                feature_cols=feature_cols
            )
        elif prediction_type == 'classification':
            return self.predict_classification(
                target_col=target_column,
                feature_cols=feature_cols
            )
        elif prediction_type == 'trend':
            if not self.temporal_cols:
                return {"error": "No temporal column found for trend analysis"}
            return self.analyze_trend(
                temporal_col=self.temporal_cols[0],
                value_col=target_column,
                extrapolate_periods=periods
            )
        else:
            return {"error": f"Unknown prediction type: {prediction_type}"}

    def forecast_timeseries(
        self,
        temporal_col: str,
        value_col: str,
        periods: int = 10,
        confidence_level: float = 0.95
    ) -> Dict:
        """
        Time series forecasting with automatic model selection.

        Models tested:
        - ARIMA
        - Prophet
        - Exponential Smoothing

        Returns predictions with confidence intervals and model comparison.
        """
        print(f"📈 Time Series Forecasting: {value_col}")

        # Validate columns
        if temporal_col not in self.df.columns or value_col not in self.df.columns:
            return {"error": f"Columns not found: {temporal_col}, {value_col}"}

        # Prepare time series data
        ts_data = self.df[[temporal_col, value_col]].copy()
        ts_data[temporal_col] = pd.to_datetime(ts_data[temporal_col])
        ts_data = ts_data.sort_values(temporal_col).dropna()

        if len(ts_data) < 30:
            return {"error": f"Insufficient data for forecasting. Need at least 30 points, got {len(ts_data)}"}

        dates = ts_data[temporal_col].values
        values = ts_data[value_col].values

        # Train/test split (80/20)
        split_idx = int(len(values) * 0.8)
        train_dates, test_dates = dates[:split_idx], dates[split_idx:]
        train_values, test_values = values[:split_idx], values[split_idx:]

        print(f"   Data: {len(train_values)} train, {len(test_values)} test")

        # Select models
        models = ModelSelector.select_timeseries_models(len(train_values))
        print(f"   Training {len(models)} models...")

        # Compare models
        results = []
        for model in models:
            try:
                print(f"   - {model.get_name()}...")

                if isinstance(model, ProphetModel):
                    # Prophet needs special handling
                    model.fit(train_dates, train_values)
                    forecast_result = model.predict(periods=len(test_values), freq='D')
                    test_pred = forecast_result['yhat'].tail(len(test_values)).values
                else:
                    # ARIMA and Exponential Smoothing
                    model.fit(None, train_values)
                    test_pred = model.predict(steps=len(test_values))

                # Calculate metrics
                metrics = model.get_metrics(test_values, test_pred)
                results.append({
                    'model': model,
                    'name': model.get_name(),
                    'metrics': metrics,
                    'mape': metrics['mape']
                })
                print(f"      MAPE: {metrics['mape']:.2f}%")

            except Exception as e:
                print(f"      Failed: {e}")
                continue

        if not results:
            return {"error": "All forecasting models failed"}

        # Select best model (lowest MAPE)
        best = min(results, key=lambda x: x['mape'])
        best_model = best['model']
        print(f"✅ Best model: {best['name']} (MAPE: {best['mape']:.2f}%)")

        # Retrain on full dataset and generate forecast
        if isinstance(best_model, ProphetModel):
            best_model.fit(dates, values)
            forecast_result = best_model.predict(periods=periods, freq='D')
            forecast_dates = forecast_result['ds'].tail(periods).values
            forecast_values = forecast_result['yhat'].tail(periods).values
            lower_bounds = forecast_result['yhat_lower'].tail(periods).values
            upper_bounds = forecast_result['yhat_upper'].tail(periods).values
        else:
            best_model.fit(None, values)
            forecast_values = best_model.predict(steps=periods)

            # Estimate confidence intervals (simple approach: ±1.96*std for 95% CI)
            residuals = values[1:] - values[:-1]
            std_error = np.std(residuals)
            z_score = 1.96  # 95% confidence
            lower_bounds = forecast_values - z_score * std_error
            upper_bounds = forecast_values + z_score * std_error

            # Generate future dates
            last_date = pd.to_datetime(dates[-1])
            freq = pd.infer_freq(pd.to_datetime(dates[-10:]))  # Infer from last 10 dates
            if freq is None:
                freq = 'D'  # Default to daily
            forecast_dates = pd.date_range(start=last_date, periods=periods+1, freq=freq)[1:]

        # Format predictions
        predictions = []
        for i in range(periods):
            predictions.append({
                "period": i + 1,
                "timestamp": str(forecast_dates[i]),
                "predicted_value": float(forecast_values[i]),
                "lower_bound": float(lower_bounds[i]),
                "upper_bound": float(upper_bounds[i]),
                "confidence": confidence_level
            })

        # Model performance
        model_performance = {
            "metrics": best['metrics'],
            "models_compared": [
                {"name": r['name'], "score": r['mape']}
                for r in sorted(results, key=lambda x: x['mape'])
            ],
            "selection_reason": f"Selected {best['name']} with best MAPE: {best['mape']:.2f}%"
        }

        # Visualization data
        visualization_data = {
            "historical_dates": [str(d) for d in dates],
            "historical_values": values.tolist(),
            "forecast_dates": [str(d) for d in forecast_dates],
            "forecast_values": forecast_values.tolist(),
            "lower_bound": lower_bounds.tolist(),
            "upper_bound": upper_bounds.tolist()
        }

        return {
            "prediction_type": "forecast",
            "method": best['name'],
            "predictions": predictions,
            "model_performance": model_performance,
            "visualization_data": visualization_data,
            "description": f"{periods}-period forecast using {best['name']} model"
        }

    def predict_regression(
        self,
        target_col: str,
        feature_cols: Optional[List[str]] = None,
        test_size: float = 0.2
    ) -> Dict:
        """
        Regression with automatic model selection.

        Models tested:
        - Linear Regression
        - Ridge Regression
        - Random Forest Regressor
        - Gradient Boosting Regressor
        - XGBoost Regressor

        Returns predictions with feature importance and model comparison.
        """
        print(f"📊 Regression Prediction: {target_col}")

        # Validate target
        if target_col not in self.df.columns:
            return {"error": f"Target column not found: {target_col}"}

        if target_col not in self.numeric_cols:
            return {"error": f"Target column must be numeric: {target_col}"}

        # Auto-select features if not provided
        if feature_cols is None:
            feature_cols = [col for col in self.numeric_cols if col != target_col]
            print(f"   Auto-selected {len(feature_cols)} features")

        if len(feature_cols) == 0:
            return {"error": "No feature columns available"}

        # Prepare data
        df_clean = self.df[[target_col] + feature_cols].dropna()

        if len(df_clean) < 50:
            return {"error": f"Insufficient data for regression. Need at least 50 samples, got {len(df_clean)}"}

        X = df_clean[feature_cols].values
        y = df_clean[target_col].values

        # Train/test split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42
        )

        print(f"   Data: {len(X_train)} train, {len(X_test)} test")
        print(f"   Features: {len(feature_cols)}")

        # Select and compare models
        models = ModelSelector.select_regression_models(len(X_train), len(feature_cols))
        best_model, comparison = ModelSelector.compare_models(
            models, X_train, y_train, X_test, y_test, task_type='regression'
        )

        print(f"✅ {comparison['selection_reason']}")

        # Retrain on full dataset
        best_model.fit(X, y)

        # Generate predictions for all data
        y_pred = best_model.predict(X)
        residuals = y - y_pred

        # Format predictions
        predictions = []
        for i in range(len(df_clean)):
            predictions.append({
                "row_index": int(df_clean.index[i]) + 2,  # +2 for spreadsheet numbering
                "actual": float(y[i]),
                "predicted": float(y_pred[i]),
                "residual": float(residuals[i])
            })

        # Feature importance (if available)
        feature_importance = {}
        if hasattr(best_model, 'get_feature_importance'):
            importance = best_model.get_feature_importance()
            feature_importance = {
                feature_cols[i]: float(importance[i])
                for i in range(len(feature_cols))
            }
            # Sort by importance
            feature_importance = dict(sorted(feature_importance.items(), key=lambda x: x[1], reverse=True))

        # Visualization data
        visualization_data = {
            "actual": y.tolist(),
            "predicted": y_pred.tolist(),
            "feature_importance": feature_importance
        }

        return {
            "prediction_type": "regression",
            "method": comparison['best_model'],
            "predictions": predictions,
            "model_performance": {
                "metrics": comparison['all_results'][0]['metrics'],
                "models_compared": comparison['all_results'],
                "selection_reason": comparison['selection_reason']
            },
            "feature_importance": feature_importance,
            "visualization_data": visualization_data,
            "description": f"Regression prediction using {comparison['best_model']}"
        }

    def predict_classification(
        self,
        target_col: str,
        feature_cols: Optional[List[str]] = None,
        test_size: float = 0.2
    ) -> Dict:
        """
        Classification with automatic model selection.

        Models tested:
        - Logistic Regression
        - Decision Tree
        - Random Forest Classifier
        - Gradient Boosting Classifier

        Returns predictions with probability scores.
        """
        print(f"🎯 Classification Prediction: {target_col}")

        # Validate target
        if target_col not in self.df.columns:
            return {"error": f"Target column not found: {target_col}"}

        # Auto-select features
        if feature_cols is None:
            feature_cols = [col for col in self.numeric_cols if col != target_col]
            print(f"   Auto-selected {len(feature_cols)} features")

        if len(feature_cols) == 0:
            return {"error": "No feature columns available"}

        # Prepare data
        df_clean = self.df[[target_col] + feature_cols].dropna()

        if len(df_clean) < 50:
            return {"error": f"Insufficient data for classification. Need at least 50 samples, got {len(df_clean)}"}

        # Encode target if categorical
        y = df_clean[target_col].values
        label_encoder = None
        if df_clean[target_col].dtype == 'object':
            label_encoder = LabelEncoder()
            y = label_encoder.fit_transform(y)

        X = df_clean[feature_cols].values

        # Check class balance
        unique, counts = np.unique(y, return_counts=True)
        n_classes = len(unique)

        if n_classes < 2:
            return {"error": "Need at least 2 classes for classification"}

        print(f"   Data: {len(df_clean)} samples, {n_classes} classes")
        print(f"   Class distribution: {dict(zip(unique, counts))}")

        # Train/test split (stratified)
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        # Select and compare models
        models = ModelSelector.select_classification_models(len(X_train), n_classes)
        best_model, comparison = ModelSelector.compare_models(
            models, X_train, y_train, X_test, y_test, task_type='classification'
        )

        print(f"✅ {comparison['selection_reason']}")

        # Retrain on full dataset
        best_model.fit(X, y)

        # Generate predictions
        y_pred = best_model.predict(X)
        if hasattr(best_model, 'predict_proba'):
            y_proba = best_model.predict_proba(X)
        else:
            y_proba = None

        # Format predictions
        predictions = []
        for i in range(len(df_clean)):
            pred_dict = {
                "row_index": int(df_clean.index[i]) + 2,
                "actual": int(y[i]) if label_encoder is None else label_encoder.inverse_transform([y[i]])[0],
                "predicted": int(y_pred[i]) if label_encoder is None else label_encoder.inverse_transform([y_pred[i]])[0]
            }

            if y_proba is not None:
                pred_dict["probabilities"] = {
                    f"class_{int(j)}": float(y_proba[i][j])
                    for j in range(n_classes)
                }

            predictions.append(pred_dict)

        return {
            "prediction_type": "classification",
            "method": comparison['best_model'],
            "predictions": predictions,
            "model_performance": {
                "metrics": comparison['all_results'][0]['metrics'],
                "models_compared": comparison['all_results'],
                "selection_reason": comparison['selection_reason']
            },
            "class_distribution": {str(k): int(v) for k, v in zip(unique, counts)},
            "description": f"Classification using {comparison['best_model']}"
        }

    def analyze_trend(
        self,
        temporal_col: str,
        value_col: str,
        extrapolate_periods: int = 10,
        confidence_level: float = 0.95
    ) -> Dict:
        """
        Identify trends and extrapolate with confidence bands.

        Methods:
        - Linear trend fitting
        - Polynomial trend (if non-linear)
        - Confidence interval calculation

        Returns trend coefficients, extrapolated values, and confidence bands.
        """
        print(f"📉 Trend Analysis: {value_col}")

        # Prepare data
        ts_data = self.df[[temporal_col, value_col]].copy()
        ts_data[temporal_col] = pd.to_datetime(ts_data[temporal_col])
        ts_data = ts_data.sort_values(temporal_col).dropna()

        if len(ts_data) < 10:
            return {"error": f"Insufficient data for trend analysis. Need at least 10 points, got {len(ts_data)}"}

        dates = ts_data[temporal_col].values
        values = ts_data[value_col].values

        # Convert dates to numeric (days since first date)
        first_date = pd.to_datetime(dates[0])
        X = np.array([(pd.to_datetime(d) - first_date).days for d in dates])
        y = values

        # Fit linear trend
        from sklearn.linear_model import LinearRegression
        model = LinearRegression()
        model.fit(X.reshape(-1, 1), y)

        # Calculate R² to assess trend strength
        from sklearn.metrics import r2_score
        y_pred = model.predict(X.reshape(-1, 1))
        r2 = r2_score(y, y_pred)

        print(f"   Trend R²: {r2:.3f}")

        # Generate future dates
        last_days = X[-1]
        future_X = np.arange(last_days + 1, last_days + extrapolate_periods + 1)

        # Predict future values
        future_y = model.predict(future_X.reshape(-1, 1))

        # Calculate confidence intervals
        residuals = y - y_pred
        std_error = np.std(residuals)
        z_score = 1.96  # 95% confidence
        margin = z_score * std_error * np.sqrt(1 + 1/len(X))  # Prediction interval

        lower_bounds = future_y - margin
        upper_bounds = future_y + margin

        # Generate future dates
        freq = pd.infer_freq(pd.to_datetime(dates[-10:]))
        if freq is None:
            freq = 'D'
        future_dates = pd.date_range(start=pd.to_datetime(dates[-1]), periods=extrapolate_periods+1, freq=freq)[1:]

        # Format predictions
        predictions = []
        for i in range(extrapolate_periods):
            predictions.append({
                "period": i + 1,
                "timestamp": str(future_dates[i]),
                "trend_value": float(future_y[i]),
                "lower_bound": float(lower_bounds[i]),
                "upper_bound": float(upper_bounds[i]),
                "confidence": confidence_level
            })

        # Trend description
        slope = model.coef_[0]
        trend_direction = "increasing" if slope > 0 else "decreasing"
        trend_strength = "strong" if r2 > 0.7 else "moderate" if r2 > 0.4 else "weak"

        # Visualization data
        visualization_data = {
            "historical_dates": [str(d) for d in dates],
            "historical_values": values.tolist(),
            "trend_line": y_pred.tolist(),
            "forecast_dates": [str(d) for d in future_dates],
            "forecast_values": future_y.tolist(),
            "lower_bound": lower_bounds.tolist(),
            "upper_bound": upper_bounds.tolist()
        }

        return {
            "prediction_type": "trend",
            "method": "Linear Trend Extrapolation",
            "predictions": predictions,
            "model_performance": {
                "metrics": {
                    "r2": float(r2),
                    "slope": float(slope),
                    "intercept": float(model.intercept_)
                },
                "trend_direction": trend_direction,
                "trend_strength": trend_strength
            },
            "visualization_data": visualization_data,
            "description": f"{trend_strength.capitalize()} {trend_direction} trend with R²={r2:.3f}"
        }

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

    def _detect_prediction_type(self, target_col: str) -> str:
        """
        Automatically detect appropriate prediction type.

        Decision tree:
        1. Check if target is numeric or categorical
        2. Check if temporal column exists
        3. Analyze data structure
        """
        target_dtype = self.df[target_col].dtype

        # Classification: categorical target
        if target_dtype in ['object', 'category', 'bool']:
            return 'classification'

        # Check for time series structure
        if self.temporal_cols:
            # If data has temporal column and target is numeric
            temporal_col = self.temporal_cols[0]
            if self._is_timeseries_structured(temporal_col):
                return 'forecast'

        # Regression: numeric target with other features
        if len(self.numeric_cols) > 1:
            return 'regression'

        # Default to trend analysis if temporal data exists
        if self.temporal_cols:
            return 'trend'

        return 'regression'  # Fallback

    def _is_timeseries_structured(self, temporal_col: str) -> bool:
        """Check if data has time series structure (sorted, regular intervals)"""
        try:
            dates = pd.to_datetime(self.df[temporal_col])
            if not dates.is_monotonic_increasing:
                # Try sorting
                dates = dates.sort_values()

            # Check for regular intervals
            intervals = dates.diff().dropna()
            if len(intervals.unique()) <= 3:  # Allow some variation
                return True
        except:
            pass
        return False

    def _parse_time_horizon(self, time_expr: str, reference_date: pd.Timestamp = None) -> Dict:
        """
        Parse natural language time expressions into structured format.

        Args:
            time_expr: Natural language time expression (e.g., "next year", "July 2026")
            reference_date: Reference date for calculations (defaults to now)

        Returns:
            Dict with keys: type, periods, unit, target_date (optional), event (optional)

        Examples:
            "next week" → {type: "relative", periods: 7, unit: "days"}
            "July 2026" → {type: "specific_date", target: "2026-07-01", periods: <calculated>}
            "Q4 2025" → {type: "specific_date", target: "2025-10-01", periods: <calculated>}
            "before holiday season" → {type: "event_based", event: "holiday_season", ...}
        """
        if reference_date is None:
            reference_date = pd.Timestamp.now()

        time_expr_lower = time_expr.lower()

        # Relative expressions (most common)
        if "next week" in time_expr_lower:
            return {"type": "relative", "periods": 7, "unit": "days"}
        elif "next month" in time_expr_lower:
            return {"type": "relative", "periods": 1, "unit": "months"}
        elif "next quarter" in time_expr_lower:
            return {"type": "relative", "periods": 3, "unit": "months"}
        elif "next year" in time_expr_lower:
            return {"type": "relative", "periods": 12, "unit": "months"}

        # Specific dates using dateparser library
        try:
            import dateparser
            parsed_date = dateparser.parse(time_expr, settings={'PREFER_DATES_FROM': 'future'})
            if parsed_date:
                days_diff = (parsed_date - reference_date).days
                return {
                    "type": "specific_date",
                    "target": parsed_date.strftime("%Y-%m-%d"),
                    "periods": max(1, days_diff),
                    "unit": "days"
                }
        except ImportError:
            print("Warning: dateparser not installed, falling back to basic parsing")
        except Exception:
            pass

        # Event-based time mapping (predefined events)
        event_calendar = {
            "holiday season": "11-15",  # November 15
            "summer": "06-01",  # June 1
            "end of year": "12-31",  # December 31
            "spring": "03-01",  # March 1
            "fall": "09-01",  # September 1
            "winter": "12-01"  # December 1
        }

        for event, date_str in event_calendar.items():
            if event in time_expr_lower:
                # Determine year (this year if not passed, next year if passed)
                month_day = date_str.split('-')
                target_month = int(month_day[0])
                year = reference_date.year if reference_date.month <= target_month else reference_date.year + 1
                target_date = pd.Timestamp(f"{year}-{date_str}")
                days_diff = (target_date - reference_date).days
                return {
                    "type": "event_based",
                    "event": event,
                    "target": target_date.strftime("%Y-%m-%d"),
                    "periods": max(1, days_diff),
                    "unit": "days"
                }

        # Default fallback (couldn't parse)
        return {"type": "relative", "periods": 10, "unit": "auto"}

    def conditional_predict(
        self,
        target_column: str,
        conditions: List[Dict],
        condition_logic: str = "AND",
        prediction_type: str = 'auto',
        periods: int = 10
    ) -> Dict:
        """
        Run predictions on filtered subset of data.

        Args:
            target_column: Column to predict
            conditions: List of filter conditions [{column, operator, value}]
            condition_logic: "AND" or "OR" to combine conditions
            prediction_type: Type of prediction (auto/forecast/regression/classification)
            periods: Number of periods to predict

        Supported operators: equals, greater_than, less_than, between, in

        Returns:
            Dict with conditional_prediction, filter_description, prediction_result, comparison_to_full_dataset
        """
        print(f"🔍 Conditional Prediction: {target_column} with {len(conditions)} conditions")

        # Build pandas query string
        query_parts = []
        for cond in conditions:
            col = cond['column']
            op = cond['operator']
            val = cond['value']

            if op == 'equals':
                if isinstance(val, str):
                    query_parts.append(f"`{col}` == '{val}'")
                else:
                    query_parts.append(f"`{col}` == {val}")
            elif op == 'greater_than':
                query_parts.append(f"`{col}` > {val}")
            elif op == 'less_than':
                query_parts.append(f"`{col}` < {val}")
            elif op == 'between':
                query_parts.append(f"(`{col}` >= {val[0]} and `{col}` <= {val[1]})")
            elif op == 'in':
                if isinstance(val[0], str):
                    val_str = ",".join([f"'{v}'" for v in val])
                    query_parts.append(f"`{col}` in [{val_str}]")
                else:
                    query_parts.append(f"`{col}` in {val}")

        # Combine conditions
        join_op = " and " if condition_logic == "AND" else " or "
        query_string = join_op.join(query_parts)

        print(f"   Query: {query_string}")

        # Apply filter
        try:
            filtered_df = self.df.query(query_string)
        except Exception as e:
            return {"error": f"Filter failed: {str(e)}"}

        # Validate sufficient data
        if len(filtered_df) < 30:
            return {"error": f"Filtered data too small: {len(filtered_df)} rows (need ≥30)"}

        print(f"   Filtered: {len(filtered_df)} / {len(self.df)} rows ({len(filtered_df)/len(self.df)*100:.1f}%)")

        # Run prediction on filtered data
        filtered_analyzer = PredictiveAnalyzer(filtered_df, llm_client=self.llm)
        prediction_result = filtered_analyzer.auto_predict(
            target_column=target_column,
            prediction_type=prediction_type,
            periods=periods
        )

        if 'error' in prediction_result:
            return prediction_result

        # Compare to baseline (full dataset)
        baseline_result = self.auto_predict(target_column, prediction_type, periods)
        filtered_avg = np.mean([p.get('predicted_value', 0) for p in prediction_result.get('predictions', [])])
        baseline_avg = np.mean([p.get('predicted_value', 0) for p in baseline_result.get('predictions', [])])
        difference_pct = ((filtered_avg - baseline_avg) / baseline_avg * 100) if baseline_avg != 0 else 0

        return {
            "conditional_prediction": True,
            "filter_description": query_string,
            "filtered_rows": len(filtered_df),
            "total_rows": len(self.df),
            "filter_percentage": len(filtered_df) / len(self.df) * 100,
            "prediction_result": prediction_result,
            "comparison_to_full_dataset": {
                "filtered_avg": float(filtered_avg),
                "full_dataset_avg": float(baseline_avg),
                "difference": f"{'+' if difference_pct > 0 else ''}{difference_pct:.1f}%"
            }
        }

    def predict_multiple_targets(
        self,
        target_columns: List[str],
        prediction_type: str = 'auto',
        periods: int = 10,
        analyze_relationships: bool = True
    ) -> Dict:
        """
        Run predictions for multiple targets simultaneously.

        Args:
            target_columns: List of columns to predict
            prediction_type: Type of prediction to use for all targets
            periods: Number of periods to predict
            analyze_relationships: Whether to calculate correlations between targets

        Returns:
            Dict with targets (results for each), correlations, combined_insights
        """
        from concurrent.futures import ThreadPoolExecutor

        print(f"🎯 Multi-Target Prediction: {len(target_columns)} targets")

        # Validate columns exist
        for col in target_columns:
            if col not in self.df.columns:
                return {"error": f"Column '{col}' not found"}

        # Run predictions in parallel
        def predict_single(target_col):
            try:
                result = self.auto_predict(target_col, prediction_type, periods)
                return (target_col, result)
            except Exception as e:
                return (target_col, {"error": str(e)})

        with ThreadPoolExecutor(max_workers=min(4, len(target_columns))) as executor:
            results = dict(list(executor.map(predict_single, target_columns)))

        # Check for errors
        for col, result in results.items():
            if 'error' in result:
                return {"error": f"Prediction failed for {col}: {result['error']}"}

        # Calculate correlations if requested
        correlations = {}
        if analyze_relationships and len(target_columns) > 1:
            for i, col1 in enumerate(target_columns):
                for col2 in target_columns[i+1:]:
                    if col1 in self.numeric_cols and col2 in self.numeric_cols:
                        try:
                            corr = self.df[[col1, col2]].corr().iloc[0, 1]
                            correlations[(col1, col2)] = float(corr)
                        except:
                            pass

        # Generate combined insights using LLM
        combined_insights = ""
        if self.llm and correlations:
            corr_desc = ", ".join([f"{c1} ↔ {c2}: {v:.2f}" for (c1, c2), v in correlations.items()])
            combined_insights = f"Correlation analysis: {corr_desc}"

        return {
            "multi_target_prediction": True,
            "targets": results,
            "correlations": correlations,
            "combined_insights": combined_insights,
            "prediction_type": prediction_type,
            "periods": periods
        }

    def compare_predictions(
        self,
        target_column: str,
        comparison_dimension: str,
        comparison_values: List[str],
        prediction_type: str = 'auto',
        periods: int = 10
    ) -> Dict:
        """
        Run predictions for multiple entities and compare results.

        Args:
            target_column: Column to predict
            comparison_dimension: Column to split data by (e.g., "product_name")
            comparison_values: Values to compare (e.g., ["Product A", "Product B"])
            prediction_type: Type of prediction
            periods: Number of periods

        Returns:
            Dict with entities (results for each), comparison_metrics, winner
        """
        print(f"🔄 Comparative Prediction: {target_column} across {comparison_dimension}")

        if comparison_dimension not in self.df.columns:
            return {"error": f"Comparison dimension '{comparison_dimension}' not found"}

        entities = {}
        comparison_metrics = {}

        # Run predictions for each entity
        for value in comparison_values:
            filtered_df = self.df[self.df[comparison_dimension] == value]

            if len(filtered_df) < 30:
                return {"error": f"Insufficient data for {value}: {len(filtered_df)} rows"}

            analyzer = PredictiveAnalyzer(filtered_df, llm_client=self.llm)
            result = analyzer.auto_predict(target_column, prediction_type, periods)

            if 'error' in result:
                return {"error": f"Prediction failed for {value}: {result['error']}"}

            entities[value] = result

            # Calculate metrics
            predictions = result.get('predictions', [])
            avg_pred = np.mean([p.get('predicted_value', 0) for p in predictions])
            trend = "increasing" if len(predictions) > 1 and predictions[-1].get('predicted_value', 0) > predictions[0].get('predicted_value', 0) else "stable"

            comparison_metrics[value] = {
                "avg_prediction": float(avg_pred),
                "trend": trend
            }

        # Determine winner (highest average prediction)
        winner = max(comparison_metrics.items(), key=lambda x: x[1]['avg_prediction'])[0]

        return {
            "comparison_type": "entity_comparison",
            "entities": entities,
            "comparison_metrics": comparison_metrics,
            "winner": winner,
            "comparison_dimension": comparison_dimension
        }

    def find_prediction_extremes(
        self,
        target_column: str,
        extremes_type: str = "both",
        periods: int = 12,
        temporal_col: Optional[str] = None
    ) -> Dict:
        """
        Identify peaks and troughs in forecasted values.

        Args:
            target_column: Column to predict
            extremes_type: "maximum", "minimum", or "both"
            periods: Number of periods to forecast
            temporal_col: Optional temporal column (auto-detected if None)

        Returns:
            Dict with peak and/or trough information including timing and values
        """
        print(f"📊 Finding Extremes: {extremes_type} in {target_column} forecasts")

        # Detect temporal column if not provided
        if temporal_col is None and self.temporal_cols:
            temporal_col = self.temporal_cols[0]

        if not temporal_col:
            return {"error": "No temporal column found for extremes analysis"}

        # Run forecast
        result = self.forecast_timeseries(temporal_col, target_column, periods)

        if 'error' in result:
            return result

        predictions = result.get('predictions', [])
        if len(predictions) < 2:
            return {"error": "Insufficient predictions for extremes analysis"}

        values = np.array([p.get('predicted_value', 0) for p in predictions])

        extremes_result = {
            "extremes_type": extremes_type,
            "target_column": target_column,
            "periods_analyzed": len(predictions),
            "forecast_method": result.get('method', 'unknown')
        }

        # Find maximum
        if extremes_type in ["maximum", "both"]:
            max_idx = int(np.argmax(values))
            max_prediction = predictions[max_idx]

            extremes_result["peak"] = {
                "value": float(values[max_idx]),
                "period": max_prediction.get('period', max_idx + 1),
                "period_index": max_idx,
                "confidence_interval": max_prediction.get('confidence_interval', {}),
                "timing_description": self._generate_timing_description(max_idx, len(predictions))
            }

        # Find minimum
        if extremes_type in ["minimum", "both"]:
            min_idx = int(np.argmin(values))
            min_prediction = predictions[min_idx]

            extremes_result["trough"] = {
                "value": float(values[min_idx]),
                "period": min_prediction.get('period', min_idx + 1),
                "period_index": min_idx,
                "confidence_interval": min_prediction.get('confidence_interval', {}),
                "timing_description": self._generate_timing_description(min_idx, len(predictions))
            }

        # Add overall trend analysis
        if len(values) > 1:
            overall_trend = "increasing" if values[-1] > values[0] else "decreasing" if values[-1] < values[0] else "stable"
            volatility = float(np.std(values))

            extremes_result["trend_analysis"] = {
                "overall_direction": overall_trend,
                "volatility": volatility,
                "value_range": {
                    "min": float(np.min(values)),
                    "max": float(np.max(values)),
                    "range": float(np.max(values) - np.min(values))
                }
            }

        return extremes_result

    def _generate_timing_description(self, index: int, total_periods: int) -> str:
        """Generate human-readable timing description for extremes."""
        percentage = (index / total_periods) * 100

        if percentage < 25:
            return "early in forecast period"
        elif percentage < 50:
            return "in first half of forecast"
        elif percentage < 75:
            return "in second half of forecast"
        else:
            return "late in forecast period"

    def whatif_analysis(
        self,
        target_column: str,
        scenarios: List[Dict],
        prediction_type: str = 'auto',
        periods: int = 10
    ) -> Dict:
        """
        Run what-if scenario analysis with modified feature values.

        Args:
            target_column: Column to predict
            scenarios: List of scenarios, each with name and modifications
                Example: [{"name": "20% increase", "modifications": [
                    {"column": "price", "operation": "multiply", "value": 1.2}
                ]}]
            prediction_type: Type of prediction
            periods: Number of periods

        Returns:
            Dict with baseline prediction, scenario results, and comparisons
        """
        print(f"🔮 What-If Analysis: {target_column} with {len(scenarios)} scenario(s)")

        # Run baseline prediction
        baseline_result = self.auto_predict(target_column, prediction_type, periods)

        if 'error' in baseline_result:
            return {"error": f"Baseline prediction failed: {baseline_result['error']}"}

        baseline_predictions = baseline_result.get('predictions', [])
        baseline_avg = np.mean([p.get('predicted_value', 0) for p in baseline_predictions])

        scenario_results = {}
        comparison_metrics = {}

        # Run each scenario
        for scenario in scenarios:
            scenario_name = scenario.get('name', 'Unnamed Scenario')
            modifications = scenario.get('modifications', [])

            # Create modified dataframe
            modified_df = self.df.copy()

            for mod in modifications:
                col = mod.get('column')
                operation = mod.get('operation', 'multiply')
                value = mod.get('value', 1.0)

                if col not in modified_df.columns:
                    return {"error": f"Column '{col}' not found for modification"}

                # Apply modification based on operation
                if operation == 'multiply':
                    modified_df[col] = modified_df[col] * value
                elif operation == 'add':
                    modified_df[col] = modified_df[col] + value
                elif operation == 'set':
                    modified_df[col] = value
                elif operation == 'increase_by_percent':
                    modified_df[col] = modified_df[col] * (1 + value / 100)
                elif operation == 'decrease_by_percent':
                    modified_df[col] = modified_df[col] * (1 - value / 100)
                else:
                    return {"error": f"Unknown operation '{operation}'"}

            # Run prediction on modified data
            analyzer = PredictiveAnalyzer(modified_df, llm_client=self.llm)
            scenario_result = analyzer.auto_predict(target_column, prediction_type, periods)

            if 'error' in scenario_result:
                return {"error": f"Scenario '{scenario_name}' prediction failed: {scenario_result['error']}"}

            scenario_results[scenario_name] = scenario_result

            # Calculate comparison metrics
            scenario_predictions = scenario_result.get('predictions', [])
            scenario_avg = np.mean([p.get('predicted_value', 0) for p in scenario_predictions])

            absolute_change = scenario_avg - baseline_avg
            percent_change = ((scenario_avg - baseline_avg) / baseline_avg * 100) if baseline_avg != 0 else 0

            # Calculate elasticity (% change in output / % change in input)
            input_change_pct = 0
            for mod in modifications:
                if mod.get('operation') in ['increase_by_percent', 'decrease_by_percent']:
                    input_change_pct = abs(mod.get('value', 0))
                elif mod.get('operation') == 'multiply':
                    input_change_pct = abs((mod.get('value', 1) - 1) * 100)

            elasticity = abs(percent_change / input_change_pct) if input_change_pct != 0 else 0

            comparison_metrics[scenario_name] = {
                "scenario_avg": float(scenario_avg),
                "baseline_avg": float(baseline_avg),
                "absolute_change": float(absolute_change),
                "percent_change": float(percent_change),
                "elasticity": float(elasticity),
                "direction": "increase" if absolute_change > 0 else "decrease" if absolute_change < 0 else "no change"
            }

        # Generate insights
        insights = ""
        if self.llm and comparison_metrics:
            most_impactful = max(comparison_metrics.items(), key=lambda x: abs(x[1]['percent_change']))[0]
            insights = f"Most impactful scenario: '{most_impactful}' with {comparison_metrics[most_impactful]['percent_change']:.1f}% change"

        return {
            "whatif_analysis": True,
            "target_column": target_column,
            "baseline_prediction": baseline_result,
            "scenarios": scenario_results,
            "comparison_metrics": comparison_metrics,
            "insights": insights,
            "periods": periods
        }

    def calculate_probability(
        self,
        target_column: str,
        probability_type: str = "class_likelihood",
        specific_class: Optional[str] = None,
        threshold: Optional[float] = None,
        periods: int = 10,
        prediction_type: str = 'auto'
    ) -> Dict:
        """
        Calculate probabilities for predictions.

        Args:
            target_column: Column to predict
            probability_type: "class_likelihood" for classification, "threshold_exceeding" for regression
            specific_class: Specific class for probability calculation (classification only)
            threshold: Threshold value for probability calculation (regression only)
            periods: Number of periods
            prediction_type: Type of prediction

        Returns:
            Dict with probability distributions or threshold probabilities
        """
        print(f"📊 Probability Analysis: {probability_type} for {target_column}")

        # Check if target is categorical or numeric
        is_categorical = self.df[target_column].dtype == 'object' or len(self.df[target_column].unique()) < 20

        if probability_type == "class_likelihood" and is_categorical:
            # Classification probability
            result = self.predict_classification(target_column)

            if 'error' in result:
                return result

            probabilities = result.get('class_probabilities', {})

            if specific_class:
                if specific_class not in probabilities:
                    # Try fuzzy matching
                    import difflib
                    matches = difflib.get_close_matches(specific_class, probabilities.keys(), n=1, cutoff=0.6)
                    if matches:
                        specific_class = matches[0]
                    else:
                        return {"error": f"Class '{specific_class}' not found in predictions"}

                return {
                    "probability_analysis": True,
                    "type": "class_likelihood",
                    "target_column": target_column,
                    "specific_class": specific_class,
                    "probability": float(probabilities.get(specific_class, 0)),
                    "all_probabilities": {k: float(v) for k, v in probabilities.items()},
                    "confidence": "high" if probabilities.get(specific_class, 0) > 0.7 else "medium" if probabilities.get(specific_class, 0) > 0.4 else "low"
                }
            else:
                # Return all class probabilities
                sorted_probs = sorted(probabilities.items(), key=lambda x: x[1], reverse=True)

                return {
                    "probability_analysis": True,
                    "type": "class_likelihood",
                    "target_column": target_column,
                    "probabilities": {k: float(v) for k, v in sorted_probs},
                    "most_likely_class": sorted_probs[0][0] if sorted_probs else None,
                    "confidence": float(sorted_probs[0][1]) if sorted_probs else 0
                }

        elif probability_type == "threshold_exceeding" or not is_categorical:
            # Regression probability using Monte Carlo simulation
            result = self.auto_predict(target_column, prediction_type, periods)

            if 'error' in result:
                return result

            predictions = result.get('predictions', [])
            if not predictions:
                return {"error": "No predictions generated"}

            # Extract predicted values and confidence intervals
            predicted_values = [p.get('predicted_value', 0) for p in predictions]
            avg_prediction = np.mean(predicted_values)

            # If no threshold specified, use mean of historical data
            if threshold is None:
                threshold = float(self.df[target_column].mean())

            # Monte Carlo simulation for probability
            n_simulations = 1000
            confidence_intervals = [p.get('confidence_interval', {}) for p in predictions]

            # Estimate standard deviation from confidence intervals
            std_devs = []
            for ci in confidence_intervals:
                lower = ci.get('lower', avg_prediction)
                upper = ci.get('upper', avg_prediction)
                # 95% CI approximately ±1.96 std
                std_dev = (upper - lower) / (2 * 1.96) if upper != lower else avg_prediction * 0.1
                std_devs.append(std_dev)

            avg_std = np.mean(std_devs) if std_devs else avg_prediction * 0.1

            # Run Monte Carlo simulation
            simulated_values = np.random.normal(avg_prediction, avg_std, n_simulations)
            exceeds_threshold = np.sum(simulated_values > threshold)
            probability_exceeding = float(exceeds_threshold / n_simulations)

            return {
                "probability_analysis": True,
                "type": "threshold_exceeding",
                "target_column": target_column,
                "threshold": float(threshold),
                "avg_prediction": float(avg_prediction),
                "probability_exceeding_threshold": probability_exceeding,
                "probability_below_threshold": 1 - probability_exceeding,
                "simulation_details": {
                    "n_simulations": n_simulations,
                    "estimated_std": float(avg_std),
                    "prediction_range": {
                        "min": float(np.min(simulated_values)),
                        "max": float(np.max(simulated_values)),
                        "median": float(np.median(simulated_values))
                    }
                },
                "confidence": "high" if abs(probability_exceeding - 0.5) > 0.3 else "medium" if abs(probability_exceeding - 0.5) > 0.15 else "low"
            }

        else:
            return {"error": f"Invalid probability_type '{probability_type}' for data type"}
