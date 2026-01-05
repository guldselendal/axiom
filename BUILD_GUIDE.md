# Building Axiom for Production

This guide explains how to build the Axiom app for production use.

## Prerequisites

1. **Node.js** (v18 or higher recommended)
2. **All dependencies installed**: `npm install`
3. **Icon files** (optional but recommended):
   - `assets/icon.icns` for macOS
   - `assets/icon.ico` for Windows
   - `assets/icon.png` for Linux

## Build Commands

### Option 1: Full Production Build (Recommended)

Creates installers/distributables for your platform:

```bash
npm run electron:build
```

**What this does:**
- Builds the React/Vite frontend
- Compiles TypeScript for Electron main and preload scripts
- Creates a distributable package using electron-builder
- Generates installers (DMG for macOS, NSIS installer for Windows, AppImage for Linux)

**Output location:** `release/` folder

**For macOS:**
- Creates: `Axiom-0.1.0-arm64.dmg` (or `x64.dmg` for Intel Macs)
- Creates: `Axiom-0.1.0-arm64-mac.zip` (unpacked app)

**For Windows:**
- Creates: `Axiom Setup 0.1.0.exe` (installer)

**For Linux:**
- Creates: `Axiom-0.1.0.AppImage`

### Option 2: Pack Only (No Installer)

Creates the app bundle without installers (faster, for testing):

```bash
npm run electron:pack
```

**What this does:**
- Same as above but skips installer creation
- Just creates the app bundle in `release/` folder
- Useful for quick testing or manual distribution

## Building for Specific Platforms

### Build for macOS (on macOS)

```bash
npm run electron:build
```

The build will automatically detect your architecture (ARM64 or x64).

### Build for Windows (on Windows or macOS)

On Windows:
```bash
npm run electron:build
```

On macOS (cross-compile):
```bash
npm run electron:build -- --win
```

### Build for Linux (on Linux or macOS)

On Linux:
```bash
npm run electron:build
```

On macOS (cross-compile):
```bash
npm run electron:build -- --linux
```

## Build Options

You can specify additional options:

```bash
# Build only for macOS
npm run electron:build -- --mac

# Build only for Windows
npm run electron:build -- --win

# Build only for Linux
npm run electron:build -- --linux

# Build for all platforms
npm run electron:build -- --mac --win --linux

# Build without code signing (faster, but macOS will show warnings)
npm run electron:build -- --mac --config.mac.identity=null
```

## Code Signing (macOS)

For distribution outside the Mac App Store, you'll need to code sign:

1. **Get an Apple Developer Certificate**
2. **Update package.json** to include signing config:

```json
"mac": {
  "category": "public.app-category.productivity",
  "icon": "assets/icon.icns",
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
}
```

3. **Set environment variable:**
```bash
export CSC_IDENTITY_AUTO_DISCOVERY=true
npm run electron:build
```

## Distribution

### macOS

1. **DMG file**: Share the `.dmg` file - users can drag the app to Applications
2. **ZIP file**: Share the `.zip` file - users can extract and run

**Note:** First-time users may need to:
- Right-click the app → Open (to bypass Gatekeeper)
- System Preferences → Security → Allow the app

### Windows

Share the `.exe` installer - users can run it to install the app.

### Linux

Share the `.AppImage` file - users can:
1. Make it executable: `chmod +x Axiom-0.1.0.AppImage`
2. Run it: `./Axiom-0.1.0.AppImage`

## Troubleshooting

### Build fails with "icon not found"
- Make sure `assets/icon.icns` (or `.ico`/`.png`) exists
- Check the file paths in `package.json`

### Build is slow
- First build downloads Electron binaries (one-time)
- Subsequent builds are faster
- Use `electron:pack` for faster testing

### macOS: "App is damaged" error
- This is normal for unsigned apps
- Users need to: Right-click → Open → Allow
- Or sign the app with an Apple Developer certificate

### Windows: Antivirus warnings
- Common for unsigned executables
- Consider code signing with a Windows certificate

## File Locations After Build

- **macOS**: `release/mac-arm64/Axiom.app` (or `mac-x64/`)
- **Windows**: `release/win-unpacked/Axiom.exe`
- **Linux**: `release/linux-unpacked/axiom`

## Quick Start

For a quick production build:

```bash
# 1. Make sure dependencies are installed
npm install

# 2. Build the app
npm run electron:build

# 3. Find your app in the release/ folder
```

That's it! Your production-ready app will be in the `release/` folder.

