
import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react'
import NoteCard from './NoteCard'
import HoverEditor from './HoverEditor'
import WarningModal from './WarningModal'
import { saveNotes, savePan, loadPan, loadNotes } from '../utils/storage'
import { saveNoteToFile, loadNoteFromFile, deleteNoteFile, renameNoteFile, listNoteFiles, createNoteFile } from '../utils/fileSystem'
import { HoverEditorHandle } from './HoverEditor'
import { findLinks } from '../utils/linkParser'

export interface Note {
  id: string
  x: number
  y: number
  width: number
  height: number
  content: string
  title?: string
  color?: string
  filePath?: string
  centerX?: number  // Center X coordinate (computed)
  centerY?: number  // Center Y coordinate (computed)
}

// Helper function to ensure note has center coordinates
const ensureNoteCenters = (note: Note): Note => {
  return { 
    ...note, 
    centerX: note.x + note.width / 2, 
    centerY: note.y + note.height / 2 
  }
}

// Alternative: Helper to calculate top-left from center point (more explicit)
const centerToTopLeft = (centerX: number, centerY: number, width: number, height: number) => {
  return {
    x: centerX - width / 2,
    y: centerY - height / 2
  }
}

// Alternative: Helper to get center from screen coordinates (absolute calculation)
const screenToWorldCenter = (screenX: number, screenY: number, rect: DOMRect, pan: { x: number; y: number }, zoom: number) => {
  const worldCenterX = (screenX - rect.left - pan.x) / zoom
  const worldCenterY = (screenY - rect.top - pan.y) / zoom
  return { x: worldCenterX, y: worldCenterY }
}

// Helper to find intersection point of a line with a rectangle edge
const getLineRectIntersection = (
  lineStartX: number, lineStartY: number,
  lineEndX: number, lineEndY: number,
  rectX: number, rectY: number, rectWidth: number, rectHeight: number
): { x: number; y: number } | null => {
  // Calculate direction vector
  const dx = lineEndX - lineStartX
  const dy = lineEndY - lineStartY
  
  // Rectangle edges
  const left = rectX
  const right = rectX + rectWidth
  const top = rectY
  const bottom = rectY + rectHeight
  
  // Find intersection with each edge
  const intersections: Array<{ x: number; y: number; t: number }> = []
  
  // Left edge
  if (dx !== 0) {
    const t = (left - lineStartX) / dx
    if (t >= 0 && t <= 1) {
      const y = lineStartY + t * dy
      if (y >= top && y <= bottom) {
        intersections.push({ x: left, y, t })
      }
    }
  }
  
  // Right edge
  if (dx !== 0) {
    const t = (right - lineStartX) / dx
    if (t >= 0 && t <= 1) {
      const y = lineStartY + t * dy
      if (y >= top && y <= bottom) {
        intersections.push({ x: right, y, t })
      }
    }
  }
  
  // Top edge
  if (dy !== 0) {
    const t = (top - lineStartY) / dy
    if (t >= 0 && t <= 1) {
      const x = lineStartX + t * dx
      if (x >= left && x <= right) {
        intersections.push({ x, y: top, t })
      }
    }
  }
  
  // Bottom edge
  if (dy !== 0) {
    const t = (bottom - lineStartY) / dy
    if (t >= 0 && t <= 1) {
      const x = lineStartX + t * dx
      if (x >= left && x <= right) {
        intersections.push({ x, y: bottom, t })
      }
    }
  }
  
  // Return the closest intersection to lineStart (smallest t)
  if (intersections.length === 0) return null
  intersections.sort((a, b) => a.t - b.t)
  return { x: intersections[0].x, y: intersections[0].y }
}

interface CanvasProps {
  zoom: number
  onZoomChange: (zoom: number) => void
  activeTool: string
  canvasId: string
  onFileCreated?: (filePath: string) => void
}

export interface CanvasHandle {
  openFile: (filePath: string, content: string) => void
  addNoteAtPosition: (filePath: string, content: string, screenX: number, screenY: number) => void
  updateNoteTitle: (oldFilePath: string, newFilePath: string, newTitle: string) => void
  removeNoteByFilePath: (filePath: string) => void
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ zoom, onZoomChange, activeTool, canvasId, onFileCreated }, ref) => {
  // Start with empty canvas - notes only appear when explicitly opened
  const [notes, setNotes] = useState<Note[]>([])
  const [isNotesLoaded, setIsNotesLoaded] = useState(false)

  // Load pan position from file system on mount
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanLoaded, setIsPanLoaded] = useState(false)
  
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [editingNotes, setEditingNotes] = useState<Array<{ note: Note; position: { x: number; y: number }; filePath?: string }>>([])
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const editorRefs = useRef<Map<string, React.RefObject<any>>>(new Map())
  const editingNotesRef = useRef(editingNotes)
  
  // Keep ref in sync with state
  useEffect(() => {
    editingNotesRef.current = editingNotes
  }, [editingNotes])

  // Load canvas state when canvasId changes
  useEffect(() => {
    const loadState = async () => {
      setIsNotesLoaded(false)
      
      // Load notes for this canvas
      const savedNotes = await loadNotes(canvasId)
      if (savedNotes && savedNotes.length > 0) {
        // Refresh content from files for notes that have filePath
        const refreshedNotes = await Promise.all(
          savedNotes.map(async (note) => {
            let updatedNote = note
            if (note.filePath) {
              // Load fresh content from file
              const result = await loadNoteFromFile(note.filePath)
              if (result.success && result.content !== undefined) {
                // Extract title from first line of content
                const lines = result.content.split('\n')
                const title = (lines[0] || '').trim() || (note.filePath.endsWith('.md') ? note.filePath.slice(0, -3) : note.filePath)
                updatedNote = {
                  ...note,
                  content: result.content,
                  title: title
                }
              }
            }
            // Ensure center coordinates are calculated
            return ensureNoteCenters(updatedNote)
          })
        )
        setNotes(refreshedNotes)
      } else {
        setNotes([])
      }
      
      // Load pan for this canvas
      const savedPan = await loadPan(canvasId)
      if (savedPan) {
        setPan(savedPan)
      } else {
        setPan({ x: 0, y: 0 })
      }
      
      setIsNotesLoaded(true)
      setIsPanLoaded(true)
    }
    loadState()
  }, [canvasId])

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Change cursor to indicate drop is allowed
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const filePath = e.dataTransfer.getData('text/plain')
    if (!filePath) {
      return
    }

    if (!canvasRef.current) {
      return
    }
    
    // Use screen coordinates directly (like tempNote)
    const screenX = e.clientX 
    const screenY = e.clientY
    
    // Load file content
    const result = await loadNoteFromFile(filePath)
    if (result.success && result.content !== undefined) {
      const content = result.content || ''
      
      const rect = canvasRef.current.getBoundingClientRect()
      
      // Card dimensions
      const cardWidth = 198
      const cardHeight = 132
      
      // Alternative Approach 1: Calculate center first, then derive top-left (more explicit)
      const worldCenter = screenToWorldCenter(screenX, screenY, rect, pan, zoom)
      const cardTopLeft = centerToTopLeft(worldCenter.x, worldCenter.y, cardWidth, cardHeight)
      
      // Check if note already exists for this file using functional update to get current state
      setNotes(prevNotes => {
        const existingNote = prevNotes.find(n => n.filePath === filePath)
        if (existingNote) {
          // Update existing note position
          return prevNotes.map(n => 
            n.id === existingNote.id 
              ? ensureNoteCenters({ ...n, x: cardTopLeft.x, y: cardTopLeft.y })
              : n
          )
        } else {
          // Extract title from first line of content (trimmed) for consistency
          const lines = content.split('\n')
          const title = (lines[0] || '').trim() || (filePath.endsWith('.md') ? filePath.slice(0, -3) : filePath)
          
          // Create new note at drop position
          const newNote: Note = ensureNoteCenters({
            id: `file-${filePath}-${Date.now()}`,
            x: cardTopLeft.x,
            y: cardTopLeft.y,
            width: cardWidth,
            height: cardHeight,
            content: content,
            title: title, // Use first line of content as title
            filePath: filePath,
            color: '#ffffff'
          })
          
          // Add note with animation
          return [...prevNotes, newNote]
        }
      })
    }
  }, [pan, zoom])

  // Handle link click - open file in hover editor
  const handleLinkClick = useCallback(async (fileName: string) => {
    // Check if file exists
    const filesResult = await listNoteFiles()
    if (!filesResult.success || !filesResult.files) {
      setWarningMessage('Failed to check if file exists')
      return
    }
    
    // Find file by name (without extension)
    const fileNameWithoutExt = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName
    let matchingFile = filesResult.files.find(file => {
      const fileBaseName = file.name.endsWith('.md') ? file.name.slice(0, -3) : file.name
      return fileBaseName === fileNameWithoutExt
    })
    
    let filePath: string
    let fileContent: string
    
    if (!matchingFile) {
      // File doesn't exist - create it
      const createResult = await createNoteFile(fileNameWithoutExt)
      if (!createResult.success || !createResult.filePath) {
        setWarningMessage(`Failed to create file "${fileName}"`)
        return
      }
      
      // New file is created with filename as default title
      filePath = createResult.filePath
      fileContent = fileNameWithoutExt // New files start with filename as the title
    } else {
      filePath = matchingFile.path
      // Load existing file
      const loadResult = await loadNoteFromFile(filePath)
      if (!loadResult.success || loadResult.content === undefined) {
        setWarningMessage(`Failed to load file "${fileName}"`)
        return
      }
      fileContent = loadResult.content
    }
    
    // Check if already editing this file using ref to get latest state
    const existingEditor = editingNotesRef.current.find(e => 
      e.filePath === filePath
    )
    
    if (existingEditor) {
      // Focus the existing editor instead of opening a new one
      // Use setTimeout to ensure the ref is attached after render
      setTimeout(() => {
        const editorRef = editorRefs.current.get(filePath)
        if (editorRef?.current) {
          editorRef.current.focus()
        }
      }, 0)
      return
    }
    
    // Open file in hover editor
    // Calculate center position for hover editor
    const editorHeight = 320
    const viewportCenterX = window.innerWidth / 2
    const viewportCenterY = window.innerHeight / 2
    const editorX = viewportCenterX
    const editorY = viewportCenterY - editorHeight / 2 - 40
    
    // Normalize filePath - ensure it's just the filename (relative to vault)
    let normalizedFilePath = filePath
    if (normalizedFilePath.includes('/')) {
      normalizedFilePath = normalizedFilePath.split('/').pop() || normalizedFilePath
    }
    if (normalizedFilePath.startsWith('/')) {
      normalizedFilePath = normalizedFilePath.slice(1)
    }
    
    // Extract title from first line of content (trimmed) for consistency
    const lines = fileContent.split('\n')
    const title = (lines[0] || '').trim() || (normalizedFilePath.endsWith('.md') ? normalizedFilePath.slice(0, -3) : normalizedFilePath)
    
    const tempNote: Note = ensureNoteCenters({
      id: `editor-${normalizedFilePath}-${Date.now()}`,
      x: 0,
      y: 0,
      width: 198,
      height: 132,
      content: fileContent,
      title: title, // Use first line of content as title
      filePath: normalizedFilePath
    })
    
    // Create a ref for this editor
    const editorRef = { current: null } as React.RefObject<HoverEditorHandle>
    editorRefs.current.set(normalizedFilePath, editorRef)
    
    setEditingNotes(prev => [...prev, { 
      note: tempNote, 
      position: { x: editorX, y: editorY },
      filePath: normalizedFilePath
    }])
  }, [])

  // Expose function to open file in editor via ref
  useImperativeHandle(ref, () => ({
    openFile: (filePath: string, content: string) => {
      // Only open in hover editor, don't add to canvas
      // Notes should only appear on desk when manually dragged/placed
      
      // Calculate center position accounting for editor size and HoverEditor's positioning logic
      // HoverEditor calculates: screenX = position.x - editorWidth/2, screenY = position.y + 40
      // To center: we want screenY = viewportCenterY - editorHeight/2
      // So: viewportCenterY - editorHeight/2 = position.y + 40
      // Therefore: position.y = viewportCenterY - editorHeight/2 - 40
      const editorHeight = 320
      const viewportCenterX = window.innerWidth / 2
      const viewportCenterY = window.innerHeight / 2
      
      // Position to center the editor on screen
      const editorX = viewportCenterX // Will be centered by HoverEditor (position.x - editorWidth/2)
      const editorY = viewportCenterY - editorHeight / 2 - 40 // Account for +40 offset in HoverEditor
      
      // Normalize filePath - ensure it's just the filename (relative to vault)
      let normalizedFilePath = filePath
      if (normalizedFilePath.includes('/')) {
        normalizedFilePath = normalizedFilePath.split('/').pop() || normalizedFilePath
      }
      if (normalizedFilePath.startsWith('/')) {
        normalizedFilePath = normalizedFilePath.slice(1)
      }
      
      // Check if already editing this file using ref to get latest state
      const isAlreadyEditing = editingNotesRef.current.some(e => {
        let ePath = e.filePath || ''
        if (ePath.includes('/')) {
          ePath = ePath.split('/').pop() || ePath
        }
        if (ePath.startsWith('/')) {
          ePath = ePath.slice(1)
        }
        return ePath === normalizedFilePath
      })
      
      if (isAlreadyEditing) {
        // Focus the existing editor instead of opening a new one
        setTimeout(() => {
          const editorRef = editorRefs.current.get(normalizedFilePath)
          if (editorRef?.current) {
            editorRef.current.focus()
          }
        }, 0)
        return
      }
      
      // Extract title from first line of content (trimmed) for consistency
      const lines = content.split('\n')
      const title = (lines[0] || '').trim() || (normalizedFilePath.endsWith('.md') ? normalizedFilePath.slice(0, -3) : normalizedFilePath)
      
      // Create a temporary note just for the editor (not on canvas)
      const tempNote: Note = ensureNoteCenters({
        id: `editor-${normalizedFilePath}-${Date.now()}`,
        x: 0,
        y: 0,
        width: 198,
        height: 132,
        content: content,
        title: title, // Use first line of content as title
        filePath: normalizedFilePath
      })
      
      // Create a ref for this editor
      const editorRef = { current: null } as React.RefObject<HoverEditorHandle>
      editorRefs.current.set(normalizedFilePath, editorRef)
      
      setEditingNotes(prev => {
        const newEditingNotes = [...prev, { 
          note: tempNote, 
          position: { x: editorX, y: editorY },
          filePath: normalizedFilePath
        }]
        return newEditingNotes
      })
    },
    addNoteAtPosition: async (filePath: string, content: string, screenX: number, screenY: number) => {
      if (!canvasRef.current) {
        return
      }
      
      // Use screen coordinates directly (like tempNote)
      const rect = canvasRef.current.getBoundingClientRect()
      
      // Card dimensions
      const cardWidth = 198
      const cardHeight = 132
      
      // Alternative Approach 1: Calculate center first, then derive top-left (more explicit)
      const worldCenter = screenToWorldCenter(screenX, screenY, rect, pan, zoom)
      const cardTopLeft = centerToTopLeft(worldCenter.x, worldCenter.y, cardWidth, cardHeight)
      
      // Check if note already exists for this file using functional update
      setNotes(prevNotes => {
        const existingNote = prevNotes.find(n => n.filePath === filePath)
        if (existingNote) {
          // Update existing note position
          return prevNotes.map(n => 
            n.id === existingNote.id 
              ? ensureNoteCenters({ ...n, x: 0, y: 0 })
              : n
          )
        } else {
          // Extract title from first line of content (trimmed) for consistency
          const lines = content.split('\n')
          const title = (lines[0] || '').trim() || (filePath.endsWith('.md') ? filePath.slice(0, -3) : filePath)
          
          // Create new note at position
          const newNote: Note = ensureNoteCenters({
            id: `file-${filePath}-${Date.now()}`,
            x: cardTopLeft.x,
            y: cardTopLeft.y,
            width: cardWidth,
            height: cardHeight,
            content: content,
            title: title, // Use first line of content as title
            filePath: filePath,
            color: '#ffffff'
          })
          
          return [...prevNotes, newNote]
        }
      })
    },
    updateNoteTitle: (oldFilePath: string, newFilePath: string, newTitle: string) => {
      // Update notes that match the old file path
      setNotes(prevNotes => prevNotes.map(note => 
        note.filePath === oldFilePath
          ? ensureNoteCenters({ ...note, title: newTitle, filePath: newFilePath })
          : note
      ))
      
      // Also update any notes being edited
      setEditingNotes(prev => prev.map(editing => 
        editing.filePath === oldFilePath
          ? { 
              ...editing, 
              filePath: newFilePath,
              note: { ...editing.note, title: newTitle, filePath: newFilePath }
            }
          : editing
      ))
    },
    removeNoteByFilePath: (filePath: string) => {
      // Normalize filePath - extract just the filename (e.g., "Note 1.md")
      let normalizedFilePath = filePath
      if (normalizedFilePath.includes('/')) {
        normalizedFilePath = normalizedFilePath.split('/').pop() || normalizedFilePath
      }
      if (normalizedFilePath.startsWith('/')) {
        normalizedFilePath = normalizedFilePath.slice(1)
      }
      
      // Remove notes from local state
      setNotes(prevNotes => {
        const filtered = prevNotes.filter(note => {
          if (!note.filePath) return true
          const noteFilePath = note.filePath.includes('/') 
            ? note.filePath.split('/').pop() || note.filePath
            : note.filePath
          const matches = noteFilePath === normalizedFilePath
          return !matches
        })
        return filtered
      })
      
      // Close hover editors for this file
      setEditingNotes(prev => {
        const filtered = prev.filter(editing => {
          if (!editing.filePath) return true
          const editingFilePath = editing.filePath.includes('/')
            ? editing.filePath.split('/').pop() || editing.filePath
            : editing.filePath
          const matches = editingFilePath === normalizedFilePath
          if (matches) {
            // Remove ref
            if (editing.filePath) {
              editorRefs.current.delete(editing.filePath)
            }
          }
          return !matches
        })
        return filtered
      })
    }
  }), [editingNotes, pan, zoom, notes, canvasId])

  // Save note content to markdown files whenever they change
  useEffect(() => {
    if (isNotesLoaded) {
      // Save each note's content to its markdown file
      notes.forEach(async (note) => {
        if (note.filePath) {
          // Note has a file, save content to that file
          await saveNoteToFile(note.filePath, note.content)
        }
        // If note doesn't have a filePath, it's a new note - we'll create a file when it's first saved
      })
    }
  }, [notes, isNotesLoaded])

  // Save pan position to file system whenever it changes
  useEffect(() => {
    if (isPanLoaded) {
      savePan(pan, canvasId)
    }
  }, [pan, isPanLoaded, canvasId])

  // Save notes whenever they change
  useEffect(() => {
    if (isNotesLoaded) {
      // Save note positions and metadata (content is also saved for reference, but files are source of truth)
      const notesToSave = notes.map(note => ({
        id: note.id,
        x: note.x,
        y: note.y,
        width: note.width,
        height: note.height,
        content: note.content, // Keep content for reference (will be refreshed from files on load)
        title: note.title,
        color: note.color,
        filePath: note.filePath,
        centerX: note.centerX, // Save center coordinates
        centerY: note.centerY
      }))
      saveNotes(notesToSave as Note[], canvasId)
    }
  }, [notes, isNotesLoaded, canvasId])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Check if clicking on background (not on a card or interactive element)
    const target = e.target as HTMLElement
    const isClickingOnCard = target.closest('[data-note-card]') !== null
    const isBackground = !isClickingOnCard && (
      target === e.currentTarget || 
      target.classList.contains('canvas-grid') ||
      target.tagName === 'svg' ||
      target.tagName === 'line' ||
      (target.tagName === 'DIV' && !target.closest('[data-note-card]'))
    )
    
    // Allow panning with:
    // - Middle mouse button (button === 1)
    // - Ctrl/Cmd+click
    // - Hand tool active
    // - Left click on background (empty canvas area, not on cards)
    const canPan = e.button === 1 || 
                   (e.button === 0 && (e.ctrlKey || e.metaKey)) ||
                   (e.button === 0 && activeTool === 'hand') ||
                   (e.button === 0 && isBackground && !e.ctrlKey && !e.metaKey)
    
    if (canPan) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
      e.preventDefault()
      e.stopPropagation()
    }
  }, [pan, activeTool])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    }
  }, [isPanning, panStart])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.cancelable) {
        e.preventDefault()
      }
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.1, Math.min(2, zoom * delta))
      onZoomChange(newZoom)
    }
  }, [zoom, onZoomChange])


  return (
    <div className="flex-1 relative overflow-hidden bg-gray-100" style={{ zIndex: 1 }}>
      {/* Title Bar */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-white border-b border-gray-200 flex items-center px-4 z-20">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium">{canvasId}</span>
          </div>
        </div>
        <div className="ml-auto">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span>Links</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 canvas-grid"
        style={{
          top: 0,
          cursor: isPanning ? 'grabbing' : (activeTool === 'hand' ? 'grab' : 'default'),
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onContextMenu={() => {
          // Allow context menu on canvas (for future features)
          // But don't prevent default - let note cards handle their own context menus
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          {/* Link arrows - rendered behind cards */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 0,
              overflow: 'visible',
            }}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill="#666" />
              </marker>
            </defs>
            {(() => {
              const links: Array<{ from: Note; to: Note }> = []
              
              // Find all links between notes
              notes.forEach((fromNote) => {
                if (!fromNote.content) return
                
                // Parse links from note content
                const linkMatches = findLinks(fromNote.content)
                
                linkMatches.forEach((linkMatch) => {
                  // Find target note by filePath
                  const targetNote = notes.find((note) => {
                    if (!note.filePath) return false
                    
                    // Normalize filePath for comparison
                    let noteFilePath = note.filePath
                    if (noteFilePath.includes('/')) {
                      noteFilePath = noteFilePath.split('/').pop() || noteFilePath
                    }
                    if (noteFilePath.startsWith('/')) {
                      noteFilePath = noteFilePath.slice(1)
                    }
                    const noteFileName = noteFilePath.endsWith('.md') 
                      ? noteFilePath.slice(0, -3) 
                      : noteFilePath
                    
                    // Compare with link fileName
                    const linkFileName = linkMatch.fileName.endsWith('.md')
                      ? linkMatch.fileName.slice(0, -3)
                      : linkMatch.fileName
                    
                    return noteFileName.toLowerCase() === linkFileName.toLowerCase()
                  })
                  
                  if (targetNote && targetNote.id !== fromNote.id) {
                    // Check if link already exists (avoid duplicates)
                    const linkExists = links.some(
                      l => l.from.id === fromNote.id && l.to.id === targetNote.id
                    )
                    if (!linkExists) {
                      links.push({ from: fromNote, to: targetNote })
                    }
                  }
                })
              })
              
              // Render arrows connecting note edges
              return links.map((link, index) => {
                // Calculate centers for direction
                const fromCenterX = link.from.x + link.from.width / 2
                const fromCenterY = link.from.y + link.from.height / 2
                const toCenterX = link.to.x + link.to.width / 2
                const toCenterY = link.to.y + link.to.height / 2
                
                // Find intersection points on note edges
                const fromPoint = getLineRectIntersection(
                  toCenterX, toCenterY, // Line from target center
                  fromCenterX, fromCenterY, // To source center
                  link.from.x, link.from.y, link.from.width, link.from.height
                )
                
                const toPoint = getLineRectIntersection(
                  fromCenterX, fromCenterY, // Line from source center
                  toCenterX, toCenterY, // To target center
                  link.to.x, link.to.y, link.to.width, link.to.height
                )
                
                // Fallback to centers if intersection calculation fails
                const startX = fromPoint?.x ?? fromCenterX
                const startY = fromPoint?.y ?? fromCenterY
                const endX = toPoint?.x ?? toCenterX
                const endY = toPoint?.y ?? toCenterY
                
                return (
                  <line
                    key={`link-${link.from.id}-${link.to.id}-${index}`}
                    x1={startX}
                    y1={startY}
                    x2={endX}
                    y2={endY}
                    stroke="#666"
                    strokeWidth="1"
                    markerEnd="url(#arrowhead)"
                    opacity="0.4"
                  />
                )
              })
            })()}
          </svg>
          
          {/* Red circles at card centers for visualization */}
          {notes.map((note) => {
            // Calculate center manually
            const centerX = note.x + note.width / 2
            const centerY = note.y + note.height / 2
            return (
              <div
                key={`center-${note.id}`}
                style={{
                  position: 'absolute',
                  left: `${centerX}px`,
                  top: `${centerY}px`,
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: 'red',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10,
                  pointerEvents: 'none',
                }}
              />
            )
          })}
          
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              zoom={zoom}
              pan={pan}
              canvasTop={48}
              onUpdate={(updatedNote) => {
                setNotes(notes.map((n) => (n.id === updatedNote.id ? ensureNoteCenters(updatedNote) : n)))
              }}
              onEdit={(note, position) => {
                // Check if note is already being edited
                const isAlreadyEditing = editingNotes.some(e => e.note.id === note.id)
                if (!isAlreadyEditing) {
                  setEditingNotes([...editingNotes, { note, position, filePath: note.filePath }])
                }
              }}
              onLinkClick={handleLinkClick}
              onDelete={async (note) => {
                // Delete permanently: remove from canvas and delete file
                if (note.filePath) {
                  const result = await deleteNoteFile(note.filePath)
                  if (result.success) {
                    setNotes(notes.filter((n) => n.id !== note.id))
                  }
                } else {
                  // Note without file, just remove from canvas
                  setNotes(notes.filter((n) => n.id !== note.id))
                }
              }}
              onRemove={(note) => {
                // Remove from desk: just remove from canvas, keep the file
                setNotes(notes.filter((n) => n.id !== note.id))
              }}
            />
          ))}
        </div>
      </div>

      {/* Hover Editors */}
      {editingNotes.map((editingNote) => {
        // Get or create ref for this editor
        if (!editingNote.filePath) {
          // Notes without filePath don't need refs (they can't be linked to)
          return (
            <HoverEditor
              key={editingNote.note.id}
              note={editingNote.note}
              position={editingNote.position}
              filePath={editingNote.filePath}
              onLinkClick={handleLinkClick}
              onFileCreated={onFileCreated}
              onSave={async (content) => {
                // Note doesn't have a file yet - update canvas only
                // Extract title from content (first line) - use trim() for consistency
                const lines = content.split('\n')
                const newTitle = (lines[0] || '').trim()
                setNotes(notes.map((n) => 
                  n.id === editingNote.note.id ? ensureNoteCenters({ ...n, content, title: newTitle }) : n
                ))
                // Close editor for notes without files
                setEditingNotes(editingNotes.filter(e => e.note.id !== editingNote.note.id))
              }}
              onClose={() => {
                setEditingNotes(editingNotes.filter(e => e.note.id !== editingNote.note.id))
              }}
            />
          )
        }
        
        // Get or create ref for this editor
        if (!editorRefs.current.has(editingNote.filePath)) {
          editorRefs.current.set(editingNote.filePath, { current: null } as React.RefObject<HoverEditorHandle>)
        }
        const editorRef = editorRefs.current.get(editingNote.filePath)!
        
        return (
          <HoverEditor
            key={editingNote.note.id}
            ref={editorRef}
            note={editingNote.note}
            position={editingNote.position}
            filePath={editingNote.filePath}
            onLinkClick={handleLinkClick}
            onFileCreated={onFileCreated}
            onDelete={async (note) => {
              // Delete permanently: remove from canvas and delete file
              const noteFilePath = editingNote.filePath
              if (noteFilePath) {
                const result = await deleteNoteFile(noteFilePath)
                if (result.success) {
                  setNotes(notes.filter((n) => n.id !== note.id))
                  // Also remove from editing notes
                  setEditingNotes(editingNotes.filter((e) => e.note.id !== note.id))
                  // Remove ref
                  if (noteFilePath && editorRefs.current.has(noteFilePath)) {
                    editorRefs.current.delete(noteFilePath)
                  }
                }
              } else {
                // Note without file, just remove from canvas and editing notes
                setNotes(notes.filter((n) => n.id !== note.id))
                setEditingNotes(editingNotes.filter((e) => e.note.id !== note.id))
              }
            }}
            onSave={async (content, newFileName) => {
            // If this is a file, save it back to disk
            if (editingNote.filePath) {
              // IMPORTANT: editingNote.filePath is the ORIGINAL file path (the old name)
              // We should always use this as the source for rename, never the newFileName
              let originalFilePath = editingNote.filePath
              
              // Normalize original filePath - extract just the filename
              // filePath should be relative to vault (e.g., "Note 1.md"), but handle both cases
              if (originalFilePath.includes('/')) {
                originalFilePath = originalFilePath.split('/').pop() || originalFilePath
              }
              // Remove leading slash if present
              if (originalFilePath.startsWith('/')) {
                originalFilePath = originalFilePath.slice(1)
              }
              
              // Extract title from content (first line) - use trim() for consistency
              const lines = content.split('\n')
              const newTitle = (lines[0] || '').trim()
              
              // Start with the original file path - this will be updated if rename succeeds
              let currentFilePath = originalFilePath
              
              // If filename was changed, rename the file
              if (newFileName) {
                // Check for duplicate names before renaming
                const filesResult = await listNoteFiles()
                if (filesResult.success && filesResult.files) {
                  const newFileNameWithExt = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`
                  const duplicateFile = filesResult.files.find((f: any) => {
                    // Skip the current file (the one we're renaming)
                    const currentPath = f.path.includes('/') ? f.path.split('/').pop() : f.path
                    if (currentPath === originalFilePath) return false
                    // Check if another file has the same name as the new name
                    return f.name === newFileNameWithExt || f.path === newFileNameWithExt
                  })
                  
                  if (duplicateFile) {
                    setWarningMessage(`A file with the name "${newFileName}" already exists. Please choose a different name.`)
                    return
                  }
                }
                
                // Rename FROM the original file path TO the new file name
                const renameResult = await renameNoteFile(originalFilePath, newFileName)
                if (renameResult.success && renameResult.newFilePath) {
                  // Update currentFilePath to the new path after successful rename
                  // newFilePath should be just the filename (e.g., "Lorem.md"), not an absolute path
                  let newFilePath = renameResult.newFilePath
                  // Normalize in case it's somehow an absolute path
                  if (newFilePath.includes('/')) {
                    newFilePath = newFilePath.split('/').pop() || newFilePath
                  }
                  if (newFilePath.startsWith('/')) {
                    newFilePath = newFilePath.slice(1)
                  }
                  
                  // Update ref map with new file path
                  const oldFilePathForRef = editingNote.filePath
                  if (oldFilePathForRef && editorRefs.current.has(oldFilePathForRef)) {
                    const ref = editorRefs.current.get(oldFilePathForRef)!
                    editorRefs.current.delete(oldFilePathForRef)
                    editorRefs.current.set(newFilePath, ref)
                  }
                  
                  // Update currentFilePath to use the new path
                  currentFilePath = newFilePath
                } else if (renameResult.error) {
                  setWarningMessage(renameResult.error)
                  return
                }
              }
              
              // Save content to file (use currentFilePath which is either original or newly renamed)
              await saveNoteToFile(currentFilePath, content)
              
              // Update note in canvas if it exists - include title update
              setNotes(prev => prev.map((n) => 
                n.filePath === editingNote.filePath 
                  ? ensureNoteCenters({ ...n, content, title: newTitle, filePath: currentFilePath })
                  : n.id === editingNote.note.id 
                    ? ensureNoteCenters({ ...n, content, title: newTitle, filePath: currentFilePath })
                    : n
              ))
              
              // If this was a rename operation, update the editor's filePath and keep it open
              if (newFileName) {
                setEditingNotes(prev => {
                  const updated = prev.map(e => 
                    e.note.id === editingNote.note.id
                      ? { ...e, filePath: currentFilePath, note: { ...e.note, content, title: newTitle, filePath: currentFilePath } }
                      : e
                  )
                  return updated
                })
              } else {
                // Not a rename, but update title in editor and keep it open
                setEditingNotes(prev => {
                  const updated = prev.map(e => 
                    e.note.id === editingNote.note.id
                      ? { ...e, note: { ...e.note, content, title: newTitle } }
                      : e
                  )
                  return updated
                })
              }
              
              // Notify sidebar to refresh file list (file watcher should handle this, but ensure it's updated)
              // The file watcher in Sidebar should detect the change and update the list
              }
            }}
            onClose={() => {
              // Remove ref when editor closes
              if (editingNote.filePath) {
                editorRefs.current.delete(editingNote.filePath)
              }
              setEditingNotes(prev => {
                const filtered = prev.filter(e => e.note.id !== editingNote.note.id)
                return filtered
              })
            }}
          />
        )
      })}

      {/* Warning Modal */}
      {warningMessage && (
        <WarningModal
          message={warningMessage}
          onClose={() => setWarningMessage(null)}
        />
      )}
    </div>
  )
})

Canvas.displayName = 'Canvas'

export default Canvas

