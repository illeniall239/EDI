/**
 * Univer Data Conversion Utilities
 *
 * Converts between our internal array format and Univer's data structures
 */

import type { IWorkbookData, ICellData, IObjectMatrixPrimitiveType } from '@univerjs/core';
import { CellValueType, LocaleType } from '@univerjs/core';

// Use configured row count (default 1000 for better UX)
const DEFAULT_ROW_COUNT = 1000;

/**
 * Convert array of objects to Univer workbook data structure
 */
export function arrayToUniverData(
  data: any[],
  columnOrder?: string[]
): IWorkbookData {
  if (!data || data.length === 0) {
    return createEmptyWorkbook();
  }

  // Extract headers (column names)
  const headers = columnOrder || Object.keys(data[0] || {});
  // If there are rows but no headers/keys, fall back to a default-sized empty workbook
  if (!headers || headers.length === 0) {
    return createEmptyWorkbook(Math.max(DEFAULT_ROW_COUNT, (data?.length || 0) + 1), 26);
  }
  
  // Create cell data matrix
  const cellData: IObjectMatrixPrimitiveType<ICellData> = {};
  
  // Add headers in row 0
  headers.forEach((header, colIndex) => {
    if (!cellData[0]) cellData[0] = {};
    cellData[0][colIndex] = {
      v: header,
      t: CellValueType.STRING,
      s: {
        // Header styling
        bl: 1, // bold
        bg: { rgb: '#f0f0f0' }, // background color
      }
    };
  });

  // Add data rows (starting from row 1)
  data.forEach((row, rowIndex) => {
    const univerRow = rowIndex + 1;
    if (!cellData[univerRow]) cellData[univerRow] = {};
    
    headers.forEach((header, colIndex) => {
      const value = row[header];
      cellData[univerRow][colIndex] = convertValueToUniverCell(value);
    });
  });

  return {
    id: 'workbook-01',
    appVersion: '0.1.0',
    sheets: {
      'sheet-01': {
        id: 'sheet-01',
        name: 'Sheet1',
        cellData,
        rowCount: Math.max(data.length + 1, DEFAULT_ROW_COUNT), // ensure usable grid with 1000 rows
        columnCount: Math.max(headers.length, 26),
        defaultRowHeight: 25,
        defaultColumnWidth: 100,
      }
    },
    locale: LocaleType.EN_US,
    name: 'Workbook',
    sheetOrder: ['sheet-01'],
    styles: {},
  };
}

/**
 * Convert Univer workbook data to array of objects
 */
export function univerDataToArray(workbook: IWorkbookData): {
  data: any[];
  columnOrder: string[];
} {
  const firstSheet = Object.values(workbook.sheets || {})[0];
  
  if (!firstSheet || !firstSheet.cellData) {
    return { data: [], columnOrder: [] };
  }

  const cellData = firstSheet.cellData;
  
  // Extract headers from row 0
  const headers: string[] = [];
  const headerRow = cellData[0] || {};
  
  let maxCol = 0;
  Object.keys(headerRow).forEach(colStr => {
    const col = parseInt(colStr);
    if (col > maxCol) maxCol = col;
  });
  
  for (let col = 0; col <= maxCol; col++) {
    const cell = headerRow[col];
    headers[col] = cell?.v?.toString() || `Column${col}`;
  }

  // Extract data rows (starting from row 1)
  const data: any[] = [];
  const rows = Object.keys(cellData)
    .map(Number)
    .filter(r => r > 0)
    .sort((a, b) => a - b);

  rows.forEach(rowIndex => {
    const row = cellData[rowIndex] || {};
    const rowData: any = {};
    
    headers.forEach((header, colIndex) => {
      const cell = row[colIndex];
      rowData[header] = convertUniverCellToValue(cell);
    });
    
    // Only add row if it has data
    const hasData = Object.values(rowData).some(v => v !== null && v !== undefined && v !== '');
    if (hasData) {
      data.push(rowData);
    }
  });

  return { data, columnOrder: headers };
}

/**
 * Convert a value to Univer cell format
 */
function convertValueToUniverCell(value: any): ICellData {
  // Handle formulas (strings starting with =)
  if (typeof value === 'string' && value.trim().startsWith('=')) {
    return {
      f: value.trim(),
      v: null, // Will be calculated
      t: CellValueType.NUMBER, // Assume formula returns number
    };
  }

  // Handle numbers
  if (typeof value === 'number') {
    return {
      v: value,
      t: CellValueType.NUMBER,
    };
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    return {
      v: value ? 1 : 0,
      t: CellValueType.BOOLEAN,
    };
  }

  // Handle null/undefined
  if (value === null || value === undefined) {
    return {
      v: '',
      t: CellValueType.STRING,
    };
  }

  // Default to string
  return {
    v: String(value),
    t: CellValueType.STRING,
  };
}

/**
 * Convert Univer cell to plain value
 */
function convertUniverCellToValue(cell: ICellData | undefined): any {
  if (!cell) return null;

  // If cell has a formula, return the formula string
  if (cell.f) {
    return cell.f;
  }

  // Otherwise return the computed value
  return cell.v ?? null;
}

/**
 * Create an empty Univer workbook
 */
function createEmptyWorkbook(rows: number = DEFAULT_ROW_COUNT, cols: number = 26): IWorkbookData {
  return {
    id: 'workbook-01',
    appVersion: '0.1.0',
    sheets: {
      'sheet-01': {
        id: 'sheet-01',
        name: 'Sheet1',
        cellData: {},
        rowCount: rows,
        columnCount: cols,
      }
    },
    locale: LocaleType.EN_US,
    name: 'Workbook',
    sheetOrder: ['sheet-01'],
    styles: {},
  };
}

/**
 * Convert Luckysheet celldata format to Univer format
 * Useful for migrating saved data
 */
export function luckysheetToUniverCellData(
  luckysheetCelldata: any[]
): IObjectMatrixPrimitiveType<ICellData> {
  const univerCellData: IObjectMatrixPrimitiveType<ICellData> = {};

  luckysheetCelldata.forEach((cell: any) => {
    const row = cell.r;
    const col = cell.c;
    const cellValue = cell.v;

    if (!univerCellData[row]) {
      univerCellData[row] = {};
    }

    // Convert Luckysheet cell format to Univer format
    const univerCell: ICellData = {
      v: cellValue?.v ?? null,
      t: detectCellType(cellValue?.v),
    };

    // Preserve formula
    if (cellValue?.f) {
      univerCell.f = cellValue.f;
    }

    // Preserve formatting (basic mapping)
    if (cellValue?.s) {
      univerCell.s = cellValue.s;
    }

    univerCellData[row][col] = univerCell;
  });

  return univerCellData;
}

/**
 * Detect cell type from value
 */
function detectCellType(value: any): CellValueType {
  if (typeof value === 'number') {
    return CellValueType.NUMBER;
  }
  if (typeof value === 'boolean') {
    return CellValueType.BOOLEAN;
  }
  return CellValueType.STRING;
}

/**
 * Export utilities
 */
export const UniverConverter = {
  arrayToUniver: arrayToUniverData,
  univerToArray: univerDataToArray,
  luckysheetToUniver: luckysheetToUniverCellData,
  valueToCell: convertValueToUniverCell,
  cellToValue: convertUniverCellToValue,
};

