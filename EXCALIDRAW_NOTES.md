# Excalidraw Notes Implementation

## Overview
This document describes the implementation of Excalidraw note support alongside existing Markdown notes in the Axiom application.

## Data Model

### Note Types
The application now supports two note types:
- **Markdown Notes** (`type: 'markdown'`): Traditional markdown text files (`.md`)
- **Excalidraw Notes** (`type: 'excalidraw'`): Drawing files (`.excalidraw`)

### Type Definitions
Located in `src/types/notes.ts`:
- `BaseNote`: Common fields (id, worldX, worldY, width, height, title, color, filePath, canvasId)
- `MarkdownNote`: Extends BaseNote with `content: string`
- `ExcalidrawNote`: Extends BaseNote with `excalidrawData: ExcalidrawData`
- `Note`: Union type `MarkdownNote | ExcalidrawNote`

### Excalidraw Data Structure
```typescript
interface ExcalidrawData {
  type: 'excalidraw'
  version: number
  source: string
  elements: ExcalidrawElement[]
  appState: ExcalidrawAppState
  files?: Record<string, ExcalidrawBinaryFile> // Embedded images/files
}
```

## Storage & Persistence

### File System
- **Markdown files**: Stored as `.md` files with plain text content
- **Excalidraw files**: Stored as `.excalidraw` files with JSON content

### File Operations
All file operations in `src/utils/fileSystem.ts` and `electron/main.ts` support both file types:
- `createNoteFile(fileName, noteType)` - Creates either `.md` or `.excalidraw` file
- `loadNoteFromFile(filePath)` - Loads content (text for markdown, JSON string for excalidraw)
- `saveNoteToFile(filePath, content)` - Saves content (text or JSON string)
- `renameNoteFile(oldFilePath, newFileName)` - Preserves file extension type
- `listNoteFiles()` - Returns both `.md` and `.excalidraw` files

### Autosave
- **Debounce**: 800ms for Excalidraw changes
- **Flush on unmount**: Pending saves are flushed when editor closes or note switches
- **No data loss**: Last changes are saved before switching notes

## UI Components

### ExcalidrawNoteEditor
Located in `src/components/ExcalidrawNoteEditor.tsx`:
- Full-featured Excalidraw editor using `@excalidraw/excalidraw`
- Draggable window (similar to HoverEditor)
- Export functionality:
  - Export to PNG
  - Export to `.excalidraw` JSON file
- Autosave on changes

### MegaSurface
Updated to handle both note types:
- Detects note type when loading from files
- Renders appropriate editor (HoverEditor for markdown, ExcalidrawNoteEditor for excalidraw)
- Note cards show different visuals:
  - Markdown: Text preview
  - Excalidraw: Drawing icon with "Excalidraw" label

### Sidebar
- Shows type indicators:
  - Markdown: Document icon (gray)
  - Excalidraw: Pencil icon (purple)
- File titles loaded correctly for both types
- Supports drag-and-drop for both types

## Note Creation

### Context Menu
Right-click on empty canvas shows:
- "New markdown note" - Creates markdown note
- "New Excalidraw note" - Creates excalidraw note

### File Creation
- Default: Markdown notes (backward compatibility)
- Excalidraw notes: Created with initial empty structure (elements: [], appState: {...})

## File Format

### Excalidraw Files
Stored as JSON with structure:
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [...],
  "appState": {...},
  "files": {...}
}
```

### Embedded Files
Images and other binary files embedded in Excalidraw drawings are stored in the `files` object within the JSON. Each file entry includes:
- `id`: Unique identifier
- `dataURL`: Base64-encoded data
- `mimeType`: MIME type (e.g., "image/png")
- `created`: Timestamp

## Limitations

1. **Link Parsing**: Only markdown notes support `[[link]]` syntax. Excalidraw notes cannot link to other notes via this mechanism.

2. **Backlinks**: Backlinks in HoverEditor only work for markdown notes (since links are parsed from markdown content).

3. **File Size**: Large Excalidraw drawings with many embedded images may result in large JSON files. Consider implementing file size limits or separate file storage for images in the future.

4. **Export**: PNG export requires the Excalidraw export API. If unavailable, only JSON export is supported.

## Migration

### Backward Compatibility
- Existing notes without a `type` field default to `markdown`
- Old note format (with `x`, `y` instead of `worldX`, `worldY`) is automatically converted
- Canvas cards always use markdown type (for display purposes)

### Loading Notes
When loading notes from storage:
1. Check `filePath` extension (`.excalidraw` vs `.md`)
2. If `.excalidraw`, parse JSON and create `ExcalidrawNote`
3. If `.md` or no extension, create `MarkdownNote`
4. If no `type` field exists, default to `markdown`

## Testing Checklist

- [x] Create Excalidraw note from context menu
- [x] Create markdown note from context menu
- [x] Open Excalidraw note (double-click)
- [x] Draw in Excalidraw editor
- [x] Autosave works (changes persist after closing)
- [x] Switch between notes (no data loss)
- [x] Export Excalidraw to PNG
- [x] Export Excalidraw to `.excalidraw` file
- [x] Sidebar shows type indicators
- [x] Drag Excalidraw file from sidebar to canvas
- [x] Rename Excalidraw note
- [x] Delete Excalidraw note
- [x] Markdown notes still work as before
- [x] Canvas cards work correctly
- [x] Note links work (markdown only)

## Future Enhancements

1. **Thumbnail Preview**: Show small preview of Excalidraw drawings in sidebar
2. **Separate File Storage**: Store embedded images separately to reduce JSON file size
3. **Link Support**: Allow linking to Excalidraw notes from markdown (or vice versa)
4. **Collaboration**: Real-time collaboration for Excalidraw notes (if needed)
5. **Version History**: Track changes to Excalidraw drawings over time

