# ⚡ Simple Univer Toggle - User Guide

## ✅ What's Done

I've added a **simple toggle button** to switch between Luckysheet and Univer spreadsheet engines.

---

## 🎯 Where to Find the Toggle

### Work Mode
**Location**: Top navbar (right side, before workspace selector)
- Look for the ⚡ lightning bolt icon
- Says "Luckysheet" or "Univer"
- Click to switch engines

### Learn Mode  
**Location**: Chat sidebar header (top right, before cycle arrow)
- Look for the ⚡ lightning bolt icon
- Click to switch engines

---

## 🚀 How It Works

### Current State (Default)
- **Using**: Luckysheet ✅
- **Toggle shows**: Gray ⚡ with "Luckysheet" text
- Everything works as before

### When You Click the Toggle
1. Toggle turns **yellow** ⚡
2. Page reloads automatically
3. Now using **Univer** engine

### If Univer Packages Not Installed
You'll see a helpful message with:
- Install command to copy
- Button to switch back to Luckysheet
- No errors, graceful handling

---

## 📦 To Enable Univer

**Step 1**: Install packages (one-time)
```bash
cd edi-frontend

npm install @univerjs/core @univerjs/sheets @univerjs/sheets-ui @univerjs/sheets-formula @univerjs/ui @univerjs/engine-render @univerjs/facade @univerjs/design @univerjs/docs @univerjs/docs-ui
```

**Step 2**: Restart dev server
```bash
npm run dev
```

**Step 3**: Click the toggle!
- Gray ⚡ → Yellow ⚡
- Page reloads
- Now using Univer

---

## 🔄 To Switch Back

Just click the toggle again:
- Yellow ⚡ → Gray ⚡
- Page reloads
- Back to Luckysheet

**Or** if you're on the "packages required" screen:
- Click "Switch back to Luckysheet" button

---

## 💾 How Settings Are Saved

Uses **localStorage** (browser storage):
- Setting persists across page reloads
- Per-browser (not synced across devices)
- No database/server changes needed

---

## 🎨 Visual Indicators

| State | Icon Color | Text | Tooltip |
|-------|-----------|------|---------|
| Luckysheet | Gray ⚡ | "Luckysheet" | "Switch to Univer (Beta)" |
| Univer | Yellow ⚡ | "Univer" | "Switch to Luckysheet" |

---

## 🧪 Testing

1. **Test Toggle in Work Mode**
   - Go to any workspace
   - Look at top navbar
   - Click ⚡ toggle
   - Page reloads
   - Check console for engine messages

2. **Test Toggle in Learn Mode**
   - Go to learn mode
   - Open chat sidebar
   - Click ⚡ toggle in header
   - Page reloads
   - Verify engine switched

---

## 🐛 Troubleshooting

### Toggle doesn't appear
- Check you're on latest code
- Hard refresh (Ctrl+Shift+R)
- Check console for errors

### Toggle appears but doesn't work
- Check browser console
- Verify localStorage is enabled
- Try incognito mode

### Packages not found error
- Install packages (see "To Enable Univer" above)
- Restart dev server
- Try toggle again

### Want to reset to default
```javascript
// In browser console:
localStorage.removeItem('USE_UNIVER');
location.reload();
```

---

## 🎉 Benefits

### For You
- ✅ **No code changes** - just click a button
- ✅ **No config files** - no .env to manage
- ✅ **Instant switch** - one click + reload
- ✅ **Visible state** - color shows current engine
- ✅ **Graceful errors** - helpful messages if packages missing

### For Users (Future)
- Can switch engines if one has issues
- Can compare performance
- Can access beta features
- Can rollback instantly

---

## 📝 Summary

**What**: Toggle button to switch spreadsheet engines
**Where**: Work mode navbar & Learn mode sidebar
**How**: Click ⚡ → Page reloads → Engine switched
**Why**: Easy testing, no code/config changes needed

---

## 🚀 Next Steps

1. **Test the toggle** - Click it and see what happens
2. **Install Univer** - If you want to try it (optional)
3. **Compare engines** - Test same data in both
4. **Give feedback** - Which one works better?

---

**Status**: ✅ Ready to use (Luckysheet working, Univer optional)

**Time to try**: < 10 seconds (just click the toggle!)

**Risk**: 🟢 None (instant rollback with another click)

