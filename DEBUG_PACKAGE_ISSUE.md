# Debug: index-Obm0uSa3.js Not Found

## Issue
The packaged app can't find `index-Obm0uSa3.js` even after rebuilding.

## File Exists Locally
✅ File exists: `dist/renderer/assets/index-Obm0uSa3.js`
✅ HTML references it: `dist/renderer/index.html` has `<script src="./assets/index-Obm0uSa3.js">`

## Possible Causes

1. **App Cache** - macOS or Electron cached the old app
2. **Wrong App Location** - Opening an old copy of the app
3. **File Not Packaged** - electron-builder didn't include the file

## Solutions

### Solution 1: Clear All Caches
```bash
# Quit the app completely (Cmd+Q)
# Then run:
rm -rf ~/Library/Caches/com.axiom.app
rm -rf ~/Library/Caches/Axiom*
rm -rf release/mac-arm64
npm run electron:pack
```

### Solution 2: Verify File is Packaged
```bash
# Check if file is in packaged app:
npx asar list release/mac-arm64/Axiom.app/Contents/Resources/app.asar | grep "index-Obm0uSa3.js"
```

### Solution 3: Clean Rebuild
```bash
rm -rf dist dist-electron release node_modules/.vite
npm run electron:pack
```

### Solution 4: Check You're Opening the Right App
After rebuild, make sure to:
1. Quit app completely (Cmd+Q, not just close window)
2. Open from: `release/mac-arm64/Axiom.app` (open from Finder, not Dock)
3. Don't use an old alias or shortcut

## Verification Commands
```bash
# Check local file exists:
ls -lh dist/renderer/assets/index-Obm0uSa3.js

# Check what HTML references:
grep "src=" dist/renderer/index.html

# Check if packaged:
npx asar list release/mac-arm64/Axiom.app/Contents/Resources/app.asar | grep "Obm0uSa3"

# Extract and check packaged HTML:
npx asar extract-file release/mac-arm64/Axiom.app/Contents/Resources/app.asar dist/renderer/index.html /tmp/packaged.html
cat /tmp/packaged.html | grep "src="
```



