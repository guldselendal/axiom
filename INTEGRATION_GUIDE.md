# Excalidraw & Local File Storage Integration Guide

## What's Been Set Up

### ✅ Electron Framework
- Main process for file system access
- Preload script for secure IPC communication
- Build configuration for desktop apps

### ✅ File System Utilities
- `src/utils/fileSystem.ts` - Unified API for file operations
- Works in both Electron (real files) and browser (localStorage fallback)
- Save/load markdown files
- File dialogs for open/save

### ✅ Excalidraw Component
- `src/components/ExcalidrawCanvas.tsx` - Ready-to-use Excalidraw wrapper
- Full-screen drawing canvas
- Save/close functionality

## Next Steps to Complete Integration

### 1. Install Dependencies
```bash
npm install
```

### 2. Add Excalidraw to a Note
You can add an "Add Drawing" button that opens ExcalidrawCanvas:

```tsx
import ExcalidrawCanvas from './components/ExcalidrawCanvas'

// In your component:
const [showExcalidraw, setShowExcalidraw] = useState(false)

{showExcalidraw && (
  <ExcalidrawCanvas
    onSave={(elements, appState) => {
      // Save drawing data to note
      const drawingData = { elements, appState }
      // Store in note content or separate field
    }}
    onClose={() => setShowExcalidraw(false)}
  />
)}
```

### 3. Add File Menu
Add File → Open/Save menu items using the fileSystem utilities:

```tsx
import { showOpenDialog, showSaveDialog, saveNoteToFile } from './utils/fileSystem'

// Save current canvas as markdown
const handleSave = async () => {
  const result = await showSaveDialog()
  if (!result.cancelled && result.filePath) {
    const markdown = convertNotesToMarkdown(notes)
    await saveNoteToFile(result.filePath, markdown)
  }
}
```

### 4. Run Electron App
```bash
npm run electron:dev
```

## File Storage Locations

- **macOS**: `~/Library/Application Support/axiom/axiom-data/`
- **Windows**: `%APPDATA%/axiom/axiom-data/`
- **Linux**: `~/.config/axiom/axiom-data/`

## Architecture Benefits

1. **Dual Mode**: Works as web app (localStorage) and desktop app (file system)
2. **Secure**: Context isolation prevents security issues
3. **Type-Safe**: Full TypeScript support
4. **Extensible**: Easy to add more file operations






