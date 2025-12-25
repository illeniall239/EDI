# Univer Installation & Testing Guide

## Quick Start

### 1. Install Dependencies

```bash
cd edi-frontend

# Install all Univer packages
npm install @univerjs/core@^0.1.16 \
  @univerjs/design@^0.1.16 \
  @univerjs/docs@^0.1.16 \
  @univerjs/docs-ui@^0.1.16 \
  @univerjs/engine-formula@^0.1.16 \
  @univerjs/engine-render@^0.1.16 \
  @univerjs/sheets@^0.1.16 \
  @univerjs/sheets-formula@^0.1.16 \
  @univerjs/sheets-ui@^0.1.16 \
  @univerjs/ui@^0.1.16 \
  @univerjs/facade@^0.1.16
```

### 2. Enable Univer (Optional - for testing)

Create or update `.env.local`:

```bash
# Use Univer instead of Luckysheet
NEXT_PUBLIC_USE_UNIVER=true
```

**Note**: By default, Luckysheet is used. Only set this when ready to test Univer.

### 3. Uncomment Univer Code

In `src/components/UniversalSpreadsheet.tsx`, uncomment:
- Import statements (lines ~10-20)
- Initialization code in useEffect (lines ~80-140)
- getCurrentData implementation (lines ~170-180)

### 4. Start Development Server

```bash
npm run dev
```

---

## Testing Strategy

### Phase 1: Basic Functionality ✅

Test with **empty workspace**:

1. Create new workspace
2. Upload CSV file
3. Verify data displays correctly
4. Edit cells
5. Save workspace
6. Reload page
7. Verify data persists

**Expected**: All cells display, editing works, data persists.

### Phase 2: Formula Testing ✅

Test **formula persistence**:

1. Create workspace with sample data
2. Add formula: `=SUM(A1:A10)`
3. Verify calculation works
4. Save workspace
5. Reload page
6. Verify formula still exists and calculates

**Expected**: Formulas persist and recalculate on load.

### Phase 3: Complex Operations ✅

Test **advanced features**:

1. Add/remove columns
2. Add/remove rows
3. Cell formatting (bold, colors)
4. Copy/paste
5. Undo/redo
6. Export to CSV
7. Export to Excel

**Expected**: All operations work smoothly.

### Phase 4: Migration Testing ✅

Test **Luckysheet → Univer** migration:

1. Create workspace with Luckysheet (NEXT_PUBLIC_USE_UNIVER=false)
2. Add data, formulas, formatting
3. Save workspace
4. Switch to Univer (NEXT_PUBLIC_USE_UNIVER=true)
5. Reload workspace
6. Verify all data, formulas, formatting preserved

**Expected**: Seamless transition, no data loss.

### Phase 5: AI Commands ✅

Test **AI integration**:

1. Run spreadsheet commands via chat
2. Test formula generation
3. Test data operations
4. Test column extraction
5. Test data quality reports

**Expected**: All AI features work with Univer.

---

## Comparison Testing

### Side-by-Side Test

Run both engines in separate browser tabs:

**Tab 1: Luckysheet**
```bash
NEXT_PUBLIC_USE_UNIVER=false npm run dev
```

**Tab 2: Univer** (different port)
```bash
NEXT_PUBLIC_USE_UNIVER=true PORT=3001 npm run dev
```

Test same operations in both tabs and compare results.

---

## Known Issues & Workarounds

### Issue 1: Styles Not Loading
**Symptom**: Univer UI looks broken
**Fix**: Ensure CSS imports are at top of component:
```typescript
import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/sheets-ui/lib/index.css';
```

### Issue 2: Formula Not Calculating
**Symptom**: Formula shows as text
**Fix**: Ensure `UniverSheetsFormulaPlugin` is registered

### Issue 3: Data Not Persisting
**Symptom**: Changes lost on reload
**Fix**: Check `saveCurrentState()` implementation

---

## Performance Benchmarks

### Metrics to Track

| Metric | Luckysheet | Univer | Target |
|--------|-----------|--------|--------|
| Initial Load | ? | ? | < 2s |
| Data Refresh (1K rows) | ? | ? | < 500ms |
| Formula Calc (100 cells) | ? | ? | < 100ms |
| Bundle Size | ? | ? | < 3MB |
| Memory Usage | ? | ? | < 100MB |

**How to measure**:
```javascript
// In browser console
performance.mark('start');
// ... perform operation ...
performance.mark('end');
performance.measure('operation', 'start', 'end');
console.log(performance.getEntriesByType('measure'));
```

---

## Debugging Tips

### Enable Verbose Logging

In `UniversalSpreadsheet.tsx`:
```typescript
// Add at top
if (typeof window !== 'undefined') {
  window.UNIVER_DEBUG = true;
}
```

### Check Univer Instance

In browser console:
```javascript
// Access Univer instance (when initialized)
window.__UNIVER_INSTANCE__

// Get current workbook data
window.__UNIVER_API__.getActiveWorkbook().getSnapshot()
```

### Common Console Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Cannot read property of undefined" | Plugin not registered | Check plugin registration order |
| "Formula engine not found" | Formula plugin missing | Register `UniverSheetsFormulaPlugin` |
| "Cell data invalid" | Wrong data format | Check converter functions |

---

## Rollback Plan

If critical issues arise:

### Emergency Rollback (Immediate)
```bash
# Set environment variable back to Luckysheet
NEXT_PUBLIC_USE_UNIVER=false

# Restart server
npm run dev
```

### Code Rollback
1. Comment out Univer imports in affected files
2. Update `spreadsheetConfig.ts`: Set `USE_UNIVER = false`
3. Deploy

### Data Recovery
- All data is stored in Supabase in universal format
- Both engines can read same data
- No data loss from switching engines

---

## Feature Parity Checklist

Before full migration, verify these work in Univer:

### Core Features
- [ ] Display data from array
- [ ] Load data from Supabase
- [ ] Save data to Supabase
- [ ] Edit cells
- [ ] Add rows
- [ ] Add columns
- [ ] Delete rows
- [ ] Delete columns
- [ ] Undo/redo

### Formulas
- [ ] Enter formula (=SUM, =AVERAGE, etc.)
- [ ] Formula calculation
- [ ] Formula autocomplete
- [ ] Formula error handling
- [ ] Formula persistence
- [ ] Cross-cell references
- [ ] Formula recalculation on reload

### Formatting
- [ ] Bold/italic text
- [ ] Font size
- [ ] Cell colors
- [ ] Number formatting
- [ ] Date formatting

### Import/Export
- [ ] Import CSV
- [ ] Import Excel
- [ ] Export CSV
- [ ] Export Excel
- [ ] Column extraction

### AI Features
- [ ] Execute Luckysheet API commands
- [ ] Generate formulas
- [ ] Data analysis commands
- [ ] Custom commands
- [ ] Data quality reports

### Work/Learn Modes
- [ ] Work mode functionality
- [ ] Learn mode functionality
- [ ] Background auto-save
- [ ] Manual save
- [ ] Mode switching

---

## Next Steps After Installation

1. ✅ Install dependencies
2. ✅ Uncomment Univer code
3. ⏳ Run basic tests (Phase 1)
4. ⏳ Test formulas (Phase 2)
5. ⏳ Test complex operations (Phase 3)
6. ⏳ Run migration test (Phase 4)
7. ⏳ Test AI commands (Phase 5)
8. ⏳ Performance benchmarks
9. ⏳ Feature parity verification
10. ⏳ Production rollout decision

---

## Support & Resources

- **Univer Docs**: https://docs.univer.ai
- **Univer GitHub**: https://github.com/dream-num/univer
- **Migration Guide**: https://docs.univer.ai/guides/recipes/practices/migrate-from-luckysheet
- **Discord**: https://discord.gg/z3NKNT6D2f

---

## Notes

- Keep both implementations until Univer is fully validated
- Monitor for user feedback during rollout
- Document all workarounds for future reference
- Update this guide as issues are discovered

