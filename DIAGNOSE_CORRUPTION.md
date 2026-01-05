# Diagnosis: index.html Corruption with Electron Main Process Code

## User Report

The actual `index.html` file content contains Electron main process code (main.js/main.cjs) instead of HTML. The file literally contains:
```javascript
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
// ... rest of main.js code ...
```

## Current Investigation Status

### ✅ Verified Current Build (After Fix)

1. **Local Build Output**: `dist/renderer/index.html` is correct HTML
   - Starts with `<!doctype html>`
   - Contains valid HTML structure
   - Does NOT contain Electron code

2. **Packaged App (Latest Build)**: `/dist/renderer/index.html` in asar is correct HTML
   - Verified by extracting asar archive
   - Contains valid HTML, not JavaScript

3. **Build Process**: No collision detected
   - Vite outputs to `dist/renderer/`
   - TypeScript electron outputs to `dist-electron/`
   - No copy/move operations that could overwrite

### ❓ Questions to Answer

**CRITICAL**: Are you testing an OLD packaged app that was built BEFORE the `dist/renderer/` fix?

The fix we implemented moved the renderer output from `dist/` to `dist/renderer/`. If you're running an app packaged before this change, it would:
- Still be loading from `dist/index.html` (old path)
- OR have been packaged with corrupted files from before the fix

## Diagnostic Steps

### Step 1: Check Which Packaged App You're Running

```bash
# Check when the packaged app was built
ls -l release/mac-arm64/Axiom.app/Contents/Resources/app.asar

# Extract and check the index.html in the packaged app
npx asar extract release/mac-arm64/Axiom.app/Contents/Resources/app.asar /tmp/check
head -30 /tmp/check/dist/renderer/index.html
# OR (if old build):
head -30 /tmp/check/dist/index.html
```

### Step 2: Rebuild Fresh Package

```bash
# Clean everything
rm -rf dist dist-electron release

# Build fresh
npm run electron:build

# Verify the packaged index.html
npx asar extract release/mac-arm64/Axiom.app/Contents/Resources/app.asar /tmp/fresh
head -30 /tmp/fresh/dist/renderer/index.html
```

### Step 3: Check Electron Load Path

The Electron main process loads from `dist/renderer/index.html` (after our fix). But if you're running an OLD build, it might still be trying to load from `dist/index.html`.

Check the compiled main.cjs:
```bash
grep -A2 "rendererDir\|indexPath" dist-electron/main.cjs | head -10
```

Should show:
```javascript
const rendererDir = join(appPath, 'dist', 'renderer');
const indexPath = join(rendererDir, 'index.html');
```

If it shows `join(appPath, 'dist', 'index.html')`, you're running old code.

## Possible Root Causes (If Running Fresh Build)

If you've rebuilt after the fix and STILL see corruption, possible causes:

### 1. Electron Builder File Pattern Issue

Check if electron-builder is copying files incorrectly:
```json
"files": [
  "dist/renderer/**/*",  // Should be this
  "dist-electron/**/*",
  ...
]
```

### 2. Build Script Order Issue

The build runs:
1. `npm run build` → creates `dist/renderer/index.html`
2. `npm run electron:build-main` → creates `dist-electron/main.js`
3. `electron-builder` → packages everything

If something runs between step 1 and 3 that could corrupt the file...

### 3. Symlink or File System Issue

Check for symlinks:
```bash
ls -li dist/renderer/index.html dist-electron/main.js
```

They should have different inode numbers (not be the same file).

## Next Steps

1. **Rebuild the packaged app** using the current code
2. **Extract and inspect** the packaged `dist/renderer/index.html`
3. **Report back** what you find in the freshly packaged app

If the fresh build is still corrupted, we need to:
- Check electron-builder hooks
- Check for any file system issues
- Trace the exact build sequence that causes corruption



