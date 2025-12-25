# Luckysheet API Usage Audit

This document catalogs all Luckysheet API calls used in the codebase to ensure complete migration to Univer.

---

## Core API Calls

### Data Retrieval
| API Call | Location | Purpose | Univer Equivalent |
|----------|----------|---------|-------------------|
| `window.luckysheet.getAllSheets()` | NativeSpreadsheet.tsx:685 | Get full sheet snapshot with celldata | `univerAPI.getActiveWorkbook().getSnapshot()` |
| `window.luckysheet.getAllSheets()[0].celldata` | NativeSpreadsheet.tsx:524 | Get cell data with formulas | `sheet.getCellMatrix()` or `sheet.getSnapshot().cellData` |
| `window.luckysheet.getSheetData()` | NativeSpreadsheet.tsx:531 | Get 2D array of values | `sheet.getRange().getValues()` |
| `window.luckysheet.flowdata()` | NativeSpreadsheet.tsx:various | Get current sheet data | `sheet.getCellMatrix()` |

### Data Modification
| API Call | Location | Purpose | Univer Equivalent |
|----------|----------|---------|-------------------|
| `window.luckysheet.setCellValue(row, col, value)` | NativeSpreadsheet.tsx:various | Set single cell | `univerAPI.executeCommand(SetRangeValuesCommand)` |
| `window.luckysheet.setRangeValue(range, data)` | ChatSidebar.tsx | Set multiple cells | `univerAPI.executeCommand(SetRangeValuesCommand)` |
| `window.luckysheet.insertRow(row)` | Various | Insert new row | `univerAPI.executeCommand(InsertRowCommand)` |
| `window.luckysheet.deleteRow(row)` | Various | Delete row | `univerAPI.executeCommand(RemoveRowCommand)` |
| `window.luckysheet.insertColumn(col)` | Various | Insert new column | `univerAPI.executeCommand(InsertColCommand)` |

### Sheet Management
| API Call | Location | Purpose | Univer Equivalent |
|----------|----------|---------|-------------------|
| `window.luckysheet.create()` | NativeSpreadsheet.tsx:1510 | Initialize Luckysheet | `new Univer()` + plugins |
| `window.luckysheet.destroy()` | NativeSpreadsheet.tsx:cleanup | Cleanup instance | `univer.dispose()` |
| `window.luckysheet.refresh()` | NativeSpreadsheet.tsx:2970 | Force refresh | `univerAPI.getActiveWorkbook().save()` |
| `window.luckysheet.jfrefreshgrid()` | NativeSpreadsheet.tsx:2971 | Refresh grid view | Auto-handled in Univer |

### Selection & Navigation
| API Call | Location | Purpose | Univer Equivalent |
|----------|----------|---------|-------------------|
| `window.luckysheet.getRange()` | NativeSpreadsheet.tsx:various | Get selected range | `univerAPI.getActiveRange()` |
| `window.luckysheet.setRangeShow()` | Various | Show/highlight range | `univerAPI.setActiveRange()` |

### Formulas
| API Call | Location | Purpose | Univer Equivalent |
|----------|----------|---------|-------------------|
| Formula setting via celldata | NativeSpreadsheet.tsx:prepareLuckysheetData | Set formula with `f` property | `SetRangeValuesCommand` with formula |
| Formula reading via celldata | NativeSpreadsheet.tsx:convertLuckysheetToArrayData | Read `cell.v.f` | `cell.f` in Univer |

---

## Data Structure Mapping

### Luckysheet Cell Format
```javascript
{
  r: 0,           // row
  c: 1,           // column
  v: {
    v: 100,       // computed value
    f: "=SUM(A1)", // formula
    ct: { fa: "General", t: "g" }, // cell type
    m: "100"      // formatted display
  }
}
```

### Univer Cell Format
```javascript
{
  v: 100,         // value
  f: "=SUM(A1)",  // formula
  s: {            // style
    ff: "Arial",
    fs: 12
  },
  t: CellValueType.NUMBER
}
```

---

## Configuration Mapping

### Luckysheet Options
```javascript
luckysheet.create({
  container: 'luckysheet',
  data: [{ celldata: [...] }],
  showtoolbar: false,
  showsheetbar: false,
  column: 26,
  row: 1000
})
```

### Univer Configuration
```typescript
const univer = new Univer({
  theme: defaultTheme,
  locale: LocaleType.EN_US,
});

const workbook = univer.createUniverSheet({
  id: 'workbook-01',
  appVersion: '0.1.0',
  sheets: {
    sheet1: {
      id: 'sheet-01',
      cellData: { ... }
    }
  }
});
```

---

## Hook Patterns

### Current Pattern (Luckysheet)
```typescript
useEffect(() => {
  if (window.luckysheet) {
    window.luckysheet.create(options);
  }
  return () => {
    if (window.luckysheet) {
      window.luckysheet.destroy();
    }
  };
}, []);
```

### New Pattern (Univer)
```typescript
const univerRef = useRef<Univer>();

useEffect(() => {
  const univer = new Univer({...});
  // Register plugins
  univer.registerPlugin(UniverSheetsPlugin);
  univer.registerPlugin(UniverSheetsFormulaPlugin);
  
  univerRef.current = univer;
  
  return () => {
    univer.dispose();
  };
}, []);
```

---

## Event Handling

### Luckysheet Events
```javascript
// Cell change
luckysheet.create({
  hook: {
    cellUpdated: (r, c, oldValue, newValue) => { ... }
  }
});
```

### Univer Events
```typescript
// Using command interceptor
commandService.onCommandExecuted((command) => {
  if (command.id === SetRangeValuesCommand.id) {
    // Handle cell update
  }
});
```

---

## Custom Extensions

### Current Custom Code
1. **Formula Error Detection** - FormulaErrorService.ts
   - Hook into Luckysheet's calculation engine
   - Parse error messages
   - Suggest fixes

2. **Command Processor** - spreadsheetCommandProcessor.ts
   - Execute custom commands
   - Map AI commands to Luckysheet APIs

3. **Data Quality Reports**
   - Read data from Luckysheet
   - Generate reports
   - Visualize issues

### Migration Strategy
- Formula errors: Use Univer's formula engine events
- Commands: Use Univer's command pattern natively
- Reports: Update to read from Univer's data format

---

## Dependencies to Update

### Remove
```json
{
  "luckysheet": "^2.1.13",
  "@types/luckysheet": "^2.1.0"
}
```

### Add
```json
{
  "@univerjs/core": "latest",
  "@univerjs/design": "latest",
  "@univerjs/engine-formula": "latest",
  "@univerjs/engine-render": "latest",
  "@univerjs/sheets": "latest",
  "@univerjs/sheets-formula": "latest",
  "@univerjs/sheets-ui": "latest",
  "@univerjs/ui": "latest",
  "@univerjs/facade": "latest"
}
```

---

## Files Affected

### Primary Files (Major Changes)
- `src/components/NativeSpreadsheet.tsx` - Complete rewrite as UniversalSpreadsheet.tsx
- `src/components/ChatSidebar.tsx` - Update Luckysheet API calls
- `src/utils/api.ts` - Update data format handling
- `public/index.html` - Remove Luckysheet CDN links

### Secondary Files (Minor Updates)
- `src/components/WorkModeWorkspace.tsx` - Update component import
- `src/components/LearnModeWorkspace.tsx` - Update component import
- `src/app/workspace/[id]/page.tsx` - Update component import
- `src/services/formulaErrorService.ts` - Update formula detection

### Configuration Files
- `package.json` - Update dependencies
- `next.config.js` - May need Univer-specific webpack config
- `.env` - Add feature flags

---

## Testing Checklist

### Data Integrity
- [ ] Load existing workspace saved with Luckysheet
- [ ] Verify all cells have correct values
- [ ] Verify all formulas are preserved
- [ ] Verify cell formatting is maintained
- [ ] Save with Univer and reload
- [ ] Cross-check with original data

### Feature Parity
- [ ] Basic cell editing
- [ ] Formula input and calculation
- [ ] Copy/paste
- [ ] Undo/redo
- [ ] Add/remove rows
- [ ] Add/remove columns
- [ ] Cell formatting
- [ ] Export to CSV
- [ ] Export to Excel
- [ ] AI command execution
- [ ] Background auto-save
- [ ] Manual save
- [ ] Data quality reports
- [ ] Column extraction

### Performance
- [ ] Initial load time < 2s
- [ ] Data refresh < 500ms
- [ ] Formula calculation responsive
- [ ] No memory leaks
- [ ] Bundle size acceptable

---

## Risk Analysis

### High Risk
1. **Formula compatibility** - Different engines may calculate differently
2. **Data loss** - Conversion errors could lose user data
3. **Performance regression** - Univer may be slower for large datasets

### Medium Risk
1. **Feature gaps** - Some Luckysheet features may not exist in Univer
2. **API breaking changes** - Univer is actively developed
3. **Browser compatibility** - Different support matrix

### Low Risk
1. **UI differences** - Styling may look different
2. **Keyboard shortcuts** - May need remapping
3. **File exports** - Format differences

---

## Notes
- Keep both implementations in parallel until Univer is production-ready
- Document all workarounds and edge cases
- Create automated tests for critical features
- Plan for gradual rollout with feature flags

