# Configure Matplotlib to use non-interactive backend before any other imports
import matplotlib
matplotlib.use('Agg')  # Use the Agg backend that doesn't require a display or GUI
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
import numpy as np
from io import BytesIO
import uuid
import os
import time # For potential retries
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle, KeepInFrame
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT

# --- Gemini Integration ---
import google.generativeai as genai

# --- ReportGenerator Class ---
class ReportGenerator:
    def __init__(self, data_handler, agent_services_instance, gemini_api_key=None):
        # self.llm is no longer passed; it's instantiated here
        self.data_handler = data_handler
        self.agent_services = agent_services_instance # For cancellation flag
        
        # ReportLab specific setup
        self.styles = getSampleStyleSheet()
        self._setup_reportlab_styles()
        self.story = [] # For ReportLab elements
        self.figure_count = 0
        self.table_count = 0
        self.max_plots_per_section = 3 
        self.max_cat_for_bivariate = 10 

        # --- Instantiate Gemini LLM ---
        if gemini_api_key:
            genai.configure(api_key=gemini_api_key)
        elif os.getenv("GOOGLE_API_KEY"):
            # Assumes GOOGLE_API_KEY is set in the environment
            genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
        else:
            raise ValueError("Gemini API key not provided or GOOGLE_API_KEY environment variable not set.")

        # Using gemini-1.5-flash-latest for speed and cost-effectiveness
        # Adjust model name if needed, e.g., "gemini-1.5-pro-latest" for more power
        self.gemini_model = genai.GenerativeModel(
            model_name="gemini-1.5-flash-latest",
            # Optional: Add safety settings if needed
            # safety_settings=[
            #     {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            #     {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            #     {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            #     {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            # ],
            generation_config=genai.types.GenerationConfig(
                # candidate_count=1, # Default
                # stop_sequences=['...'], # If needed
                # max_output_tokens=2048, # Default for flash is 8192, adjust if necessary for specific prompts
                temperature=0.6, # Adjust for creativity vs. factuality in reports
                # top_p=0.9,
                # top_k=40
            )
        )
        print("ReportGenerator initialized with Gemini model (gemini-1.5-flash-latest).")


    def _invoke_gemini(self, prompt_text, max_retries=3, delay=5):
        """Helper function to call Gemini API with retries and basic error handling."""
        self._check_cancellation() # Check before making an API call
        for attempt in range(max_retries):
            try:
                response = self.gemini_model.generate_content(prompt_text)
                # Check if response.parts is empty or if text is missing
                if not response.parts or not hasattr(response.parts[0], 'text'):
                    # Sometimes Gemini might return a finish_reason without content if blocked etc.
                    finish_reason = response.prompt_feedback.block_reason if response.prompt_feedback else "Unknown reason (no content)"
                    error_message = f"Gemini API call resulted in no content. Finish Reason: {finish_reason}. Prompt: '{prompt_text[:200]}...'"
                    if attempt < max_retries - 1:
                        print(f"Warning: {error_message} Retrying ({attempt + 1}/{max_retries})...")
                        time.sleep(delay * (attempt + 1))
                        continue
                    else:
                        print(f"Error: {error_message} Max retries reached.")
                        # Fallback to a safe string to avoid breaking report generation
                        return "Error: LLM response not available after multiple retries."

                return response.text # Accessing the text directly from the response object
            except Exception as e:
                error_message = f"Error calling Gemini API: {str(e)}. Prompt: '{prompt_text[:200]}...'"
                if attempt < max_retries - 1:
                    print(f"Warning: {error_message} Retrying ({attempt + 1}/{max_retries})...")
                    time.sleep(delay * (attempt + 1))
                else:
                    print(f"Error: {error_message} Max retries reached.")
                    # Fallback to a safe string to avoid breaking report generation
                    return f"Error: LLM communication failed after multiple retries - {str(e)}"
        return "Error: LLM response not available after multiple retries." # Should be unreachable if logic is correct

    def _setup_reportlab_styles(self):
        # (Style setup remains the same as before)
        self.styles.add(ParagraphStyle(name='Justify', parent=self.styles['Normal'], alignment=TA_JUSTIFY))
        self.styles.add(ParagraphStyle(name='Center', parent=self.styles['Normal'], alignment=TA_CENTER))
        self.styles.add(ParagraphStyle(name='Right', parent=self.styles['Normal'], alignment=TA_RIGHT))
        self.styles.add(ParagraphStyle(name='ReportTitle', parent=self.styles['h1'], alignment=TA_CENTER, fontSize=22, spaceAfter=20, textColor=colors.HexColor("#2F5496")))
        self.styles.add(ParagraphStyle(name='SectionTitle', parent=self.styles['h2'], fontSize=18, spaceBefore=18, spaceAfter=10, textColor=colors.HexColor("#4F81BD"), keepWithNext=1))
        self.styles.add(ParagraphStyle(name='SubSectionTitle', parent=self.styles['h3'], fontSize=15, spaceBefore=12, spaceAfter=6, textColor=colors.HexColor("#5A9BD5"), keepWithNext=1))
        self.styles.add(ParagraphStyle(name='FigureCaption', parent=self.styles['Italic'], alignment=TA_CENTER, fontSize=9, spaceBefore=3, spaceAfter=8))
        self.styles.add(ParagraphStyle(name='TableCaption', parent=self.styles['Normal'], alignment=TA_CENTER, fontSize=10, spaceBefore=8, spaceAfter=3, fontName='Helvetica-Bold'))
        self.styles.add(ParagraphStyle(name='LLMInterpretation', parent=self.styles['Justify'], fontSize=10, spaceBefore=6, spaceAfter=10, leftIndent=12, rightIndent=12, borderColor=colors.lightgrey, borderPadding=5, borderWidth=0.5))
        self.styles.add(ParagraphStyle(name='ExecSummary', parent=self.styles['Justify'], fontSize=11, spaceBefore=6, spaceAfter=12, leading=14))

    def _check_cancellation(self):
        if self.agent_services and self.agent_services.operation_cancelled_flag:
            raise InterruptedError("Report generation cancelled by user.")

    # --- ReportLab Helper Methods (remain the same) ---
    def _rl_add_title(self, title_text):
        self.story.append(Paragraph(title_text, self.styles['ReportTitle']))
        self.story.append(Spacer(1, 0.3 * inch))

    def _rl_add_heading(self, text, level=2):
        style_name = 'SectionTitle' if level == 2 else 'SubSectionTitle'
        self.story.append(Paragraph(text, self.styles[style_name]))

    def _rl_add_paragraph(self, text, style='Justify'):
        self.story.append(Paragraph(text, self.styles[style]))
        self.story.append(Spacer(1, 0.1 * inch))

    def _rl_add_llm_interpretation(self, text, title="Key Observations:"):
        if title:
            self.story.append(Paragraph(f"<i>{title}</i>", self.styles['Normal'])) 
            self.story.append(Spacer(1, 0.05 * inch))
        self.story.append(Paragraph(text, self.styles['LLMInterpretation']))

    def _rl_add_image_from_buffer(self, fig, caption_text, width=6.5*inch, height=None):
        self._check_cancellation()
        self.figure_count += 1
        try:
            img_buffer = BytesIO()
            fig.savefig(img_buffer, format='png', bbox_inches='tight', dpi=150)
            img_buffer.seek(0)
            
            img_width_px, img_height_px = fig.get_size_inches() * fig.dpi
            aspect_ratio = img_height_px / img_width_px
            if height is None:
                height = width * aspect_ratio
            
            max_h = 7.5 * inch 
            if height > max_h:
                height = max_h
                width = height / aspect_ratio

            img = Image(img_buffer, width=width, height=height)
            
            full_caption = f"<b>Figure {self.figure_count}:</b> {caption_text}"
            caption_paragraph = Paragraph(full_caption, self.styles['FigureCaption'])
            
            elements_to_keep = [img, Spacer(1, 0.05 * inch), caption_paragraph]
            self.story.append(KeepInFrame(width + 0.5*inch, height + 0.8*inch, elements_to_keep)) 
            self.story.append(Spacer(1, 0.1 * inch))
        except Exception as e:
            print(f"Error adding image to report: {str(e)}")
        finally:
            # Always ensure the figure is closed to prevent memory leaks and Tkinter issues
            try:
                plt.close(fig)
            except Exception as close_error:
                print(f"Error closing figure: {str(close_error)}")

    def _rl_add_table(self, df_table, caption_text):
        self._check_cancellation()
        self.table_count += 1
        full_caption = f"<b>Table {self.table_count}:</b> {caption_text}"
        self.story.append(Paragraph(full_caption, self.styles['TableCaption']))
        
        # Ensure column names are strings for ReportLab Table
        df_table_display = df_table.copy()
        df_table_display.columns = [str(col) for col in df_table_display.columns]
        data = [df_table_display.columns.tolist()] + df_table_display.astype(str).values.tolist()
        
        rl_table = Table(data, repeatRows=1)
        rl_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#4F81BD")), 
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),         
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor("#DCE6F1")), 
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('LEFTPADDING', (0,0), (-1,-1), 4),
            ('RIGHTPADDING', (0,0), (-1,-1), 4),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ]))
        self.story.append(rl_table)
        self.story.append(Spacer(1, 0.2 * inch))

    def _get_column_types(self, df):
        numerical_cols = df.select_dtypes(include=np.number).columns.tolist()
        categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
        datetime_cols = df.select_dtypes(include=['datetime64', 'datetimetz']).columns.tolist()
        return numerical_cols, categorical_cols, datetime_cols
        
    # --- Report Sections ---
    # ALL LLM calls will now use self._invoke_gemini(prompt) instead of self.llm.invoke(prompt).content.strip()

    def _generate_executive_summary(self, df_summary_info):
        self._check_cancellation()
        self._rl_add_heading("Executive Summary", level=2)
        prompt = f"""
        Based on the following preliminary data overview:
        {df_summary_info}

        Write a concise executive summary (2-3 paragraphs) for an automated data analysis report.
        This summary should:
        1. Briefly state the purpose of the report (initial automated exploration).
        2. Highlight the most significant or striking characteristics of the dataset discovered so far (e.g., size, key data quality observations, any immediately obvious patterns or lack thereof).
        3. Mention the types of analyses performed (e.g., descriptive statistics, quality checks, visualizations).
        4. Conclude with a forward-looking statement about the utility of this initial scan.
        Maintain a professional and highly condensed tone. This is for a busy executive.
        """
        summary_text = self._invoke_gemini(prompt).strip() # MODIFIED
        self._rl_add_paragraph(summary_text, style='ExecSummary')
        self.story.append(PageBreak())

    def _generate_data_overview(self, df):
        self._check_cancellation()
        self._rl_add_heading("1. Data Overview", level=2)
        filename = self.data_handler.get_filename() or "the uploaded dataset"
        self._rl_add_paragraph(f"This report provides an initial automated analysis of the dataset from '{filename}'.")
        self._rl_add_heading("1.1. Basic Information", level=3)
        basic_info_df = pd.DataFrame({
            "Metric": ["Number of Rows", "Number of Columns", "Total Data Points"],
            "Value": [df.shape[0], df.shape[1], df.size]
        })
        self._rl_add_table(basic_info_df, "Dataset Dimensions")
        self._rl_add_heading("1.2. Data Types", level=3)
        dtype_summary = df.dtypes.value_counts().reset_index()
        dtype_summary.columns = ['Data Type', 'Count']
        dtype_summary['Data Type'] = dtype_summary['Data Type'].astype(str)
        self._rl_add_table(dtype_summary, "Summary of Feature Data Types")
        num_cols, cat_cols, dt_cols = self._get_column_types(df)
        
        # For Gemini, it's good practice to frame prompts clearly.
        # Let's make the prompt for data types interpretation more direct.
        data_types_context = f"""
        The dataset comprises:
        - {len(num_cols)} numerical features. Examples: {', '.join(map(str, num_cols[:3]))}{'...' if len(num_cols) > 3 else ''}.
        - {len(cat_cols)} categorical/object features. Examples: {', '.join(map(str, cat_cols[:3]))}{'...' if len(cat_cols) > 3 else ''}.
        - {len(dt_cols)} datetime features. Examples: {', '.join(map(str, dt_cols[:3]))}{'...' if len(dt_cols) > 3 else ''}.
        """
        prompt = f"""
        Given the following summary of data types in a dataset:
        {data_types_context}
        Please provide a brief (1-2 sentence) interpretation of this data type distribution and its general implication for analysis.
        For example, mention if the mix of types is typical or if any type is notably dominant/absent and what that might mean.
        """
        dtype_interpretation = self._invoke_gemini(prompt).strip() # MODIFIED
        self._rl_add_llm_interpretation(dtype_interpretation, title="Data Types Distribution Interpretation:")
        return f"Dataset '{filename}' has {df.shape[0]} rows, {df.shape[1]} columns. Numerical: {len(num_cols)}, Categorical: {len(cat_cols)}, Datetime: {len(dt_cols)}."


    def _generate_data_quality_assessment(self, df):
        self._check_cancellation()
        self._rl_add_heading("2. Data Quality Assessment", level=2)
        # ... (rest of the DQ logic for tables is the same) ...
        total_rows = len(df)
        all_findings = [] 

        self._rl_add_heading("2.1. Missing Values", level=3)
        missing_summary = df.isnull().sum()
        missing_summary = missing_summary[missing_summary > 0].sort_values(ascending=False)
        if not missing_summary.empty:
            missing_df = pd.DataFrame({
                'Feature': missing_summary.index,
                'Missing Count': missing_summary.values,
                'Percentage Missing': (missing_summary.values / total_rows * 100).round(2)
            })
            self._rl_add_table(missing_df, "Features with Missing Values")
            all_findings.append("Missing Values Report:\n" + missing_df.to_string(index=False))
        else:
            self._rl_add_paragraph("No missing values were found in the dataset. This is excellent for data completeness.")
            all_findings.append("No missing values found.")

        self._rl_add_heading("2.2. Duplicate Records", level=3)
        num_duplicates = df.duplicated().sum()
        if num_duplicates > 0:
            dup_text = f"The dataset contains {num_duplicates} duplicate rows (representing {(num_duplicates/total_rows*100):.2f}% of the data). These may need to be investigated or removed depending on the analysis context, as they can skew results."
            self._rl_add_paragraph(dup_text)
            all_findings.append(f"{num_duplicates} duplicate rows found ({(num_duplicates/total_rows*100):.2f}%).")
        else:
            self._rl_add_paragraph("No duplicate rows were found in the dataset.")
            all_findings.append("No duplicate rows found.")

        self._rl_add_heading("2.3. Feature Variance", level=3)
        constant_cols = [col for col in df.columns if df[col].nunique(dropna=False) == 1]
        if constant_cols:
            const_text = f"The following columns have only one unique value (constant) and provide no predictive power: {', '.join(constant_cols)}. They are typically candidates for removal."
            self._rl_add_paragraph(const_text)
            all_findings.append(f"Constant columns found: {', '.join(constant_cols)}.")
        else:
            self._rl_add_paragraph("No constant columns (columns with only one unique value) were identified.")
            all_findings.append("No constant columns identified.")
        
        quasi_constant_cols = []
        for col in df.columns:
            if col not in constant_cols:
                counts = df[col].value_counts(normalize=True, dropna=False)
                if not counts.empty and counts.iloc[0] > 0.95:
                     quasi_constant_cols.append(f"{col} (dominant value: {str(counts.index[0])[:20]}{'...' if len(str(counts.index[0])) > 20 else ''} at {counts.iloc[0]*100:.1f}%)")
        if quasi_constant_cols:
            quasi_text = (f"The following columns are quasi-constant (one value is highly dominant), potentially offering limited information: "
                          f"{'; '.join(quasi_constant_cols)}. Their utility should be reviewed.")
            self._rl_add_paragraph(quasi_text)
            all_findings.append(f"Quasi-constant columns found: {'; '.join(quasi_constant_cols)}.")
        else:
            self._rl_add_paragraph("No significantly quasi-constant columns were identified using a 95% dominance threshold.")
            all_findings.append("No highly quasi-constant columns (95% threshold) identified.")

        self._check_cancellation()
        dq_findings_str = "\n- ".join(all_findings)
        prompt = f"""
        A data quality assessment was performed with the following findings:
        - Total rows: {total_rows}
        - {dq_findings_str}

        Provide an overall assessment (2-3 paragraphs) of the data quality based *only* on these points.
        What are the potential implications of these findings for further analysis (e.g., impact on modeling, reliability of insights)?
        Suggest general strategies to address any identified issues.
        """
        dq_interpretation = self._invoke_gemini(prompt).strip() # MODIFIED
        self._rl_add_llm_interpretation(dq_interpretation, title="Data Quality Summary & Implications:")
        self.story.append(PageBreak())
        return f"Data Quality: Missing values status: {'Found' if not missing_summary.empty else 'None'}. Duplicates: {num_duplicates}. Constant columns: {len(constant_cols)}."


    def _generate_univariate_analysis(self, df):
        self._check_cancellation()
        self._rl_add_heading("3. Univariate Analysis", level=2)
        # ... (plotting logic is the same) ...
        numerical_cols, categorical_cols, _ = self._get_column_types(df)
        num_observations = [] # For LLM prompt context
        cat_observations = [] # For LLM prompt context

        if numerical_cols:
            self._rl_add_heading("3.1. Numerical Features", level=3)
            for i, col in enumerate(numerical_cols):
                if i >= self.max_plots_per_section * 2: break 
                self._check_cancellation()
                try:
                    # (Plotting code for histogram and boxplot remains the same)
                    fig, axes = plt.subplots(1, 2, figsize=(10, 3.5))                     
                    sns.histplot(df[col].dropna(), kde=True, ax=axes[0], color="#5A9BD5", bins=30)
                    axes[0].set_title(f"Distribution of {col}", fontsize=10)
                    axes[0].set_xlabel(col, fontsize=9); axes[0].set_ylabel("Frequency", fontsize=9)
                    axes[0].tick_params(axis='both', which='major', labelsize=8)
                    sns.boxplot(x=df[col].dropna(), ax=axes[1], color="#77DD77", width=0.4)
                    axes[1].set_title(f"Boxplot of {col}", fontsize=10)
                    axes[1].set_xlabel(col, fontsize=9)
                    axes[1].tick_params(axis='both', which='major', labelsize=8)
                    plt.tight_layout()
                    caption = f"Distribution (histogram and KDE) and boxplot for '{col}'. The histogram shows shape, central tendency, and spread. The boxplot highlights median, quartiles, and potential outliers."
                    self._rl_add_image_from_buffer(fig, caption, width=7*inch)
                    
                    desc_stat = df[col].describe().round(2)
                    num_observations.append(f"Feature '{col}': Mean={desc_stat.get('mean', 'N/A')}, Median={desc_stat.get('50%', 'N/A')}, StdDev={desc_stat.get('std', 'N/A')}, Min={desc_stat.get('min', 'N/A')}, Max={desc_stat.get('max', 'N/A')}, Skewness={df[col].skew():.2f}, Kurtosis={df[col].kurtosis():.2f}. Boxplot may indicate outliers.")
                except Exception as e:
                    self._rl_add_paragraph(f"Error generating plots for numerical feature {col}: {str(e)}")
            
            if num_observations:
                prompt_num = f"""
                The following numerical features were analyzed with histograms and boxplots, yielding these observations:
                {"; ".join(num_observations[:10])} {'...' if len(num_observations) > 10 else ''} 
                (Consider all observations provided for summary, even if truncated here).

                Provide a summary (2-3 paragraphs) of key insights from these numerical feature distributions. Comment on:
                - General shapes of distributions (e.g., symmetric, skewed left/right).
                - Presence of potential outliers as suggested by boxplots or extreme min/max values relative to mean/median.
                - Spread or variability of features (e.g., high/low standard deviation).
                Focus on patterns or striking characteristics relevant for data analysis.
                """
                num_interpretation = self._invoke_gemini(prompt_num).strip() # MODIFIED
                self._rl_add_llm_interpretation(num_interpretation, title="Observations on Numerical Feature Distributions:")

        if categorical_cols:
            self._rl_add_heading("3.2. Categorical Features", level=3)
            for i, col in enumerate(categorical_cols):
                if i >= self.max_plots_per_section * 2: break
                self._check_cancellation()
                unique_vals = df[col].nunique(dropna=False)
                value_counts = df[col].value_counts(dropna=False).nlargest(15) 
                if unique_vals > 1: 
                    try:
                        # (Plotting code for bar chart remains the same)
                        fig, ax = plt.subplots(figsize=(7, 4.5))
                        sns.barplot(x=value_counts.index.astype(str), y=value_counts.values, ax=ax, palette="viridis", order=value_counts.index.astype(str))
                        ax.set_title(f"Frequency of Categories in {col} (Top {len(value_counts)})", fontsize=12)
                        ax.set_xlabel(col, fontsize=10); ax.set_ylabel("Count", fontsize=10)
                        ax.tick_params(axis='x', labelsize=8); plt.setp(ax.get_xticklabels(), rotation=45, ha='right')
                        ax.tick_params(axis='y', labelsize=8); plt.tight_layout()
                        caption = f"Bar chart showing frequency of top categories in '{col}'. Total unique values: {unique_vals}."
                        self._rl_add_image_from_buffer(fig, caption)
                        top_cat_val_str = str(value_counts.index[0])[:20] + ('...' if len(str(value_counts.index[0])) > 20 else '')
                        cat_observations.append(f"Feature '{col}': {unique_vals} unique values. Top category: '{top_cat_val_str}' ({(value_counts.iloc[0]/len(df)*100):.1f}%).")
                    except Exception as e:
                        self._rl_add_paragraph(f"Error generating bar chart for {col}: {str(e)}")
                else:
                     cat_observations.append(f"Feature '{col}': Only 1 unique value ('{df[col].unique()[0]}'). (Noted as constant).")

            if cat_observations:
                prompt_cat = f"""
                The following categorical features were analyzed, yielding these observations:
                {"; ".join(cat_observations[:10])} {'...' if len(cat_observations) > 10 else ''}
                (Consider all observations provided for summary, even if truncated here).

                Provide a summary (2-3 paragraphs) of key insights from these categorical feature distributions. Comment on:
                - Features with high or low cardinality (number of unique values).
                - Features with dominant categories or relatively even distributions.
                - Any implications for feature encoding or analysis (e.g., high cardinality might need special handling).
                """
                cat_interpretation = self._invoke_gemini(prompt_cat).strip() # MODIFIED
                self._rl_add_llm_interpretation(cat_interpretation, title="Observations on Categorical Feature Distributions:")
        
        self.story.append(PageBreak())
        return f"Univariate: Analyzed {len(numerical_cols)} numerical and {len(categorical_cols)} categorical features."


    def _generate_bivariate_analysis(self, df):
        self._check_cancellation()
        self._rl_add_heading("4. Bivariate Analysis", level=2)
        # ... (plotting logic is the same) ...
        numerical_cols, categorical_cols, _ = self._get_column_types(df)
        bivar_observations_for_llm = [] # Collect text for LLM prompts

        # Numerical vs. Numerical
        if len(numerical_cols) >= 2:
            self._rl_add_heading("4.1. Numerical vs. Numerical Features", level=3)
            # ... (heatmap and scatter plot generation logic remains the same) ...
            try:
                corr = df[numerical_cols].corr()
                # (Heatmap plotting code)
                fig_corr_width = min(max(8, len(numerical_cols)*0.8), 12); fig_corr_height = min(max(6, len(numerical_cols)*0.6), 10)
                fig_corr, ax_corr = plt.subplots(figsize=(fig_corr_width, fig_corr_height))
                sns.heatmap(corr, annot=True, fmt=".2f", cmap='coolwarm', ax=ax_corr, annot_kws={"size": 7 if len(numerical_cols) < 15 else 5}, linewidths=.5)
                ax_corr.set_title("Correlation Heatmap of Numerical Features", fontsize=12)
                ax_corr.tick_params(axis='both', which='major', labelsize=8)
                plt.xticks(rotation=45, ha='right'); plt.yticks(rotation=0); plt.tight_layout()
                caption_corr = "Heatmap visualizing linear correlations (Pearson's r) between numerical features."
                self._rl_add_image_from_buffer(fig_corr, caption_corr, width=7*inch) 
                
                upper_tri = corr.where(np.triu(np.ones(corr.shape), k=1).astype(bool))
                strong_corrs = upper_tri.stack().reset_index(); strong_corrs.columns = ['Var1', 'Var2', 'Correlation']
                strong_corrs['AbsCorrelation'] = strong_corrs['Correlation'].abs()
                top_corrs = strong_corrs.sort_values(by='AbsCorrelation', ascending=False).head(self.max_plots_per_section)

                scatter_plot_info = []
                if not top_corrs.empty:
                    self._rl_add_paragraph(f"Scatter plots for up to {self.max_plots_per_section} most correlated pairs (absolute value > 0.3):")
                    plotted_scatter = 0
                    for _, row in top_corrs.iterrows():
                        if row['AbsCorrelation'] > 0.3:
                            # (Scatter plot code)
                            try:
                                fig_scatter, ax_scatter = plt.subplots(figsize=(6, 4))
                                sns.scatterplot(x=df[row['Var1']], y=df[row['Var2']], ax=ax_scatter, alpha=0.6, color="#E67E22")
                                ax_scatter.set_title(f"Scatter: {row['Var1']} vs. {row['Var2']} (Corr: {row['Correlation']:.2f})", fontsize=11)
                                ax_scatter.set_xlabel(row['Var1'], fontsize=9); ax_scatter.set_ylabel(row['Var2'], fontsize=9)
                                ax_scatter.tick_params(axis='both', which='major', labelsize=8); plt.tight_layout()
                                caption_scatter = f"Scatter plot for '{row['Var1']}' and '{row['Var2']}'. Correlation: {row['Correlation']:.2f}."
                                self._rl_add_image_from_buffer(fig_scatter, caption_scatter, width=5.5*inch)
                                scatter_plot_info.append(f"'{row['Var1']}' vs '{row['Var2']}' (Corr: {row['Correlation']:.2f})")
                                plotted_scatter +=1
                                if plotted_scatter >= self.max_plots_per_section: break
                            except Exception as e: self._rl_add_paragraph(f"Error generating scatter plot for {row['Var1']} vs {row['Var2']}: {str(e)}")
                
                num_num_context = f"Correlation matrix computed. Top correlations (Var1, Var2, Correlation):\n{top_corrs.to_string(index=False, columns=['Var1','Var2','Correlation'], max_rows=3)}\n"
                if scatter_plot_info:
                    num_num_context += f"Scatter plots generated for pairs like: {', '.join(scatter_plot_info)}.\n"
                bivar_observations_for_llm.append(f"Numerical vs Numerical: {num_num_context.strip()}")

                prompt_corr = f"""
                The following numerical correlation analysis was performed:
                {num_num_context}
                Briefly explain what a correlation matrix generally shows. Highlight 1-2 of the strongest positive or negative correlations observed.
                What might these specific strong correlations imply in simple terms? If no strong correlations are apparent (e.g., all |value| < 0.3), state that.
                Comment on any interesting patterns observed in scatter plots if described. (1-2 paragraphs)
                """
                corr_interpretation = self._invoke_gemini(prompt_corr).strip() # MODIFIED
                self._rl_add_llm_interpretation(corr_interpretation, title="Interpretation of Numerical Correlations:")
            except Exception as e:
                self._rl_add_paragraph(f"Error generating numerical vs. numerical analysis: {str(e)}")

        # Numerical vs. Categorical
        if numerical_cols and categorical_cols:
            self._rl_add_heading("4.2. Numerical vs. Categorical Features", level=3)
            # ... (box plot generation logic remains the same) ...
            num_cat_plots = 0
            num_cat_plot_info = []
            for cat_col in categorical_cols:
                if num_cat_plots >= self.max_plots_per_section: break
                if df[cat_col].nunique(dropna=False) <= self.max_cat_for_bivariate and df[cat_col].nunique(dropna=False) > 1:
                    for num_col_idx, num_col in enumerate(numerical_cols):
                        if num_cat_plots >= self.max_plots_per_section: break
                        if num_col_idx >= 1 and self.max_plots_per_section <=2 : break
                        try:
                            # (Box plot code)
                            fig, ax = plt.subplots(figsize=(7, 4.5))
                            order = df.groupby(cat_col)[num_col].median().sort_values().index.astype(str)
                            sns.boxplot(x=df[cat_col].astype(str), y=df[num_col], ax=ax, palette="pastel", order=order)
                            ax.set_title(f"{num_col} by {cat_col}", fontsize=12)
                            ax.set_xlabel(cat_col, fontsize=10); ax.set_ylabel(num_col, fontsize=10)
                            ax.tick_params(axis='x', labelsize=8); plt.setp(ax.get_xticklabels(), rotation=30, ha='right')
                            ax.tick_params(axis='y', labelsize=8); plt.tight_layout()
                            caption = f"Box plot of '{num_col}' across categories of '{cat_col}'."
                            self._rl_add_image_from_buffer(fig, caption)
                            num_cat_plot_info.append(f"'{num_col}' by '{cat_col}'")
                            num_cat_plots += 1
                        except Exception as e: self._rl_add_paragraph(f"Error generating box plot for {num_col} vs {cat_col}: {str(e)}")
            
            if num_cat_plots > 0 :
                num_cat_context = f"Box plots generated showing numerical distributions across categories. Examples: {', '.join(num_cat_plot_info[:2])}."
                bivar_observations_for_llm.append(f"Numerical vs Categorical: {num_cat_context.strip()}")
                prompt_num_cat = f"""
                {num_cat_context}
                Provide a general interpretation (1-2 paragraphs) of what these types of plots reveal.
                What kind of insights can be drawn if significant differences are observed in medians or spreads across categories?
                (e.g., 'Category A tends to have higher values of Numeric X than Category B').
                """
                num_cat_interpretation = self._invoke_gemini(prompt_num_cat).strip() # MODIFIED
                self._rl_add_llm_interpretation(num_cat_interpretation, title="Interpretation of Numerical vs. Categorical Interactions:")

        # Categorical vs. Categorical
        if len(categorical_cols) >= 2:
            self._rl_add_heading("4.3. Categorical vs. Categorical Features", level=3)
            # ... (crosstab and optional stacked bar plot generation logic remains the same) ...
            cat_cat_analyses = 0
            cat_cat_plot_info = []
            cat_cols_for_bivar = [c for c in categorical_cols if df[c].nunique(dropna=False) <= self.max_cat_for_bivariate and df[c].nunique(dropna=False) > 1]
            for i in range(len(cat_cols_for_bivar)):
                if cat_cat_analyses >= self.max_plots_per_section : break
                for j in range(i + 1, len(cat_cols_for_bivar)):
                    if cat_cat_analyses >= self.max_plots_per_section : break
                    col1, col2 = cat_cols_for_bivar[i], cat_cols_for_bivar[j]
                    try:
                        # (Crosstab and optional stacked bar plot code)
                        crosstab_counts_df = pd.crosstab(df[col1], df[col2])
                        self._rl_add_table(crosstab_counts_df.reset_index(), f"Crosstab: Counts for {col1} vs. {col2}")
                        if df[col1].nunique() <= 5 and df[col2].nunique() <= 5:
                            crosstab_counts_df.plot(kind='bar', stacked=True, figsize=(7, 4.5), colormap='Spectral')
                            plt.title(f"Stacked Bar: {col1} vs. {col2}", fontsize=12)
                            plt.xlabel(col1, fontsize=10); plt.ylabel("Count", fontsize=10)
                            plt.xticks(rotation=30, ha='right', fontsize=8); plt.yticks(fontsize=8)
                            plt.legend(title=col2, fontsize=8); plt.tight_layout()
                            caption_stacked = f"Stacked bar chart: '{col2}' within each category of '{col1}'."
                            self._rl_add_image_from_buffer(plt.gcf(), caption_stacked)
                        
                        crosstab_df_norm = pd.crosstab(df[col1], df[col2], normalize='index').mul(100).round(1)
                        cat_cat_plot_info.append(f"Crosstab & (opt. plot) for '{col1}' vs '{col2}'. Example (norm % for '{col1}'):\n{crosstab_df_norm.head(2).to_string()}")
                        cat_cat_analyses += 1
                    except Exception as e: self._rl_add_paragraph(f"Error generating crosstab/plot for {col1} vs {col2}: {str(e)}")

            if cat_cat_analyses > 0 :
                cat_cat_context = f"Crosstabs (and opt. stacked bars) generated. Examples:\n" + "\n".join(cat_cat_plot_info[:2])
                bivar_observations_for_llm.append(f"Categorical vs Categorical: {cat_cat_context.strip()}")
                prompt_cat_cat = f"""
                {cat_cat_context}
                Provide a general interpretation (1-2 paragraphs) of what these analyses reveal.
                How can one interpret a crosstabulation (especially a normalized one)? What kind of associations or dependencies might be uncovered?
                """
                cat_cat_interpretation = self._invoke_gemini(prompt_cat_cat).strip() # MODIFIED
                self._rl_add_llm_interpretation(cat_cat_interpretation, title="Interpretation of Categorical vs. Categorical Interactions:")

        if not bivar_observations_for_llm:
             self._rl_add_paragraph("Sufficient pairs of features for comprehensive bivariate analysis were not available or did not meet the plotting/analysis criteria.")
        
        self.story.append(PageBreak())
        return f"Bivariate: Analyzed various feature pairs. Observations gathered: {len(bivar_observations_for_llm)}"


    def _generate_key_findings_summary(self, df, all_summaries):
        self._check_cancellation()
        self._rl_add_heading("5. Key Findings & Insights Summary", level=2)
        summary_str = "\n\n".join(all_summaries)
        prompt = f"""
        An automated analysis was performed on a dataset. Here's a condensed log of findings from various sections:
        {summary_str}
        
        Please synthesize these findings into a 'Key Findings & Insights' section (3-4 paragraphs). This section should:
        1.  Reiterate the most critical data quality issues and their potential impact.
        2.  Summarize the most notable patterns or characteristics observed in feature distributions (univariate analysis).
        3.  Highlight the most significant relationships or correlations found between features (bivariate analysis).
        4.  Point out any surprising or unexpected findings, if any were implied.
        5.  Avoid making recommendations here; just summarize observations.
        The goal is to provide a consolidated view of what the data seems to be telling us at this initial stage.
        """
        findings_text = self._invoke_gemini(prompt).strip() # MODIFIED
        self._rl_add_llm_interpretation(findings_text, title=None) 

    def _generate_conclusion_and_next_steps(self, df, all_summaries_str):
        self._check_cancellation()
        self._rl_add_heading("6. Conclusion & Potential Next Steps", level=2)
        prompt = f"""
        An automated analysis was performed on a dataset with {df.shape[0]} rows and {df.shape[1]} columns.
        Key information from the analysis: {all_summaries_str}

        Write a brief concluding paragraph (2-3 sentences) summarizing that this automated report provides a foundational, high-level understanding of the data's characteristics, quality, and potential relationships.

        Then, based *specifically* on the types of findings in the 'Key information' (e.g., if missing data was high, if strong correlations were found, if certain categories showed different numerical distributions), suggest 3-4 concrete and relevant potential next steps for a more in-depth analysis. Make these actionable and data-driven.
        Examples:
        - If missing data: "Develop a strategy for handling missing values in columns X, Y, Z (e.g., imputation, removal)."
        - If strong correlation: "Further investigate the strong correlation between A and B using domain knowledge or advanced statistical tests."
        - If outliers: "Examine potential outliers in feature Q to determine if they are errors or genuine extreme values."
        - If interesting bivariate num-cat: "Perform statistical tests (e.g., ANOVA, t-tests) to confirm if differences in numerical feature M across categories of P are significant."
        - If high cardinality cat: "Consider dimensionality reduction or feature engineering techniques for high-cardinality categorical features like R."
        (3-4 paragraphs total, including conclusion)
        """
        llm_conclusion = self._invoke_gemini(prompt).strip() # MODIFIED
        self._rl_add_paragraph(llm_conclusion)

    # --- Main Report Generation Method ---
    def generate_report_pdf_reportlab(self, output_filepath=None, progress_callback=None):
        """Generate a comprehensive PDF report using ReportLab and Gemini."""
        self._check_cancellation()  # Check before starting
        print("Using ReportLab and Gemini for PDF generation with enhanced structure.")
        
        df = self.data_handler.get_df()
        if df is None or df.empty:
            return None, "No data loaded or data is empty, cannot generate report."

        self.story = [] 
        self.figure_count = 0
        self.table_count = 0
        
        reports_dir = "generated_reports"
        os.makedirs(reports_dir, exist_ok=True)
        
        original_filename = self.data_handler.get_filename() or "Dataset"
        sanitized_base_filename = "".join(c if c.isalnum() else "_" for c in os.path.splitext(original_filename)[0])
        safe_report_title_name = sanitized_base_filename.replace("_", " ").title() 

        # Use provided output filepath if given, otherwise generate one
        if output_filepath:
            report_filename_pdf = output_filepath
        else:
            report_uuid = uuid.uuid4()
            report_filename_pdf = os.path.join(reports_dir, f"Automated_Gemini_Analysis_{sanitized_base_filename}_{report_uuid}.pdf")

        doc = SimpleDocTemplate(report_filename_pdf, pagesize=letter,
                              rightMargin=0.75*inch, leftMargin=0.75*inch,
                              topMargin=0.75*inch, bottomMargin=1.25*inch) 
        
        def my_page_template(canvas, doc):
            canvas.saveState()
            canvas.setFont('Helvetica', 8)
            report_date = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M")
            footer_title = (safe_report_title_name[:50] + '...') if len(safe_report_title_name) > 50 else safe_report_title_name
            page_num_text = f"Page {doc.page} | EDI.ai Gemini Analysis: {footer_title} | Generated: {report_date}" # Updated footer
            canvas.drawCentredString(letter[0]/2, 0.5*inch, page_num_text)
            canvas.restoreState()

        max_steps = 7 
        current_step = 0
        all_section_summaries = [] 

        def update_progress(desc, section_summary=None):
            nonlocal current_step
            current_step += 1
            if section_summary:
                all_section_summaries.append(section_summary)
            if progress_callback:
                progress_callback(current_step / max_steps, desc)

        try:
            self._rl_add_title(f"Automated Data Analysis Report (via Gemini): {safe_report_title_name}") # Updated title
            
            exec_summary_placeholder_index = len(self.story)
            self.story.append(Spacer(1,0.01*inch))

            self._check_cancellation()
            update_progress("Generating Data Overview (Gemini)...")
            df_overview_summary = self._generate_data_overview(df.copy()) 
            all_section_summaries.append(f"Overview: {df_overview_summary}")

            self._check_cancellation()
            update_progress("Assessing Data Quality (Gemini)...")
            dq_summary = self._generate_data_quality_assessment(df.copy())
            all_section_summaries.append(f"Quality: {dq_summary}")
            
            self._check_cancellation()
            update_progress("Performing Univariate Analysis (Gemini)...")
            univar_summary = self._generate_univariate_analysis(df.copy())
            all_section_summaries.append(f"Univariate: {univar_summary}")
            
            self._check_cancellation()
            update_progress("Performing Bivariate Analysis (Gemini)...")
            bivar_summary = self._generate_bivariate_analysis(df.copy())
            all_section_summaries.append(f"Bivariate: {bivar_summary}")

            self._check_cancellation()
            update_progress("Synthesizing Key Findings (Gemini)...")
            current_full_summary_for_findings = "\n".join(all_section_summaries)
            self._generate_key_findings_summary(df.copy(), current_full_summary_for_findings)
            all_section_summaries.append("Key findings synthesized based on quality, univariate, and bivariate analyses.") 

            self._check_cancellation()
            story_after_placeholder = self.story[exec_summary_placeholder_index+1:]
            self.story = self.story[:exec_summary_placeholder_index] 
            
            update_progress("Generating Executive Summary (Gemini)...") 
            self._generate_executive_summary(current_full_summary_for_findings) 
            self.story.extend(story_after_placeholder) 

            self._check_cancellation()
            update_progress("Formulating Conclusion & Next Steps (Gemini)...")
            current_full_summary_for_conclusion = "\n".join(all_section_summaries)
            self._generate_conclusion_and_next_steps(df.copy(), current_full_summary_for_conclusion)
            
            update_progress("Building PDF Document...")
            doc.build(self.story, onFirstPage=my_page_template, onLaterPages=my_page_template)

            if progress_callback: progress_callback(1.0, "Report PDF generated successfully with Gemini!")
            return report_filename_pdf, f"Report (Gemini) generated: {os.path.basename(report_filename_pdf)}"
        
        except InterruptedError: 
            # Cleanup
            if os.path.exists(report_filename_pdf):
                try: os.remove(report_filename_pdf) 
                except OSError: pass
            return None, "Report generation cancelled by user."
        except Exception as e:
            # Cleanup
            if os.path.exists(report_filename_pdf):
                try: os.remove(report_filename_pdf)
                except OSError: pass
            print(f"Error building PDF with ReportLab (Gemini workflow): {e}")
            import traceback
            traceback.print_exc()
            return None, f"Error building PDF (Gemini): {str(e)}"

    def generate_report(self, output_filepath=None, progress_callback=None):
        """Main method to generate the entire report. Wrapper around generate_report_pdf_reportlab."""
        try:
            # Ensure we're using the Agg backend
            import matplotlib
            matplotlib.use('Agg')
            
            # Clean up any existing plots before starting
            plt.close('all')
            
            # Generate the report
            report_path, status = self.generate_report_pdf_reportlab(output_filepath, progress_callback)
            
            return report_path, status
        except Exception as e:
            print(f"Error generating report: {str(e)}")
            raise
        finally:
            # Ensure all plots are closed at the end to prevent memory leaks
            try:
                plt.close('all')
            except Exception as close_error:
                print(f"Error closing plots: {str(close_error)}")