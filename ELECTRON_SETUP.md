# Electron Setup Guide for Mindz

## Overview

This setup enables:
- ✅ **Local file storage** - Save/load markdown files on your computer
- ✅ **Excalidraw integration** - Drawing canvas within notes
- ✅ **Desktop app** - Native app experience
- ✅ **Cross-platform** - Windows, macOS, Linux

## Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Run in development mode:**
```bash
npm run electron:dev
```

3. **Build for production:**
```bash
npm run electron:build
```

## Architecture

- **Main Process** (`electron/main.ts`) - Node.js, handles file system
- **Preload Script** (`electron/preload.ts`) - Bridge between main and renderer
- **Renderer Process** (React/Vite) - Your UI
- **IPC Communication** - Secure communication between processes

## File Storage

Files are stored in:
- **macOS**: `~/Library/Application Support/mindz/mindz-data/`
- **Windows**: `%APPDATA%/mindz/mindz-data/`
- **Linux**: `~/.config/mindz/mindz-data/`

## Excalidraw Integration

The `ExcalidrawCanvas` component is ready to use. You can:
- Embed drawings in notes
- Save drawings as part of note data
- Export drawings as images

## Next Steps

1. Add Excalidraw button to toolbar
2. Create note type system (text vs drawing)
3. Implement file save/load dialogs in UI
4. Add export functionality
