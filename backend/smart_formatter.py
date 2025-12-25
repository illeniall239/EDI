from typing import Dict, List, Optional
import pandas as pd
import numpy as np


class SmartFormatter:
    """
    Intelligent spreadsheet formatting engine.

    Analyzes data types and applies professional formatting:
    - Data type detection (currency, dates, percentages, numbers, text)
    - Number format application
    - Column width optimization
    - Header styling and freeze
    - Text alignment
    """

    def __init__(self, df: pd.DataFrame, llm_client=None):
        self.df = df
        self.llm = llm_client
        self.column_types = self._detect_column_types()

    def _detect_column_types(self) -> Dict[str, str]:
        """
        Detect semantic data types for each column.

        Returns:
            Dictionary mapping column names to types:
            - 'currency': Dollar amounts (e.g., 1234.56 → $1,234.56)
            - 'percentage': Ratios (e.g., 0.45 → 45%)
            - 'date': Date values (e.g., 2024-01-15)
            - 'number': Generic numeric (e.g., 1234.5 → 1,234.50)
            - 'integer': Whole numbers (no decimals)
            - 'text': String data (left-aligned)
        """
        column_types = {}

        for col in self.df.columns:
            data = self.df[col].dropna()

            if len(data) == 0:
                column_types[col] = 'text'
                continue

            # Check if numeric
            if pd.api.types.is_numeric_dtype(data):
                # Currency detection (column name hints or $ symbols)
                if any(keyword in col.lower() for keyword in ['price', 'cost', 'amount', 'revenue', 'salary', 'fee', 'payment', 'usd', 'dollar', 'total']):
                    column_types[col] = 'currency'
                # Percentage detection (values between 0-1 or column name hints)
                elif any(keyword in col.lower() for keyword in ['percent', 'rate', '%', 'ratio']):
                    column_types[col] = 'percentage'
                # Check if values look like percentages (0.0 to 1.0 range)
                elif data.min() >= 0 and data.max() <= 1 and data.mean() < 1:
                    column_types[col] = 'percentage'
                # Integer detection (no decimals)
                elif all(data == data.astype(int)):
                    column_types[col] = 'integer'
                else:
                    column_types[col] = 'number'

            # Date detection
            elif pd.api.types.is_datetime64_any_dtype(data):
                column_types[col] = 'date'
            elif data.dtype == 'object':
                # Try parsing as date
                try:
                    pd.to_datetime(data.head(10), errors='raise')
                    column_types[col] = 'date'
                except:
                    column_types[col] = 'text'
            else:
                column_types[col] = 'text'

        return column_types

    def get_format_string(self, column_type: str) -> str:
        """
        Get Excel/Univer number format string for column type.

        Format patterns for Univer:
        - Currency: "$#,##0.00"
        - Percentage: "0.00%"
        - Date: "MM/DD/YYYY"
        - Number: "#,##0.00"
        - Integer: "#,##0"
        - Text: "@" (text format)
        """
        format_map = {
            'currency': '$#,##0.00',
            'percentage': '0.00%',
            'date': 'MM/DD/YYYY',
            'number': '#,##0.00',
            'integer': '#,##0',
            'text': '@'
        }
        return format_map.get(column_type, '@')

    def get_column_alignment(self, column_type: str) -> str:
        """Get horizontal alignment for column type."""
        if column_type in ['currency', 'percentage', 'number', 'integer']:
            return 'right'
        elif column_type == 'date':
            return 'center'
        else:
            return 'left'

    def calculate_column_width(self, col_name: str, column_type: str) -> int:
        """
        Calculate optimal column width based on content.

        Returns width in pixels (Univer uses pixel-based widths).
        """
        # Get max content length
        data = self.df[col_name].dropna().astype(str)

        if len(data) == 0:
            max_length = len(col_name)
        else:
            max_length = max(
                data.str.len().max(),
                len(col_name)
            )

        # Base width calculations (approximate)
        if column_type == 'currency':
            # "$1,234.56" format needs more space
            base_width = max(max_length * 8, 100)
        elif column_type == 'percentage':
            # "45.67%" format
            base_width = max(max_length * 8, 80)
        elif column_type == 'date':
            # "01/15/2024" format
            base_width = 100
        elif column_type == 'number':
            # "1,234.56" format
            base_width = max(max_length * 8, 90)
        elif column_type == 'integer':
            # "1,234" format
            base_width = max(max_length * 8, 80)
        else:
            # Text content
            base_width = min(max(max_length * 8, 80), 300)  # Cap at 300px

        return int(base_width)

    def generate_formatting_instructions(self, template: Optional[str] = None) -> Dict:
        """
        Generate complete formatting instructions for frontend.

        Parameters:
            template: Optional formatting template name
                     ('financial', 'professional', 'minimal')

        Returns:
            Dictionary with formatting instructions:
            {
                'column_formats': {col_name: format_string},
                'column_widths': {col_name: width_in_pixels},
                'column_alignments': {col_name: 'left'|'center'|'right'},
                'header_style': {bold, background, freeze},
                'summary': "Applied professional formatting to X columns"
            }
        """
        column_formats = {}
        column_widths = {}
        column_alignments = {}

        for col in self.df.columns:
            col_type = self.column_types[col]
            column_formats[col] = self.get_format_string(col_type)
            column_widths[col] = self.calculate_column_width(col, col_type)
            column_alignments[col] = self.get_column_alignment(col_type)

        # Header styling (template-based customization)
        if template == 'financial':
            header_style = {
                'bold': True,
                'background': '#2C3E50',  # Dark blue
                'font_color': '#FFFFFF',  # White
                'freeze': True
            }
        elif template == 'minimal':
            header_style = {
                'bold': True,
                'background': '#F8F9FA',  # Light gray
                'font_color': '#000000',  # Black
                'freeze': True
            }
        else:  # 'professional' default
            header_style = {
                'bold': True,
                'background': '#4A90E2',  # Blue
                'font_color': '#FFFFFF',  # White
                'freeze': True
            }

        # Generate summary
        type_counts = {}
        for col_type in self.column_types.values():
            type_counts[col_type] = type_counts.get(col_type, 0) + 1

        summary_parts = []
        if type_counts.get('currency', 0) > 0:
            summary_parts.append(f"{type_counts['currency']} currency columns")
        if type_counts.get('date', 0) > 0:
            summary_parts.append(f"{type_counts['date']} date columns")
        if type_counts.get('percentage', 0) > 0:
            summary_parts.append(f"{type_counts['percentage']} percentage columns")

        summary = f"Applied {template or 'professional'} formatting to {len(self.df.columns)} columns"
        if summary_parts:
            summary += f": {', '.join(summary_parts)}"

        return {
            'column_formats': column_formats,
            'column_widths': column_widths,
            'column_alignments': column_alignments,
            'column_types': self.column_types,
            'header_style': header_style,
            'summary': summary
        }
