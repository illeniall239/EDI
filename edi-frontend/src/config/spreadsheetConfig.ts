/**
 * Spreadsheet Engine Configuration
 * 
 * Controls which spreadsheet engine to use (Luckysheet vs Univer)
 * during the migration period.
 */

export const SPREADSHEET_ENGINE = {
  LUCKYSHEET: 'luckysheet',
  UNIVER: 'univer'
} as const;

export type SpreadsheetEngine = typeof SPREADSHEET_ENGINE[keyof typeof SPREADSHEET_ENGINE];

/**
 * Feature flag to enable Univer spreadsheet engine
 *
 * Default: true (use Univer) - Luckysheet is deprecated
 *
 * Note: Univer is now the only supported engine. This function always returns UNIVER.
 * The localStorage check is kept for backward compatibility but defaults to Univer.
 */
export function getSpreadsheetEngine(): SpreadsheetEngine {
  // ALWAYS use Univer - Luckysheet is deprecated
  // localStorage check kept for backward compatibility only
  if (typeof window !== 'undefined') {
    const useLuckysheet = localStorage.getItem('USE_UNIVER') === 'false';
    if (useLuckysheet) {
      console.warn('⚠️ Luckysheet is deprecated and no longer supported. Using Univer.');
    }
  }
  return SPREADSHEET_ENGINE.UNIVER;
}

/**
 * Toggle between Luckysheet and Univer
 * @deprecated Univer is now the only supported engine. This function does nothing.
 */
export function toggleSpreadsheetEngine(): void {
  console.warn('⚠️ toggleSpreadsheetEngine() is deprecated - Univer is the only supported engine');
  // Do nothing - Univer is always used
}

/**
 * Check if Univer is enabled
 * @returns Always true - Univer is the only supported engine
 */
export function isUniverEnabled(): boolean {
  return true; // Always use Univer
}

/**
 * Check if using Luckysheet engine
 * @deprecated Luckysheet is no longer supported
 * @returns Always false - Luckysheet is deprecated
 */
export function isLuckysheetEnabled(): boolean {
  return false; // Luckysheet is deprecated
}

/**
 * Univer-specific configuration
 */
export const UNIVER_CONFIG = {
  // Locale settings
  locale: 'en-US',
  
  // Theme settings
  theme: 'default',
  
  // Performance settings
  enableLazyLoad: true,
  maxRows: 10000,
  maxCols: 100,
  
  // Feature flags
  features: {
    formula: true,
    formatting: true,
    charts: false, // Enable later
    collaboration: false, // Enable later
    comments: false, // Enable later
  }
};

/**
 * Luckysheet-specific configuration (for comparison/reference)
 */
export const LUCKYSHEET_CONFIG = {
  showtoolbar: false,
  showsheetbar: false,
  showstatisticBar: false,
  enableAddRow: true,
  enableAddCol: true,
  userInfo: false,
  showConfigWindowResize: false,
  column: 26,
  row: 1000,
};

