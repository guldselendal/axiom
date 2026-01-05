import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { ExcalidrawData, ExcalidrawNote, ExcalidrawElement, ExcalidrawBinaryFile } from '../types/notes'
// Excalidraw component types - using any to avoid module resolution issues
type ExcalidrawImperativeAPI = any
type AppState = any
type BinaryFiles = any
import { saveNoteToFile, renameNoteFile } from '../utils/fileSystem'
import { getTitleFromFilePath } from '../utils/fileExtensions'
import { ExcalidrawSaveManager } from '../utils/excalidrawSaveManager'
import { hashExcalidrawData } from '../utils/contentHash'

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
  
  // Filename editing state - use utility function for consistent title extraction
  const getFileName = (path?: string) => {
    if (!path) return ''
    return getTitleFromFilePath(path)
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
            type: 'excalidraw',
            version: 2,
            source: 'https://excalidraw.com',
            elements: Array.isArray(elements) ? elements : [],
            appState: appState || {},
            files: files ? Object.fromEntries(
              Object.entries(files).map(([id, file]: [string, any]) => [
                id,
                {
                  id: file.id || id,
                  dataURL: file.dataURL || '',
                  mimeType: file.mimeType || '',
                  created: file.created,
                } as ExcalidrawBinaryFile
              ])
            ) : {},
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
  const isInitialLoadRef = useRef(true)
  // Store onSave in a ref so save manager can access it
  const onSaveRef = useRef(onSave)
  // Use filePath prop, or fallback to note.filePath if prop is not provided
  const effectiveFilePath = filePath || note.filePath
  const filePathRef = useRef(effectiveFilePath)
  // Store excalidrawAPI in a ref so save manager can access the latest API
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null)
  
  // Initialize save manager
  const saveManagerRef = useRef<ExcalidrawSaveManager | null>(null)

  // Update refs when props/state change
  useEffect(() => {
    onSaveRef.current = onSave
    // Always use the most up-to-date filePath (prop or note.filePath)
    const currentFilePath = filePath || note.filePath
    filePathRef.current = currentFilePath
    
    // Update save manager file path
    if (saveManagerRef.current && currentFilePath) {
      saveManagerRef.current.setFilePath(currentFilePath)
    }
    
    console.log('ExcalidrawNoteEditor: Refs updated, filePath:', currentFilePath, 'from prop:', filePath, 'from note:', note.filePath, 'onSave:', typeof onSave)
  }, [onSave, filePath, note.filePath])
  
  // Update excalidrawAPI ref when it changes
  useEffect(() => {
    excalidrawAPIRef.current = excalidrawAPI
    console.log('ExcalidrawNoteEditor: excalidrawAPI ref updated, API available:', !!excalidrawAPI)
  }, [excalidrawAPI])
  
  // Initialize save manager on mount
  useEffect(() => {
    if (!saveManagerRef.current) {
      saveManagerRef.current = new ExcalidrawSaveManager({
        debounceMs: 500,
        onSave: async (data: ExcalidrawData, filePath: string) => {
          const jsonContent = JSON.stringify(data, null, 2)
          const result = await saveNoteToFile(filePath, jsonContent)
          if (result.success) {
            // Call onSave callback to update parent state
            onSaveRef.current(data, filePath)
          }
          return result
        },
        onError: (error: string) => {
          console.error('ExcalidrawSaveManager: Save error:', error)
          // Could show user notification here
        }
      })
    }
    
    // Update file path in save manager
    const currentFilePath = filePath || note.filePath
    if (currentFilePath) {
      saveManagerRef.current.setFilePath(currentFilePath)
      filePathRef.current = currentFilePath
    }
    
    // Initialize hash from loaded note data if available
    if (note.excalidrawData && saveManagerRef.current) {
      // Ensure files is always an object for hashing
      const dataForHash = {
        ...note.excalidrawData,
        files: note.excalidrawData.files || {}
      }
      const hash = hashExcalidrawData(dataForHash)
      saveManagerRef.current.markSaved(hash)
    }
    
    return () => {
      // Flush any pending saves before unmount
      if (saveManagerRef.current) {
        saveManagerRef.current.flushSave()
      }
    }
  }, [filePath, note.filePath, note.excalidrawData])
  
  // Also update refs immediately on mount to ensure they're set
  useEffect(() => {
    if (filePath && !filePathRef.current) {
      filePathRef.current = filePath
      console.log('ExcalidrawNoteEditor: Initial filePath set:', filePath)
    }
    if (onSave && !onSaveRef.current) {
      onSaveRef.current = onSave
      console.log('ExcalidrawNoteEditor: Initial onSave set')
    }
  }, []) // Only run once on mount

  // Get current Excalidraw data from API
  const getCurrentExcalidrawData = useCallback((): ExcalidrawData | null => {
    const currentAPI = excalidrawAPIRef.current
    if (!currentAPI) {
      return null
    }
    
    const elements = currentAPI.getSceneElements()
    const appState = currentAPI.getAppState()
    const files = currentAPI.getFiles()
    
    return {
      type: 'excalidraw',
      version: 2,
      source: 'axiom',
      elements: elements.map((el: any) => ({ ...el })),
      appState: { ...appState },
      files: Object.fromEntries(
        Object.entries(files).map(([id, file]: [string, any]) => [
          id,
          {
            id: file.id || id,
            dataURL: file.dataURL || '',
            mimeType: file.mimeType || '',
            created: file.created,
          } as ExcalidrawBinaryFile
        ])
      ),
    }
  }, [])


  // Handle Excalidraw changes - debounced save via save manager
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
    
    if (!saveManagerRef.current) {
      return
    }
    
    // Get current data from API (most up-to-date)
    const data = getCurrentExcalidrawData()
    if (!data) {
      return
    }
    
    // Schedule debounced save (only saves if data is dirty)
    if (saveManagerRef.current) {
      saveManagerRef.current.scheduleSave(data)
    }

    const excalidrawData: ExcalidrawData = {
      type: 'excalidraw',
      version: 2,
      source: 'https://excalidraw.com',
      elements: elements.map((el: any) => ({ ...el })), // Clone elements
      appState: { ...appState }, // Clone appState
      files: Object.fromEntries(
        Object.entries(files).map(([id, file]: [string, any]) => [
          id,
          {
            id: file.id || id,
            dataURL: file.dataURL || '',
            mimeType: file.mimeType || '',
            created: file.created,
          } as ExcalidrawBinaryFile
        ])
      ),
    }
    
    // Schedule debounced save (only saves if data is dirty)
    if (saveManagerRef.current) {
      saveManagerRef.current.scheduleSave(excalidrawData)
    }
  }, [filePath, note.filePath, note.id])

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
      
      // Mark this data as saved (initialize hash from loaded data)
      if (saveManagerRef.current && note.excalidrawData) {
        const hash = hashExcalidrawData(note.excalidrawData)
        saveManagerRef.current.markSaved(hash)
      }
      
      // Small delay to ensure initial load flag is set
      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 100)
    }
  }, [excalidrawAPI, note.id, note.excalidrawData]) // Include note.excalidrawData to initialize hash

  // Flush pending saves - can be called before closing
  // Use refs to avoid dependency on filePath and onSave
  // Flush pending saves - can be called before closing
  const flushPendingSave = useCallback(async () => {
    if (!saveManagerRef.current) {
      return false
    }
    
    // Get current data and flush
    const data = getCurrentExcalidrawData()
    if (!data) {
      return false
    }
    
    // Flush save manager (cancels debounce and saves immediately)
    return await saveManagerRef.current.flushSave(data)
  }, [getCurrentExcalidrawData])

  // Save triggers: flush on unmount, blur, and beforeunload
  useEffect(() => {
    // Save on window blur (tab switch, app loses focus)
    const handleBlur = () => {
      if (saveManagerRef.current) {
        saveManagerRef.current.flushSave()
      }
    }
    
    // Save on beforeunload (app shutdown)
    const handleBeforeUnload = () => {
      if (saveManagerRef.current && saveManagerRef.current.hasPendingSave()) {
        // Get current data and flush
        const currentAPI = excalidrawAPIRef.current
        if (currentAPI) {
          const elements = currentAPI.getSceneElements()
          const appState = currentAPI.getAppState()
          const files = currentAPI.getFiles()
          
          const data: ExcalidrawData = {
            type: 'excalidraw',
            version: 2,
            source: 'axiom',
            elements: elements.map((el: any) => ({ ...el })),
            appState: { ...appState },
            files: Object.fromEntries(
              Object.entries(files).map(([id, file]: [string, any]) => [
                id,
                {
                  id: file.id || id,
                  dataURL: file.dataURL || '',
                  mimeType: file.mimeType || '',
                  created: file.created,
                } as any
              ])
            ),
          }
          
          saveManagerRef.current.flushSave(data)
        }
        // Don't prevent unload - Electron handles this better
      }
    }
    
    window.addEventListener('blur', handleBlur)
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      
      // Flush save on unmount
      if (saveManagerRef.current) {
        saveManagerRef.current.flushSave()
      }
    }
  }, [])

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
        getDimensions: (width: number, height: number) => ({ width, height, scale: 1 }),
      })
      
      canvas.toBlob((blob: Blob | null) => {
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
      elements: elements.map((el: any) => ({ ...el })),
      appState: { ...appState },
      files: Object.fromEntries(
        Object.entries(files).map(([id, file]: [string, any]) => [
          id,
          {
            id: file.id || id,
            dataURL: file.dataURL || '',
            mimeType: file.mimeType || '',
            created: file.created,
          } as ExcalidrawBinaryFile
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
          onChange={handleExcalidrawChange as any}
          detectScroll={true}
          initialData={{
            elements: (note.excalidrawData?.elements || []) as any,
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
            files: note.excalidrawData?.files ? (Object.values(note.excalidrawData.files).reduce((acc: any, file: ExcalidrawBinaryFile) => {
              acc[file.id] = file;
              return acc;
            }, {}) as any) : ({} as any),
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

