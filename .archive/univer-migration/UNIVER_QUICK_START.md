# Univer Migration - Quick Start Guide

## 🚀 TL;DR

We've built a complete parallel implementation to migrate from Luckysheet to Univer. **The wrapper is now integrated** - your app will automatically use Luckysheet by default. When ready to test Univer, follow the 3 steps below.

**Current Status**: ✅ `SpreadsheetWrapper` is now used throughout the app (switched from `NativeSpreadsheet`)

---

## 📦 Step 1: Install Packages (2 minutes)

```bash
cd edi-frontend

npm install @univerjs/core@^0.1.16 @univerjs/design@^0.1.16 @univerjs/docs@^0.1.16 @univerjs/docs-ui@^0.1.16 @univerjs/engine-formula@^0.1.16 @univerjs/engine-render@^0.1.16 @univerjs/sheets@^0.1.16 @univerjs/sheets-formula@^0.1.16 @univerjs/sheets-ui@^0.1.16 @univerjs/ui@^0.1.16 @univerjs/facade@^0.1.16
```

---

## ⚙️ Step 2: Enable Univer (30 seconds)

Create `.env.local`:
```bash
NEXT_PUBLIC_USE_UNIVER=true
```

**To switch back to Luckysheet**: Delete this file or set to `false`

---

## 🔧 Step 3: Uncomment Code (1 minute)

Open `src/components/UniversalSpreadsheet.tsx`

Find and uncomment these 3 sections:

### Section 1: Imports (~line 11)
```typescript
// Uncomment these:
import { Univer, IWorkbookData } from '@univerjs/core';
import { UniverSheetsPlugin } from '@univerjs/sheets';
// ... etc
```

### Section 2: Initialization (~line 80)
```typescript
// Uncomment the try block:
try {
  const univer = new Univer({...});
  // ... all initialization code
}
```

### Section 3: Get Data (~line 170)
```typescript
// Uncomment:
try {
  const workbook = univerAPIRef.current.getActiveWorkbook();
  // ... extraction code
}
```

---

## ✅ Step 4: Test (5 minutes)

```bash
npm run dev
```

Visit your app and test:
1. ✅ Load existing workspace
2. ✅ Edit cells
3. ✅ Add formula (e.g., `=SUM(A1:A10)`)
4. ✅ Save and reload
5. ✅ Verify formula persists

---

## 🔄 To Rollback (Instant)

**Option 1**: Feature Flag
```bash
# .env.local
NEXT_PUBLIC_USE_UNIVER=false
```

**Option 2**: Delete env file
```bash
rm .env.local
```

Restart server → Back to Luckysheet!

---

## 📁 What Was Created

| File | Purpose |
|------|---------|
| `UNIVER_MIGRATION_PLAN.md` | Full strategy (read first) |
| `LUCKYSHEET_API_AUDIT.md` | API mapping reference |
| `UNIVER_INSTALLATION_GUIDE.md` | Detailed testing guide |
| `UNIVER_MIGRATION_SUMMARY.md` | Complete overview |
| `UNIVER_QUICK_START.md` | This file |
| `src/config/spreadsheetConfig.ts` | Feature flag system |
| `src/utils/univerConverter.ts` | Data conversion |
| `src/components/UniversalSpreadsheet.tsx` | New component |
| `src/components/SpreadsheetWrapper.tsx` | Engine switcher |
| `package.univer.json` | Dependencies list |

---

## 🎯 How It Works

```
┌─────────────────────────────┐
│   Your Parent Component     │
│  (WorkModeWorkspace, etc)   │
└──────────────┬──────────────┘
               │
               ↓
┌─────────────────────────────┐
│   SpreadsheetWrapper        │ ← Decides which engine
└──────────────┬──────────────┘
               │
        ┌──────┴──────┐
        ↓             ↓
┌──────────────┐  ┌──────────────┐
│ Luckysheet   │  │   Univer     │
│  (Current)   │  │    (New)     │
└──────────────┘  └──────────────┘
```

**Feature Flag Controls**: Which component loads
**Zero Changes Needed**: In parent components
**Same Data Format**: Both read/write Supabase the same way

---

## 🛡️ Safety Features

✅ **No Data Changes**: Supabase schema unchanged
✅ **Instant Rollback**: Change env var, restart
✅ **Side by Side**: Can test both engines
✅ **Preserved State**: Your app works as-is
✅ **Type Safe**: Full TypeScript support

---

## 📊 Testing Checklist

Minimal viable test:
- [ ] App loads
- [ ] Data displays
- [ ] Can edit cells
- [ ] Formulas calculate
- [ ] Save works
- [ ] Reload preserves data

Full test checklist in `UNIVER_INSTALLATION_GUIDE.md`

---

## 🐛 Troubleshooting

### "Cannot find module @univerjs/core"
→ Run Step 1 (install packages)

### Univer shows placeholder UI
→ Run Step 3 (uncomment code)

### App shows Luckysheet, not Univer
→ Check `.env.local` has `NEXT_PUBLIC_USE_UNIVER=true`
→ Restart dev server

### Styles look broken
→ Check CSS imports at top of UniversalSpreadsheet.tsx

### Formulas not working
→ Ensure `UniverSheetsFormulaPlugin` is registered

---

## 📖 More Info

- **Full Details**: `UNIVER_MIGRATION_SUMMARY.md`
- **Complete Guide**: `UNIVER_INSTALLATION_GUIDE.md`
- **API Reference**: `LUCKYSHEET_API_AUDIT.md`
- **Strategy**: `UNIVER_MIGRATION_PLAN.md`

---

## 💬 Questions?

1. Check the documentation files listed above
2. Review Univer docs: https://docs.univer.ai
3. Check console for detailed logs (all prefixed with `[Univer]`)

---

## ✨ Why This Matters

- **Luckysheet is deprecated** (no more updates)
- **Univer is actively maintained** (regular updates)
- **Better performance** (modern architecture)
- **New features** (collaboration, advanced formulas, etc)
- **Future-proof** (long-term support)

---

**Current Status**: 🟢 Ready to install and test

**Risk Level**: 🟢 Very Low (instant rollback available)

**Time to Test**: ⏱️ ~10 minutes

**Impact on Production**: 🛡️ Zero (until you enable it)

---

Good luck! 🚀

