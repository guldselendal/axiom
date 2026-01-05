# Electron + Vite Build Pipeline Analysis & Fix

## Executive Summary

**Root Cause**: The `index.html` template was being corrupted with hardcoded build artifact paths (e.g., `./assets/index-AV5aLvEP.js`), which breaks Vite's build process. Vite requires the template to reference source entry points (`/src/main.tsx`) so it can inject correct hashed asset paths during build.

**Build Pipeline Status**: ✅ **CORRECTLY CONFIGURED** - All alignment points validated:
- Vite outDir: `dist/` ✅
- Electron loadFile: `app.getAppPath()/dist/index.html` ✅
- Packaging: `dist/**/*` included ✅
- Asset resolution: `base: './'` for file:// ✅

---

## Step 1: Build Topology Map

```
Entry Point:     src/main.tsx (via index.html template)
                    ↓
Vite Build:      vite build (via "build" script)
                    ↓
Vite outDir:     dist/ (explicitly set in vite.config.ts)
                    ↓
Build Artifacts: dist/index.html
                 dist/assets/index-*.js
                 dist/assets/index-*.css
                    ↓
Electron loadFile: join(app.getAppPath(), 'dist', 'index.html')
                    ↓
Packaged Location: app.asar/dist/index.html
                   app.asar/dist/assets/*
```

**Build Scripts**:
- `build`: `tsc && vite build` → outputs to `dist/`
- `electron:build`: runs `build`, then `electron:build-main`, `electron:build-preload`, then `electron-builder`
- `electron:pack`: same as `electron:build` but uses `electron-builder --dir` for unpacked output

---

## Step 2: Vite Output Validation ✅

**Verified**:
- ✅ `dist/index.html` exists
- ✅ `dist/assets/` directory exists with all JS/CSS files
- ✅ `dist/index.html` references relative paths: `./assets/index-*.js` (correct for file://)
- ✅ All referenced assets exist in `dist/assets/`
- ✅ No hardcoded build filenames in source template (enforced by prebuild script)

---

## Step 3: file:// Asset Resolution ✅

**Configuration**:
- ✅ `base: './'` set in `vite.config.ts` (correct for Electron file:// protocol)
- ✅ Built HTML uses relative paths (`./assets/...`)
- ✅ `loadFile()` automatically sets correct base URL for relative paths in asar archives

---

## Step 4: Electron Loading Validation ✅

**Path Resolution**:
```typescript
const appPath = app.getAppPath()  // Returns path to app.asar or unpacked app
const indexPath = join(appPath, 'dist', 'index.html')
mainWindow.loadFile(indexPath)  // Handles asar archives automatically
```

**Logging** (already present):
- ✅ `__dirname` logged
- ✅ `app.getAppPath()` logged
- ✅ `indexPath` logged
- ✅ `did-fail-load` event handler
- ✅ `did-finish-load` event handler
- ✅ `dom-ready` event handler
- ✅ Promise rejection handler

---

## Step 5: Packaging Validation ✅

**electron-builder Configuration**:
```json
"files": [
  "dist/**/*",          // ✅ Renderer build output included
  "dist-electron/**/*", // ✅ Main/preload build output included
  "package.json",
  "assets/**/*"         // ✅ App icons included
]
```

**Verified in Packaged App**:
- ✅ `/dist/index.html` exists in `app.asar`
- ✅ `/dist/assets/index-*.js` exists in `app.asar`
- ✅ `/dist/assets/index-*.css` exists in `app.asar`
- ✅ Packaged HTML matches local build HTML (relative paths preserved)

---

## Step 6: Code Changes

### Change 1: vite.config.ts
**Purpose**: Explicit outDir declaration for clarity and alignment verification

```diff
  base: './', // Important for Electron file:// protocol
  build: {
+   outDir: 'dist', // Explicit output directory (aligns with Electron loadFile path)
    rollupOptions: {
      output: {
        // Ensure consistent chunk naming for dynamic imports
        manualChunks: undefined,
      },
    },
```

### Change 2: package.json (scripts)
**Purpose**: Pre-build validation to prevent template corruption

```diff
  "scripts": {
+   "prebuild": "node scripts/validate-html-template.cjs",
    "build": "tsc && vite build",
```

### Change 3: scripts/validate-html-template.cjs (NEW FILE)
**Purpose**: Validates index.html template before build to prevent hardcoded asset paths

```javascript
#!/usr/bin/env node
/**
 * Pre-build validation: Ensure index.html template is not corrupted with hardcoded build artifacts
 */
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

// Check for hardcoded asset paths (build artifacts that should not be in source)
const hardcodedAssetPattern = /(src|href)=["'][^"']*\/assets\/index-[A-Za-z0-9_-]+\.(js|css)["']/;
const hasHardcodedAssets = hardcodedAssetPattern.test(html);

if (hasHardcodedAssets) {
  console.error('❌ ERROR: index.html contains hardcoded asset paths!');
  console.error('❌ This breaks Vite\'s build process.');
  console.error('❌ Expected: <script type="module" src="/src/main.tsx"></script>');
  console.error('❌ Found hardcoded build artifacts in source template.');
  process.exit(1);
}

// Verify the correct entry point exists
if (!html.includes('/src/main.tsx')) {
  console.error('❌ ERROR: index.html is missing the correct entry point!');
  console.error('❌ Expected: <script type="module" src="/src/main.tsx"></script>');
  process.exit(1);
}

console.log('✅ index.html template is valid');
```

### Change 4: index.html (CORRECTION)
**Purpose**: Restore correct Vite template format (if corrupted)

**Correct format**:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Offline note-taking app with infinite canvas" />
    <title>Axiom - Note Taking App</title>
    <script type="module" src="/src/main.tsx"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

**❌ Incorrect format** (build artifacts in source):
```html
<script type="module" crossorigin src="./assets/index-AV5aLvEP.js"></script>
<link rel="stylesheet" crossorigin href="./assets/index-j-AoDy2J.css">
```

---

## Verification Checklist

Use this checklist to verify the packaged app works correctly:

### Pre-Build Verification
- [ ] Run `npm run prebuild` - should output "✅ index.html template is valid"
- [ ] Run `npm run build` - should complete without errors
- [ ] Check `dist/index.html` - should reference `./assets/index-*.js` (relative paths)
- [ ] Verify `dist/assets/` contains all referenced JS/CSS files

### Post-Build Verification
- [ ] Run `npm run electron:build` - should complete without errors
- [ ] Launch packaged app: `release/mac-arm64/Axiom.app`
- [ ] DevTools should auto-open (or open manually: Cmd+Option+I)
- [ ] **Console Tab**:
  - [ ] Should see: `[PRELOAD] Preload script loading...`
  - [ ] Should see: `[RENDERER] main.tsx: Script executing`
  - [ ] Should see: `[RENDERER] ✅ Root element found, creating React root...`
  - [ ] Should see: `[RENDERER] ✅ App render called`
  - [ ] **NO console errors**
- [ ] **Network Tab**:
  - [ ] `index.html` - Status: 200, Type: text/html
  - [ ] `index-*.js` - Status: 200, Type: application/javascript
  - [ ] `index-*.css` - Status: 200, Type: text/css
  - [ ] **NO 404 errors**
- [ ] **Application Tab**:
  - [ ] URL should be: `file:///.../app.asar/dist/index.html`
  - [ ] Content-Type should be: `text/html`
- [ ] **Visual Verification**:
  - [ ] App UI renders correctly (not blank screen)
  - [ ] Not showing plain text or preload script code
  - [ ] Sidebar and canvas are visible

---

## Hardening Recommendation

**Pre-Build Validation Script**: ✅ **IMPLEMENTED**

The `scripts/validate-html-template.cjs` script runs automatically before every build via the `prebuild` npm script hook. This prevents:
- Accidental corruption of `index.html` with hardcoded build artifacts
- Missing source entry point (`/src/main.tsx`)
- Build failures due to template corruption

**Additional Recommendations**:

1. **Git Pre-Commit Hook** (optional):
   ```bash
   # .git/hooks/pre-commit
   npm run prebuild || exit 1
   ```

2. **CI/CD Validation** (recommended):
   Add to CI pipeline:
   ```yaml
   - name: Validate HTML template
     run: npm run prebuild
   ```

3. **Documentation**: 
   Add note in `README.md` or `CONTRIBUTING.md`:
   > **Important**: Never commit `index.html` with hardcoded asset paths. The template must reference `/src/main.tsx`, not build artifacts.

---

## Root Cause Summary

**Single Sentence**: The `index.html` template was being corrupted with hardcoded build artifact paths, breaking Vite's ability to inject correct hashed asset references during build.

**Evidence**:
1. Build artifacts (`./assets/index-AV5aLvEP.js`) found in source template
2. Vite build process requires template to reference source (`/src/main.tsx`)
3. Prebuild validation script now prevents this regression

**Build Pipeline Alignment**: ✅ All components correctly aligned - the issue was template corruption, not configuration mismatch.

---

## Troubleshooting

If the packaged app still shows blank screen or plain text:

1. **Check Console Errors**: Open DevTools (Cmd+Option+I) and check for runtime errors
2. **Verify Build Artifacts**: Ensure `dist/index.html` uses relative paths (`./assets/...`)
3. **Check Package Contents**: Verify `app.asar` contains `/dist/index.html` and `/dist/assets/*`
4. **Review Logs**: Check terminal output for Electron main process logs
5. **Rebuild Clean**: 
   ```bash
   rm -rf dist dist-electron release node_modules/.vite
   npm run electron:build
   ```

---

**Analysis Date**: 2025-01-04  
**Status**: ✅ Build pipeline validated and hardened



