# Univer Migration Plan

## Executive Summary
Migrate from deprecated Luckysheet to Univer for long-term maintainability and modern features. Implementation will be done in parallel to allow smooth transition without disrupting current functionality.

---

## Phase 1: Research & Setup (Current Phase)

### 1.1 API Mapping Document
Map all current Luckysheet APIs to Univer equivalents:

| Current (Luckysheet) | Univer Equivalent | Notes |
|---------------------|-------------------|-------|
| `window.luckysheet.getAllSheets()` | `univerAPI.getActiveWorkbook().getSheets()` | Returns worksheet data |
| `window.luckysheet.getSheetData()` | `sheet.getSnapshot()` | Cell data snapshot |
| `window.luckysheet.setCellValue()` | `univerAPI.getCommandService().executeCommand()` | Uses command pattern |
| `window.luckysheet.refresh()` | `univerAPI.getActiveWorkbook().save()` | Trigger recalc |
| `window.luckysheet.jfrefreshgrid()` | Auto-handled by Univer | Not needed |

### 1.2 Dependencies
```json
{
  "@univerjs/core": "latest",
  "@univerjs/design": "latest",
  "@univerjs/docs": "latest",
  "@univerjs/docs-ui": "latest",
  "@univerjs/engine-formula": "latest",
  "@univerjs/engine-render": "latest",
  "@univerjs/sheets": "latest",
  "@univerjs/sheets-formula": "latest",
  "@univerjs/sheets-ui": "latest",
  "@univerjs/ui": "latest",
  "@univerjs/facade": "latest"
}
```

### 1.3 File Structure
```
edi-frontend/src/
├── components/
│   ├── NativeSpreadsheet.tsx          # Current Luckysheet (keep)
│   ├── UniversalSpreadsheet.tsx       # New Univer component
│   └── SpreadsheetWrapper.tsx         # Wrapper to toggle between both
├── utils/
│   ├── luckysheetConverter.ts         # Current converters (keep)
│   └── univerConverter.ts             # New Univer converters
├── hooks/
│   └── useSpreadsheetMode.ts          # Hook to manage which engine to use
└── config/
    └── spreadsheetConfig.ts           # Feature flags
```

---

## Phase 2: Parallel Implementation

### 2.1 Create UniversalSpreadsheet Component
- Initialize Univer with plugin system
- Support same props interface as NativeSpreadsheet
- Implement basic CRUD operations

### 2.2 Data Conversion Layer
```typescript
// utils/univerConverter.ts
export function arrayToUniverData(data: any[]): IWorkbookData
export function univerDataToArray(workbook: IWorkbookData): any[]
export function preserveFormulas(celldata: ICellData): string | value
```

### 2.3 Formula Persistence
- Map Luckysheet formula format to Univer
- Ensure formulas are saved/loaded correctly
- Handle formula recalculation

### 2.4 Feature Parity Checklist
- [ ] Data loading/display
- [ ] Formula input and calculation
- [ ] Cell formatting (bold, colors, etc.)
- [ ] Column operations (add, remove, reorder)
- [ ] Row operations (add, remove)
- [ ] Save/Load from Supabase
- [ ] Undo/Redo
- [ ] Copy/Paste
- [ ] AI command integration
- [ ] Export (CSV, Excel)
- [ ] Column extraction
- [ ] Data quality reports

---

## Phase 3: Testing & Validation

### 3.1 Feature Testing Matrix
Test each feature with both engines side-by-side:
- Work Mode functionality
- Learn Mode functionality
- Formula persistence across page reload
- New column addition
- Background auto-save
- Manual save
- AI commands execution

### 3.2 Performance Benchmarks
Compare:
- Initial load time
- Data refresh speed
- Formula calculation speed
- Memory usage
- Bundle size

### 3.3 Data Integrity Tests
- Save data with Luckysheet, load with Univer
- Ensure no data loss in conversion
- Verify formula accuracy

---

## Phase 4: Gradual Rollout

### 4.1 Feature Flag System
```typescript
// config/spreadsheetConfig.ts
export const SPREADSHEET_ENGINE = {
  LUCKYSHEET: 'luckysheet',
  UNIVER: 'univer'
} as const;

export const USE_UNIVER = process.env.NEXT_PUBLIC_USE_UNIVER === 'true';
```

### 4.2 Wrapper Component
```typescript
// SpreadsheetWrapper.tsx
export default function SpreadsheetWrapper(props) {
  const engine = USE_UNIVER ? 'univer' : 'luckysheet';
  
  return engine === 'univer' 
    ? <UniversalSpreadsheet {...props} />
    : <NativeSpreadsheet {...props} />;
}
```

### 4.3 Migration Steps
1. Deploy with Univer code but flag OFF
2. Enable for internal testing
3. Enable for beta users
4. Monitor for issues
5. Full rollout
6. Deprecate Luckysheet code

---

## Phase 5: Cleanup & Documentation

### 5.1 Code Cleanup
- Remove Luckysheet dependencies
- Remove NativeSpreadsheet.tsx
- Clean up unused converters
- Update imports across codebase

### 5.2 Documentation
- Update developer docs
- Create troubleshooting guide
- Document new APIs for team

---

## Risk Mitigation

### Critical Risks
1. **Data Loss**: Mitigate with comprehensive conversion tests
2. **Performance Regression**: Benchmark before/after
3. **Feature Missing**: Complete feature parity checklist
4. **User Disruption**: Gradual rollout with rollback plan

### Rollback Strategy
- Keep Luckysheet code until Univer is proven stable
- Feature flag allows instant rollback
- Maintain parallel support for 1-2 releases

---

## Timeline Estimate

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Research & Setup | 1-2 days | 🔄 In Progress |
| Phase 2: Implementation | 3-5 days | ⏳ Pending |
| Phase 3: Testing | 2-3 days | ⏳ Pending |
| Phase 4: Rollout | 1-2 weeks | ⏳ Pending |
| Phase 5: Cleanup | 1-2 days | ⏳ Pending |
| **Total** | **2-3 weeks** | |

---

## Success Criteria

✅ All features from NativeSpreadsheet working in UniversalSpreadsheet
✅ No data loss in conversion
✅ Formulas persist correctly across reloads
✅ Performance equal or better than Luckysheet
✅ Zero critical bugs in production
✅ Positive user feedback
✅ Clean codebase with deprecated code removed

---

## Next Steps

1. ✅ Create migration plan (this document)
2. 🔄 Document current Luckysheet API usage
3. ⏳ Install Univer dependencies
4. ⏳ Create basic UniversalSpreadsheet component
5. ⏳ Implement data converters
6. ⏳ Test basic functionality

---

## Notes

- Keep this document updated as we progress
- Track issues in a separate UNIVER_ISSUES.md
- Document all breaking changes
- Maintain feature parity matrix

