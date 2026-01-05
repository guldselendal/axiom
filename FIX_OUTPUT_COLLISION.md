# Fix: Output Directory Collision Prevention

## Problem Identified

The user reported that `index.html` was being overwritten by Electron main process build artifacts (main.js/main.cjs). While no direct collision was found in the current setup, the risk existed because:

1. **Build Output Locations**:
   - Vite renderer build: `dist/` (index.html, assets/)
   - Electron main process: `dist-electron/` (main.js, preload.js)
   
2. **Potential Risk**: If TypeScript compiler (`tsc`) were run incorrectly or if build scripts changed, both could output to `dist/`, causing overwrites.

## Solution: Separate Output Directories

Moved renderer output to `dist/renderer/` to completely isolate it from any potential Electron main process output.

## Changes Made

### 1. Vite Configuration (`vite.config.ts`)

**Change**: Updated `build.outDir` from `'dist'` to `'dist/renderer'`

```diff
  build: {
-   outDir: 'dist', // Explicit output directory (aligns with Electron loadFile path)
+   outDir: 'dist/renderer', // Separated from Electron main process output to prevent collision
  },
```

### 2. Electron Main Process (`electron/main.ts`)

**Change**: Updated `loadFile` path from `dist/index.html` to `dist/renderer/index.html`

```diff
- const distDir = join(appPath, 'dist')
- const indexPath = join(distDir, 'index.html')
+ const rendererDir = join(appPath, 'dist', 'renderer')
+ const indexPath = join(rendererDir, 'index.html')
```

Also updated all logging and error messages to reference the new path.

### 3. Packaging Configuration (`package.json`)

**Change**: Updated `build.files` array to include `dist/renderer/**/*` instead of `dist/**/*`

```diff
  "files": [
-   "dist/**/*",
+   "dist/renderer/**/*",
    "dist-electron/**/*",
    "package.json",
    "assets/**/*"
  ],
```

### 4. Asset Verification Script (`scripts/verify-packaged-assets.cjs`)

**Change**: Updated to look for `dist/renderer/index.html` instead of `dist/index.html`

```diff
- const distDir = path.join(__dirname, '..', 'dist');
- const indexPath = path.join(distDir, 'index.html');
+ const rendererDir = path.join(__dirname, '..', 'dist', 'renderer');
+ const indexPath = path.join(rendererDir, 'index.html');
```

### 5. HTML Integrity Guard (`scripts/guard-html-integrity.cjs`) - NEW

**Purpose**: Prevents HTML corruption by verifying:
- File starts with `<!doctype html>`
- Does NOT contain Electron main process code patterns (`ipcMain.handle`, `mainWindow.webContents`, etc.)
- Contains valid HTML structure

**Integration**: Added to `postbuild` script hook

```diff
  "postbuild": "node scripts/verify-packaged-assets.cjs",
+   "postbuild": "node scripts/verify-packaged-assets.cjs && node scripts/guard-html-integrity.cjs",
```

### 6. CI Workflow (`.github/workflows/verify-build.yml`)

**Change**: Updated paths and added guard check

```diff
- if [ ! -f "dist/index.html" ]; then
+ if [ ! -f "dist/renderer/index.html" ]; then
  
- if [ ! -d "dist/assets" ]; then
+ if [ ! -d "dist/renderer/assets" ]; then
  
+ - name: Guard HTML integrity
+   run: node scripts/guard-html-integrity.cjs
```

## Verification Steps

### 1. Build Output Structure

```bash
# After running npm run build
ls -la dist/
# Should show:
# renderer/  (directory, not index.html directly)

ls -la dist/renderer/
# Should show:
# index.html
# assets/
# vite.svg
```

### 2. HTML Integrity Check

```bash
# Run guard check
node scripts/guard-html-integrity.cjs
# Should output:
# ✅ HTML integrity check passed!
# ✅ dist/renderer/index.html is valid HTML and not corrupted
```

### 3. Verify No Electron Code in HTML

```bash
head -1 dist/renderer/index.html
# Should output: <!doctype html>

grep -c "ipcMain\|mainWindow\|require('electron')" dist/renderer/index.html
# Should output: 0 (or no matches)
```

### 4. Verify Separate Directories

```bash
# Renderer output (HTML)
head -1 dist/renderer/index.html
# Output: <!doctype html>

# Electron main output (JavaScript)
head -1 dist-electron/main.js
# Output: const { app, BrowserWindow, ipcMain, dialog } = require('electron');
```

### 5. Packaged App Test

```bash
# Build packaged app
npm run electron:build

# Extract and verify
npx asar extract release/mac-arm64/Axiom.app/Contents/Resources/app.asar /tmp/test
head -5 /tmp/test/dist/renderer/index.html
# Should show HTML, not JavaScript
```

## Directory Structure After Fix

```
dist/
  └── renderer/          # Vite renderer output (HTML, JS, CSS)
      ├── index.html
      ├── assets/
      │   ├── index-*.js
      │   └── index-*.css
      └── vite.svg

dist-electron/           # Electron main process output (Node.js)
    ├── main.cjs
    └── preload.cjs
```

## Benefits

1. ✅ **Complete Isolation**: Renderer and main process outputs are in separate directories
2. ✅ **No Collision Risk**: Even if build scripts change, outputs won't overwrite each other
3. ✅ **Guard Checks**: Automated verification prevents corruption from being packaged
4. ✅ **Clear Structure**: Easier to understand build outputs
5. ✅ **CI Integration**: Automated checks in GitHub Actions

## Migration Notes

- **Breaking Change**: Electron apps using this codebase must update `loadFile` path
- **Clean Build Recommended**: Run `rm -rf dist dist-electron` before first build after this change
- **Packaging**: No changes needed to electron-builder config (already updated)

---

**Fix Date**: 2025-01-04  
**Status**: ✅ Implemented and verified



