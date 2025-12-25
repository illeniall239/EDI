/**
 * Univer API Adapter
 *
 * Provides a unified API interface that wraps Univer's FacadeAPI
 * to maintain compatibility with existing Luckysheet-based AI commands
 * and provide a consistent interface for spreadsheet operations.
 *
 * All operations use Univer's FacadeAPI directly (FWorkbook, FWorksheet, FRange).
 */

import { ICommandService } from '@univerjs/core';
import { AddHyperLinkCommand, CancelHyperLinkCommand, HyperLinkModel } from '@univerjs/sheets-hyper-link';
import { RemoveRowByRangeCommand } from '@univerjs/sheets';

export class UniverAdapter {
  private univerAPI: any;
  private univerInstance: any;
  private workbook: any;
  private worksheet: any;

  constructor(univerAPI: any, univerInstance?: any) {
    this.univerAPI = univerAPI;
    this.univerInstance = univerInstance;
    this.workbook = univerAPI?.getActiveWorkbook?.();
    this.worksheet = this.workbook?.getActiveSheet?.();
  }

  /**
   * Refresh workbook and worksheet references
   */
  private refresh() {
    try {
      if (this.univerAPI) {
        this.workbook = this.univerAPI.getActiveWorkbook?.();
        if (this.workbook) {
          this.worksheet = this.workbook.getActiveSheet?.();
        } else {
          console.warn('[UniverAdapter] Could not get active workbook');
        }
      }
    } catch (error) {
      console.error('[UniverAdapter] Error refreshing references:', error);
    }
  }

  // ==================== READ OPERATIONS ====================

  /**
   * Get data from a range (e.g., "A1:B10")
   */
  getRange(range: string) {
    this.refresh();
    return this.worksheet?.getRange(range);
  }

  /**
   * Get value from a single cell
   */
  getCellValue(row: number, col: number): any {
    this.refresh();
    const range = this.worksheet?.getRange(row, col);
    return range?.getValue();
  }

  /**
   * Get values from a range as 2D array
   */
  getRangeValues(startRow: number, startCol: number, numRows: number, numCols: number): any[][] {
    this.refresh();
    const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);
    return range?.getValues() || [];
  }

  /**
   * Get all data from the sheet as 2D array
   */
  getAllData(): any[][] {
    this.refresh();
    try {
      if (!this.worksheet) {
        console.log('[UniverAdapter] getAllData() - no worksheet');
        return [];
      }

      // Debug: log available methods to understand what APIs are actually present
      const methods = Object.keys(this.worksheet).filter(k => typeof this.worksheet[k] === 'function');
      console.log('[UniverAdapter] getAllData() - worksheet has', methods.length, 'methods');
      console.log('[UniverAdapter] getAllData() - sample methods:', methods.slice(0, 10).join(', '));

      // Use large fixed range since getRange().getValues() is known to work
      // We'll trim empty rows/columns afterwards to find actual data extent
      const MAX_ROWS = 2000;
      const MAX_COLS = 100;

      console.log(`[UniverAdapter] getAllData() - fetching ${MAX_ROWS}x${MAX_COLS} range`);
      const range = this.worksheet.getRange(0, 0, MAX_ROWS, MAX_COLS);

      if (!range) {
        console.log('[UniverAdapter] getAllData() - getRange returned null');
        return [];
      }

      const rawData = range.getValues();
      console.log('[UniverAdapter] getAllData() - raw data:', rawData ? `${rawData.length} rows` : 'null');

      if (!rawData || rawData.length === 0) {
        console.log('[UniverAdapter] getAllData() - no data returned');
        return [];
      }

      // Trim empty trailing rows
      let lastNonEmptyRow = -1;
      for (let r = rawData.length - 1; r >= 0; r--) {
        const row = rawData[r];
        if (row && row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
          lastNonEmptyRow = r;
          break;
        }
      }

      if (lastNonEmptyRow === -1) {
        console.log('[UniverAdapter] getAllData() - all rows are empty');
        return [];
      }

      // Trim empty trailing columns
      let lastNonEmptyCol = -1;
      for (let c = rawData[0].length - 1; c >= 0; c--) {
        for (let r = 0; r <= lastNonEmptyRow; r++) {
          const cell = rawData[r][c];
          if (cell !== null && cell !== undefined && cell !== '') {
            lastNonEmptyCol = c;
            break;
          }
        }
        if (lastNonEmptyCol !== -1) break;
      }

      if (lastNonEmptyCol === -1) {
        console.log('[UniverAdapter] getAllData() - all columns are empty');
        return [];
      }

      // Trim the data to actual extent
      const trimmedData = rawData.slice(0, lastNonEmptyRow + 1).map(row => row.slice(0, lastNonEmptyCol + 1));

      console.log(`[UniverAdapter] getAllData() - trimmed to ${trimmedData.length} rows x ${trimmedData[0]?.length || 0} cols`);

      return trimmedData;
    } catch (error) {
      console.error('[UniverAdapter] Error getting all data:', error);
      return [];
    }
  }

  /**
   * Get formula from a cell
   */
  getFormula(row: number, col: number): string | null {
    this.refresh();
    const range = this.worksheet?.getRange(row, col);
    return range?.getFormula() || null;
  }

  // ==================== WRITE OPERATIONS ====================

  /**
   * Set value in a single cell
   */
  setCellValue(row: number, col: number, value: any): boolean {
    try {
      this.refresh();
      const range = this.worksheet?.getRange(row, col);
      range?.setValue(value);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting cell value:', error);
      return false;
    }
  }

  /**
   * Set values in a range (2D array)
   */
  setRangeValues(startRow: number, startCol: number, values: any[][]): boolean {
    try {
      this.refresh();
      const numRows = values.length;
      const numCols = values[0]?.length || 0;
      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);
      range?.setValues(values);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting range values:', error);
      return false;
    }
  }

  /**
   * Set formula in a cell
   */
  setFormula(row: number, col: number, formula: string): boolean {
    try {
      this.refresh();
      const range = this.worksheet?.getRange(row, col);
      range?.setFormula(formula);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting formula:', error);
      return false;
    }
  }

  /**
   * Load data from array (for file uploads)
   */
  loadData(data: any[][], clearExisting: boolean = true): boolean {
    try {
      console.log('[UniverAdapter] loadData called with:', {
        rows: data.length,
        cols: data[0]?.length || 0,
        clearExisting
      });

      this.refresh();
      
      console.log('[UniverAdapter] Worksheet available:', !!this.worksheet);
      
      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available!');
        return false;
      }

      if (clearExisting) {
        console.log('[UniverAdapter] Clearing existing data...');
        this.worksheet.clear();
      }

      if (!data || data.length === 0) {
        console.warn('[UniverAdapter] No data to load');
        return false;
      }

      console.log('[UniverAdapter] Setting data...');
      // Set all data at once
      const range = this.worksheet.getRange(0, 0, data.length, data[0].length);
      console.log('[UniverAdapter] Range obtained:', !!range);
      
      if (!range) {
        console.error('[UniverAdapter] Could not get range!');
        return false;
      }

      range.setValues(data);
      console.log(`✅ [UniverAdapter] Successfully loaded ${data.length} rows x ${data[0].length} columns`);
      
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error loading data:', error);
      console.error('[UniverAdapter] Error stack:', error instanceof Error ? error.stack : 'N/A');
      return false;
    }
  }

  // ==================== FORMATTING OPERATIONS ====================

  /**
   * Set background color for a range
   */
  setBackgroundColor(startRow: number, startCol: number, numRows: number, numCols: number, color: string): boolean {
    try {
      this.refresh();
      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);
      range?.setBackgroundColor(color);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting background color:', error);
      return false;
    }
  }

  /**
   * Set font color for a range
   */
  setFontColor(startRow: number, startCol: number, numRows: number, numCols: number, color: string): boolean {
    try {
      this.refresh();
      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);
      range?.setFontColor(color);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting font color:', error);
      return false;
    }
  }

  /**
   * Set font weight (bold)
   */
  setFontWeight(startRow: number, startCol: number, numRows: number, numCols: number, weight: string): boolean {
    try {
      this.refresh();
      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);
      range?.setFontWeight(weight);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting font weight:', error);
      return false;
    }
  }

  /**
   * Set horizontal alignment for range
   */
  setHorizontalAlignment(startRow: number, startCol: number, numRows: number, numCols: number, alignment: 'left' | 'center' | 'right'): boolean {
    try {
      this.refresh();
      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);
      range?.setHorizontalAlignment(alignment);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting horizontal alignment:', error);
      return false;
    }
  }

  /**
   * Get column headers from first row
   */
  getHeaders(): string[] {
    try {
      this.refresh();
      if (!this.worksheet) {
        console.error('[UniverAdapter] Worksheet not available');
        return [];
      }

      const maxColumns = this.worksheet.getMaxColumns();
      const headers: string[] = [];

      for (let col = 0; col < maxColumns; col++) {
        const cellValue = this.worksheet.getRange(0, col, 1, 1).getValue();
        if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
          headers.push(String(cellValue));
        } else {
          break; // Stop when we hit an empty header
        }
      }

      return headers;
    } catch (error) {
      console.error('[UniverAdapter] Error getting headers:', error);
      return [];
    }
  }

  /**
   * Insert a single row at the specified position
   */
  insertRow(rowIndex: number, rowValues: any[]): boolean {
    try {
      this.refresh();
      if (!this.worksheet) {
        console.error('[UniverAdapter] Worksheet not available');
        return false;
      }

      console.log(`[UniverAdapter] Inserting row at index ${rowIndex}`);
      console.log(`[UniverAdapter] rowValues:`, rowValues);

      // Ensure rowValues is a valid array
      if (!Array.isArray(rowValues) || rowValues.length === 0) {
        console.error('[UniverAdapter] Invalid rowValues');
        return false;
      }

      // Get current dimensions
      const maxRows = this.worksheet.getMaxRows();
      const maxCols = Math.max(this.worksheet.getMaxColumns(), rowValues.length);

      console.log(`[UniverAdapter] Current dimensions: ${maxRows} rows x ${maxCols} cols`);

      // Build the new data array manually to avoid splice issues
      const newData: any[][] = [];

      // Add rows before insertion point
      for (let r = 0; r < rowIndex && r < maxRows; r++) {
        const row: any[] = [];
        for (let c = 0; c < maxCols; c++) {
          try {
            const val = this.worksheet.getRange(r, c, 1, 1).getValue();
            row.push(val);
          } catch {
            row.push(null);
          }
        }
        newData.push(row);
      }

      // Add the new row
      const newRow: any[] = [];
      for (let i = 0; i < maxCols; i++) {
        newRow.push(i < rowValues.length ? rowValues[i] : null);
      }
      newData.push(newRow);

      // Add rows after insertion point
      for (let r = rowIndex; r < maxRows; r++) {
        const row: any[] = [];
        for (let c = 0; c < maxCols; c++) {
          try {
            const val = this.worksheet.getRange(r, c, 1, 1).getValue();
            row.push(val);
          } catch {
            row.push(null);
          }
        }
        newData.push(row);
      }

      console.log(`[UniverAdapter] Built new data array with ${newData.length} rows`);

      // Clear the worksheet
      if (maxRows > 0 && maxCols > 0) {
        this.worksheet.getRange(0, 0, maxRows, maxCols).clear();
      }

      // Write all data back
      for (let r = 0; r < newData.length; r++) {
        for (let c = 0; c < newData[r].length; c++) {
          const value = newData[r][c];
          if (value !== null && value !== undefined && value !== '') {
            try {
              this.worksheet.getRange(r, c, 1, 1).setValue(value);
            } catch (error) {
              console.error(`[UniverAdapter] Error setting cell (${r},${c}):`, error);
            }
          }
        }
      }

      console.log(`[UniverAdapter] Successfully inserted row at index ${rowIndex}`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error inserting row:', error);
      console.error('[UniverAdapter] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      return false;
    }
  }

  /**
   * Insert multiple rows at the specified position
   */
  insertMultipleRows(startRowIndex: number, rowsData: any[][]): boolean {
    try {
      this.refresh();
      if (!this.worksheet) {
        console.error('[UniverAdapter] Worksheet not available');
        return false;
      }

      console.log(`[UniverAdapter] Inserting ${rowsData.length} rows at index ${startRowIndex}`);

      // Ensure rowsData is valid
      if (!Array.isArray(rowsData) || rowsData.length === 0) {
        console.error('[UniverAdapter] Invalid rowsData');
        return false;
      }

      // Get current dimensions
      const maxRows = this.worksheet.getMaxRows();
      let maxCols = this.worksheet.getMaxColumns();

      // Find max columns needed
      for (const row of rowsData) {
        if (Array.isArray(row)) {
          maxCols = Math.max(maxCols, row.length);
        }
      }

      console.log(`[UniverAdapter] Current dimensions: ${maxRows} rows x ${maxCols} cols`);

      // Build the new data array manually to avoid splice issues
      const newData: any[][] = [];

      // Add rows before insertion point
      for (let r = 0; r < startRowIndex && r < maxRows; r++) {
        const row: any[] = [];
        for (let c = 0; c < maxCols; c++) {
          try {
            const val = this.worksheet.getRange(r, c, 1, 1).getValue();
            row.push(val);
          } catch {
            row.push(null);
          }
        }
        newData.push(row);
      }

      // Add the new rows
      for (const rowData of rowsData) {
        const newRow: any[] = [];
        for (let i = 0; i < maxCols; i++) {
          newRow.push(i < rowData.length ? rowData[i] : null);
        }
        newData.push(newRow);
      }

      // Add rows after insertion point
      for (let r = startRowIndex; r < maxRows; r++) {
        const row: any[] = [];
        for (let c = 0; c < maxCols; c++) {
          try {
            const val = this.worksheet.getRange(r, c, 1, 1).getValue();
            row.push(val);
          } catch {
            row.push(null);
          }
        }
        newData.push(row);
      }

      console.log(`[UniverAdapter] Built new data array with ${newData.length} rows`);

      // Clear the worksheet
      if (maxRows > 0 && maxCols > 0) {
        this.worksheet.getRange(0, 0, maxRows, maxCols).clear();
      }

      // Write all data back
      for (let r = 0; r < newData.length; r++) {
        for (let c = 0; c < newData[r].length; c++) {
          const value = newData[r][c];
          if (value !== null && value !== undefined && value !== '') {
            try {
              this.worksheet.getRange(r, c, 1, 1).setValue(value);
            } catch (error) {
              console.error(`[UniverAdapter] Error setting cell (${r},${c}):`, error);
            }
          }
        }
      }

      console.log(`[UniverAdapter] Successfully inserted ${rowsData.length} rows at index ${startRowIndex}`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error inserting multiple rows:', error);
      console.error('[UniverAdapter] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      return false;
    }
  }

  /**
   * Set number format
   */
  setNumberFormat(startRow: number, startCol: number, numRows: number, numCols: number, format: string): boolean {
    try {
      this.refresh();
      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);
      range?.setNumberFormat(format);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting number format:', error);
      return false;
    }
  }

  /**
   * Set font style (italic)
   */
  setFontStyle(startRow: number, startCol: number, numRows: number, numCols: number, style: 'italic' | 'normal'): boolean {
    try {
      this.refresh();
      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);
      // Univer uses setFontStyle for italic
      range?.setFontStyle?.(style);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting font style:', error);
      return false;
    }
  }

  /**
   * Set font line (underline, strikethrough)
   */
  setFontLine(startRow: number, startCol: number, numRows: number, numCols: number, line: 'underline' | 'line-through' | 'none'): boolean {
    try {
      this.refresh();
      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);
      // Univer uses setFontLine for underline/strikethrough
      range?.setFontLine?.(line);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting font line:', error);
      return false;
    }
  }

  // ==================== ROW/COLUMN SIZING ====================

  /**
   * Set width of a single column
   */
  setColumnWidth(columnIndex: number, _width: number): boolean {
    try {
      this.refresh();
      this.worksheet?.setColumnWidth(columnIndex, _width);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting column width:', error);
      return false;
    }
  }

  /**
   * Set width of multiple columns
   */
  setColumnWidths(startCol: number, numCols: number, _width: number): boolean {
    try {
      this.refresh();
      this.worksheet?.setColumnWidths(startCol, numCols, _width);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting column widths:', error);
      return false;
    }
  }

  /**
   * Auto-resize columns to fit content (autofit)
   */
  autoResizeColumns(startCol: number, numCols: number): boolean {
    try {
      this.refresh();

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available for autoResizeColumns');
        return false;
      }

      if (typeof this.worksheet.autoResizeColumns !== 'function') {
        console.error('[UniverAdapter] autoResizeColumns method not available on worksheet');
        console.log('[UniverAdapter] Available methods:', Object.keys(this.worksheet).filter(k => typeof this.worksheet[k] === 'function'));
        return false;
      }

      console.log(`[UniverAdapter] Calling autoResizeColumns(${startCol}, ${numCols})`);
      this.worksheet.autoResizeColumns(startCol, numCols);
      console.log('[UniverAdapter] autoResizeColumns completed successfully');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error auto-resizing columns:', error);
      return false;
    }
  }

  /**
   * Set height of a single row
   */
  setRowHeight(rowIndex: number, _height: number): boolean {
    try {
      this.refresh();
      this.worksheet?.setRowHeight(rowIndex, _height);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting row height:', error);
      return false;
    }
  }

  /**
   * Set height of multiple rows
   */
  setRowHeights(startRow: number, numRows: number, _height: number): boolean {
    try {
      this.refresh();
      this.worksheet?.setRowHeights(startRow, numRows, _height);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting row heights:', error);
      return false;
    }
  }

  /**
   * Auto-resize rows to fit content
   */
  autoResizeRows(startRow: number, numRows: number): boolean {
    try {
      this.refresh();

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available for autoResizeRows');
        return false;
      }

      if (typeof this.worksheet.autoResizeRows !== 'function') {
        console.error('[UniverAdapter] autoResizeRows method not available on worksheet');
        return false;
      }

      console.log(`[UniverAdapter] Calling autoResizeRows(${startRow}, ${numRows})`);
      this.worksheet.autoResizeRows(startRow, numRows);
      console.log('[UniverAdapter] autoResizeRows completed successfully');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error auto-resizing rows:', error);
      return false;
    }
  }

  /**
   * Autofit all columns to content (wrapper for autoResizeColumns)
   */
  autofitColumns(): boolean {
    try {
      console.log('[UniverAdapter] autofitColumns() started');
      const dimensions = this.getSheetDimensions();
      console.log('[UniverAdapter] Dimensions:', dimensions);

      if (dimensions.cols === 0) {
        console.error('[UniverAdapter] autofitColumns failed: cols = 0');
        return false;
      }

      console.log(`[UniverAdapter] Calling autoResizeColumns(0, ${dimensions.cols})`);
      return this.autoResizeColumns(0, dimensions.cols);
    } catch (error) {
      console.error('[UniverAdapter] Error autofitting columns:', error);
      return false;
    }
  }

  /**
   * Autofit all rows to content (wrapper for autoResizeRows)
   */
  autofitRows(): boolean {
    try {
      console.log('[UniverAdapter] autofitRows() started');
      const dimensions = this.getSheetDimensions();
      console.log('[UniverAdapter] Dimensions:', dimensions);

      if (dimensions.rows === 0) {
        console.error('[UniverAdapter] autofitRows failed: rows = 0');
        return false;
      }

      console.log(`[UniverAdapter] Calling autoResizeRows(0, ${dimensions.rows})`);
      return this.autoResizeRows(0, dimensions.rows);
    } catch (error) {
      console.error('[UniverAdapter] Error autofitting rows:', error);
      return false;
    }
  }

  // ==================== SHEET OPERATIONS ====================

  /**
   * Clear all data from the sheet
   */
  clearSheet(): boolean {
    try {
      this.refresh();
      this.worksheet?.clear();
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error clearing sheet:', error);
      return false;
    }
  }

  /**
   * Clear a specific range
   */
  clearRange(startRow: number, startCol: number, numRows: number, numCols: number): boolean {
    try {
      this.refresh();
      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);
      range?.clear();
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error clearing range:', error);
      return false;
    }
  }

  /**
   * Sort data by column
   */
  sort(range: string, columnIndex: number, ascending: boolean = true): boolean {
    try {
      this.refresh();
      this.worksheet?.sort(range, columnIndex, ascending);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error sorting:', error);
      return false;
    }
  }

  /**
   * Apply auto filter to a range
   */
  autoFilter(range: string): boolean {
    try {
      this.refresh();
      this.worksheet?.autoFilter(range);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error applying filter:', error);
      return false;
    }
  }

  // ==================== UTILITY OPERATIONS ====================

  /**
   * Get sheet dimensions
   */
  getSheetDimensions(): { rows: number; cols: number } {
    try {
      this.refresh();
      const data = this.getAllData();
      return {
        rows: data.length,
        cols: data[0]?.length || 0
      };
    } catch (error) {
      console.error('[UniverAdapter] Error getting dimensions:', error);
      return { rows: 0, cols: 0 };
    }
  }

  /**
   * Check if Univer is ready
   */
  isReady(): boolean {
    // Refresh to get latest workbook/worksheet references
    this.refresh();
    const ready = !!(this.univerAPI && this.workbook && this.worksheet);
    
    if (!ready) {
      console.warn('[UniverAdapter] Not ready:', {
        hasAPI: !!this.univerAPI,
        hasWorkbook: !!this.workbook,
        hasWorksheet: !!this.worksheet
      });
    }
    
    return ready;
  }

  /**
   * Get raw Univer API for advanced operations
   */
  getRawAPI(): any {
    return this.univerAPI;
  }

  /**
   * Get active workbook
   */
  getWorkbook(): any {
    this.refresh();
    return this.workbook;
  }

  /**
   * Get active worksheet
   */
  getWorksheet(): any {
    this.refresh();
    return this.worksheet;
  }

  /**
   * Get current cell selection (active cell)
   * Returns { row: number, col: number } or null if no selection
   */
  getCurrentSelection(): { row: number; col: number } | null {
    try {
      this.refresh();

      // Try to get the active selection from Univer
      // Univer's FacadeAPI provides getActiveRange() for the current selection
      const activeRange = this.worksheet?.getActiveRange?.();

      if (activeRange) {
        // Get the top-left cell of the selection (primary cell)
        const row = activeRange.getRow?.() ?? 0;
        const col = activeRange.getColumn?.() ?? 0;

        console.log('[UniverAdapter] Current selection:', { row, col });
        return { row, col };
      }

      // Fallback to A1 (0, 0) if no selection found
      console.warn('[UniverAdapter] No active selection found, defaulting to A1');
      return { row: 0, col: 0 };
    } catch (error) {
      console.error('[UniverAdapter] Error getting current selection:', error);
      return { row: 0, col: 0 };
    }
  }

  /**
   * Get current active range (full selection with dimensions)
   * Returns { startRow, startCol, numRows, numCols } or null if no selection
   */
  getCurrentActiveRange(): {
    startRow: number;
    startCol: number;
    numRows: number;
    numCols: number
  } | null {
    try {
      this.refresh();

      // Get the active selection range from Univer
      const activeRange = this.worksheet?.getActiveRange?.();

      if (activeRange) {
        const startRow = activeRange.getRow?.() ?? 0;
        const startCol = activeRange.getColumn?.() ?? 0;
        const numRows = activeRange.getNumRows?.() ?? 1;
        const numCols = activeRange.getNumColumns?.() ?? 1;

        console.log('[UniverAdapter] Active range:', { startRow, startCol, numRows, numCols });
        return { startRow, startCol, numRows, numCols };
      }

      // Fallback to A1 cell if no selection found
      console.warn('[UniverAdapter] No active range found, defaulting to A1');
      return { startRow: 0, startCol: 0, numRows: 1, numCols: 1 };
    } catch (error) {
      console.error('[UniverAdapter] Error getting active range:', error);
      return { startRow: 0, startCol: 0, numRows: 1, numCols: 1 };
    }
  }

  // ==================== MERGE/UNMERGE OPERATIONS ====================

  /**
   * Merge cells in a range
   * @param startRow Starting row index (0-based)
   * @param startCol Starting column index (0-based)
   * @param numRows Number of rows to merge
   * @param numCols Number of columns to merge
   * @returns Success boolean
   */
  mergeCells(startRow: number, startCol: number, numRows: number, numCols: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Merging cells: (${startRow}, ${startCol}) size ${numRows}x${numCols}`);

      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);

      if (!range) {
        console.error('[UniverAdapter] Could not get range for merging');
        return false;
      }

      range.merge();
      console.log('[UniverAdapter] ✅ Cells merged successfully');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error merging cells:', error);
      return false;
    }
  }

  /**
   * Unmerge cells in a range (break apart merged cells)
   * @param startRow Starting row index (0-based)
   * @param startCol Starting column index (0-based)
   * @param numRows Number of rows in the range
   * @param numCols Number of columns in the range
   * @returns Success boolean
   */
  unmergeCells(startRow: number, startCol: number, numRows: number, numCols: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Unmerging cells: (${startRow}, ${startCol}) size ${numRows}x${numCols}`);

      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);

      if (!range) {
        console.error('[UniverAdapter] Could not get range for unmerging');
        return false;
      }

      range.breakApart();
      console.log('[UniverAdapter] ✅ Cells unmerged successfully');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error unmerging cells:', error);
      return false;
    }
  }

  // ==================== CELL/RANGE INSERT/DELETE OPERATIONS ====================

  /**
   * Insert cells in a range with shift direction
   * @param startRow Starting row index (0-based)
   * @param startCol Starting column index (0-based)
   * @param numRows Number of rows in the range
   * @param numCols Number of columns in the range
   * @param shiftDirection Direction to shift existing cells: 'right' or 'down'
   * @returns Success boolean
   */
  insertCells(startRow: number, startCol: number, numRows: number, numCols: number, shiftDirection: 'right' | 'down' = 'down'): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Inserting cells: (${startRow}, ${startCol}) size ${numRows}x${numCols}, shift ${shiftDirection}`);

      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);

      if (!range) {
        console.error('[UniverAdapter] Could not get range for inserting cells');
        return false;
      }

      // Univer's insertCells expects a dimension parameter
      const dimension = shiftDirection === 'down' ? 0 : 1; // 0 = rows (shift down), 1 = cols (shift right)
      range.insertCells(dimension);
      console.log('[UniverAdapter] ✅ Cells inserted successfully');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error inserting cells:', error);
      return false;
    }
  }

  /**
   * Delete cells in a range with shift direction
   * @param startRow Starting row index (0-based)
   * @param startCol Starting column index (0-based)
   * @param numRows Number of rows in the range
   * @param numCols Number of columns in the range
   * @param shiftDirection Direction to shift remaining cells: 'left' or 'up'
   * @returns Success boolean
   */
  deleteCells(startRow: number, startCol: number, numRows: number, numCols: number, shiftDirection: 'left' | 'up' = 'up'): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Deleting cells: (${startRow}, ${startCol}) size ${numRows}x${numCols}, shift ${shiftDirection}`);

      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);

      if (!range) {
        console.error('[UniverAdapter] Could not get range for deleting cells');
        return false;
      }

      // Univer's deleteCells expects a dimension parameter
      const dimension = shiftDirection === 'up' ? 0 : 1; // 0 = rows (shift up), 1 = cols (shift left)
      range.deleteCells(dimension);
      console.log('[UniverAdapter] ✅ Cells deleted successfully');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error deleting cells:', error);
      return false;
    }
  }

  // ==================== ENHANCED FILTER OPERATIONS ====================

  /**
   * Create a filter on a range
   * @param range Range in A1 notation (e.g., "A1:D10") or empty for auto-detect
   * @returns Success boolean
   */
  createFilter(range?: string): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Creating filter on range: ${range || 'auto-detect'}`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available for creating filter');
        return false;
      }

      const filter = this.worksheet.createFilter();

      if (!filter) {
        console.error('[UniverAdapter] Failed to create filter');
        return false;
      }

      console.log('[UniverAdapter] ✅ Filter created successfully');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error creating filter:', error);
      return false;
    }
  }

  /**
   * Get the active filter on the worksheet
   * @returns Filter object or null if no filter exists
   */
  getFilter(): any {
    try {
      this.refresh();

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available for getting filter');
        return null;
      }

      const filter = this.worksheet.getFilter();
      console.log('[UniverAdapter] Filter retrieved:', filter ? 'exists' : 'none');
      return filter;
    } catch (error) {
      console.error('[UniverAdapter] Error getting filter:', error);
      return null;
    }
  }

  /**
   * Clear/remove the active filter
   * @returns Success boolean
   */
  clearFilter(): boolean {
    try {
      this.refresh();
      console.log('[UniverAdapter] Clearing filter');

      const filter = this.getFilter();

      if (!filter) {
        console.log('[UniverAdapter] No filter to clear');
        return true; // Not an error - just no filter exists
      }

      // Remove the filter using Univer's remove() method
      if (typeof filter.remove === 'function') {
        filter.remove();
        console.log('[UniverAdapter] ✅ Filter cleared successfully');
        return true;
      } else {
        console.warn('[UniverAdapter] Filter remove method not available');
        return false;
      }
    } catch (error) {
      console.error('[UniverAdapter] Error clearing filter:', error);
      return false;
    }
  }

  /**
   * Set filter criteria for a specific column (value-based filtering)
   * @param column Column identifier (letter like 'A' or index like 0)
   * @param values Array of values to show (filter will hide rows not matching these values)
   * @returns Success boolean
   */
  setColumnFilterCriteria(column: string | number, values: string[]): boolean {
    try {
      this.refresh();
      const colIndex = typeof column === 'string' ? this.columnLetterToIndex(column) : column;
      console.log(`[UniverAdapter] Setting filter criteria for column ${column} (index ${colIndex}):`, values);

      const filter = this.getFilter();

      if (!filter) {
        console.error('[UniverAdapter] No filter exists. Create a filter first using createFilter()');
        return false;
      }

      // Apply filter criteria using Univer's setColumnFilterCriteria method
      if (typeof filter.setColumnFilterCriteria === 'function') {
        filter.setColumnFilterCriteria(colIndex, {
          colId: colIndex,
          filters: { filters: values }
        });
        console.log('[UniverAdapter] ✅ Filter criteria applied successfully');
        return true;
      } else {
        console.error('[UniverAdapter] setColumnFilterCriteria method not available on filter object');
        return false;
      }
    } catch (error) {
      console.error('[UniverAdapter] Error setting column filter criteria:', error);
      return false;
    }
  }

  /**
   * Remove filter criteria from a specific column
   * @param column Column identifier (letter like 'A' or index like 0)
   * @returns Success boolean
   */
  removeColumnFilterCriteria(column: string | number): boolean {
    try {
      this.refresh();
      const colIndex = typeof column === 'string' ? this.columnLetterToIndex(column) : column;
      console.log(`[UniverAdapter] Removing filter criteria for column ${column} (index ${colIndex})`);

      const filter = this.getFilter();

      if (!filter) {
        console.log('[UniverAdapter] No filter exists');
        return true;
      }

      if (typeof filter.removeColumnFilterCriteria === 'function') {
        filter.removeColumnFilterCriteria(colIndex);
        console.log('[UniverAdapter] ✅ Column filter criteria removed successfully');
        return true;
      } else {
        console.error('[UniverAdapter] removeColumnFilterCriteria method not available on filter object');
        return false;
      }
    } catch (error) {
      console.error('[UniverAdapter] Error removing column filter criteria:', error);
      return false;
    }
  }

  /**
   * Remove all filter criteria (keeps filter object, just clears all column criteria)
   * @returns Success boolean
   */
  removeAllFilterCriteria(): boolean {
    try {
      this.refresh();
      console.log('[UniverAdapter] Removing all filter criteria');

      const filter = this.getFilter();

      if (!filter) {
        console.log('[UniverAdapter] No filter exists');
        return true;
      }

      if (typeof filter.removeFilterCriteria === 'function') {
        filter.removeFilterCriteria();
        console.log('[UniverAdapter] ✅ All filter criteria removed successfully');
        return true;
      } else {
        console.error('[UniverAdapter] removeFilterCriteria method not available on filter object');
        return false;
      }
    } catch (error) {
      console.error('[UniverAdapter] Error removing all filter criteria:', error);
      return false;
    }
  }

  /**
   * Get array of row indices that are currently filtered out (hidden by filter)
   * @returns Array of row indices (0-based) or empty array
   */
  getFilteredOutRows(): number[] {
    try {
      this.refresh();

      const filter = this.getFilter();

      if (!filter) {
        console.log('[UniverAdapter] No filter exists');
        return [];
      }

      if (typeof filter.getFilteredOutRows === 'function') {
        const filteredRows = filter.getFilteredOutRows();
        console.log('[UniverAdapter] Filtered out rows:', filteredRows);
        return filteredRows || [];
      } else {
        console.error('[UniverAdapter] getFilteredOutRows method not available on filter object');
        return [];
      }
    } catch (error) {
      console.error('[UniverAdapter] Error getting filtered out rows:', error);
      return [];
    }
  }

  /**
   * Helper: Convert column letter to index (A=0, B=1, etc.)
   * @param letter Column letter (case insensitive)
   * @returns Column index (0-based)
   */
  private columnLetterToIndex(letter: string): number {
    const upper = letter.toUpperCase();
    let index = 0;
    for (let i = 0; i < upper.length; i++) {
      index = index * 26 + (upper.charCodeAt(i) - 64);
    }
    return index - 1; // Convert to 0-based
  }

  // ==================== CONDITIONAL FORMATTING METHODS ====================

  /**
   * Create a new conditional formatting rule builder
   * @returns FConditionalFormattingBuilder instance or null
   */
  newConditionalFormattingRule(): any {
    try {
      this.refresh();

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available for creating CF rule');
        return null;
      }

      const builder = this.worksheet.newConditionalFormattingRule();
      console.log('[UniverAdapter] Created CF rule builder');
      return builder;
    } catch (error) {
      console.error('[UniverAdapter] Error creating CF rule builder:', error);
      return null;
    }
  }

  /**
   * Add a conditional formatting rule to the worksheet
   * @param rule Built rule from newConditionalFormattingRule().build()
   * @returns Success boolean
   */
  addConditionalFormattingRule(rule: any): boolean {
    try {
      this.refresh();

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available for adding CF rule');
        return false;
      }

      if (!rule) {
        console.error('[UniverAdapter] No rule provided');
        return false;
      }

      this.worksheet.addConditionalFormattingRule(rule);
      console.log('[UniverAdapter] ✅ CF rule added successfully');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error adding CF rule:', error);
      return false;
    }
  }

  /**
   * Get all conditional formatting rules in the worksheet
   * @returns Array of CF rules or empty array
   */
  getConditionalFormattingRules(): any[] {
    try {
      this.refresh();

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return [];
      }

      const rules = this.worksheet.getConditionalFormattingRules();
      console.log(`[UniverAdapter] Retrieved ${rules?.length || 0} CF rules`);
      return rules || [];
    } catch (error) {
      console.error('[UniverAdapter] Error getting CF rules:', error);
      return [];
    }
  }

  /**
   * Delete a conditional formatting rule by ID
   * @param cfId Rule ID to delete
   * @returns Success boolean
   */
  deleteConditionalFormattingRule(cfId: string): boolean {
    try {
      this.refresh();

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      this.worksheet.deleteConditionalFormattingRule(cfId);
      console.log('[UniverAdapter] ✅ CF rule deleted:', cfId);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error deleting CF rule:', error);
      return false;
    }
  }

  /**
   * Clear all conditional formatting rules
   * @returns Success boolean
   */
  clearConditionalFormatRules(): boolean {
    try {
      this.refresh();

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      this.worksheet.clearConditionalFormatRules();
      console.log('[UniverAdapter] ✅ All CF rules cleared');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error clearing CF rules:', error);
      return false;
    }
  }

  /**
   * Helper: Create a duplicate values rule
   * @param range Range in A1 notation (e.g., "A1:A100") or null for auto-detect
   * @param bgColor Background color (default: yellow)
   * @param fontColor Font color (optional)
   * @returns Success boolean
   */
  createDuplicateValuesRule(range?: string, bgColor: string = '#FFFF00', fontColor?: string): boolean {
    try {
      console.log('[UniverAdapter] Creating duplicate values rule');

      const builder = this.newConditionalFormattingRule();
      if (!builder) return false;

      // Get range
      const targetRange = range ? this.getRange(range) : this.worksheet?.getActiveRange?.();
      if (!targetRange) {
        console.error('[UniverAdapter] Could not get range for CF rule');
        return false;
      }

      // Build rule
      builder.setDuplicateValues()
        .setRanges([targetRange.getRange()])
        .setBackground(bgColor);

      if (fontColor) {
        builder.setFontColor(fontColor);
      }

      const rule = builder.build();
      return this.addConditionalFormattingRule(rule);
    } catch (error) {
      console.error('[UniverAdapter] Error creating duplicate values rule:', error);
      return false;
    }
  }

  /**
   * Helper: Create a greater than rule
   * @param range Range in A1 notation
   * @param value Threshold value
   * @param bgColor Background color (default: red)
   * @param fontColor Font color (optional)
   * @returns Success boolean
   */
  createGreaterThanRule(range: string, value: number, bgColor: string = '#FF0000', fontColor?: string): boolean {
    try {
      console.log(`[UniverAdapter] Creating greater than rule: value > ${value}`);

      const builder = this.newConditionalFormattingRule();
      if (!builder) return false;

      const targetRange = this.getRange(range);
      if (!targetRange) {
        console.error('[UniverAdapter] Could not get range');
        return false;
      }

      builder.whenNumberGreaterThan(value)
        .setRanges([targetRange.getRange()])
        .setBackground(bgColor);

      if (fontColor) {
        builder.setFontColor(fontColor);
      }

      const rule = builder.build();
      return this.addConditionalFormattingRule(rule);
    } catch (error) {
      console.error('[UniverAdapter] Error creating greater than rule:', error);
      return false;
    }
  }

  /**
   * Helper: Create a less than rule
   * @param range Range in A1 notation
   * @param value Threshold value
   * @param bgColor Background color (default: red)
   * @param fontColor Font color (optional)
   * @returns Success boolean
   */
  createLessThanRule(range: string, value: number, bgColor: string = '#FF0000', fontColor?: string): boolean {
    try {
      console.log(`[UniverAdapter] Creating less than rule: value < ${value}`);

      const builder = this.newConditionalFormattingRule();
      if (!builder) return false;

      const targetRange = this.getRange(range);
      if (!targetRange) {
        console.error('[UniverAdapter] Could not get range');
        return false;
      }

      builder.whenNumberLessThan(value)
        .setRanges([targetRange.getRange()])
        .setBackground(bgColor);

      if (fontColor) {
        builder.setFontColor(fontColor);
      }

      const rule = builder.build();
      return this.addConditionalFormattingRule(rule);
    } catch (error) {
      console.error('[UniverAdapter] Error creating less than rule:', error);
      return false;
    }
  }

  /**
   * Helper: Create an equals rule
   * @param range Range in A1 notation
   * @param value Value to match
   * @param bgColor Background color (default: green)
   * @param fontColor Font color (optional)
   * @returns Success boolean
   */
  createEqualsRule(range: string, value: number, bgColor: string = '#00FF00', fontColor?: string): boolean {
    try {
      console.log(`[UniverAdapter] Creating equals rule: value = ${value}`);

      const builder = this.newConditionalFormattingRule();
      if (!builder) return false;

      const targetRange = this.getRange(range);
      if (!targetRange) {
        console.error('[UniverAdapter] Could not get range');
        return false;
      }

      builder.whenNumberEqualTo(value)
        .setRanges([targetRange.getRange()])
        .setBackground(bgColor);

      if (fontColor) {
        builder.setFontColor(fontColor);
      }

      const rule = builder.build();
      return this.addConditionalFormattingRule(rule);
    } catch (error) {
      console.error('[UniverAdapter] Error creating equals rule:', error);
      return false;
    }
  }

  /**
   * Helper: Create a text contains rule
   * @param range Range in A1 notation
   * @param text Text to search for
   * @param bgColor Background color (default: yellow)
   * @param fontColor Font color (optional)
   * @returns Success boolean
   */
  createTextContainsRule(range: string, text: string, bgColor: string = '#FFFF00', fontColor?: string): boolean {
    try {
      console.log(`[UniverAdapter] Creating text contains rule: contains "${text}"`);

      const builder = this.newConditionalFormattingRule();
      if (!builder) return false;

      const targetRange = this.getRange(range);
      if (!targetRange) {
        console.error('[UniverAdapter] Could not get range');
        return false;
      }

      builder.whenTextContains(text)
        .setRanges([targetRange.getRange()])
        .setBackground(bgColor);

      if (fontColor) {
        builder.setFontColor(fontColor);
      }

      const rule = builder.build();
      return this.addConditionalFormattingRule(rule);
    } catch (error) {
      console.error('[UniverAdapter] Error creating text contains rule:', error);
      return false;
    }
  }

  /**
   * Helper: Create a unique values rule
   * @param range Range in A1 notation or null for auto-detect
   * @param bgColor Background color (default: light green)
   * @param fontColor Font color (optional)
   * @returns Success boolean
   */
  createUniqueValuesRule(range?: string, bgColor: string = '#90EE90', fontColor?: string): boolean {
    try {
      console.log('[UniverAdapter] Creating unique values rule');

      const builder = this.newConditionalFormattingRule();
      if (!builder) return false;

      const targetRange = range ? this.getRange(range) : this.worksheet?.getActiveRange?.();
      if (!targetRange) {
        console.error('[UniverAdapter] Could not get range');
        return false;
      }

      builder.setUniqueValues()
        .setRanges([targetRange.getRange()])
        .setBackground(bgColor);

      if (fontColor) {
        builder.setFontColor(fontColor);
      }

      const rule = builder.build();
      return this.addConditionalFormattingRule(rule);
    } catch (error) {
      console.error('[UniverAdapter] Error creating unique values rule:', error);
      return false;
    }
  }

  // ==================== QUICK HIGHLIGHT METHOD ====================

  /**
   * Quick highlight for cells (simplified background color setting)
   * @param startRow Starting row index (0-based)
   * @param startCol Starting column index (0-based)
   * @param numRows Number of rows to highlight
   * @param numCols Number of columns to highlight
   * @param color Hex color code (e.g., '#FFFF00' for yellow)
   * @returns Success boolean
   */
  highlightCells(startRow: number, startCol: number, numRows: number, numCols: number, color: string): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Highlighting cells: (${startRow}, ${startCol}) size ${numRows}x${numCols} with color ${color}`);

      const range = this.worksheet?.getRange(startRow, startCol, numRows, numCols);

      if (!range) {
        console.error('[UniverAdapter] Could not get range for highlighting');
        return false;
      }

      // Univer's FRange has a highlight() method that's simpler than setBackgroundColor
      if (typeof range.highlight === 'function') {
        range.highlight(color);
      } else {
        // Fallback to setBackgroundColor if highlight() not available
        range.setBackgroundColor(color);
      }

      console.log('[UniverAdapter] ✅ Cells highlighted successfully');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error highlighting cells:', error);
      return false;
    }
  }

  // ==================== TEXT TO COLUMNS OPERATION ====================

  /**
   * Split text in a column to multiple columns
   * @param columnIndex Column index (0-based) to split
   * @param delimiter Delimiter to split on (e.g., ',', ';', '\t')
   * @param numRows Number of rows to process (optional, defaults to all data)
   * @returns Success boolean
   */
  splitTextToColumns(columnIndex: number, delimiter: string, numRows?: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Splitting text to columns: column ${columnIndex}, delimiter '${delimiter}'`);

      const dimensions = this.getSheetDimensions();
      const rowCount = numRows || dimensions.rows;

      const range = this.worksheet?.getRange(0, columnIndex, rowCount, 1);

      if (!range) {
        console.error('[UniverAdapter] Could not get range for text split');
        return false;
      }

      // Univer's FRange has splitTextToColumns method
      if (typeof range.splitTextToColumns === 'function') {
        range.splitTextToColumns(delimiter);
        console.log('[UniverAdapter] ✅ Text split to columns successfully');
        return true;
      } else {
        console.error('[UniverAdapter] splitTextToColumns method not available on range');
        return false;
      }
    } catch (error) {
      console.error('[UniverAdapter] Error splitting text to columns:', error);
      return false;
    }
  }

  // ==================== ROW OPERATIONS (FACADEAPI) ====================

  /**
   * Insert blank rows at a specific position (renamed to avoid conflict with data insertion)
   * @param rowIndex Starting row index (0-based)
   * @param count Number of rows to insert (default: 1)
   * @returns Success boolean
   */
  insertBlankRows(rowIndex: number, count: number = 1): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Inserting ${count} blank row(s) at index ${rowIndex}`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      // Use FacadeAPI: worksheet.insertRows(rowPosition, howMany)
      this.worksheet.insertRows(rowIndex, count);

      console.log(`[UniverAdapter] ✅ Successfully inserted ${count} blank row(s)`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error inserting blank rows:', error);
      return false;
    }
  }

  /**
   * Delete rows at a specific position
   * @param rowIndex Starting row index (0-based)
   * @param count Number of rows to delete (default: 1)
   * @returns Success boolean
   */
  deleteRow(rowIndex: number, count: number = 1): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Deleting ${count} row(s) starting at index ${rowIndex}`);

      if (!this.worksheet || !this.workbook || !this.univerInstance) {
        console.error('[UniverAdapter] Missing required objects');
        return false;
      }

      // Get command service (same pattern as hyperlinks)
      const commandService = this.univerInstance.__getInjector().get(ICommandService);
      if (!commandService) {
        console.error('[UniverAdapter] Command service not available');
        return false;
      }

      // Execute RemoveRowByRangeCommand
      // Note: RemoveRowByRangeCommand requires explicit unitId, subUnitId, and range
      // Use fixed MAX_COLS since FacadeAPI doesn't provide getColumnCount()
      const MAX_COLS = 100;

      const result = commandService.executeCommand(RemoveRowByRangeCommand.id, {
        unitId: this.workbook.getId(),
        subUnitId: this.worksheet.getSheetId(),
        range: {
          startRow: rowIndex,
          endRow: rowIndex + count - 1,
          startColumn: 0,
          endColumn: MAX_COLS - 1
        }
      });

      if (result) {
        console.log(`[UniverAdapter] ✅ Successfully deleted ${count} row(s)`);
      } else {
        console.warn(`[UniverAdapter] ⚠️ Command returned false for row deletion`);
      }

      return !!result;
    } catch (error) {
      console.error('[UniverAdapter] ❌ Error deleting rows:', error);
      return false;
    }
  }

  /**
   * Find and replace text in the worksheet
   * @param findText Text to find
   * @param replaceText Text to replace with
   * @param options Optional configuration (case sensitivity, whole cell matching, etc.)
   * @returns Number of cells replaced, or -1 on error
   */
  async findAndReplace(
    findText: string,
    replaceText: string,
    options?: {
      matchCase?: boolean;
      matchEntireCell?: boolean;
      matchFormulaText?: boolean;
      columnFilter?: string | number;
    }
  ): Promise<number> {
    this.refresh();

    try {
      if (!this.univerAPI) {
        console.error('[UniverAdapter] univerAPI not available for find/replace');
        return -1;
      }

      console.log(`[UniverAdapter] Finding "${findText}" and replacing with "${replaceText}"`);
      console.log('[UniverAdapter] Step 1: About to call createTextFinderAsync');

      // Step 1: Create text finder
      const textFinder = await this.univerAPI.createTextFinderAsync(findText);

      console.log('[UniverAdapter] Step 2: createTextFinderAsync returned:', textFinder);
      console.log('[UniverAdapter] Step 2a: textFinder is null?', textFinder === null);
      console.log('[UniverAdapter] Step 2b: textFinder is undefined?', textFinder === undefined);

      if (!textFinder) {
        console.warn('[UniverAdapter] createTextFinderAsync returned null/undefined');
        return 0;
      }

      console.log('[UniverAdapter] Step 3: Skipping options configuration (async methods hang)');
      // NOTE: The matchCaseAsync(), matchEntireCellAsync(), and matchFormulaTextAsync()
      // methods appear to return promises that never resolve, causing the operation to hang.
      // For now, we'll skip configuration and use default settings.

      console.log('[UniverAdapter] Step 4: About to replace...');

      // If column filter is specified, we need to:
      // 1. Find all matches
      // 2. Filter by column
      // 3. Replace only filtered matches

      if (options?.columnFilter !== undefined) {
        console.log('[UniverAdapter] Column filter detected:', options.columnFilter);

        // Step 4a: Resolve column index
        let targetColumnIndex: number;

        if (typeof options.columnFilter === 'string') {
          // Check if it's a column letter (A, B, C) or column name (appid, name)
          if (options.columnFilter.length === 1 && /[A-Z]/i.test(options.columnFilter)) {
            // Column letter: A=0, B=1, etc.
            targetColumnIndex = options.columnFilter.toUpperCase().charCodeAt(0) - 65;
            console.log('[UniverAdapter] Resolved column letter', options.columnFilter, 'to index', targetColumnIndex);
          } else {
            // Column name: need to find which column has this header
            targetColumnIndex = await this.findColumnByName(options.columnFilter);
            if (targetColumnIndex === -1) {
              console.warn('[UniverAdapter] Column name not found:', options.columnFilter);
              return 0;
            }
            console.log('[UniverAdapter] Resolved column name', options.columnFilter, 'to index', targetColumnIndex);
          }
        } else {
          // Already a number
          targetColumnIndex = options.columnFilter;
        }

        // Step 4b: Find all matches
        const matches = textFinder.findAll();
        console.log('[UniverAdapter] Found', matches.length, 'total matches');

        // Step 4c: Filter matches by column
        const columnMatches = matches.filter(range => {
          const col = range.getColumn();
          return col === targetColumnIndex;
        });

        console.log('[UniverAdapter] Filtered to', columnMatches.length, 'matches in column', targetColumnIndex);

        // Step 4d: Replace filtered matches
        let count = 0;
        for (const range of columnMatches) {
          try {
            range.setValue(replaceText);
            count++;
          } catch (error) {
            console.error('[UniverAdapter] Failed to replace in range:', error);
          }
        }

        console.log(`[UniverAdapter] ✅ Replaced ${count} cell(s) in column ${targetColumnIndex}`);
        return count;

      } else {
        // No column filter - replace all matches (existing code)
        console.log('[UniverAdapter] 🔧 Attempting replace operation...');
        console.log('[UniverAdapter] textFinder type:', typeof textFinder);
        console.log('[UniverAdapter] textFinder methods:', Object.keys(textFinder).filter(k => typeof textFinder[k] === 'function'));

        // Try the async method first
        if (typeof textFinder.replaceAllWithAsync === 'function') {
          console.log('[UniverAdapter] Using replaceAllWithAsync method');
          const count = await textFinder.replaceAllWithAsync(replaceText);
          console.log(`[UniverAdapter] ✅ Replaced ${count} cell(s)`);
          return count;
        } else {
          // Fallback: use synchronous findAll + setValue approach
          console.log('[UniverAdapter] replaceAllWithAsync not available, using findAll + setValue fallback');
          const matches = textFinder.findAll();
          console.log(`[UniverAdapter] Found ${matches.length} matches to replace`);

          let count = 0;
          for (const range of matches) {
            try {
              range.setValue(replaceText);
              count++;
            } catch (error) {
              console.error('[UniverAdapter] Failed to set value for range:', error);
            }
          }

          console.log(`[UniverAdapter] ✅ Replaced ${count} cell(s) using fallback`);
          return count;
        }
      }

    } catch (error) {
      console.error('[UniverAdapter] ❌ Error in findAndReplace:', error);
      return -1;
    }
  }

  /**
   * Find all matches without replacing
   * @param findText Text to find
   * @param options Optional configuration
   * @returns Array of matched cell addresses (A1 notation) or empty array on error
   */
  async findAll(
    findText: string,
    options?: {
      matchCase?: boolean;
      matchEntireCell?: boolean;
      matchFormulaText?: boolean;
    }
  ): Promise<string[]> {
    this.refresh();

    try {
      if (!this.univerAPI) {
        console.error('[UniverAdapter] univerAPI not available for find');
        return [];
      }

      const textFinder = await this.univerAPI.createTextFinderAsync(findText);

      if (!textFinder) {
        console.warn('[UniverAdapter] createTextFinderAsync returned null');
        return [];
      }

      // Configure options
      if (options?.matchCase !== undefined) {
        await textFinder.matchCaseAsync(options.matchCase);
      }

      if (options?.matchEntireCell !== undefined) {
        await textFinder.matchEntireCellAsync(options.matchEntireCell);
      }

      if (options?.matchFormulaText !== undefined) {
        await textFinder.matchFormulaTextAsync(options.matchFormulaText);
      }

      // Find all matches
      const matches = textFinder.findAll();

      // Convert FRange[] to A1 notation strings
      const addresses = matches.map(range => range.getA1Notation());

      console.log(`[UniverAdapter] Found ${addresses.length} match(es): ${addresses.join(', ')}`);
      return addresses;

    } catch (error) {
      console.error('[UniverAdapter] ❌ Error in findAll:', error);
      return [];
    }
  }

  /**
   * Find column index by header name
   * @param columnName Name to search for in first row
   * @returns Column index (0-based) or -1 if not found
   */
  private async findColumnByName(columnName: string): Promise<number> {
    this.refresh();

    try {
      // Get first row (headers)
      const headerRange = this.worksheet?.getRange(0, 0, 1, 100); // First row, up to 100 columns
      if (!headerRange) {
        console.warn('[UniverAdapter] Could not get header range');
        return -1;
      }

      const headers = headerRange.getValues()[0];

      // Find matching column (case-insensitive)
      const lowerName = columnName.toLowerCase();
      for (let i = 0; i < headers.length; i++) {
        if (headers[i] && String(headers[i]).toLowerCase() === lowerName) {
          console.log(`[UniverAdapter] Found column "${columnName}" at index ${i}`);
          return i;
        }
      }

      console.warn(`[UniverAdapter] Column "${columnName}" not found in headers`);
      return -1;
    } catch (error) {
      console.error('[UniverAdapter] Error finding column by name:', error);
      return -1;
    }
  }

  /**
   * Hide rows in a range
   * @param startRow Starting row index (0-based)
   * @param endRow Ending row index (0-based, inclusive)
   * @returns Success boolean
   */
  hideRows(startRow: number, endRow: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Hiding rows ${startRow} to ${endRow}`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      // Calculate count from range
      const count = endRow - startRow + 1;

      // Use FacadeAPI: worksheet.hideRows(rowPosition, howMany)
      this.worksheet.hideRows(startRow, count);

      console.log(`[UniverAdapter] ✅ Successfully hid rows ${startRow}-${endRow}`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error hiding rows:', error);
      return false;
    }
  }

  /**
   * Show/unhide rows in a range
   * @param startRow Starting row index (0-based)
   * @param endRow Ending row index (0-based, inclusive)
   * @returns Success boolean
   */
  showRows(startRow: number, endRow: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Showing rows ${startRow} to ${endRow}`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      // Calculate count from range
      const count = endRow - startRow + 1;

      // Use FacadeAPI: worksheet.showRows(rowPosition, howMany)
      this.worksheet.showRows(startRow, count);

      console.log(`[UniverAdapter] ✅ Successfully showed rows ${startRow}-${endRow}`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error showing rows:', error);
      return false;
    }
  }

  // ==================== COLUMN OPERATIONS (FACADEAPI) ====================

  /**
   * Insert columns at a specific position
   * @param columnIndex Starting column index (0-based)
   * @param count Number of columns to insert (default: 1)
   * @returns Success boolean
   */
  insertColumn(columnIndex: number, count: number = 1): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Inserting ${count} column(s) at index ${columnIndex}`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      // Use FacadeAPI: worksheet.insertColumns(columnPosition, howMany)
      this.worksheet.insertColumns(columnIndex, count);

      console.log(`[UniverAdapter] ✅ Successfully inserted ${count} column(s)`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error inserting columns:', error);
      return false;
    }
  }

  /**
   * Delete columns at a specific position
   * @param columnIndex Starting column index (0-based)
   * @param count Number of columns to delete (default: 1)
   * @returns Success boolean
   */
  deleteColumn(columnIndex: number, count: number = 1): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Deleting ${count} column(s) at index ${columnIndex}`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      // Use FacadeAPI: worksheet.deleteColumns(columnPosition, howMany)
      this.worksheet.deleteColumns(columnIndex, count);

      console.log(`[UniverAdapter] ✅ Successfully deleted ${count} column(s)`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error deleting columns:', error);
      return false;
    }
  }

  /**
   * Hide columns in a range
   * @param startColumn Starting column index (0-based)
   * @param endColumn Ending column index (0-based, inclusive)
   * @returns Success boolean
   */
  hideColumns(startColumn: number, endColumn: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Hiding columns ${startColumn} to ${endColumn}`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      // Calculate count from range
      const count = endColumn - startColumn + 1;

      // Use FacadeAPI: worksheet.hideColumns(columnPosition, howMany)
      this.worksheet.hideColumns(startColumn, count);

      console.log(`[UniverAdapter] ✅ Successfully hid columns ${startColumn}-${endColumn}`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error hiding columns:', error);
      return false;
    }
  }

  /**
   * Show/unhide columns in a range
   * @param startColumn Starting column index (0-based)
   * @param endColumn Ending column index (0-based, inclusive)
   * @returns Success boolean
   */
  showColumns(startColumn: number, endColumn: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Showing columns ${startColumn} to ${endColumn}`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      // Calculate count from range
      const count = endColumn - startColumn + 1;

      // Use FacadeAPI: worksheet.showColumns(columnPosition, howMany)
      this.worksheet.showColumns(startColumn, count);

      console.log(`[UniverAdapter] ✅ Successfully showed columns ${startColumn}-${endColumn}`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error showing columns:', error);
      return false;
    }
  }

  // ==================== FREEZE PANES OPERATIONS (FACADEAPI) ====================

  /**
   * Freeze rows from the top
   * @param rowCount Number of rows to freeze (from row 0)
   * @returns Success boolean
   */
  freezeRows(rowCount: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Freezing first ${rowCount} row(s)`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      // Use FacadeAPI: worksheet.setFrozenRows(rowCount)
      this.worksheet.setFrozenRows(rowCount);

      console.log(`[UniverAdapter] ✅ Successfully froze ${rowCount} row(s)`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error freezing rows:', error);
      return false;
    }
  }

  /**
   * Freeze columns from the left
   * @param columnCount Number of columns to freeze (from column 0)
   * @returns Success boolean
   */
  freezeColumns(columnCount: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Freezing first ${columnCount} column(s)`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      // Use FacadeAPI: worksheet.setFrozenColumns(colCount)
      this.worksheet.setFrozenColumns(columnCount);

      console.log(`[UniverAdapter] ✅ Successfully froze ${columnCount} column(s)`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error freezing columns:', error);
      return false;
    }
  }

  /**
   * Freeze both rows and columns (freeze panes)
   * @param rowCount Number of rows to freeze from top
   * @param columnCount Number of columns to freeze from left
   * @returns Success boolean
   */
  freezePanes(rowCount: number, columnCount: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Freezing ${rowCount} row(s) and ${columnCount} column(s)`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      // Use FacadeAPI: worksheet.setFreeze({xSplit, ySplit, startRow, startColumn})
      this.worksheet.setFreeze({
        xSplit: columnCount,
        ySplit: rowCount,
        startRow: rowCount,
        startColumn: columnCount
      });

      console.log(`[UniverAdapter] ✅ Successfully froze panes`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error freezing panes:', error);
      return false;
    }
  }

  /**
   * Unfreeze all panes (rows and columns)
   * @returns Success boolean
   */
  unfreeze(): boolean {
    try {
      this.refresh();
      console.log('[UniverAdapter] Unfreezing all panes');

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      // Use FacadeAPI: worksheet.cancelFreeze()
      this.worksheet.cancelFreeze();

      console.log('[UniverAdapter] ✅ Successfully unfroze all panes');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error unfreezing panes:', error);
      return false;
    }
  }

  /**
   * Add a new sheet to the workbook
   * @param sheetName Name of the new sheet
   * @param data Array data for the new sheet (2D array)
   * @returns Success boolean
   */
  addSheet(sheetName: string, data: any[][]): boolean {
    try {
      this.refresh();

      if (!this.univerAPI) {
        console.error('[UniverAdapter] univerAPI not available');
        return false;
      }

      // Get the active workbook using FacadeAPI
      const fWorkbook = this.univerAPI.getActiveWorkbook();

      if (!fWorkbook) {
        console.error('[UniverAdapter] No active workbook');
        return false;
      }

      // Validate data
      if (!data || data.length === 0) {
        console.error('[UniverAdapter] Cannot add sheet with empty data');
        return false;
      }

      // Use minimum grid dimensions for better UX (same as empty sheets)
      const DEFAULT_ROW_COUNT = 1000;
      const DEFAULT_COL_COUNT = 26;

      // Get actual data dimensions
      const dataRows = data.length;
      const dataCols = data[0]?.length || 0;

      // Create grid with minimum dimensions
      const gridRows = Math.max(DEFAULT_ROW_COUNT, dataRows);
      const gridCols = Math.max(DEFAULT_COL_COUNT, dataCols);

      console.log(`[UniverAdapter] Adding new sheet: ${sheetName} with ${gridRows}x${gridCols} grid (data: ${dataRows}x${dataCols})`);

      // Use Univer's correct FacadeAPI: fWorkbook.create(name, rows, cols)
      const newSheet = fWorkbook.create(sheetName, gridRows, gridCols);

      if (!newSheet) {
        console.error('[UniverAdapter] Failed to create sheet - fWorkbook.create returned null');
        return false;
      }

      console.log('[UniverAdapter] Sheet created, setting data...');

      // Set only the actual data (not the entire grid)
      const range = newSheet.getRange(0, 0, dataRows, dataCols);

      if (!range) {
        console.error('[UniverAdapter] Failed to get range');
        return false;
      }

      range.setValues(data);

      console.log('[UniverAdapter] Data set, activating sheet...');

      // Activate the new sheet using FSheet.activate()
      newSheet.activate();

      console.log(`[UniverAdapter] ✅ Successfully added and activated sheet: ${sheetName}`);
      return true;
    } catch (error) {
      console.error('[UniverAdapter] ❌ Error adding sheet:', error);
      return false;
    }
  }

  /**
   * Get full workbook snapshot for persistence
   * This is equivalent to Luckysheet's getAllSheets()
   * @returns Promise<IWorkbookData> - Full workbook state
   */
  async getWorkbookSnapshot(): Promise<any> {
    try {
      this.refresh();

      if (!this.workbook) {
        console.error('[UniverAdapter] No workbook available for snapshot');
        return null;
      }

      if (typeof this.workbook.save !== 'function') {
        console.error('[UniverAdapter] save() method not available on workbook');
        return null;
      }

      console.log('[UniverAdapter] Getting workbook snapshot...');
      const snapshot = await this.workbook.save();
      console.log('[UniverAdapter] Workbook snapshot retrieved successfully');
      return snapshot;
    } catch (error) {
      console.error('[UniverAdapter] Error getting workbook snapshot:', error);
      return null;
    }
  }

  // ==================== HYPERLINK METHODS ====================

  /**
   * Set hyperlink on a cell
   * @param row Row index (0-based)
   * @param col Column index (0-based)
   * @param url URL to link to
   * @param label Optional display text (defaults to URL)
   * @returns Success boolean
   */
  setHyperlink(row: number, col: number, url: string, label?: string): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Setting hyperlink at (${row}, ${col}): ${url}`);

      if (!this.workbook || !this.worksheet) {
        console.error('[UniverAdapter] No workbook or worksheet available');
        return false;
      }

      // Get the command service from Univer instance
      if (!this.univerInstance) {
        console.error('[UniverAdapter] No Univer instance available');
        return false;
      }

      // Generate unique ID for the hyperlink
      const linkId = `hyperlink_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Get unit and subunit IDs
      const unitId = this.workbook.getId();
      const subUnitId = this.worksheet.getSheetId();

      // Create hyperlink object
      const link = {
        id: linkId,
        row: row,
        column: col,
        payload: url,
        display: label || url
      };

      // Execute the command
      const commandService = this.univerInstance.__getInjector().get(ICommandService);

      const result = commandService.executeCommand(AddHyperLinkCommand.id, {
        unitId: unitId,
        subUnitId: subUnitId,
        link: link
      });

      if (result) {
        console.log('[UniverAdapter] ✅ Hyperlink set successfully');
        return true;
      } else {
        console.error('[UniverAdapter] Failed to execute AddHyperLinkCommand');
        return false;
      }
    } catch (error) {
      console.error('[UniverAdapter] Error setting hyperlink:', error);
      return false;
    }
  }

  /**
   * Get hyperlink from a cell
   * @param row Row index (0-based)
   * @param col Column index (0-based)
   * @returns URL string or null
   */
  getHyperlink(row: number, col: number): string | null {
    try {
      this.refresh();

      if (!this.workbook || !this.worksheet) {
        console.error('[UniverAdapter] No workbook or worksheet available');
        return null;
      }

      // Get the hyperlink model service
      if (!this.univerInstance) {
        console.error('[UniverAdapter] No Univer instance available');
        return null;
      }

      const hyperlinkModel = this.univerInstance.__getInjector().get(HyperLinkModel);

      const unitId = this.workbook.getId();
      const subUnitId = this.worksheet.getSheetId();

      // Get hyperlink at specific position
      const hyperlink = hyperlinkModel.getHyperLink(unitId, subUnitId, row, col);

      return hyperlink ? hyperlink.payload : null;
    } catch (error) {
      console.error('[UniverAdapter] Error getting hyperlink:', error);
      return null;
    }
  }

  /**
   * Remove hyperlink from a cell
   * @param row Row index (0-based)
   * @param col Column index (0-based)
   * @returns Success boolean
   */
  removeHyperlink(row: number, col: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Removing hyperlink from (${row}, ${col})`);

      if (!this.workbook || !this.worksheet) {
        console.error('[UniverAdapter] No workbook or worksheet available');
        return false;
      }

      // First, get the existing hyperlink to find its ID
      if (!this.univerInstance) {
        console.error('[UniverAdapter] No Univer instance available');
        return false;
      }

      const hyperlinkModel = this.univerInstance.__getInjector().get(HyperLinkModel);
      const commandService = this.univerInstance.__getInjector().get(ICommandService);

      const unitId = this.workbook.getId();
      const subUnitId = this.worksheet.getSheetId();

      // Get the hyperlink to find its ID
      const hyperlink = hyperlinkModel.getHyperLink(unitId, subUnitId, row, col);

      if (!hyperlink) {
        console.warn('[UniverAdapter] No hyperlink found at this position');
        return false;
      }

      // Execute cancel command
      const result = commandService.executeCommand(CancelHyperLinkCommand.id, {
        unitId: unitId,
        subUnitId: subUnitId,
        id: hyperlink.id,
        row: row,
        column: col
      });

      if (result) {
        console.log('[UniverAdapter] ✅ Hyperlink removed');
        return true;
      } else {
        console.error('[UniverAdapter] Failed to execute CancelHyperLinkCommand');
        return false;
      }
    } catch (error) {
      console.error('[UniverAdapter] Error removing hyperlink:', error);
      return false;
    }
  }

  /**
   * Set hyperlink on a range using A1 notation
   * @param range A1 notation (e.g., "A1" or "A1:B5")
   * @param url URL to link to
   * @param label Optional display text
   * @returns Success boolean
   */
  setHyperlinkByRange(range: string, url: string, label?: string): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Setting hyperlink on range ${range}: ${url}`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      const rangeObj = this.worksheet.getRange(range);
      if (!rangeObj) {
        console.error('[UniverAdapter] Failed to get range');
        return false;
      }

      rangeObj.setHyperlink(url, label || url);
      console.log('[UniverAdapter] ✅ Hyperlink set on range');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting hyperlink on range:', error);
      return false;
    }
  }

  // ==================== DATA VALIDATION METHODS ====================

  /**
   * Create a new data validation rule builder
   * @returns Rule builder or null
   */
  newDataValidationRule(): any {
    try {
      this.refresh();

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return null;
      }

      return this.worksheet.newDataValidationRule();
    } catch (error) {
      console.error('[UniverAdapter] Error creating data validation rule:', error);
      return null;
    }
  }

  /**
   * Set data validation on a range
   * @param startRow Starting row (0-based)
   * @param startCol Starting column (0-based)
   * @param numRows Number of rows
   * @param numCols Number of columns
   * @param rule Validation rule object
   * @returns Success boolean
   */
  setDataValidation(
    startRow: number,
    startCol: number,
    numRows: number,
    numCols: number,
    rule: any
  ): boolean {
    try {
      this.refresh();
      console.log(
        `[UniverAdapter] Setting data validation on (${startRow},${startCol}) [${numRows}x${numCols}]`
      );

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      const range = this.worksheet.getRange(startRow, startCol, numRows, numCols);
      if (!range) {
        console.error('[UniverAdapter] Failed to get range');
        return false;
      }

      range.setDataValidation(rule);
      console.log('[UniverAdapter] ✅ Data validation set');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error setting data validation:', error);
      return false;
    }
  }

  /**
   * Get data validation from a cell
   * @param row Row index (0-based)
   * @param col Column index (0-based)
   * @returns Validation rule or null
   */
  getDataValidation(row: number, col: number): any {
    try {
      this.refresh();

      if (!this.worksheet) return null;

      const range = this.worksheet.getRange(row, col);
      return range?.getDataValidation() || null;
    } catch (error) {
      console.error('[UniverAdapter] Error getting data validation:', error);
      return null;
    }
  }

  /**
   * Remove data validation from a range
   * @param startRow Starting row (0-based)
   * @param startCol Starting column (0-based)
   * @param numRows Number of rows
   * @param numCols Number of columns
   * @returns Success boolean
   */
  removeDataValidation(
    startRow: number,
    startCol: number,
    numRows: number,
    numCols: number
  ): boolean {
    try {
      this.refresh();
      console.log(
        `[UniverAdapter] Removing data validation from (${startRow},${startCol}) [${numRows}x${numCols}]`
      );

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      const range = this.worksheet.getRange(startRow, startCol, numRows, numCols);
      if (!range) {
        console.error('[UniverAdapter] Failed to get range');
        return false;
      }

      range.removeDataValidation();
      console.log('[UniverAdapter] ✅ Data validation removed');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error removing data validation:', error);
      return false;
    }
  }

  /**
   * Helper: Create dropdown list validation
   * @param values Array of dropdown options
   * @param allowInvalid Whether to allow invalid entries (default: false)
   * @param helpText Optional help text
   * @returns Validation rule or null
   */
  createDropdownValidation(
    values: string[],
    allowInvalid: boolean = false,
    helpText?: string
  ): any {
    try {
      const builder = this.newDataValidationRule();
      if (!builder) return null;

      builder.requireValueInList(values);
      builder.setAllowInvalid(allowInvalid);

      if (helpText) {
        builder.setHelpText(helpText);
      }

      return builder.build();
    } catch (error) {
      console.error('[UniverAdapter] Error creating dropdown validation:', error);
      return null;
    }
  }

  /**
   * Helper: Create number range validation
   * @param min Minimum value
   * @param max Maximum value
   * @param helpText Optional help text
   * @returns Validation rule or null
   */
  createNumberRangeValidation(
    min: number,
    max: number,
    helpText?: string
  ): any {
    try {
      const builder = this.newDataValidationRule();
      if (!builder) return null;

      builder.requireNumberBetween(min, max);
      builder.setAllowInvalid(false);

      if (helpText) {
        builder.setHelpText(helpText);
      }

      return builder.build();
    } catch (error) {
      console.error('[UniverAdapter] Error creating number range validation:', error);
      return null;
    }
  }

  /**
   * Helper: Create date validation
   * @param helpText Optional help text
   * @returns Validation rule or null
   */
  createDateValidation(helpText?: string): any {
    try {
      const builder = this.newDataValidationRule();
      if (!builder) return null;

      builder.requireDate();
      builder.setAllowInvalid(false);

      if (helpText) {
        builder.setHelpText(helpText);
      }

      return builder.build();
    } catch (error) {
      console.error('[UniverAdapter] Error creating date validation:', error);
      return null;
    }
  }

  // ==================== COMMENT/NOTE METHODS ====================

  /**
   * Add a note/comment to a cell
   * @param row Row index (0-based)
   * @param col Column index (0-based)
   * @param text Note text content
   * @returns Success boolean
   */
  addNote(row: number, col: number, text: string): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Adding note to (${row}, ${col}): "${text}"`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      const range = this.worksheet.getRange(row, col);
      if (!range) {
        console.error('[UniverAdapter] Failed to get range');
        return false;
      }

      range.setNote(text);
      console.log('[UniverAdapter] ✅ Note added');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error adding note:', error);
      return false;
    }
  }

  /**
   * Get note/comment from a cell
   * @param row Row index (0-based)
   * @param col Column index (0-based)
   * @returns Note text or null
   */
  getNote(row: number, col: number): string | null {
    try {
      this.refresh();

      if (!this.worksheet) return null;

      const range = this.worksheet.getRange(row, col);
      if (!range) return null;

      return range.getNote() || null;
    } catch (error) {
      console.error('[UniverAdapter] Error getting note:', error);
      return null;
    }
  }

  /**
   * Remove note/comment from a cell
   * @param row Row index (0-based)
   * @param col Column index (0-based)
   * @returns Success boolean
   */
  removeNote(row: number, col: number): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Removing note from (${row}, ${col})`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      const range = this.worksheet.getRange(row, col);
      if (!range) {
        console.error('[UniverAdapter] Failed to get range');
        return false;
      }

      range.clearNote();
      console.log('[UniverAdapter] ✅ Note removed');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error removing note:', error);
      return false;
    }
  }

  /**
   * Add note to a range using A1 notation
   * @param range A1 notation (e.g., "A1")
   * @param text Note text
   * @returns Success boolean
   */
  addNoteByRange(range: string, text: string): boolean {
    try {
      this.refresh();
      console.log(`[UniverAdapter] Adding note to range ${range}`);

      if (!this.worksheet) {
        console.error('[UniverAdapter] No worksheet available');
        return false;
      }

      const rangeObj = this.worksheet.getRange(range);
      if (!rangeObj) {
        console.error('[UniverAdapter] Failed to get range');
        return false;
      }

      rangeObj.setNote(text);
      console.log('[UniverAdapter] ✅ Note added to range');
      return true;
    } catch (error) {
      console.error('[UniverAdapter] Error adding note to range:', error);
      return false;
    }
  }

  // ==================== IMAGE/DRAWING METHODS ====================

  /**
   * Insert an image from URL into the worksheet
   *
   * NOTE: Univer's drawing system uses a complex JSON OT (Operational Transform) mutation system
   * rather than simple facade API methods. FRange does not have an insertImage() method.
   *
   * The proper implementation requires:
   * 1. Using DrawingManagerService to manage drawing state
   * 2. Creating IDrawingParam objects with transform coordinates
   * 3. Using getBatchAddOp() to generate JSON operations
   * 4. Applying mutations through the command system
   *
   * This is significantly more complex than other features and requires deeper integration.
   * For now, this method is stubbed and will log a warning.
   *
   * @param row Row index (0-based)
   * @param col Column index (0-based)
   * @param imageUrl URL of the image to insert
   * @param width Optional width in pixels
   * @param height Optional height in pixels
   * @returns Success boolean (always false - not implemented)
   */
  insertImage(
    row: number,
    col: number,
    imageUrl: string,
    width?: number,
    height?: number
  ): boolean {
    void width;
    void height;
    console.warn('[UniverAdapter] ⚠️ insertImage() not yet implemented - Univer drawing system requires complex mutation-based approach');
    console.warn('[UniverAdapter] See DrawingManagerService and IDrawingJson1Type in @univerjs/drawing for implementation details');
    console.warn(`[UniverAdapter] Requested: Insert image at (${row}, ${col}): ${imageUrl}`);
    return false;
  }

  /**
   * Insert an image by range using A1 notation
   *
   * NOTE: Not implemented - see insertImage() for details
   *
   * @param range A1 notation (e.g., "A1")
   * @param imageUrl URL of the image
   * @param width Optional width
   * @param height Optional height
   * @returns Success boolean (always false - not implemented)
   */
  insertImageByRange(
    range: string,
    imageUrl: string,
    width?: number,
    height?: number
  ): boolean {
    void width;
    void height;
    console.warn('[UniverAdapter] ⚠️ insertImageByRange() not yet implemented - see insertImage() for details');
    console.warn(`[UniverAdapter] Requested: Insert image at range ${range}: ${imageUrl}`);
    return false;
  }

  /**
   * Create a drawing/shape in the worksheet
   *
   * NOTE: Not implemented - Univer drawing system requires mutation-based approach
   * See DrawingManagerService and IDrawingParam for implementation details
   *
   * @param shapeType Type of shape (e.g., 'rectangle', 'circle', 'line')
   * @param startRow Starting row (0-based)
   * @param startCol Starting column (0-based)
   * @param width Width in pixels
   * @param height Height in pixels
   * @param properties Optional shape properties (color, border, etc.)
   * @returns Success boolean (always false - not implemented)
   */
  createDrawing(
    shapeType: string,
    startRow: number,
    startCol: number,
    width: number,
    height: number,
    properties?: any
  ): boolean {
    void width;
    void height;
    void properties;
    console.warn('[UniverAdapter] ⚠️ createDrawing() not yet implemented - Univer drawing system requires complex mutation-based approach');
    console.warn(`[UniverAdapter] Requested: Create ${shapeType} at (${startRow}, ${startCol})`);
    return false;
  }

  // ============================================================
  // NAMED RANGE OPERATIONS
  // ============================================================

  /**
   * Create a named range (defined name)
   * @param name Name for the range (must be valid identifier)
   * @param rangeA1 Cell range in A1 notation (e.g., "A1:D10")
   * @param scope 'workbook' (global) or 'worksheet' (local to current sheet)
   * @param comment Optional description
   * @returns Success boolean
   */
  async createNamedRange(
    name: string,
    rangeA1: string,
    scope: 'workbook' | 'worksheet' = 'workbook',
    comment?: string
  ): Promise<boolean> {
    void scope;
    void comment;
    this.refresh();

    try {
      // Validate name format
      if (!isValidRangeName(name)) {
        console.error(`[UniverAdapter] Invalid name format: "${name}"`);
        return false;
      }

      // Validate range format
      if (!isValidA1Range(rangeA1)) {
        console.error(`[UniverAdapter] Invalid range format: "${rangeA1}"`);
        return false;
      }

      // Check if name already exists
      const existing = this.workbook?.getDefinedName(name);
      if (existing) {
        console.error(`[UniverAdapter] Named range "${name}" already exists`);
        return false;
      }

      // Build reference with sheet prefix
      const sheetName = this.worksheet?.getName() || 'Sheet1';
      const ref = `${sheetName}!$${rangeA1.replace(':', ':$')}`;

      console.log(`[UniverAdapter] Creating named range: ${name} = ${ref}`);

      // Create using simple method
      this.workbook?.insertDefinedName(name, ref);

      console.log(`[UniverAdapter] ✅ Named range "${name}" created`);
      return true;

    } catch (error) {
      console.error('[UniverAdapter] ❌ Error creating named range:', error);
      return false;
    }
  }

  /**
   * Delete a named range
   * @param name Name of the range to delete
   * @returns Success boolean
   */
  async deleteNamedRange(name: string): Promise<boolean> {
    this.refresh();

    try {
      // Check if exists
      const existing = this.workbook?.getDefinedName(name);
      if (!existing) {
        console.error(`[UniverAdapter] Named range "${name}" not found`);
        return false;
      }

      console.log(`[UniverAdapter] Deleting named range: ${name}`);
      this.workbook?.deleteDefinedName(name);

      console.log(`[UniverAdapter] ✅ Named range "${name}" deleted`);
      return true;

    } catch (error) {
      console.error('[UniverAdapter] ❌ Error deleting named range:', error);
      return false;
    }
  }

  /**
   * List all named ranges
   * @returns Array of named range info
   */
  async listNamedRanges(): Promise<Array<{ name: string; ref: string; scope: string }>> {
    this.refresh();

    try {
      const workbookNames = this.workbook?.getDefinedNames() || [];
      const worksheetNames = this.worksheet?.getDefinedNames() || [];

      const results: Array<{ name: any; ref: any; scope: string }> = [];

      // Add workbook-level names
      for (const dn of workbookNames) {
        results.push({
          name: dn.getName(),
          ref: dn.getRef(),
          scope: 'workbook'
        });
      }

      // Add worksheet-level names
      for (const dn of worksheetNames) {
        results.push({
          name: dn.getName(),
          ref: dn.getRef(),
          scope: 'worksheet'
        });
      }

      console.log(`[UniverAdapter] Found ${results.length} named range(s)`);
      return results;

    } catch (error) {
      console.error('[UniverAdapter] ❌ Error listing named ranges:', error);
      return [];
    }
  }

  /**
   * Rename a named range
   * @param oldName Current name
   * @param newName New name
   * @returns Success boolean
   */
  async renameNamedRange(oldName: string, newName: string): Promise<boolean> {
    this.refresh();

    try {
      // Validate new name format
      if (!isValidRangeName(newName)) {
        console.error(`[UniverAdapter] Invalid new name format: "${newName}"`);
        return false;
      }

      // Check if old name exists
      const existing = this.workbook?.getDefinedName(oldName);
      if (!existing) {
        console.error(`[UniverAdapter] Named range "${oldName}" not found`);
        return false;
      }

      // Check if new name already exists
      const conflict = this.workbook?.getDefinedName(newName);
      if (conflict) {
        console.error(`[UniverAdapter] Named range "${newName}" already exists`);
        return false;
      }

      console.log(`[UniverAdapter] Renaming: ${oldName} → ${newName}`);
      existing.setName(newName);

      console.log(`[UniverAdapter] ✅ Named range renamed`);
      return true;

    } catch (error) {
      console.error('[UniverAdapter] ❌ Error renaming named range:', error);
      return false;
    }
  }

  /**
   * Update the cell reference of a named range
   * @param name Name of the range
   * @param newRangeA1 New cell range in A1 notation
   * @returns Success boolean
   */
  async updateNamedRange(name: string, newRangeA1: string): Promise<boolean> {
    this.refresh();

    try {
      // Validate range format
      if (!isValidA1Range(newRangeA1)) {
        console.error(`[UniverAdapter] Invalid range format: "${newRangeA1}"`);
        return false;
      }

      // Check if exists
      const existing = this.workbook?.getDefinedName(name);
      if (!existing) {
        console.error(`[UniverAdapter] Named range "${name}" not found`);
        return false;
      }

      // Build new reference
      const sheetName = this.worksheet?.getName() || 'Sheet1';
      const ref = `${sheetName}!$${newRangeA1.replace(':', ':$')}`;

      console.log(`[UniverAdapter] Updating ${name} to ${ref}`);
      existing.setRef(ref);

      console.log(`[UniverAdapter] ✅ Named range updated`);
      return true;

    } catch (error) {
      console.error('[UniverAdapter] ❌ Error updating named range:', error);
      return false;
    }
  }

  /**
   * Get info about a specific named range
   * @param name Name of the range
   * @returns Range info or null if not found
   */
  async getNamedRange(name: string): Promise<{ name: string; ref: string; scope: string } | null> {
    this.refresh();

    try {
      const dn = this.workbook?.getDefinedName(name);
      if (!dn) {
        return null;
      }

      return {
        name: dn.getName(),
        ref: dn.getRef(),
        scope: 'workbook' // Simplified for now
      };

    } catch (error) {
      console.error('[UniverAdapter] ❌ Error getting named range:', error);
      return null;
    }
  }
}

/**
 * Validate named range name format
 * Must start with letter or underscore, contain only alphanumeric + underscore
 */
function isValidRangeName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Validate A1 notation range format
 */
function isValidA1Range(range: string): boolean {
  return /^[A-Z]+\d+(:[A-Z]+\d+)?$/i.test(range);
}

/**
 * Helper function to create adapter from univerAPI ref
 */
export function createUniverAdapter(univerAPI: any, univerInstance?: any): UniverAdapter | null {
  if (!univerAPI) {
    console.warn('[UniverAdapter] univerAPI is null, cannot create adapter');
    return null;
  }
  return new UniverAdapter(univerAPI, univerInstance);
}

