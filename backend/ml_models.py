"""
Machine Learning Model Wrappers for Predictive Analytics

Provides unified interface for various ML models:
- Time series: ARIMA, Prophet, Exponential Smoothing
- Regression: Linear, Ridge, RandomForest, GradientBoosting, XGBoost
- Classification: Logistic, DecisionTree, RandomForest, GradientBoosting
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple, List, Optional
import numpy as np
import pandas as pd
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
from sklearn.model_selection import cross_val_score
import warnings
warnings.filterwarnings('ignore')


class BaseModel(ABC):
    """Base class for all prediction models"""

    @abstractmethod
    def fit(self, X, y):
        """Train the model"""
        pass

    @abstractmethod
    def predict(self, X) -> np.ndarray:
        """Generate predictions"""
        pass

    @abstractmethod
    def get_metrics(self, X_test, y_test) -> Dict[str, float]:
        """Calculate performance metrics"""
        pass

    @abstractmethod
    def get_name(self) -> str:
        """Return model name"""
        pass


# ========================
# TIME SERIES MODELS
# ========================

class ARIMAModel(BaseModel):
    """ARIMA time series model wrapper"""

    def __init__(self, order=(1, 1, 1)):
        from statsmodels.tsa.arima.model import ARIMA
        self.order = order
        self.model_class = ARIMA
        self.fitted_model = None

    def fit(self, X, y):
        """Fit ARIMA model (X is ignored for univariate time series)"""
        try:
            model = self.model_class(y, order=self.order)
            self.fitted_model = model.fit()
            return self
        except Exception as e:
            print(f"ARIMA fit failed: {e}")
            raise

    def predict(self, steps=10) -> np.ndarray:
        """Forecast future values"""
        if self.fitted_model is None:
            raise ValueError("Model not fitted")
        forecast = self.fitted_model.forecast(steps=steps)
        return np.array(forecast)

    def get_metrics(self, y_test, y_pred) -> Dict[str, float]:
        """Calculate time series metrics"""
        mse = mean_squared_error(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mse)

        # MAPE (Mean Absolute Percentage Error)
        mape = np.mean(np.abs((y_test - y_pred) / (y_test + 1e-10))) * 100

        return {
            'rmse': float(rmse),
            'mae': float(mae),
            'mape': float(mape)
        }

    def get_name(self) -> str:
        return f"ARIMA{self.order}"


class ProphetModel(BaseModel):
    """Facebook Prophet model wrapper"""

    def __init__(self, interval_width=0.95):
        try:
            from prophet import Prophet
            self.model = Prophet(
                yearly_seasonality='auto',
                weekly_seasonality='auto',
                daily_seasonality='auto',
                interval_width=interval_width
            )
            self.fitted = False
        except ImportError:
            raise ImportError("Prophet not installed. Install with: pip install prophet")

    def fit(self, dates, y):
        """Fit Prophet model"""
        # Prophet requires DataFrame with 'ds' and 'y' columns
        df = pd.DataFrame({
            'ds': pd.to_datetime(dates),
            'y': y
        })

        # Silence Prophet's verbose output
        import logging
        logging.getLogger('prophet').setLevel(logging.ERROR)

        self.model.fit(df)
        self.fitted = True
        return self

    def predict(self, periods=10, freq='D') -> pd.DataFrame:
        """Generate forecast"""
        if not self.fitted:
            raise ValueError("Model not fitted")

        future = self.model.make_future_dataframe(periods=periods, freq=freq)
        forecast = self.model.predict(future)
        return forecast

    def get_metrics(self, y_test, y_pred) -> Dict[str, float]:
        """Calculate metrics"""
        mse = mean_squared_error(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        mape = np.mean(np.abs((y_test - y_pred) / (y_test + 1e-10))) * 100

        return {
            'rmse': float(rmse),
            'mae': float(mae),
            'mape': float(mape)
        }

    def get_name(self) -> str:
        return "Prophet"


class ExponentialSmoothingModel(BaseModel):
    """Exponential Smoothing model wrapper"""

    def __init__(self):
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
        self.model_class = ExponentialSmoothing
        self.fitted_model = None

    def fit(self, X, y, seasonal_periods=7):
        """Fit exponential smoothing"""
        try:
            model = self.model_class(
                y,
                seasonal_periods=seasonal_periods,
                trend='add',
                seasonal='add'
            )
            self.fitted_model = model.fit()
            return self
        except:
            # Fallback to simple exponential smoothing
            model = self.model_class(y, trend='add')
            self.fitted_model = model.fit()
            return self

    def predict(self, steps=10) -> np.ndarray:
        """Forecast future values"""
        if self.fitted_model is None:
            raise ValueError("Model not fitted")
        forecast = self.fitted_model.forecast(steps=steps)
        return np.array(forecast)

    def get_metrics(self, y_test, y_pred) -> Dict[str, float]:
        """Calculate metrics"""
        mse = mean_squared_error(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        mape = np.mean(np.abs((y_test - y_pred) / (y_test + 1e-10))) * 100

        return {
            'rmse': float(rmse),
            'mae': float(mae),
            'mape': float(mape)
        }

    def get_name(self) -> str:
        return "Exponential Smoothing"


# ========================
# REGRESSION MODELS
# ========================

class LinearRegressionModel(BaseModel):
    """Linear Regression wrapper"""

    def __init__(self):
        from sklearn.linear_model import LinearRegression
        self.model = LinearRegression()

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    def get_metrics(self, X_test, y_test) -> Dict[str, float]:
        y_pred = self.predict(X_test)
        return {
            'rmse': float(np.sqrt(mean_squared_error(y_test, y_pred))),
            'mae': float(mean_absolute_error(y_test, y_pred)),
            'r2': float(r2_score(y_test, y_pred))
        }

    def get_name(self) -> str:
        return "Linear Regression"


class RidgeRegressionModel(BaseModel):
    """Ridge Regression wrapper"""

    def __init__(self, alpha=1.0):
        from sklearn.linear_model import Ridge
        self.model = Ridge(alpha=alpha)

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    def get_metrics(self, X_test, y_test) -> Dict[str, float]:
        y_pred = self.predict(X_test)
        return {
            'rmse': float(np.sqrt(mean_squared_error(y_test, y_pred))),
            'mae': float(mean_absolute_error(y_test, y_pred)),
            'r2': float(r2_score(y_test, y_pred))
        }

    def get_name(self) -> str:
        return "Ridge Regression"


class RandomForestRegressorModel(BaseModel):
    """Random Forest Regressor wrapper"""

    def __init__(self, n_estimators=100, max_depth=10, random_state=42):
        from sklearn.ensemble import RandomForestRegressor
        self.model = RandomForestRegressor(
            n_estimators=n_estimators,
            max_depth=max_depth,
            random_state=random_state,
            n_jobs=-1
        )

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    def get_metrics(self, X_test, y_test) -> Dict[str, float]:
        y_pred = self.predict(X_test)
        return {
            'rmse': float(np.sqrt(mean_squared_error(y_test, y_pred))),
            'mae': float(mean_absolute_error(y_test, y_pred)),
            'r2': float(r2_score(y_test, y_pred))
        }

    def get_feature_importance(self) -> np.ndarray:
        return self.model.feature_importances_

    def get_name(self) -> str:
        return "Random Forest"


class GradientBoostingRegressorModel(BaseModel):
    """Gradient Boosting Regressor wrapper"""

    def __init__(self, n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42):
        from sklearn.ensemble import GradientBoostingRegressor
        self.model = GradientBoostingRegressor(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            random_state=random_state
        )

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    def get_metrics(self, X_test, y_test) -> Dict[str, float]:
        y_pred = self.predict(X_test)
        return {
            'rmse': float(np.sqrt(mean_squared_error(y_test, y_pred))),
            'mae': float(mean_absolute_error(y_test, y_pred)),
            'r2': float(r2_score(y_test, y_pred))
        }

    def get_name(self) -> str:
        return "Gradient Boosting"


class XGBoostRegressorModel(BaseModel):
    """XGBoost Regressor wrapper"""

    def __init__(self, n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42):
        try:
            from xgboost import XGBRegressor
            self.model = XGBRegressor(
                n_estimators=n_estimators,
                max_depth=max_depth,
                learning_rate=learning_rate,
                random_state=random_state,
                n_jobs=-1
            )
        except ImportError:
            raise ImportError("XGBoost not installed. Install with: pip install xgboost")

    def fit(self, X, y):
        self.model.fit(X, y, verbose=False)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    def get_metrics(self, X_test, y_test) -> Dict[str, float]:
        y_pred = self.predict(X_test)
        return {
            'rmse': float(np.sqrt(mean_squared_error(y_test, y_pred))),
            'mae': float(mean_absolute_error(y_test, y_pred)),
            'r2': float(r2_score(y_test, y_pred))
        }

    def get_name(self) -> str:
        return "XGBoost"


# ========================
# CLASSIFICATION MODELS
# ========================

class LogisticRegressionModel(BaseModel):
    """Logistic Regression wrapper"""

    def __init__(self, max_iter=1000):
        from sklearn.linear_model import LogisticRegression
        self.model = LogisticRegression(max_iter=max_iter, random_state=42)

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    def predict_proba(self, X) -> np.ndarray:
        return self.model.predict_proba(X)

    def get_metrics(self, X_test, y_test) -> Dict[str, float]:
        y_pred = self.predict(X_test)
        y_proba = self.predict_proba(X_test)

        metrics = {
            'accuracy': float(accuracy_score(y_test, y_pred)),
            'f1': float(f1_score(y_test, y_pred, average='weighted'))
        }

        # Add ROC-AUC for binary classification
        if len(np.unique(y_test)) == 2:
            metrics['roc_auc'] = float(roc_auc_score(y_test, y_proba[:, 1]))

        return metrics

    def get_name(self) -> str:
        return "Logistic Regression"


class DecisionTreeClassifierModel(BaseModel):
    """Decision Tree Classifier wrapper"""

    def __init__(self, max_depth=10, random_state=42):
        from sklearn.tree import DecisionTreeClassifier
        self.model = DecisionTreeClassifier(max_depth=max_depth, random_state=random_state)

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    def predict_proba(self, X) -> np.ndarray:
        return self.model.predict_proba(X)

    def get_metrics(self, X_test, y_test) -> Dict[str, float]:
        y_pred = self.predict(X_test)
        return {
            'accuracy': float(accuracy_score(y_test, y_pred)),
            'f1': float(f1_score(y_test, y_pred, average='weighted'))
        }

    def get_name(self) -> str:
        return "Decision Tree"


class RandomForestClassifierModel(BaseModel):
    """Random Forest Classifier wrapper"""

    def __init__(self, n_estimators=100, max_depth=10, random_state=42):
        from sklearn.ensemble import RandomForestClassifier
        self.model = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            random_state=random_state,
            n_jobs=-1
        )

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    def predict_proba(self, X) -> np.ndarray:
        return self.model.predict_proba(X)

    def get_metrics(self, X_test, y_test) -> Dict[str, float]:
        y_pred = self.predict(X_test)
        return {
            'accuracy': float(accuracy_score(y_test, y_pred)),
            'f1': float(f1_score(y_test, y_pred, average='weighted'))
        }

    def get_name(self) -> str:
        return "Random Forest Classifier"


class GradientBoostingClassifierModel(BaseModel):
    """Gradient Boosting Classifier wrapper"""

    def __init__(self, n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42):
        from sklearn.ensemble import GradientBoostingClassifier
        self.model = GradientBoostingClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            random_state=random_state
        )

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    def predict_proba(self, X) -> np.ndarray:
        return self.model.predict_proba(X)

    def get_metrics(self, X_test, y_test) -> Dict[str, float]:
        y_pred = self.predict(X_test)
        return {
            'accuracy': float(accuracy_score(y_test, y_pred)),
            'f1': float(f1_score(y_test, y_pred, average='weighted'))
        }

    def get_name(self) -> str:
        return "Gradient Boosting Classifier"


# ========================
# MODEL SELECTOR
# ========================

class ModelSelector:
    """Automatically select best model based on data characteristics and performance"""

    @staticmethod
    def select_timeseries_models(n_points: int) -> List[BaseModel]:
        """
        Select appropriate time series models based on data size.

        Decision logic:
        - < 50 points: Simple methods (Exponential Smoothing)
        - 50-500 points: ARIMA, Prophet, Exponential Smoothing
        - > 500 points: Prophet (handles large datasets well)
        """
        models = []

        if n_points < 50:
            models.append(ExponentialSmoothingModel())
        elif n_points < 500:
            models.extend([
                ARIMAModel(order=(1, 1, 1)),
                ProphetModel(),
                ExponentialSmoothingModel()
            ])
        else:
            models.extend([
                ProphetModel(),
                ExponentialSmoothingModel()
            ])

        return models

    @staticmethod
    def select_regression_models(n_samples: int, n_features: int) -> List[BaseModel]:
        """
        Select regression models based on dataset size and complexity.

        Decision logic:
        - Small dataset (< 100 rows): Linear, Ridge
        - Medium dataset (100-1000): Linear, Ridge, RandomForest
        - Large dataset (> 1000): All models including XGBoost
        """
        models = [LinearRegressionModel(), RidgeRegressionModel()]

        if n_samples >= 100:
            models.append(RandomForestRegressorModel())

        if n_samples >= 1000:
            models.extend([
                GradientBoostingRegressorModel(),
                XGBoostRegressorModel()
            ])

        return models

    @staticmethod
    def select_classification_models(n_samples: int, n_classes: int) -> List[BaseModel]:
        """
        Select classification models based on dataset size.

        Decision logic:
        - Small dataset: Logistic, DecisionTree
        - Medium dataset: + RandomForest
        - Large dataset: + GradientBoosting
        """
        models = [LogisticRegressionModel(), DecisionTreeClassifierModel()]

        if n_samples >= 100:
            models.append(RandomForestClassifierModel())

        if n_samples >= 1000:
            models.append(GradientBoostingClassifierModel())

        return models

    @staticmethod
    def compare_models(
        models: List[BaseModel],
        X_train,
        y_train,
        X_test,
        y_test,
        task_type: str = 'regression'
    ) -> Tuple[BaseModel, Dict]:
        """
        Train all models and compare performance.

        Parameters:
        - models: List of model instances
        - X_train, y_train: Training data
        - X_test, y_test: Test data
        - task_type: 'regression', 'classification', or 'timeseries'

        Returns: (best_model, comparison_results)
        """
        results = []
        primary_metric = {
            'regression': 'r2',
            'classification': 'f1',
            'timeseries': 'mape'
        }[task_type]

        for model in models:
            try:
                print(f"  Training {model.get_name()}...")

                # Train model
                model.fit(X_train, y_train)

                # Evaluate
                if task_type == 'timeseries':
                    # For time series, y_test is actual and we need predictions
                    y_pred = model.predict(steps=len(y_test))
                    metrics = model.get_metrics(y_test, y_pred)
                else:
                    metrics = model.get_metrics(X_test, y_test)

                # Get primary score
                primary_score = metrics.get(primary_metric, 0)

                results.append({
                    'model': model,
                    'name': model.get_name(),
                    'metrics': metrics,
                    'primary_score': primary_score
                })

                print(f"    {primary_metric.upper()}: {primary_score:.4f}")

            except Exception as e:
                print(f"    Failed: {e}")
                continue

        if not results:
            raise ValueError("All models failed to train")

        # Select best based on primary metric
        # For MAPE (error), lower is better; for others, higher is better
        reverse = (primary_metric != 'mape')
        best = max(results, key=lambda x: x['primary_score']) if reverse else min(results, key=lambda x: x['primary_score'])

        comparison = {
            'best_model': best['name'],
            'best_score': best['primary_score'],
            'all_results': [
                {
                    'name': r['name'],
                    'score': r['primary_score'],
                    'metrics': r['metrics']
                }
                for r in sorted(results, key=lambda x: x['primary_score'], reverse=reverse)
            ],
            'selection_reason': f"Selected {best['name']} with best {primary_metric.upper()}: {best['primary_score']:.4f}"
        }

        return best['model'], comparison
