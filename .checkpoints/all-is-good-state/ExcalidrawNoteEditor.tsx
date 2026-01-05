import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI, ExcalidrawElement, AppState, BinaryFiles } from '@excalidraw/excalidraw/types/types'
import { ExcalidrawData, ExcalidrawNote } from '../types/notes'
import { saveNoteToFile } from '../utils/fileSystem'

interface ExcalidrawNoteEditorProps {
  note: ExcalidrawNote
  filePath?: string
  position?: { x: number; y: number } // Screen position from parent
  onSave: (excalidrawData: ExcalidrawData, newFilePath?: string) => void
  onClose: () => void
  onDelete?: (note: ExcalidrawNote) => void
  onPositionChange?: (position: { x: number; y: number }) => void
}

const ExcalidrawNoteEditor: React.FC<ExcalidrawNoteEditorProps> = ({
  note,
  filePath,
  position: initialPosition,
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
  const excalidrawContainerRef = useRef<HTMLDivElement>(null)

  // Initialize position from position prop (only once on mount or when position changes from parent)
  useEffect(() => {
    if (initialPosition) {
      // Only update if we haven't manually positioned it, or if it's the first time
      if (!hasManualPositionRef.current) {
        setEditorPosition(initialPosition)
      }
    } else if (note.worldX !== undefined && note.worldY !== undefined && !hasManualPositionRef.current) {
      // Fallback to worldX/worldY if no position prop provided
      setEditorPosition({ x: note.worldX, y: note.worldY })
    }
  }, []) // Only run once on mount - don't depend on initialPosition or note to avoid resets
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
      
      // Sanitize appState to ensure collaborators is an array if it exists
      const appState = { ...note.excalidrawData.appState };
      if ('collaborators' in appState && !Array.isArray(appState.collaborators)) {
        delete appState.collaborators;
      }
      
      excalidrawAPI.updateScene({
        elements: note.excalidrawData.elements || [],
        appState: appState,
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
  const handleHeaderMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    if (e.target === headerRef.current || (e.target as HTMLElement).closest('.header-drag-area')) {
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: editorPosition.x,
        startY: editorPosition.y,
      }
      setIsDragging(true)
      e.preventDefault()
      e.stopPropagation() // Prevent event from bubbling to canvas
    }
  }, [editorPosition])

  useEffect(() => {
    const handleMove = (e: MouseEvent | PointerEvent) => {
      if (isDragging) {
        e.preventDefault()
        e.stopPropagation() // Prevent event from reaching canvas
        const deltaX = e.clientX - dragStartRef.current.x
        const deltaY = e.clientY - dragStartRef.current.y
        const newPosition = {
          x: dragStartRef.current.startX + deltaX,
          y: dragStartRef.current.startY + deltaY,
        }
        setEditorPosition(newPosition)
        hasManualPositionRef.current = true // Mark that user has manually positioned the editor
        if (onPositionChange) {
          onPositionChange(newPosition)
        }
      }
    }

    const handleUp = (e: MouseEvent | PointerEvent) => {
      if (isDragging) {
        e.preventDefault()
        e.stopPropagation() // Prevent event from reaching canvas
        setIsDragging(false)
      }
    }

    if (isDragging) {
      // Use capture phase to catch events before they reach canvas
      window.addEventListener('mousemove', handleMove, true)
      window.addEventListener('mouseup', handleUp, true)
      window.addEventListener('pointermove', handleMove, true)
      window.addEventListener('pointerup', handleUp, true)
      return () => {
        window.removeEventListener('mousemove', handleMove, true)
        window.removeEventListener('mouseup', handleUp, true)
        window.removeEventListener('pointermove', handleMove, true)
        window.removeEventListener('pointerup', handleUp, true)
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

  // Trigger resize event after modal is mounted and visible to ensure Excalidraw calculates correctly
  useEffect(() => {
    if (editorRef.current) {
      // Wait for next frame to ensure layout is stable
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'))
      })
    }
  }, [editorPosition])

  // Render modal content - will be portaled to document.body
  const modalContent = (
    <div
      ref={editorRef}
      className="fixed bg-white shadow-2xl border border-gray-200 flex flex-col z-[9999]"
      style={{
        left: `${editorPosition.x}px`,
        top: `${editorPosition.y}px`,
        width: '800px',
        height: '600px',
        borderRadius: '8px',
        // NO transform - use top/left only for positioning
        // NO scale/zoom on this container
      }}
      // Stop pointer events from propagating to canvas when dragging
      onPointerDown={(e) => {
        if (isDragging || e.target === headerRef.current || (e.target as HTMLElement).closest('.header-drag-area')) {
          e.stopPropagation()
        }
      }}
      onPointerMove={(e) => {
        if (isDragging) {
          e.stopPropagation()
        }
      }}
      onPointerUp={(e) => {
        if (isDragging) {
          e.stopPropagation()
        }
      }}
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
        CRITICAL: Excalidraw coordinate system requirements
        - Container MUST have position: relative (for getBoundingClientRect() to work correctly)
        - Container MUST have explicit width/height (stable layout)
        - NO CSS transforms on this container or any ancestor (we're in a portal, so no transformed ancestors)
        - Excalidraw uses getBoundingClientRect() on its internal container to map pointer events
      */}
      <div 
        ref={excalidrawContainerRef}
        className="flex-1 overflow-auto" 
        style={{ 
          height: 'calc(600px - 60px)',
          position: 'relative', // CRITICAL: relative positioning for coordinate calculations
          width: '100%',
          // NO transform, NO scale, NO filter, NO perspective
        }}
      >
        <Excalidraw
          excalidrawAPI={(api: ExcalidrawImperativeAPI) => {
            setExcalidrawAPI(api)
            // Trigger resize after API is ready to ensure Excalidraw calculates correctly
            requestAnimationFrame(() => {
              window.dispatchEvent(new Event('resize'))
            })
          }}
          onChange={handleExcalidrawChange}
          detectScroll={true}
          initialData={{
            elements: note.excalidrawData?.elements || [],
            appState: (() => {
              const baseAppState = note.excalidrawData?.appState || {};
              // Ensure collaborators is an array if it exists, or remove it
              const sanitizedAppState: any = {
                ...baseAppState,
                viewBackgroundColor: baseAppState.viewBackgroundColor || '#ffffff',
              };
              // Remove collaborators if it's not an array
              if ('collaborators' in sanitizedAppState && !Array.isArray(sanitizedAppState.collaborators)) {
                delete sanitizedAppState.collaborators;
              }
              return sanitizedAppState;
            })(),
            files: note.excalidrawData?.files ? Object.values(note.excalidrawData.files) : {},
          }}
        />
      </div>
    </div>
  )

  // Render via Portal to document.body to ensure no transformed ancestors
  // This ensures Excalidraw is NOT a descendant of any transformed element
  return createPortal(modalContent, document.body)
}

export default ExcalidrawNoteEditor

