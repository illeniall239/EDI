/**
 * Univer Command Service Utilities
 *
 * Provides helper functions for executing commands via Univer's Command Service.
 * These are for operations that require the command pattern (row/column ops, freeze, etc.)
 */

/**
 * Command names for Univer Sheets operations
 * These correspond to the internal command identifiers used by Univer
 */
export const UniverCommands = {
  // Row operations
  INSERT_ROW: 'sheet.operation.insert-row',
  INSERT_ROW_BEFORE: 'sheet.operation.insert-row-before',
  INSERT_ROW_AFTER: 'sheet.operation.insert-row-after',
  REMOVE_ROW: 'sheet.operation.remove-row',
  DELETE_ROW: 'sheet.command.delete-row',
  SET_ROW_VISIBLE: 'sheet.command.set-row-visible',
  SET_ROW_HIDDEN: 'sheet.command.set-row-hidden',

  // Column operations
  INSERT_COLUMN: 'sheet.operation.insert-column',
  INSERT_COLUMN_BEFORE: 'sheet.operation.insert-column-before',
  INSERT_COLUMN_AFTER: 'sheet.operation.insert-column-after',
  REMOVE_COLUMN: 'sheet.operation.remove-column',
  DELETE_COLUMN: 'sheet.command.delete-column',
  SET_COLUMN_VISIBLE: 'sheet.command.set-column-visible',
  SET_COLUMN_HIDDEN: 'sheet.command.set-column-hidden',

  // Freeze operations
  SET_FROZEN: 'sheet.command.set-frozen-columns',
  SET_FROZEN_ROWS: 'sheet.command.set-frozen-rows',
  SET_FROZEN_COLUMNS: 'sheet.command.set-frozen-columns',
  CANCEL_FROZEN: 'sheet.command.cancel-frozen',

  // Selection operations
  SET_SELECTIONS: 'sheet.operation.set-selections',
  SET_RANGE_VALUES: 'sheet.operation.set-range-values',
} as const;

/**
 * Interface for command parameters
 */
export interface CommandParams {
  unitId?: string;
  subUnitId?: string;
  range?: {
    startRow: number;
    endRow: number;
    startColumn?: number;
    endColumn?: number;
  };
  [key: string]: any;
}

/**
 * Execute a command via Univer's Command Service
 * @param univerAPI The Univer API instance
 * @param commandId The command identifier
 * @param params Command parameters
 * @returns Success boolean
 */
export function executeCommand(univerAPI: any, commandId: string, params: CommandParams): boolean {
  try {
    if (!univerAPI) {
      console.error('[UniverCommands] No univerAPI provided');
      return false;
    }

    // Get command service from Univer
    const commandService = univerAPI.getCommandService?.();

    if (!commandService) {
      console.error('[UniverCommands] Command service not available');
      return false;
    }

    console.log(`[UniverCommands] Executing command: ${commandId}`, params);

    // Execute the command
    const result = commandService.executeCommand(commandId, params);

    console.log(`[UniverCommands] Command executed:`, result);
    return true;
  } catch (error) {
    console.error(`[UniverCommands] Error executing command ${commandId}:`, error);
    return false;
  }
}

/**
 * Insert rows at a specific position
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @param rowIndex Starting row index (0-based)
 * @param count Number of rows to insert
 * @returns Success boolean
 */
export function insertRows(
  univerAPI: any,
  workbook: any,
  worksheet: any,
  rowIndex: number,
  count: number = 1
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
    range: {
      startRow: rowIndex,
      endRow: rowIndex + count - 1,
    },
  };

  return executeCommand(univerAPI, UniverCommands.INSERT_ROW, params);
}

/**
 * Delete rows at a specific position
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @param rowIndex Starting row index (0-based)
 * @param count Number of rows to delete
 * @returns Success boolean
 */
export function deleteRows(
  univerAPI: any,
  workbook: any,
  worksheet: any,
  rowIndex: number,
  count: number = 1
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
    range: {
      startRow: rowIndex,
      endRow: rowIndex + count - 1,
    },
  };

  return executeCommand(univerAPI, UniverCommands.DELETE_ROW, params);
}

/**
 * Hide rows
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @param startRow Starting row index (0-based)
 * @param endRow Ending row index (0-based, inclusive)
 * @returns Success boolean
 */
export function hideRows(
  univerAPI: any,
  workbook: any,
  worksheet: any,
  startRow: number,
  endRow: number
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
    range: {
      startRow,
      endRow,
    },
  };

  return executeCommand(univerAPI, UniverCommands.SET_ROW_HIDDEN, params);
}

/**
 * Show/unhide rows
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @param startRow Starting row index (0-based)
 * @param endRow Ending row index (0-based, inclusive)
 * @returns Success boolean
 */
export function showRows(
  univerAPI: any,
  workbook: any,
  worksheet: any,
  startRow: number,
  endRow: number
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
    range: {
      startRow,
      endRow,
    },
  };

  return executeCommand(univerAPI, UniverCommands.SET_ROW_VISIBLE, params);
}

/**
 * Insert columns at a specific position
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @param columnIndex Starting column index (0-based)
 * @param count Number of columns to insert
 * @returns Success boolean
 */
export function insertColumns(
  univerAPI: any,
  workbook: any,
  worksheet: any,
  columnIndex: number,
  count: number = 1
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
    range: {
      startRow: 0,
      endRow: 0,
      startColumn: columnIndex,
      endColumn: columnIndex + count - 1,
    },
  };

  return executeCommand(univerAPI, UniverCommands.INSERT_COLUMN, params);
}

/**
 * Delete columns at a specific position
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @param columnIndex Starting column index (0-based)
 * @param count Number of columns to delete
 * @returns Success boolean
 */
export function deleteColumns(
  univerAPI: any,
  workbook: any,
  worksheet: any,
  columnIndex: number,
  count: number = 1
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
    range: {
      startRow: 0,
      endRow: 0,
      startColumn: columnIndex,
      endColumn: columnIndex + count - 1,
    },
  };

  return executeCommand(univerAPI, UniverCommands.DELETE_COLUMN, params);
}

/**
 * Hide columns
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @param startColumn Starting column index (0-based)
 * @param endColumn Ending column index (0-based, inclusive)
 * @returns Success boolean
 */
export function hideColumns(
  univerAPI: any,
  workbook: any,
  worksheet: any,
  startColumn: number,
  endColumn: number
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
    range: {
      startRow: 0,
      endRow: 0,
      startColumn,
      endColumn,
    },
  };

  return executeCommand(univerAPI, UniverCommands.SET_COLUMN_HIDDEN, params);
}

/**
 * Show/unhide columns
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @param startColumn Starting column index (0-based)
 * @param endColumn Ending column index (0-based, inclusive)
 * @returns Success boolean
 */
export function showColumns(
  univerAPI: any,
  workbook: any,
  worksheet: any,
  startColumn: number,
  endColumn: number
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
    range: {
      startRow: 0,
      endRow: 0,
      startColumn,
      endColumn,
    },
  };

  return executeCommand(univerAPI, UniverCommands.SET_COLUMN_VISIBLE, params);
}

/**
 * Freeze rows
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @param rowCount Number of rows to freeze from top
 * @returns Success boolean
 */
export function freezeRows(
  univerAPI: any,
  workbook: any,
  worksheet: any,
  rowCount: number
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
    startRow: rowCount,
    startColumn: -1,
    ystop: rowCount,
    xsplit: -1,
  };

  return executeCommand(univerAPI, UniverCommands.SET_FROZEN_ROWS, params);
}

/**
 * Freeze columns
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @param columnCount Number of columns to freeze from left
 * @returns Success boolean
 */
export function freezeColumns(
  univerAPI: any,
  workbook: any,
  worksheet: any,
  columnCount: number
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
    startRow: -1,
    startColumn: columnCount,
    ystop: -1,
    xsplit: columnCount,
  };

  return executeCommand(univerAPI, UniverCommands.SET_FROZEN_COLUMNS, params);
}

/**
 * Freeze both rows and columns
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @param rowCount Number of rows to freeze from top
 * @param columnCount Number of columns to freeze from left
 * @returns Success boolean
 */
export function freezePanes(
  univerAPI: any,
  workbook: any,
  worksheet: any,
  rowCount: number,
  columnCount: number
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
    startRow: rowCount,
    startColumn: columnCount,
    ystop: rowCount,
    xsplit: columnCount,
  };

  return executeCommand(univerAPI, UniverCommands.SET_FROZEN, params);
}

/**
 * Unfreeze all panes
 * @param univerAPI The Univer API instance
 * @param workbook Active workbook
 * @param worksheet Active worksheet
 * @returns Success boolean
 */
export function unfreeze(
  univerAPI: any,
  workbook: any,
  worksheet: any
): boolean {
  const params: CommandParams = {
    unitId: workbook?.getId(),
    subUnitId: worksheet?.getSheetId(),
  };

  return executeCommand(univerAPI, UniverCommands.CANCEL_FROZEN, params);
}
