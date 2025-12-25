# Univer API Integration Guide

## Overview

The Univer integration includes a comprehensive API adapter (`UniverAdapter`) that provides a unified interface for:
- AI-driven natural language commands
- File uploads (CSV/Excel)
- Programmatic spreadsheet manipulation
- All CRUD operations on spreadsheet data

## Architecture

```
User/AI Command → UniversalSpreadsheet → UniverAdapter → Univer FacetAPI → Spreadsheet
                                              ↓
                                      Unified Interface
```

## Key Components

### 1. UniverAdapter (`/src/utils/univerAdapter.ts`)

A wrapper class that provides a consistent API regardless of the underlying spreadsheet engine (Luckysheet or Univer).

**Key Methods:**

#### Read Operations
```typescript
const adapter = univerAdapterRef.current;

// Get single cell value
const value = adapter.getCellValue(row, col);

// Get range values as 2D array
const values = adapter.getRangeValues(startRow, startCol, numRows, numCols);

// Get all sheet data
const allData = adapter.getAllData();

// Get formula from cell
const formula = adapter.getFormula(row, col);
```

#### Write Operations
```typescript
// Set single cell value
adapter.setCellValue(row, col, 'Hello World');

// Set range values (2D array)
adapter.setRangeValues(0, 0, [[1,2,3], [4,5,6]]);

// Set formula
adapter.setFormula(0, 0, '=SUM(A2:A10)');

// Load data from file (CSV/Excel parsed array)
adapter.loadData(parsedData, clearExisting: true);
```

#### Formatting Operations
```typescript
// Set background color
adapter.setBackgroundColor(row, col, numRows, numCols, '#FF0000');

// Set font color
adapter.setFontColor(row, col, numRows, numCols, '#FFFFFF');

// Set font weight
adapter.setFontWeight(row, col, numRows, numCols, 'bold');

// Set number format (currency, dates, etc.)
adapter.setNumberFormat(row, col, numRows, numCols, '$0.00');
```

#### Sheet Operations
```typescript
// Clear sheet
adapter.clearSheet();

// Clear specific range
adapter.clearRange(startRow, startCol, numRows, numCols);

// Sort by column
adapter.sort('A1:D10', columnIndex, ascending);

// Apply filter
adapter.autoFilter('A1:D10');
```

## File Upload Integration

### Current Flow

```
1. User uploads file → FileUpload component
2. File is parsed → Array format
3. Pass to SpreadsheetWrapper (via data prop)
4. SpreadsheetWrapper routes to correct engine
5. UniversalSpreadsheet receives data
6. UniverConverter.arrayToUniver() converts format
7. Data loaded into Univer
```

### Direct File Load (Alternative)

```typescript
// In UniversalSpreadsheet or parent component
const handleFileUpload = (parsedData: any[][]) => {
  if (univerAdapterRef.current?.isReady()) {
    univerAdapterRef.current.loadData(parsedData, true);
  }
};
```

## AI Command Integration

### Example AI Command Handler

```typescript
// In your AI command processor
const executeCommand = async (naturalLanguageCommand: string) => {
  const adapter = univerAdapterRef.current;
  
  if (!adapter?.isReady()) {
    return { error: 'Spreadsheet not ready' };
  }

  // Parse natural language → structured command
  const command = parseAICommand(naturalLanguageCommand);
  
  switch (command.type) {
    case 'SET_VALUE':
      return adapter.setCellValue(command.row, command.col, command.value);
      
    case 'SET_FORMULA':
      return adapter.setFormula(command.row, command.col, command.formula);
      
    case 'FORMAT_RANGE':
      return adapter.setBackgroundColor(
        command.startRow, 
        command.startCol, 
        command.numRows, 
        command.numCols, 
        command.color
      );
      
    case 'SORT_DATA':
      return adapter.sort(command.range, command.columnIndex, command.ascending);
      
    default:
      return { error: 'Unknown command' };
  }
};
```

### Example Natural Language Commands

```typescript
// "Set cell A1 to 100"
adapter.setCellValue(0, 0, 100);

// "Apply formula =SUM(A1:A10) to cell B1"
adapter.setFormula(1, 0, '=SUM(A1:A10)');

// "Highlight cells A1 to C3 in red"
adapter.setBackgroundColor(0, 0, 3, 3, '#FF0000');

// "Sort data by column A ascending"
adapter.sort('A1:D10', 0, true);

// "Filter data in range A1:D10"
adapter.autoFilter('A1:D10');
```

## Usage in Components

### UniversalSpreadsheet

```typescript
export default function UniversalSpreadsheet({ 
  data, 
  onCommand, 
  onDataUpdate,
  ...props 
}) {
  const univerAdapterRef = useRef<UniverAdapter | null>(null);
  
  // Initialize adapter after Univer creation
  useEffect(() => {
    if (univerAPI) {
      univerAdapterRef.current = createUniverAdapter(univerAPI);
    }
  }, [univerAPI]);
  
  // Handle AI commands
  const handleCommand = useCallback(async (cmd) => {
    if (univerAdapterRef.current?.isReady()) {
      // Use adapter methods based on command
      return await processCommand(cmd, univerAdapterRef.current);
    }
  }, []);
  
  // Handle file uploads
  const handleFileData = useCallback((fileData: any[][]) => {
    if (univerAdapterRef.current?.isReady()) {
      univerAdapterRef.current.loadData(fileData);
    }
  }, []);
}
```

## Migration from Luckysheet

### Luckysheet → Univer API Mapping

```typescript
// Luckysheet
window.luckysheet.getCellValue(row, col);
window.luckysheet.setCellValue(row, col, value);
window.luckysheet.setRangeValue(range, value);

// Univer Adapter (same interface!)
adapter.getCellValue(row, col);
adapter.setCellValue(row, col, value);
adapter.setRangeValues(startRow, startCol, values);
```

**Key Advantages:**
- ✅ Same method names where possible
- ✅ Similar parameter structure
- ✅ Unified error handling
- ✅ Works with both engines via SpreadsheetWrapper

## Feature Matrix

| Feature | Luckysheet | Univer | Adapter Support |
|---------|-----------|--------|----------------|
| Read/Write Cells | ✅ | ✅ | ✅ |
| Formulas | ✅ | ✅ | ✅ |
| Formatting | ✅ | ✅ | ✅ |
| Sort/Filter | ✅ | ✅ | ✅ |
| File Import | ✅ | ✅ | ✅ |
| AI Commands | ✅ | ✅ | ✅ |
| Data Validation | ❌ | ✅ | 🔜 |
| Conditional Format | ❌ | ✅ | 🔜 |
| Hyperlinks | ❌ | ✅ | 🔜 |
| Comments | ❌ | ✅ | 🔜 |
| Drawing/Shapes | ❌ | ✅ | 🔜 |

## Next Steps

1. **Extend Adapter**: Add methods for new Univer features (data validation, conditional formatting, etc.)
2. **AI Command Parser**: Build a natural language → command translator
3. **Testing**: Create comprehensive tests for all adapter methods
4. **Documentation**: Add JSDoc comments for all public methods

## Examples

See `/examples/univer-commands.ts` for complete examples of:
- File upload handling
- AI command processing
- Batch operations
- Error handling

