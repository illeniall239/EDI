# Fix Univer Duplicate Dependencies

## Problem
You're seeing console errors like:
- `[redi]: You are loading scripts of redi more than once!`
- `Identifier "rpc.remote-sync.service" already exists`
- Multiple duplicate dependency warnings (35+ errors)

## Root Cause
Univer packages have **nested dependencies** with different versions, causing:
- Multiple versions of `@wendellhu/redi` loaded
- Multiple versions of `@univerjs/core` and other core packages
- Dependency hell from package version mismatches

---

## ✅ Solution (Already Applied)

I've added **package overrides** to `package.json` to force single versions of problematic packages.

---

## 🔧 Steps to Fix

### Step 1: Clean Install
```bash
cd edi-frontend

# Remove node_modules and lock file
rm -rf node_modules
rm package-lock.json  # or rm yarn.lock or rm pnpm-lock.yaml

# Clean npm cache (optional but recommended)
npm cache clean --force
```

### Step 2: Reinstall
```bash
npm install
```

This will apply the `overrides` from package.json and resolve to single versions.

### Step 3: Restart Dev Server
```bash
npm run dev
```

### Step 4: Test Toggle
- Click the ⚡ toggle to switch to Univer
- Check console - errors should be gone

---

## 📋 What Was Fixed

### Added to `package.json`:
```json
"overrides": {
  "@wendellhu/redi": "0.18.3",
  "@univerjs/core": "0.9.4",
  "@univerjs/engine-formula": "0.9.4",
  "@univerjs/engine-render": "0.9.4",
  "@univerjs/sheets": "0.9.4"
}
```

This forces all packages to use the same versions, preventing duplicates.

---

## 🧪 Verify It's Fixed

### Before Fix:
```
Console: 35+ errors about duplicate redi, identifiers, etc.
```

### After Fix:
```
Console: Clean, or minimal warnings
Univer loads successfully
```

---

## 🚨 If Still Getting Errors

### Option 1: Check Package Manager
If using **yarn** or **pnpm**, use `resolutions` instead:

**For Yarn** (`package.json`):
```json
"resolutions": {
  "@wendellhu/redi": "0.18.3",
  "@univerjs/core": "0.9.4",
  "@univerjs/engine-formula": "0.9.4",
  "@univerjs/engine-render": "0.9.4",
  "@univerjs/sheets": "0.9.4"
}
```

**For pnpm** (`package.json`):
```json
"pnpm": {
  "overrides": {
    "@wendellhu/redi": "0.18.3",
    "@univerjs/core": "0.9.4",
    "@univerjs/engine-formula": "0.9.4",
    "@univerjs/engine-render": "0.9.4",
    "@univerjs/sheets": "0.9.4"
  }
}
```

### Option 2: Update All Univer Packages to Same Version
```bash
npm install @univerjs/core@0.9.4 @univerjs/sheets@0.9.4 @univerjs/sheets-ui@0.9.4 @univerjs/sheets-formula@0.9.4 @univerjs/engine-render@0.9.4 @univerjs/engine-formula@0.9.4 @univerjs/ui@0.9.4 @univerjs/design@0.9.4
```

### Option 3: Use npm-force-resolutions
```bash
npm install --save-dev npm-force-resolutions

# Add to package.json scripts:
"scripts": {
  "preinstall": "npx npm-force-resolutions"
}

npm install
```

---

## 🔍 Debug Commands

### Check installed versions:
```bash
npm list @wendellhu/redi
npm list @univerjs/core
```

Should show **single version**, not multiple.

### Check for duplicates:
```bash
npm ls | grep redi
npm ls | grep @univerjs/core
```

---

## 💡 Why This Happens

Univer's dependency tree looks like this:

```
your-app
├── @univerjs/sheets@0.9.4
│   └── @univerjs/core@0.9.4
│       └── @wendellhu/redi@0.18.3
└── @univerjs/sheets-ui@0.9.4
    ├── @univerjs/core@0.9.3  ← Different version!
    │   └── @wendellhu/redi@0.18.2  ← Different version!
    └── @univerjs/engine-formula@0.9.3
        └── @univerjs/core@0.9.2  ← Another version!
```

**Result**: 3+ copies of `redi` loaded → conflicts

**Solution**: Force all to use same version with `overrides`

---

## ✅ Success Criteria

After applying fix:
- ✅ No `[redi]` warnings in console
- ✅ No "Identifier already exists" errors
- ✅ Univer loads and displays spreadsheet
- ✅ Can edit cells and formulas
- ✅ Toggle works smoothly

---

## 🔄 Quick Fix Script

```bash
#!/bin/bash
# fix-univer-deps.sh

cd edi-frontend

echo "🧹 Cleaning..."
rm -rf node_modules
rm -f package-lock.json

echo "📦 Reinstalling with overrides..."
npm install

echo "✅ Done! Restart your dev server:"
echo "npm run dev"
```

---

## 📚 References

- [Univer Docs - Installation](https://docs.univer.ai/guides/quickstart)
- [npm overrides](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#overrides)
- [Redi Docs - FAQ](https://redi.wendell.fun/en-US/docs/faq#import-scripts-of-redi-more-than-once)

---

**Status**: Fix applied to `package.json`, needs `npm install` to take effect

**Next**: Run the steps above and test!

