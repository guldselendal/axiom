# Canvas Implementation Documentation

## Overview

The canvas is an infinite, pannable, and zoomable workspace where notes can be placed, moved, and edited. Notes are represented as cards that can be dragged around the canvas, and their positions are saved relative to the canvas coordinate system.

## Architecture

### Components

- **Canvas.tsx**: Main canvas component that manages the infinite workspace
- **NoteCard.tsx**: Individual note card component that can be dragged and edited
- **HoverEditor.tsx**: Floating editor overlay for editing note content

### Coordinate System

The canvas uses a two-level coordinate system:

1. **Canvas Coordinates**: The internal coordinate system where notes are positioned
   - Origin (0, 0) is at the top-left of the canvas
   - Notes are positioned using `x` and `y` values in canvas space
   - These coordinates are saved to `canvas-positions.json` in the vault folder

2. **Screen Coordinates**: The viewport coordinates that account for pan and zoom
   - Screen position = `(canvasX * zoom) + pan.x`
   - Screen Y position = `(canvasY * zoom) + pan.y + canvasTop`
   - `canvasTop` accounts for the title bar (48px)

### State Management

#### Canvas State

```typescript
interface CanvasState {
  notes: Note[]                    // Array of notes on the canvas
  pan: { x: number, y: number }   // Pan offset in pixels
  zoom: number                      // Zoom level (0.1 to 2.0)
  isPanning: boolean               // Whether user is currently panning
  editingNotes: Array<{            // Notes currently open in hover editors
    note: Note
    position: { x: number, y: number }
    filePath?: string
  }>
}
```

#### Note Interface

```typescript
interface Note {
  id: string           // Unique identifier
  x: number            // Canvas X position
  y: number            // Canvas Y position
  width: number        // Note width in pixels
  height: number       // Note height in pixels
  content: string      // Markdown content (title\nbody)
  color?: string       // Background color hex code
  filePath?: string    // Path to markdown file in vault
}
```

## Features

### 1. Panning

**How it works:**
- Panning is enabled with:
  - Middle mouse button
  - Ctrl/Cmd + Left click
  - Hand tool active + click on canvas background

**Implementation:**
```typescript
const handleMouseDown = (e: React.MouseEvent) => {
  const canPan = e.button === 1 || 
                 (e.button === 0 && (e.ctrlKey || e.metaKey)) ||
                 (e.button === 0 && activeTool === 'hand' && e.target === e.currentTarget)
  
  if (canPan) {
    setIsPanning(true)
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }
}
```

**Coordinate Transformation:**
- Pan offset is stored in screen space
- Applied via CSS transform: `translate(${pan.x}px, ${pan.y}px)`

### 2. Zooming

**How it works:**
- Zoom with Ctrl/Cmd + Mouse Wheel
- Zoom range: 0.1x to 2.0x
- Zoom is centered on viewport

**Implementation:**
```typescript
const handleWheel = (e: React.WheelEvent) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(2, zoom * delta))
    onZoomChange(newZoom)
  }
}
```

**Coordinate Transformation:**
- Applied via CSS transform: `scale(${zoom})`
- Combined with pan: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`

### 3. Note Dragging

**How it works:**
- Click and drag a note card to move it
- Position updates in real-time during drag
- Position is saved when drag ends

**Coordinate Conversion:**
```typescript
// Convert screen coordinates to canvas coordinates
const canvasX = (e.clientX - pan.x) / zoom
const canvasY = (e.clientY - canvasTop - pan.y) / zoom

// Apply drag offset
const newX = canvasX - dragStartRef.current.x
const newY = canvasY - dragStartRef.current.y
```

**Implementation Details:**
- Uses global mouse move handler for smooth dragging
- Tracks drag start offset to maintain relative position
- Accounts for canvas pan and zoom in calculations

### 4. Drag and Drop from Sidebar

**How it works:**
- Drag a file from the sidebar
- Drop it anywhere on the canvas
- Note appears at drop location with animation

**Implementation:**
```typescript
const handleDrop = async (e: React.DragEvent) => {
  const filePath = e.dataTransfer.getData('text/plain')
  const screenX = e.clientX
  const screenY = e.clientY
  
  // Convert to canvas coordinates
  const canvasX = (screenX - pan.x) / zoom
  const canvasY = (screenY - canvasTop - pan.y) / zoom
  
  // Create note at position
  const newNote = {
    id: `file-${filePath}-${Date.now()}`,
    x: canvasX - 90,  // Center on drop point
    y: canvasY - 60,
    // ... other properties
  }
}
```

**Animation:**
- Notes fade in and scale up when created
- CSS animation: `fadeInScale` (0.3s ease-out)
- Defined in `index.css`

### 5. Note Editing

**Hover Editor:**
- Double-click a note to open hover editor
- Editor appears as floating overlay
- Can be dragged by header
- Saves on click outside or Escape key

**Position Calculation:**
- Editor positioned relative to note or screen center
- Accounts for viewport bounds
- Uses fixed positioning for overlay

### 6. File System Integration

**Note Storage:**
- Note content saved as markdown files in vault folder
- Note positions saved in `canvas-positions.json` in vault folder
- Each note linked to its file via `filePath` property

**Saving:**
- Positions saved automatically when notes change (debounced)
- Content saved when edited in hover editor
- File deletion removes note from canvas

## Coordinate Transformation Functions

### Screen to Canvas

```typescript
function screenToCanvas(screenX: number, screenY: number, pan: {x: number, y: number}, zoom: number, canvasTop: number) {
  const canvasX = (screenX - pan.x) / zoom
  const canvasY = (screenY - canvasTop - pan.y) / zoom
  return { x: canvasX, y: canvasY }
}
```

### Canvas to Screen

```typescript
function canvasToScreen(canvasX: number, canvasY: number, pan: {x: number, y: number}, zoom: number, canvasTop: number) {
  const screenX = (canvasX * zoom) + pan.x
  const screenY = (canvasY * zoom) + pan.y + canvasTop
  return { x: screenX, y: screenY }
}
```

## Persistence

### Position Storage

- Saved to: `{vaultPath}/canvas-positions.json`
- Format:
```json
{
  "notes": [
    {
      "id": "file-note.md-1234567890",
      "x": 100,
      "y": 200,
      "width": 180,
      "height": 120,
      "color": "#ffffff",
      "filePath": "note.md"
    }
  ],
  "pan": { "x": 0, "y": 0 },
  "zoom": 1.0
}
```

### Content Storage

- Each note's content saved to its markdown file
- File path stored in note's `filePath` property
- Format: First line is title, rest is body

## Performance Considerations

1. **Debounced Saving**: Note positions saved with 500ms debounce
2. **Global Event Handlers**: Mouse move/up handlers attached to window for smooth dragging
3. **CSS Transforms**: Uses hardware-accelerated transforms for pan/zoom
4. **Animation**: CSS animations for note appearance (GPU accelerated)

## Future Enhancements

- [ ] Note linking/connections
- [ ] Multi-select and group operations
- [ ] Undo/redo functionality
- [ ] Canvas minimap
- [ ] Grid snapping
- [ ] Note templates
- [ ] Export canvas as image


