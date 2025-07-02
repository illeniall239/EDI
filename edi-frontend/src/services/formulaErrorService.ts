import { v4 as uuidv4 } from 'uuid';

export interface FormulaError {
  id: string;
  timestamp: string;
  cellReference: string;
  formula: string;
  errorType: string;
  errorMessage: string;
  solution?: string;
  examples?: string[];
  resolved?: boolean;
}

interface ErrorAnalysisResponse {
  problem: string;
  solution: string;
  examples?: string[];
}

class FormulaErrorService {
  private static instance: FormulaErrorService;
  private errorHistory: FormulaError[] = [];
  
  private constructor() {
    // Load existing errors from localStorage on initialization
    this.loadErrorHistory();
  }

  public static getInstance(): FormulaErrorService {
    if (!FormulaErrorService.instance) {
      FormulaErrorService.instance = new FormulaErrorService();
    }
    return FormulaErrorService.instance;
  }

  private loadErrorHistory(): void {
    try {
      const savedErrors = localStorage.getItem('formulaErrorHistory');
      if (savedErrors) {
        this.errorHistory = JSON.parse(savedErrors);
      }
    } catch (error) {
      console.error('Failed to load error history:', error);
    }
  }

  private saveErrorHistory(): void {
    try {
      localStorage.setItem('formulaErrorHistory', JSON.stringify(this.errorHistory));
    } catch (error) {
      console.error('Failed to save error history:', error);
    }
  }

  public async analyzeError(cellRef: string, formula: string, errorType: string): Promise<FormulaError> {
    console.log('Analyzing formula error:', { cellRef, formula, errorType });

    // Create a new error entry
    const newError: FormulaError = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      cellReference: cellRef,
      formula: formula,
      errorType: errorType,
      errorMessage: '', // Will be populated after analysis
    };

    try {
      // Make API call to analyze the error
      const response = await fetch('/api/analyze-formula-error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formula,
          errorType,
          cellRef,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API error response:', errorData);
        throw new Error(errorData.error || errorData.details || 'Failed to analyze formula error');
      }

      const analysis: ErrorAnalysisResponse = await response.json();
      console.log('Received analysis:', analysis);
      
      // Update error with analysis results
      newError.errorMessage = analysis.problem || 'Error analysis unavailable';
      newError.solution = analysis.solution;
      newError.examples = analysis.examples;
      
      // Add to history and save
      this.errorHistory.unshift(newError);
      this.saveErrorHistory();
      
      return newError;
    } catch (error) {
      console.error('Error analyzing formula:', error);
      
      // Create a fallback error message
      newError.errorMessage = 'Failed to analyze formula error';
      newError.solution = 'Please try again or contact support if the issue persists.';
      
      // Still add to history
      this.errorHistory.unshift(newError);
      this.saveErrorHistory();
      
      return newError;
    }
  }

  public getErrorHistory(): FormulaError[] {
    return this.errorHistory;
  }

  public getError(id: string): FormulaError | undefined {
    return this.errorHistory.find(error => error.id === id);
  }

  public markErrorAsResolved(id: string): void {
    const errorIndex = this.errorHistory.findIndex(error => error.id === id);
    if (errorIndex !== -1) {
      this.errorHistory[errorIndex].resolved = true;
      this.saveErrorHistory();
    }
  }

  public clearErrorHistory(): void {
    this.errorHistory = [];
    this.saveErrorHistory();
  }
}

export default FormulaErrorService; 