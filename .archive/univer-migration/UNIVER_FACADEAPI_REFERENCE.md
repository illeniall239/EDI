# Univer FacadeAPI Reference Documentation

**Purpose:** Complete API reference for Univer FacadeAPI with method mappings for ChatSidebar integration.

**Last Updated:** 2025-10-05

---

## Table of Contents

1. [Overview](#overview)
2. [Initialization](#initialization)
3. [FWorkbook API](#fworkbook-api)
4. [FWorksheet API](#fworksheet-api)
5. [FRange API](#frange-api)
6. [Luckysheet → Univer Method Mappings](#luckysheet--univer-method-mappings)
7. [Implementation Examples](#implementation-examples)
8. [Best Practices](#best-practices)

---

## Overview

Univer FacadeAPI provides a simplified, user-friendly interface for spreadsheet operations, similar to Google Apps Script or Excel VBA.

### Key Characteristics

- **Simplified Architecture:** Abstracts complex internal commands into simple method calls
- **Chainable Methods:** Most methods return the object for method chaining
- **Asynchronous Operations:** Some APIs are async - use `await` when modifying data
- **Lifecycle-Aware:** Provides lifecycle events for safe operation timing

### Architecture

```
univerAPI (FUniver)
  └─ FWorkbook
      └─ FWorksheet
          └─ FRange
```

---

## Initialization

### Preset Mode (Recommended)

```typescript
import { createUniver } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';

const { univerAPI } = createUniver({
  locale: LocaleType.EN_US,
  presets: [
    UniverSheetsCorePreset(),
    // ... other presets
  ],
});
```

### Plugin Mode

```typescript
import { FUniver } from '@univerjs/core/facade';
import '@univerjs/ui/facade';
import '@univerjs/docs-ui/facade';

const univerAPI = FUniver.newAPI(univer);
```

### Lifecycle Management

```typescript
const disposable = univerAPI.addEvent(
  univerAPI.Event.LifeCycleChanged,
  ({ stage }) => {
    if (stage === univerAPI.Enum.LifecycleStages.Rendered) {
      // UI is rendered - safe for visual operations
    }
    if (stage === univerAPI.Enum.LifecycleStages.Steady) {
      // All initialization complete - safe for all operations
    }
  }
);
```

---

## FWorkbook API

### Creation & Access

| Method | Description | Returns |
|--------|-------------|---------|
| `univerAPI.createWorkbook(data, options)` | Create new workbook | `FWorkbook` |
| `univerAPI.getActiveWorkbook()` | Get current active workbook | `FWorkbook` |
| `univerAPI.disposeUnit(unitId)` | Unload/destroy a workbook | `void` |

### Workbook Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `fWorkbook.save()` | Save workbook data | `Promise<IWorkbookData>` |
| `fWorkbook.getId()` | Get workbook ID | `string` |
| `fWorkbook.getSheets()` | Get all worksheets | `FWorksheet[]` |
| `fWorkbook.getActiveSheet()` | Get active worksheet | `FWorksheet` |
| `fWorkbook.setActiveSheet(sheet)` | Activate specific worksheet | `FWorkbook` |
| `fWorkbook.create(name, rows, cols)` | Create new worksheet | `FWorksheet` |
| `fWorkbook.deleteSheet(sheet)` | Remove worksheet | `FWorkbook` |

### Example

```typescript
const fWorkbook = univerAPI.getActiveWorkbook();
const sheets = fWorkbook.getSheets();
const newSheet = fWorkbook.create('Analysis', 1000, 26);
newSheet.activate();
```

---

## FWorksheet API

### Access & Properties

| Method | Description | Returns |
|--------|-------------|---------|
| `fWorksheet.getSheetId()` | Get sheet ID | `string` |
| `fWorksheet.getSheetName()` | Get sheet name | `string` |
| `fWorksheet.activate()` | Make this sheet active | `FWorksheet` |
| `fWorksheet.getSnapshot()` | Get complete worksheet data | `IWorksheetData` |

### Range Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `fWorksheet.getRange(row, col)` | Get single cell range | `FRange` |
| `fWorksheet.getRange(row, col, numRows, numCols)` | Get rectangular range | `FRange` |
| `fWorksheet.getRange('A1')` | Get range by A1 notation | `FRange` |
| `fWorksheet.getRange('A1:D10')` | Get range by A1 notation | `FRange` |
| `fWorksheet.getActiveRange()` | Get current selection | `FRange` |

### Data Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `fWorksheet.getCellMatrix()` | Get all cell data as matrix | `ICellData[][]` |
| `fWorksheet.clear()` | Clear all sheet content | `FWorksheet` |
| `fWorksheet.clearContent()` | Clear values, keep formatting | `FWorksheet` |
| `fWorksheet.clearFormat()` | Clear formatting, keep values | `FWorksheet` |

### Column & Row Sizing

| Method | Description | Returns |
|--------|-------------|---------|
| `fWorksheet.setColumnWidth(colIndex, width)` | Set column width in pixels | `FWorksheet` |
| `fWorksheet.setColumnWidths(startCol, numCols, width)` | Set multiple column widths | `FWorksheet` |
| `fWorksheet.autoResizeColumns(startCol, numCols)` | Autofit columns to content | `FWorksheet` |
| `fWorksheet.setRowHeight(rowIndex, height)` | Set row height in pixels | `FWorksheet` |
| `fWorksheet.setRowHeights(startRow, numRows, height)` | Set multiple row heights | `FWorksheet` |
| `fWorksheet.autoResizeRows(startRow, numRows)` | Autofit rows to content | `FWorksheet` |

### View Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `fWorksheet.refreshCanvas()` | Refresh sheet rendering | `void` |
| `fWorksheet.zoom(ratio)` | Set zoom level (0.1-4.0) | `FWorksheet` |
| `fWorksheet.scrollToCell(row, col)` | Scroll to specific cell | `FWorksheet` |
| `fWorksheet.getScrollState()` | Get current scroll position | `IScrollState` |

### Filter Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `fWorksheet.getFilter()` | Get active filter | `FFilter \| null` |
| `fWorksheet.createFilter()` | Create filter on range | `FFilter \| null` |

### Example

```typescript
const fWorksheet = fWorkbook.getActiveSheet();
const range = fWorksheet.getRange(0, 0, 10, 5); // First 10 rows, 5 columns
const activeCell = fWorksheet.getActiveRange();
fWorksheet.zoom(1.5); // 150% zoom
```

---

## FRange API

### Value Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `fRange.getValue()` | Get value of top-left cell | `any` |
| `fRange.getValues()` | Get all values as 2D array | `any[][]` |
| `fRange.getRawValue()` | Get unformatted value | `any` |
| `fRange.getDisplayValue()` | Get formatted display value | `string` |
| `fRange.getRichTextValue()` | Get rich text value | `IRichTextValue` |
| `fRange.setValue(value)` | Set value for entire range | `FRange` |
| `fRange.setValues(values)` | Set values from 2D array | `FRange` |
| `fRange.setValueForCell(value)` | Set value for top-left cell only | `FRange` |

### Formula Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `fRange.getFormula()` | Get formula from top-left cell | `string \| null` |
| `fRange.setFormula(formula)` | Set formula for range | `FRange` |

### Cell Data & Styling

| Method | Description | Returns |
|--------|-------------|---------|
| `fRange.getCellData()` | Get complete cell data object | `ICellData` |
| `fRange.getCellStyle()` | Get style of top-left cell | `IStyleData` |
| `fRange.getCellStyles()` | Get styles for all cells | `IStyleData[][]` |
| `fRange.getCellStyleData()` | Get detailed style data | `IStyleData` |

### Font & Text Formatting

| Method | Description | Returns |
|--------|-------------|---------|
| `fRange.setFontWeight(weight)` | Set font weight (e.g., 'bold') | `FRange` |
| `fRange.setFontFamily(family)` | Set font family | `FRange` |
| `fRange.setFontSize(size)` | Set font size (pt) | `FRange` |
| `fRange.setFontColor(color)` | Set font color (hex) | `FRange` |
| `fRange.setFontLine(line)` | Set underline/strikethrough | `FRange` |

### Background & Borders

| Method | Description | Returns |
|--------|-------------|---------|
| `fRange.setBackgroundColor(color)` | Set background color (hex) | `FRange` |
| `fRange.setBorder(borders)` | Set cell borders | `FRange` |

### Number Formatting

| Method | Description | Returns |
|--------|-------------|---------|
| `fRange.setNumberFormat(format)` | Set number format pattern | `FRange` |

### Range Manipulation

| Method | Description | Returns |
|--------|-------------|---------|
| `fRange.clear()` | Clear content and formatting | `FRange` |
| `fRange.clearContent()` | Clear values only | `FRange` |
| `fRange.clearFormat()` | Clear formatting only | `FRange` |
| `fRange.insertCells(shiftType)` | Insert cells with shift | `FRange` |
| `fRange.deleteCells(shiftType)` | Delete cells with shift | `FRange` |
| `fRange.merge()` | Merge cells in range | `FRange` |
| `fRange.breakApart()` | Unmerge cells | `FRange` |
| `fRange.highlight(color)` | Quick highlight | `FRange` |
| `fRange.splitTextToColumns(delimiter)` | Split text to columns | `FRange` |

### Selection & Navigation

| Method | Description | Returns |
|--------|-------------|---------|
| `fRange.activate()` | Set this range as active selection | `FRange` |
| `fRange.getA1Notation()` | Get A1 notation string | `string` |
| `fRange.getCellRect()` | Get visual rectangle coordinates | `IRectangle` |
| `fRange.getCell(row, col)` | Get specific cell in range | `FRange` |
| `fRange.getRow()` | Get starting row index | `number` |
| `fRange.getColumn()` | Get starting column index | `number` |

### Example

```typescript
const range = fWorksheet.getRange('A1:C10');

// Set values
range.setValues([
  ['Name', 'Age', 'Score'],
  ['Alice', 25, 95],
  ['Bob', 30, 87]
]);

// Format headers
const headerRange = fWorksheet.getRange('A1:C1');
headerRange.setFontWeight('bold');
headerRange.setBackgroundColor('#f0f0f0');
headerRange.setFontColor('#333333');

// Format numbers
const scoreRange = fWorksheet.getRange('C2:C10');
scoreRange.setNumberFormat('0.00');

// Get current selection
const activeRange = fWorksheet.getActiveRange();
const values = activeRange.getValues();
```

---

## Luckysheet → Univer Method Mappings

**For ChatSidebar Integration**

### Cell Value Operations

| Luckysheet | Univer Equivalent | Notes |
|------------|-------------------|-------|
| `luckysheet.setCellValue(r, c, value)` | `fWorksheet.getRange(r, c).setValue(value)` | |
| `luckysheet.getCellValue(r, c)` | `fWorksheet.getRange(r, c).getValue()` | |
| `luckysheet.setRangeValue(range, value)` | `fWorksheet.getRange(range).setValue(value)` | |

### Range Value Operations

| Luckysheet | Univer Equivalent | Notes |
|------------|-------------------|-------|
| `luckysheet.setRangeValues(range, values)` | `fWorksheet.getRange(range).setValues(values)` | 2D array |
| `luckysheet.getRangeValues(range)` | `fWorksheet.getRange(range).getValues()` | Returns 2D array |

### Formatting Operations

| Luckysheet | Univer Equivalent | Notes |
|------------|-------------------|-------|
| `luckysheet.setRangeBackgroundColor(range, color)` | `fWorksheet.getRange(range).setBackgroundColor(color)` | Hex color |
| `luckysheet.setRangeFontColor(range, color)` | `fWorksheet.getRange(range).setFontColor(color)` | Hex color |
| `luckysheet.setRangeFontBold(range, bold)` | `fWorksheet.getRange(range).setFontWeight(bold ? 'bold' : 'normal')` | |
| `luckysheet.setRangeFontSize(range, size)` | `fWorksheet.getRange(range).setFontSize(size)` | Size in pt |

### Sheet Operations

| Luckysheet | Univer Equivalent | Notes |
|------------|-------------------|-------|
| `luckysheet.clearRange(range)` | `fWorksheet.getRange(range).clear()` | |
| `luckysheet.deleteRange(range)` | `fWorksheet.getRange(range).deleteCells(shiftType)` | |
| `luckysheet.insertRange(range)` | `fWorksheet.getRange(range).insertCells(shiftType)` | |
| `luckysheet.mergeRange(range)` | `fWorksheet.getRange(range).merge()` | |

### Selection Operations

| Luckysheet | Univer Equivalent | Notes |
|------------|-------------------|-------|
| `luckysheet.getRange()` | `fWorksheet.getActiveRange()` | Current selection |
| `luckysheet.setRange(range)` | `fWorksheet.getRange(range).activate()` | Set selection |

### Formula Operations

| Luckysheet | Univer Equivalent | Notes |
|----------||-------------------|-------|
| `luckysheet.setCellFormula(r, c, formula)` | `fWorksheet.getRange(r, c).setFormula(formula)` | Must start with `=` |
| `luckysheet.getCellFormula(r, c)` | `fWorksheet.getRange(r, c).getFormula()` | |

---

## Implementation Examples

### UniverAdapter Class (Current Implementation)

Our `UniverAdapter` class already implements most common operations:

```typescript
import { UniverAdapter } from '@/utils/univerAdapter';

// Initialize
const adapter = new UniverAdapter(univerAPI);

// Check readiness
if (!adapter.isReady()) {
  console.error('Adapter not ready');
  return;
}

// Read operations
const value = adapter.getCellValue(0, 0);
const values = adapter.getRangeValues(0, 0, 10, 5);
const allData = adapter.getAllData();

// Write operations
adapter.setCellValue(0, 0, 'Hello');
adapter.setRangeValues(0, 0, [['A', 'B'], ['C', 'D']]);
adapter.setFormula(1, 1, '=SUM(A1:A10)');

// Formatting
adapter.setBackgroundColor(0, 0, 1, 5, '#ffff00');
adapter.setFontColor(0, 0, 1, 5, '#ff0000');
adapter.setFontWeight(0, 0, 1, 5, 'bold');

// Sheet operations
adapter.clearSheet();
adapter.clearRange(0, 0, 10, 10);

// Add new sheet
adapter.addSheet('New Sheet', [['Header1', 'Header2'], ['Data1', 'Data2']]);
```

### ChatSidebar Integration Pattern

```typescript
// In ChatSidebar, we need to detect which engine is active
function executeSpreadsheetCommand(actionPayload: any, univerAdapter?: UniverAdapter) {
  // Check if Univer is active
  if (univerAdapter && univerAdapter.isReady()) {
    return executeUniverCommand(actionPayload, univerAdapter);
  }

  // Fallback to Luckysheet
  if (window.luckysheet) {
    return executeLuckysheetCommand(actionPayload);
  }

  return { success: false, message: 'No spreadsheet engine available' };
}

function executeUniverCommand(actionPayload: any, adapter: UniverAdapter) {
  const { type, payload } = actionPayload;

  switch (type) {
    case 'set_cell_value':
      return adapter.setCellValue(payload.row, payload.col, payload.value)
        ? { success: true }
        : { success: false, message: 'Failed to set cell value' };

    case 'set_range_background':
      return adapter.setBackgroundColor(
        payload.startRow,
        payload.startCol,
        payload.numRows,
        payload.numCols,
        payload.color
      ) ? { success: true }
        : { success: false, message: 'Failed to set background' };

    // ... more cases
  }
}
```

### Column Extraction (New Sheet Creation)

```typescript
// Already implemented in univerAdapter.ts:418-481
const success = adapter.addSheet('Extracted Columns', extractedData);

// This internally:
// 1. Creates sheet with 1000x26 grid (minimum)
// 2. Populates data in top-left corner
// 3. Activates the new sheet
```

### Formula Insertion

```typescript
// Already implemented in UniversalSpreadsheet.tsx
const currentSelection = adapter.getCurrentSelection();
if (currentSelection) {
  adapter.setFormula(currentSelection.row, currentSelection.col, '=SUM(A1:A10)');
}
```

---

## Best Practices

### 1. Always Check Adapter Readiness

```typescript
if (!univerAdapter.isReady()) {
  console.error('Univer not ready');
  return;
}
```

### 2. Use Lifecycle Events for Initialization

```typescript
univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, ({ stage }) => {
  if (stage === univerAPI.Enum.LifecycleStages.Steady) {
    // Safe to perform all operations
    initializeData();
  }
});
```

### 3. Handle Async Operations

```typescript
// Some operations may be async
const workbookData = await fWorkbook.save();
```

### 4. Refresh Adapter References

```typescript
// UniverAdapter automatically refreshes on each operation
// But if you keep raw references, manually refresh:
const fWorkbook = univerAPI.getActiveWorkbook(); // Always fresh
```

### 5. Use A1 Notation for Readability

```typescript
// Preferred
fWorksheet.getRange('A1:D10').setValue('Header');

// Also valid (0-indexed)
fWorksheet.getRange(0, 0, 1, 4).setValue('Header');
```

### 6. Chain Operations When Possible

```typescript
fWorksheet
  .getRange('A1:C1')
  .setValue('Header')
  .setFontWeight('bold')
  .setBackgroundColor('#f0f0f0')
  .setFontColor('#333333');
```

### 7. Error Handling

```typescript
try {
  adapter.setCellValue(row, col, value);
} catch (error) {
  console.error('Failed to set value:', error);
  // Fallback or user notification
}
```

---

## Future Work: ChatSidebar Integration

To make ChatSidebar work with UniversalSpreadsheet:

1. **Pass UniverAdapter to ChatSidebar** - Add as optional prop
2. **Create Universal Command Executor** - Detect engine and route appropriately
3. **Map AI Commands** - Convert Luckysheet API calls to Univer equivalents
4. **Test Coverage** - Ensure all command types work

**Note:** This document serves as the reference for that future implementation.

---

## References

- [Univer Official Docs](https://docs.univer.ai)
- [Univer API Reference](https://reference.univer.ai/en-US)
- [Facade API Guide](https://docs.univer.ai/guides/sheets/getting-started/facade)
- [Range & Selection](https://docs.univer.ai/guides/sheets/features/core/range-selection)
- [Sheets API](https://docs.univer.ai/guides/sheets/features/core/sheets-api)

---

**Document Status:** Complete - Ready for ChatSidebar integration reference
