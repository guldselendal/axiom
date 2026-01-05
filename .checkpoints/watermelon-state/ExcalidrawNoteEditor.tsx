import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI, ExcalidrawElement, AppState, BinaryFiles } from '@excalidraw/excalidraw/types/types'
import { ExcalidrawData, ExcalidrawNote } from '../types/notes'
import { saveNoteToFile } from '../utils/fileSystem'

interface ExcalidrawNoteEditorProps {
  note: ExcalidrawNote
  filePath?: string
  onSave: (excalidrawData: ExcalidrawData, newFilePath?: string) => void
  onClose: () => void
  onDelete?: (note: ExcalidrawNote) => void
  onPositionChange?: (position: { x: number; y: number }) => void
}

const ExcalidrawNoteEditor: React.FC<ExcalidrawNoteEditorProps> = ({
  note,
  filePath,
  onSave,
  onClose,
  onDelete,
  onPositionChange,
}) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null)
  const [editorPosition, setEditorPosition] = useState({ x: 100, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 })
  const editorRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const hasManualPositionRef = useRef(false)

  // Initialize position from note prop
  useEffect(() => {
    if (note.worldX !== undefined && note.worldY !== undefined && !hasManualPositionRef.current) {
      // Convert world coordinates to screen coordinates if needed
      // For now, use the position prop if available, otherwise use worldX/worldY directly
      // The parent should pass screen coordinates via position prop
      setEditorPosition({ x: note.worldX, y: note.worldY })
    }
  }, [note.worldX, note.worldY])
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<ExcalidrawData | null>(null)
  const isInitialLoadRef = useRef(true)

  // Debounced autosave
  const debouncedSave = useCallback((data: ExcalidrawData) => {
    pendingSaveRef.current = data
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      if (pendingSaveRef.current && filePath) {
        const jsonContent = JSON.stringify(pendingSaveRef.current, null, 2)
        saveNoteToFile(filePath, jsonContent).then(result => {
          if (result.success) {
            onSave(pendingSaveRef.current!, filePath)
          } else {
            console.error('Failed to autosave Excalidraw note:', result.error)
          }
        })
        pendingSaveRef.current = null
      }
    }, 800) // 800ms debounce
  }, [filePath, onSave])

  // Handle Excalidraw changes
  const handleExcalidrawChange = useCallback((
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) => {
    // Skip save on initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false
      return
    }

    const excalidrawData: ExcalidrawData = {
      type: 'excalidraw',
      version: 2,
      source: 'https://excalidraw.com',
      elements: elements.map(el => ({ ...el })), // Clone elements
      appState: { ...appState }, // Clone appState
      files: Object.fromEntries(
        Object.entries(files).map(([id, file]) => [
          id,
          {
            id: file.id,
            dataURL: file.dataURL,
            mimeType: file.mimeType,
            created: file.created,
          }
        ])
      ),
    }

    debouncedSave(excalidrawData)
  }, [debouncedSave])

  // Load initial data
  useEffect(() => {
    if (excalidrawAPI && note.excalidrawData) {
      isInitialLoadRef.current = true
      excalidrawAPI.updateScene({
        elements: note.excalidrawData.elements,
        appState: note.excalidrawData.appState,
      })
      
      // Load files if any
      if (note.excalidrawData.files && Object.keys(note.excalidrawData.files).length > 0) {
        const files: BinaryFiles = {}
        Object.entries(note.excalidrawData.files).forEach(([id, fileData]) => {
          files[id] = {
            id: fileData.id,
            dataURL: fileData.dataURL,
            mimeType: fileData.mimeType,
            created: fileData.created,
          }
        })
        excalidrawAPI.addFiles(Object.values(files))
      }
      
      // Small delay to ensure initial load flag is set
      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 100)
    }
  }, [excalidrawAPI, note.excalidrawData])

  // Flush pending saves on unmount or note switch
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      // Flush pending save immediately
      if (pendingSaveRef.current && filePath) {
        const jsonContent = JSON.stringify(pendingSaveRef.current, null, 2)
        saveNoteToFile(filePath, jsonContent)
        pendingSaveRef.current = null
      }
    }
  }, [filePath])

  // Handle dragging
  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === headerRef.current || (e.target as HTMLElement).closest('.header-drag-area')) {
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: editorPosition.x,
        startY: editorPosition.y,
      }
      setIsDragging(true)
      e.preventDefault()
    }
  }, [editorPosition])

  useEffect(() => {
    const handleMove = (e: MouseEvent | PointerEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x
        const deltaY = e.clientY - dragStartRef.current.y
        const newPosition = {
          x: dragStartRef.current.startX + deltaX,
          y: dragStartRef.current.startY + deltaY,
        }
        setEditorPosition(newPosition)
        if (onPositionChange) {
          onPositionChange(newPosition)
        }
      }
    }

    const handleUp = () => {
      if (isDragging) {
        setIsDragging(false)
      }
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      return () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }
    }
  }, [isDragging, onPositionChange])

  // Export functions
  const handleExportPNG = useCallback(async () => {
    if (!excalidrawAPI) return
    
    try {
      const elements = excalidrawAPI.getSceneElements()
      const appState = excalidrawAPI.getAppState()
      
      // Use Excalidraw's exportToCanvas API if available
      const { exportToCanvas } = await import('@excalidraw/excalidraw')
      const canvas = await exportToCanvas({
        elements,
        appState,
        files: excalidrawAPI.getFiles(),
        getDimensions: (width, height) => ({ width, height, scale: 1 }),
      })
      
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${note.title || 'drawing'}.png`
          a.click()
          URL.revokeObjectURL(url)
        }
      })
    } catch (error) {
      console.error('Error exporting PNG:', error)
    }
  }, [excalidrawAPI, note.title])

  const handleExportExcalidraw = useCallback(() => {
    if (!excalidrawAPI) return
    
    const elements = excalidrawAPI.getSceneElements()
    const appState = excalidrawAPI.getAppState()
    const files = excalidrawAPI.getFiles()
    
    const data: ExcalidrawData = {
      type: 'excalidraw',
      version: 2,
      source: 'https://excalidraw.com',
      elements: elements.map(el => ({ ...el })),
      appState: { ...appState },
      files: Object.fromEntries(
        Object.entries(files).map(([id, file]) => [
          id,
          {
            id: file.id,
            dataURL: file.dataURL,
            mimeType: file.mimeType,
            created: file.created,
          }
        ])
      ),
    }
    
    const jsonContent = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${note.title || 'drawing'}.excalidraw`
    a.click()
    URL.revokeObjectURL(url)
  }, [excalidrawAPI, note.title])

  // Use absolute positioning instead of fixed to help Excalidraw calculate coordinates correctly
  // Absolute positioning relative to the viewport should work better with Excalidraw's coordinate system
  return (
    <div
      ref={editorRef}
      className="fixed bg-white shadow-2xl border border-gray-200 flex flex-col z-[9999]"
      style={{
        left: `${editorPosition.x}px`,
        top: `${editorPosition.y}px`,
        width: '800px',
        height: '600px',
        borderRadius: '8px',
        transform: 'none', // Ensure no transforms affect coordinate calculations
        willChange: 'auto', // Optimize rendering
      }}
      // Don't interfere with Excalidraw's event handling at all
      // Excalidraw needs to receive raw pointer events to calculate coordinates correctly
    >
      {/* Header */}
      <div
        ref={headerRef}
        className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white header-drag-area"
        onMouseDown={handleHeaderMouseDown}
        onPointerDown={handleHeaderMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span className="font-medium text-gray-900">{note.title || 'Excalidraw Drawing'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPNG}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Export as PNG"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={handleExportExcalidraw}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Export as .excalidraw"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
          {onDelete && (
            <button
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete this drawing?`)) {
                  onDelete(note)
                  onClose()
                }
              }}
              className="p-1.5 hover:bg-red-50 rounded transition-colors"
              title="Delete"
            >
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Excalidraw Editor */}
      {/* 
        FIX: Excalidraw coordinate issue
        The problem: Excalidraw uses getBoundingClientRect() on its container (excalidrawContainerRef) 
        to convert window coordinates (clientX, clientY) to container-relative coordinates.
        
        When the editor is fixed-positioned, Excalidraw's internal container ref might not be 
        correctly accounting for the fixed positioning offset.
        
        Solution: 
        1. Use detectScroll={true} to allow Excalidraw to detect scroll events
        2. Make the container scrollable so users can scroll to see the header when clicking far away
        3. Ensure the container structure is correct - Excalidraw will use getBoundingClientRect()
           on its internal container ref, which should be the direct parent of the canvas
        4. The container must have position: relative for proper coordinate calculations
      */}
      <div 
        className="flex-1 overflow-auto" 
        style={{ 
          height: 'calc(600px - 60px)',
          position: 'relative',
          width: '100%',
          // Make scrollable so users can scroll to see header when clicking far away
          // Excalidraw will use getBoundingClientRect() on its internal container
          // This div must be positioned relative to the fixed parent
        }}
      >
        <Excalidraw
          ref={(api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api)}
          onChange={handleExcalidrawChange}
          detectScroll={true}
          initialData={{
            elements: note.excalidrawData?.elements || [],
            appState: note.excalidrawData?.appState || { viewBackgroundColor: '#ffffff' },
            files: note.excalidrawData?.files ? Object.values(note.excalidrawData.files) : {},
          }}
        />
      </div>
    </div>
  )
}

export default ExcalidrawNoteEditor

