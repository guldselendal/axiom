import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI, ExcalidrawElement, AppState, BinaryFiles } from '@excalidraw/excalidraw/types/types'
import { ExcalidrawData, ExcalidrawNote } from '../types/notes'
import { saveNoteToFile, renameNoteFile } from '../utils/fileSystem'

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
  
  // Filename editing state
  const getFileName = (path?: string) => {
    if (!path) return ''
    const fileName = path.split('/').pop() || path
    return fileName.endsWith('.excalidraw') ? fileName.slice(0, -11) : fileName
  }
  const [fileName, setFileName] = useState(getFileName(filePath))
  const [isEditingFileName, setIsEditingFileName] = useState(false)
  const fileNameInputRef = useRef<HTMLInputElement>(null)

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
  
  // Update fileName when filePath changes
  useEffect(() => {
    setFileName(getFileName(filePath))
  }, [filePath])
  
  // Update displayed title when note.title changes (e.g., after rename)
  useEffect(() => {
    // If not editing filename, update fileName from note.title or filePath
    if (!isEditingFileName) {
      if (note.title) {
        setFileName(note.title)
      } else if (filePath) {
        setFileName(getFileName(filePath))
      }
    }
  }, [note.title, filePath, isEditingFileName])
  
  // Focus filename input when editing starts
  useEffect(() => {
    if (isEditingFileName && fileNameInputRef.current) {
      fileNameInputRef.current.focus()
      fileNameInputRef.current.select()
    }
  }, [isEditingFileName])
  
  // Handle filename rename
  const handleFileNameRename = async (newFileName: string) => {
    if (!filePath || !newFileName.trim()) return
    
    const trimmedName = newFileName.trim()
    const originalFileName = getFileName(filePath)
    
    // If name hasn't changed, just exit edit mode
    if (trimmedName === originalFileName) {
      setIsEditingFileName(false)
      return
    }
    
    try {
      // Rename the file
      const result = await renameNoteFile(filePath, trimmedName)
      if (result.success && result.newFilePath) {
        // Get current Excalidraw data before saving
        if (excalidrawAPI) {
          const elements = excalidrawAPI.getSceneElements()
          const appState = excalidrawAPI.getAppState()
          const files = excalidrawAPI.getFiles()
          
          const excalidrawData: ExcalidrawData = {
            elements,
            appState,
            files,
          }
          
          // Call onSave with new file path
          onSave(excalidrawData, result.newFilePath)
        } else {
          // If no API yet, just update the file path
          onSave(note.excalidrawData || { elements: [], appState: {}, files: {} }, result.newFilePath)
        }
        
        setIsEditingFileName(false)
      } else {
        alert(result.error || 'Failed to rename file')
        setFileName(originalFileName) // Reset to original name
      }
    } catch (error) {
      console.error('Error renaming file:', error)
      alert('Failed to rename file')
      setFileName(originalFileName) // Reset to original name
    }
  }
  const pendingSaveRef = useRef<ExcalidrawData | null>(null)
  const isInitialLoadRef = useRef(true)
  const isSavingRef = useRef(false)

  // Immediate save function (no debounce)
  const immediateSave = useCallback(async (data: ExcalidrawData) => {
    if (!filePath) {
      console.warn('ExcalidrawNoteEditor: Cannot save, no filePath')
      return
    }
    
    // Prevent multiple simultaneous saves
    if (isSavingRef.current) {
      // Store the latest data to save after current save completes
      pendingSaveRef.current = data
      return
    }
    
    isSavingRef.current = true
    const dataToSave = data
    
    try {
      console.log('ExcalidrawNoteEditor: Immediate save, elements count:', dataToSave.elements?.length)
      const jsonContent = JSON.stringify(dataToSave, null, 2)
      const result = await saveNoteToFile(filePath, jsonContent)
      if (result.success) {
        console.log('ExcalidrawNoteEditor: Immediate save successful')
        // Only call onSave if save was successful
        onSave(dataToSave, filePath)
      } else {
        console.error('Failed to save Excalidraw note:', result.error)
        // Don't call onSave if save failed
      }
    } catch (error) {
      console.error('Error during save:', error)
      // Don't call onSave if there was an error
    } finally {
      isSavingRef.current = false
      
      // Check if there's newer pending data that arrived during save
      // Use setTimeout to avoid recursive calls that could cause stack overflow
      if (pendingSaveRef.current && pendingSaveRef.current !== dataToSave) {
        const nextData = pendingSaveRef.current
        pendingSaveRef.current = null
        // Use setTimeout to avoid recursion issues
        setTimeout(() => {
          immediateSave(nextData)
        }, 0)
      } else {
        // Clear pending save if it's the same data we just saved
        pendingSaveRef.current = null
      }
    }
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
    
    // Save immediately on every change
    immediateSave(excalidrawData)
  }, [immediateSave])

  // Track which note we've loaded to prevent reloading on every change
  const loadedNoteIdRef = useRef<string | null>(null)
  const hasLoadedInitialDataRef = useRef(false)

  // Load initial data - only once per note
  useEffect(() => {
    if (excalidrawAPI && note.excalidrawData && (loadedNoteIdRef.current !== note.id || !hasLoadedInitialDataRef.current)) {
      isInitialLoadRef.current = true
      loadedNoteIdRef.current = note.id
      hasLoadedInitialDataRef.current = true
      
      // Sanitize appState to ensure collaborators is an array if it exists
      const appState = { ...note.excalidrawData.appState };
      if ('collaborators' in appState && !Array.isArray(appState.collaborators)) {
        delete appState.collaborators;
      }
      
      // Preserve current viewport position and zoom if scene is already loaded
      const currentAppState = excalidrawAPI.getAppState()
      const preservedAppState = {
        ...appState,
        scrollX: currentAppState.scrollX ?? appState.scrollX,
        scrollY: currentAppState.scrollY ?? appState.scrollY,
        zoom: currentAppState.zoom ?? appState.zoom,
      }
      
      excalidrawAPI.updateScene({
        elements: note.excalidrawData.elements || [],
        appState: preservedAppState,
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
  }, [excalidrawAPI, note.id]) // Only depend on note.id, not note.excalidrawData to prevent resets

  // Flush pending saves - can be called before closing
  const flushPendingSave = useCallback(async () => {
    if (!filePath) {
      console.warn('flushPendingSave: No filePath, cannot save')
      return false
    }
    
    // Wait for any ongoing save to complete
    let waitCount = 0
    while (isSavingRef.current && waitCount < 50) {
      await new Promise(resolve => setTimeout(resolve, 100))
      waitCount++
    }
    
    if (isSavingRef.current) {
      console.warn('flushPendingSave: Save operation timed out, proceeding anyway')
    }
    
    // Always get current state from Excalidraw API if available
    // This ensures we save the absolute latest state, not just what was pending
    let dataToSave: ExcalidrawData | null = null
    
    if (excalidrawAPI) {
      const elements = excalidrawAPI.getSceneElements()
      const appState = excalidrawAPI.getAppState()
      const files = excalidrawAPI.getFiles()
      
      dataToSave = {
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
    } else if (pendingSaveRef.current) {
      // Fallback to pending save if API not available
      dataToSave = pendingSaveRef.current
    } else {
      console.warn('flushPendingSave: No excalidrawAPI and no pending save')
      return false
    }
    
    if (dataToSave) {
      console.log('flushPendingSave: Saving, elements count:', dataToSave.elements?.length)
      const jsonContent = JSON.stringify(dataToSave, null, 2)
      const result = await saveNoteToFile(filePath, jsonContent)
      if (result.success) {
        // Call onSave to update the note on canvas with latest data
        onSave(dataToSave, filePath)
        pendingSaveRef.current = null
        console.log('flushPendingSave: Save successful')
        return true // Indicate save was successful
      } else {
        console.error('Failed to flush pending save:', result.error)
        return false
      }
    }
    
    return false
  }, [excalidrawAPI, filePath, onSave])

  // Flush pending saves on unmount or note switch
  useEffect(() => {
    return () => {
      // On unmount, try to get current state and save it
      if (excalidrawAPI) {
        const elements = excalidrawAPI.getSceneElements()
        const appState = excalidrawAPI.getAppState()
        const files = excalidrawAPI.getFiles()
        
        const excalidrawData: ExcalidrawData = {
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
        
        if (filePath) {
          const jsonContent = JSON.stringify(excalidrawData, null, 2)
          saveNoteToFile(filePath, jsonContent).then(result => {
            if (result.success) {
              onSave(excalidrawData, filePath)
            }
          })
        }
      } else if (pendingSaveRef.current && filePath) {
        // Fallback to pending save if API not available
        const jsonContent = JSON.stringify(pendingSaveRef.current, null, 2)
        saveNoteToFile(filePath, jsonContent).then(result => {
          if (result.success) {
            onSave(pendingSaveRef.current!, filePath)
          }
        })
      }
    }
  }, [excalidrawAPI, filePath, onSave])

  // Handle dragging
  const handleHeaderMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    // Don't start dragging if clicking on the title, filename input, or buttons
    const target = e.target as HTMLElement
    if (target.closest('input') || target.closest('span[title]') || target.closest('button') || target.closest('svg')) {
      return
    }
    
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
      data-excalidraw-editor="true"
      // Only stop propagation for header dragging
      // Excalidraw needs to receive pointer events normally
      // Since we're in a portal, events won't reach the canvas naturally
    >
      {/* Header */}
      <div
        ref={headerRef}
        className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white header-drag-area"
        onMouseDown={handleHeaderMouseDown}
        onPointerDown={handleHeaderMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <svg className="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          {isEditingFileName && filePath ? (
            <input
              ref={fileNameInputRef}
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onBlur={() => handleFileNameRename(fileName)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleFileNameRename(fileName)
                } else if (e.key === 'Escape') {
                  setFileName(getFileName(filePath))
                  setIsEditingFileName(false)
                }
              }}
              className="flex-1 font-medium text-gray-900 bg-transparent border border-gray-300 rounded px-2 py-1 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 min-w-0"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span 
              className="font-medium text-gray-900 cursor-pointer hover:text-primary-600 truncate"
              onClick={(e) => {
                e.stopPropagation()
                if (filePath) {
                  setIsEditingFileName(true)
                }
              }}
              onMouseDown={(e) => {
                // Don't start dragging if clicking on the title
                if (e.target === e.currentTarget || (e.target as HTMLElement).closest('span')) {
                  e.stopPropagation()
                }
              }}
              title={filePath ? 'Click to rename' : note.title || 'Excalidraw Drawing'}
            >
              {note.title || 'Excalidraw Drawing'}
            </span>
          )}
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
          <button
            onClick={async (e) => {
              // Immediately save the current state
              const saved = await flushPendingSave()
              if (saved) {
                // Show visual feedback that save was successful
                const button = e.currentTarget
                if (button) {
                  const originalTitle = button.title || 'Save'
                  button.title = 'Saved!'
                  setTimeout(() => {
                    if (button) {
                      button.title = originalTitle
                    }
                  }, 1000)
                }
              } else {
                alert('Failed to save. Please try again.')
              }
            }}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Save"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
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
            onClick={async () => {
              // Flush any pending saves before closing to ensure latest state is saved
              await flushPendingSave()
              onClose()
            }}
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
        // Don't stop propagation here - Excalidraw needs these events
        // The data-excalidraw-editor attribute and portal ensure canvas won't receive them
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

