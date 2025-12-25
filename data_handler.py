import pandas as pd
from sqlalchemy import create_engine
import re
import os
import time
from langchain_community.utilities import SQLDatabase
import numpy as np

class DataHandler:
    def __init__(self):
        self.df = None
        self.engine = None
        self.db_sqlalchemy = None  # This will be the SQLDatabase object from Langchain
        self.column_mapping = None
        self._raw_filepath = None  # Store the full original filepath
        self._display_filename = None # Store a user-friendly name (e.g., just the file's name)


    def clean_column_name(self, name):
        # Keep original column names without cleaning
        return name.strip()

    def check_data_consistency(self, series):
        issues = []
        dtype = series.dtype
        column_name = series.name

        if dtype in ['int64', 'float64']:
            non_numeric = series[pd.to_numeric(series, errors='coerce').isna() & series.notna()]
            if len(non_numeric) > 0:
                issues.append(f"Found {len(non_numeric)} non-numeric values in numeric column '{column_name}'")
            else:
                issues.append(f"No non-numeric values found in numeric column '{column_name}'")
        elif dtype == 'object' and series.astype(str).str.match(r'\d{4}-\d{2}-\d{2}').any(): # Ensure series is string for match
            # Attempt to convert to datetime to check validity more robustly
            parsed_dates = pd.to_datetime(series, errors='coerce')
            invalid_dates_count = series.notna().sum() - parsed_dates.notna().sum()
            if invalid_dates_count > 0:
                 issues.append(f"Found {invalid_dates_count} potentially invalid date formats in column '{column_name}'")
            else:
                 issues.append(f"No invalid date formats found in column '{column_name}'")

            if parsed_dates.notna().any(): # Check date range only if there are valid dates
                min_date, max_date = parsed_dates.min(), parsed_dates.max()
                if min_date < pd.Timestamp('1900-01-01') or max_date > pd.Timestamp.now() + pd.Timedelta(days=1): # Allow for today
                    issues.append(f"Date range ({min_date.date()} to {max_date.date()}) in column '{column_name}' includes potentially incorrect dates")
                else:
                    issues.append(f"Date range in column '{column_name}' appears valid")
        elif dtype == 'object':
            unique_values = series.nunique()
            if unique_values < 10 and unique_values > 0:
                unexpected_values = series[~series.isin(series.value_counts().nlargest(10).index) & series.notna()]
                if len(unexpected_values) > 0:
                    issues.append(f"Found {len(unexpected_values)} potential outliers in categorical data in column '{column_name}'")
                else:
                    issues.append(f"No potential outliers found in categorical data in column '{column_name}'")
            elif unique_values > 0 : # Avoid message for empty columns
                issues.append(f"Column '{column_name}' has {unique_values} unique values (not treated as low-cardinality categorical)")

        if not issues and series.notna().any(): # Add general message if no specific checks fired and column has data
            issues.append(f"No specific consistency issues detected for column '{column_name}' of type {dtype}")
        elif not series.notna().any():
            issues.append(f"Column '{column_name}' is empty.")
            
        return issues

    def generate_data_preview(self):
        if self.df is None:
            return "No data loaded to generate preview."

        preview_info = "Data Preview:\n\n"
        preview_info += f"Shape: {self.df.shape[0]} rows, {self.df.shape[1]} columns\n\n"
        
        preview_info += "Data Types:\n"
        for col, dtype in self.df.dtypes.items():
            preview_info += f"{col}: {dtype}\n"
        preview_info += "\n"

        missing_values = self.df.isnull().sum()
        if missing_values.sum() > 0:
            preview_info += "Missing Values:\n"
            for col, count in missing_values[missing_values > 0].items():
                preview_info += f"{col}: {count} ({(count/len(self.df)*100):.2f}%)\n"
        else:
            preview_info += "No missing values found.\n"
        preview_info += "\n"

        preview_info += "Data Consistency Checks:\n"
        for col in self.df.columns:
            consistency_issues = self.check_data_consistency(self.df[col])
            if consistency_issues:
                preview_info += f"{col}:\n"
                for issue in consistency_issues:
                    preview_info += f"  - {issue}\n"
        return preview_info

    def load_data(self, file_path_str, progress_callback):
        try:
            progress_callback(0.1, "Starting file load...")
            
            if not isinstance(file_path_str, str):
                progress_callback(1.0, "Failed! Invalid file path provided.")
                return "Invalid file path provided to DataHandler.", None
            
            self._raw_filepath = file_path_str
            self._display_filename = os.path.basename(file_path_str)

            print(f"DEBUG: Loading file: {self._display_filename}")

            if self._display_filename.lower().endswith('.xlsx'):
                self.df = pd.read_excel(self._raw_filepath, keep_default_na=True, na_values=['', ' ', None])
            elif self._display_filename.lower().endswith('.csv'):
                self.df = pd.read_csv(self._raw_filepath, keep_default_na=True, na_values=['', ' ', None])
            else:
                progress_callback(1.0, "Failed! Unsupported file format.")
                return "Unsupported file format. Please upload an Excel (.xlsx) or CSV file.", None

            print(f"DEBUG: Initial DataFrame shape: {self.df.shape}")
            print("DEBUG: Initial missing values:")
            for col in self.df.columns:
                missing = self.df[col].isnull().sum()
                print(f"  {col}: {missing} missing values")
            
            # Convert empty strings and whitespace to NaN
            self.df = self.df.replace(r'^\s*$', np.nan, regex=True)

            # Convert NaN values to None for consistent handling
            self.df = self.df.replace({np.nan: None})
            
            print("DEBUG: After whitespace and NaN conversion, missing values:")
            for col in self.df.columns:
                missing = self.df[col].isnull().sum()
                print(f"  {col}: {missing} missing values")
            
            progress_callback(0.3, f"Processing column names for {self._display_filename}...")
            original_columns = self.df.columns.tolist()
            # Keep original column names without cleaning
            self.column_mapping = {col: col.strip() for col in original_columns}
            self.df.columns = [col.strip() for col in original_columns]

            progress_callback(0.5, "Creating database...")
            db_file_name = f"temp_db_{re.sub(r'[^a-zA-Z0-9]', '_', self._display_filename)}.db"
            self.engine = create_engine(f'sqlite:///{db_file_name}', connect_args={'check_same_thread': False})
            self.df.to_sql('data', self.engine, index=False, if_exists='replace')
            
            self.db_sqlalchemy = SQLDatabase(self.engine) 

            progress_callback(0.9, "Generating data preview...")
            preview_info = self.generate_data_preview()
            
            response = f"File loaded successfully: {self._display_filename}.\nDatabase created.\n\n{preview_info}"
            progress_callback(1.0, "Complete!")
            return response, self.df.copy() 

        except Exception as e:
            print(f"DEBUG: Error loading data: {str(e)}")
            self.df = self.engine = self.db_sqlalchemy = self.column_mapping = None
            self._raw_filepath = self._display_filename = None
            error_message = f"Error loading data: {str(e)}"
            progress_callback(1.0, "Failed!")
            return error_message, None

    def export_data(self, file_format):
        if self.df is None:
            return "No data available to export. Please load a file first."
        try:
            export_dir = "data_exports"
            os.makedirs(export_dir, exist_ok=True)
            timestamp = time.strftime("%Y%m%d-%H%M%S")
            # Use display_filename for a cleaner exported name if available
            base_export_name = re.sub(r'\.[^.]*$', '', self._display_filename) if self._display_filename else "exported_data"
            filename = f"{base_export_name}_{timestamp}"


            if file_format.lower() == 'csv':
                filepath = os.path.join(export_dir, f"{filename}.csv")
                self.df.to_csv(filepath, index=False)
            elif file_format.lower() == 'excel':
                filepath = os.path.join(export_dir, f"{filename}.xlsx")
                self.df.to_excel(filepath, index=False)
            else:
                return f"Unsupported file format: {file_format}. Please choose 'csv' or 'excel'."
            return f"Data exported successfully to {filepath}"
        except Exception as e:
            return f"Error exporting data: {str(e)}"

    def update_df_and_db(self, new_df):
        print("DEBUG: Updating DataFrame and database")
        print(f"DEBUG: New DataFrame shape: {new_df.shape}")
        print("DEBUG: Missing values before conversion:")
        for col in new_df.columns:
            missing = new_df[col].isnull().sum()
            print(f"  {col}: {missing} missing values")
        
        # Convert empty strings and whitespace to NaN
        new_df = new_df.replace(r'^\s*$', np.nan, regex=True)
        
        # Convert NaN values to None for consistent handling
        new_df = new_df.replace({np.nan: None})
        
        print("DEBUG: Missing values after whitespace and NaN conversion:")
        for col in new_df.columns:
            missing = new_df[col].isnull().sum()
            print(f"  {col}: {missing} missing values")
        
        self.df = new_df
        
        # Create database engine if it doesn't exist
        if not self.engine:
            # Use a temporary database name for synthetic data if no filename is set
            if not self._display_filename:
                self._display_filename = f"synthetic_dataset_{int(time.time())}"
            
            db_file_name = f"temp_db_{self._display_filename.replace('.', '_').replace(' ', '_')}.db"
            print(f"DEBUG: Creating new database engine for: {db_file_name}")
            self.engine = create_engine(f'sqlite:///{db_file_name}', connect_args={'check_same_thread': False})
        
        # Update the SQL database
        self.df.to_sql('data', self.engine, index=False, if_exists='replace')
        
        # Reinitialize the SQLAlchemy database object for LangChain
        try:
            self.db_sqlalchemy = SQLDatabase(self.engine)
            print("DEBUG: Successfully reinitialized SQLAlchemy database object")
        except Exception as e:
            print(f"DEBUG: Error reinitializing SQLAlchemy database object: {str(e)}")
            self.db_sqlalchemy = None
        
        # Update column mapping to reflect any new columns
        if self.df is not None:
            self.column_mapping = {col: col.strip() for col in self.df.columns}
            print(f"DEBUG: Updated column mapping: {self.column_mapping}")


    def get_df(self):
        return self.df.copy() if self.df is not None else None 
    
    def update_df(self, new_df):
        """
        Update the stored dataframe with new data and sync with database.
        
        Args:
            new_df: pandas DataFrame with updated data
        """
        if new_df is not None:
            self.df = new_df.copy()
            # Update the SQLite database
            if self.engine:
                self.df.to_sql('data', self.engine, index=False, if_exists='replace')
                # Refresh the SQLDatabase object
                self.db_sqlalchemy = SQLDatabase(self.engine) 

    def get_db_sqlalchemy_object(self):
        return self.db_sqlalchemy

    def get_column_mapping(self):
        return self.column_mapping

    def get_filename(self):
        """
        Returns the display name of the loaded file (e.g., 'my_data.csv').
        """
        return self._display_filename

    def reset(self):
        """
        Reset the data handler to its initial state.
        """
        self.df = None
        self.engine = None
        self.db_sqlalchemy = None
        self.column_mapping = None
        self._raw_filepath = None
        self._display_filename = None

    def analyze_missing_values(self):
        """
        Analyzes missing values in the dataset and provides intelligent recommendations
        based on data patterns and statistical analysis.
        """
        if self.df is None:
            print("DEBUG: DataFrame is None")
            return {}

        print(f"DEBUG: DataFrame shape: {self.df.shape}")
        print(f"DEBUG: DataFrame columns: {self.df.columns.tolist()}")
        print("DEBUG: Missing values per column:")
        for col in self.df.columns:
            missing = self.df[col].isnull().sum()
            print(f"  {col}: {missing} missing values")

        missing_analysis = {}
        total_rows = len(self.df)

        for column in self.df.columns:
            series = self.df[column]
            missing_count = series.isnull().sum()
            if missing_count == 0:
                continue

            # Calculate basic statistics
            missing_pct = (missing_count / total_rows) * 100
            non_missing_values = series.dropna()
            
            analysis = {
                'missing_count': missing_count,
                'missing_percentage': missing_pct,
                'recommendation': None,
                'reason': None
            }

            # Analyze data type and patterns
            dtype = series.dtype
            if pd.api.types.is_numeric_dtype(dtype):
                # For numeric columns
                if non_missing_values.size > 0:
                    mean_val = non_missing_values.mean()
                    median_val = non_missing_values.median()
                    std_val = non_missing_values.std()
                    skewness = non_missing_values.skew()
                    
                    # Check for time series pattern
                    is_time_series = False
                    if self.df.index.dtype.kind in 'M':  # M is for datetime
                        # Check if values have trend correlation with time
                        correlation = non_missing_values.corr(pd.Series(range(len(non_missing_values))))
                        is_time_series = abs(correlation) > 0.7

                    if missing_pct > 50:
                        analysis['recommendation'] = 'drop_column'
                        analysis['reason'] = f'High percentage of missing values ({missing_pct:.1f}%)'
                    elif is_time_series:
                        analysis['recommendation'] = 'interpolate'
                        analysis['reason'] = 'Time series pattern detected'
                    elif abs(skewness) > 1:  # Skewed distribution
                        analysis['recommendation'] = 'median'
                        analysis['reason'] = 'Skewed distribution detected'
                    else:
                        analysis['recommendation'] = 'mean'
                        analysis['reason'] = 'Normal distribution detected'
            
            elif pd.api.types.is_datetime64_any_dtype(dtype):
                # For datetime columns
                if missing_pct < 10:
                    analysis['recommendation'] = 'interpolate'
                    analysis['reason'] = 'Low percentage of missing values in datetime column'
                else:
                    analysis['recommendation'] = 'drop_column'
                    analysis['reason'] = f'High percentage of missing values ({missing_pct:.1f}%) in datetime column'
            
            else:  # Categorical/object columns
                unique_ratio = non_missing_values.nunique() / non_missing_values.size
                
                if missing_pct > 50:
                    analysis['recommendation'] = 'drop_column'
                    analysis['reason'] = f'High percentage of missing values ({missing_pct:.1f}%)'
                elif unique_ratio > 0.5:  # High cardinality
                    analysis['recommendation'] = 'new_category'
                    analysis['reason'] = 'High cardinality categorical data'
                else:  # Low cardinality
                    analysis['recommendation'] = 'mode'
                    analysis['reason'] = 'Low cardinality categorical data'
            
            missing_analysis[column] = analysis

        return missing_analysis

    def handle_missing_values(self, strategy_dict=None, custom_strategy=None):
        """
        Applies the recommended or specified strategies to handle missing values.
        
        Args:
            strategy_dict: Optional dictionary of {column: strategy} pairs.
                         If not provided, uses recommendations from analyze_missing_values()
            custom_strategy: Optional string specifying a custom strategy in the format:
                           "fill [column] with [method]" or "drop column [column]"
        
        Returns:
            String describing the actions taken
        """
        if self.df is None:
            return "No data loaded to handle missing values."

        if custom_strategy:
            # Parse custom strategy
            strategy_dict = {}
            import re
            
            # Match "fill missing values in [column] with [method]"
            fill_match = re.match(r'fill\s+(?:missing\s+values\s+in\s+)?([^\s]+)\s+with\s+(\w+)', custom_strategy.lower())
            if fill_match:
                column, method = fill_match.groups()
                if column not in self.df.columns:
                    return f"Column '{column}' not found in the dataset."
                if method in ['mean', 'median', 'mode', 'unknown']:
                    strategy_dict[column] = method if method != 'unknown' else 'new_category'
                else:
                    return f"Unsupported fill method: {method}. Use mean, median, mode, or unknown."
            
            # Match "drop column [column]"
            drop_match = re.match(r'drop\s+column\s+([^\s]+)', custom_strategy.lower())
            if drop_match:
                column = drop_match.group(1)
                if column not in self.df.columns:
                    return f"Column '{column}' not found in the dataset."
                strategy_dict[column] = 'drop_column'
            
            # Match "interpolate missing values in [column]"
            interpolate_match = re.match(r'interpolate\s+(?:missing\s+values\s+in\s+)?([^\s]+)', custom_strategy.lower())
            if interpolate_match:
                column = interpolate_match.group(1)
                if column not in self.df.columns:
                    return f"Column '{column}' not found in the dataset."
                strategy_dict[column] = 'interpolate'
            
            if not strategy_dict:
                return "Invalid custom strategy format. Please use one of the suggested formats."
        elif strategy_dict is None:
            # Use automated recommendations
            analysis = self.analyze_missing_values()
            if not analysis:
                return "No missing values found in the dataset."
            strategy_dict = {col: info['recommendation'] for col, info in analysis.items()}

        actions_taken = []
        columns_to_drop = []
        df_modified = self.df.copy()

        for column, strategy in strategy_dict.items():
            if column not in df_modified.columns:
                continue

            if strategy == 'drop_column':
                columns_to_drop.append(column)
                actions_taken.append(f"Dropped column '{column}' due to excessive missing values")
            elif strategy == 'mean':
                fill_value = df_modified[column].mean()
                df_modified[column].fillna(fill_value, inplace=True)
                actions_taken.append(f"Filled missing values in '{column}' with mean ({fill_value:.2f})")
            elif strategy == 'median':
                fill_value = df_modified[column].median()
                df_modified[column].fillna(fill_value, inplace=True)
                actions_taken.append(f"Filled missing values in '{column}' with median ({fill_value:.2f})")
            elif strategy == 'mode':
                fill_value = df_modified[column].mode()[0]
                df_modified[column].fillna(fill_value, inplace=True)
                actions_taken.append(f"Filled missing values in '{column}' with mode ({fill_value})")
            elif strategy == 'new_category':
                fill_value = 'Unknown'
                df_modified[column].fillna(fill_value, inplace=True)
                actions_taken.append(f"Filled missing values in '{column}' with new category '{fill_value}'")
            elif strategy == 'interpolate':
                df_modified[column].interpolate(method='time' if pd.api.types.is_datetime64_any_dtype(df_modified[column]) else 'linear', inplace=True)
                actions_taken.append(f"Interpolated missing values in '{column}'")

        # Drop columns if any were marked for dropping
        if columns_to_drop:
            df_modified.drop(columns=columns_to_drop, inplace=True)

        # Update the dataframe
        self.df = df_modified
        self.update_df_and_db(df_modified)

        return "\n".join(actions_taken) if actions_taken else "No changes were needed."