import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { loadNoteFromFile, watchFiles, onFilesChanged, selectVaultFolder, getVaultPath, renameNoteFile, createNoteFile, deleteNoteFile } from '../utils/fileSystem'
import { saveCanvasList, saveCurrentCanvas, removeNoteFromAllCanvases, deleteCanvas, clearStateCache, clearCanvasState } from '../utils/storage'
import { getTitleFromFilePath, stripFileExtension } from '../utils/fileExtensions'
import WarningModal from './WarningModal'

interface FileItem {
  name: string
  path: string
  modified: number
  size: number
}

interface SidebarProps {
  onOpenFile?: (filePath: string, content: string) => void
  onFileRename?: (oldFilePath: string, newFilePath: string, newTitle: string) => void
  onFileDelete?: (filePath: string) => void
  onFileCreated?: (filePath: string) => void
  onCreateNoteOnCanvas?: (filePath: string, noteType: 'markdown' | 'excalidraw') => void // Callback to create note on canvas and open editor
  currentCanvas: string
  onCanvasChange: (canvasId: string) => void
  canvases: string[]
  onCanvasListUpdate: (canvases: string[]) => void
  isHidden?: boolean
  onToggleHide?: () => void
  canvasNotes?: Array<{ filePath?: string }> // Notes currently on the canvas
}

export interface SidebarHandle {
  refreshFiles: () => Promise<void>
}

const Sidebar = forwardRef<SidebarHandle, SidebarProps>(({ onOpenFile, onFileRename, onFileDelete, onCreateNoteOnCanvas, currentCanvas, onCanvasChange, canvases, onCanvasListUpdate, isHidden = false, onToggleHide: _onToggleHide, canvasNotes = [] }, ref) => {
  // Removed search tab - only home tab remains
  const [files, setFiles] = useState<FileItem[]>([])
  const [fileTitles, setFileTitles] = useState<Map<string, string>>(new Map()) // Map file path to title (first line)
  const [vaultPath, setVaultPath] = useState<string>('')
  const [showVaultMenu, setShowVaultMenu] = useState(false)
  const [showDeskMenu, setShowDeskMenu] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [contextMenuFile, setContextMenuFile] = useState<FileItem | null>(null)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [renamingFile, setRenamingFile] = useState<string | null>(null)
  const [newFileName, setNewFileName] = useState('')
  const [isAddingCanvas, setIsAddingCanvas] = useState(false)
  const [newCanvasName, setNewCanvasName] = useState('')
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const newCanvasInputRef = useRef<HTMLInputElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const isSubmittingRef = useRef(false)

  // Load vault path on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await getVaultPath()
        setVaultPath(result.vaultPath)
      } catch (error) {
        console.error('Error loading data:', error)
      }
    }
    loadData()
  }, [])

  const handleSelectVault = async () => {
    try {
      const result = await selectVaultFolder()
      if (!result.cancelled && result.vaultPath) {
        // Clear state cache so new vault's state will be loaded fresh
        clearStateCache()
        setVaultPath(result.vaultPath)
        // Reload the window to apply new vault and load its state
        window.location.reload()
      }
    } catch (error) {
      console.error('Error selecting vault:', error)
    }
    setShowVaultMenu(false)
  }

  // Load titles for files
  const loadFileTitles = useCallback(async (fileList: FileItem[]) => {
    setFileTitles(prevTitles => {
      // Start with existing titles to preserve manually set ones
      const titlesMap = new Map(prevTitles)
      
      // Load titles for files that don't have a title yet or need updating
      fileList.forEach(file => {
        // Only update if we don't already have a title for this path
        // This preserves manually set titles (like after rename)
        if (!titlesMap.has(file.path)) {
          if (file.name.endsWith('.excalidraw.md') || file.name.endsWith('.excalidraw')) {
            // For Excalidraw files, use filename without extension
            const title = getTitleFromFilePath(file.name)
            titlesMap.set(file.path, title)
          } else {
            // For markdown files, use filename without extension as default
            // (will be updated by async load below if needed)
            const fallbackTitle = file.name.endsWith('.md') ? file.name.slice(0, -3) : file.name
            titlesMap.set(file.path, fallbackTitle)
          }
        }
      })
      
      return titlesMap
    })
    
    // Load markdown file titles asynchronously (for first line content)
    const titlesMap = new Map<string, string>()
    await Promise.all(fileList.map(async (file) => {
      try {
        if (file.name.endsWith('.excalidraw.md') || file.name.endsWith('.excalidraw')) {
          // For Excalidraw files, use filename without extension
          const title = getTitleFromFilePath(file.name)
          titlesMap.set(file.path, title)
        } else {
          // Markdown files - try to load first line
          const result = await loadNoteFromFile(file.path)
          if (result.success && result.content) {
            const firstLine = result.content.split('\n')[0] || ''
            const title = firstLine.trim() || (file.name.endsWith('.md') ? file.name.slice(0, -3) : file.name)
            titlesMap.set(file.path, title)
          } else {
            // Fallback to filename if file is empty or can't be loaded
            const fallbackTitle = file.name.endsWith('.md') ? file.name.slice(0, -3) : file.name
            titlesMap.set(file.path, fallbackTitle)
          }
        }
      } catch (error) {
        // Fallback to filename on error
        const fallbackTitle = getTitleFromFilePath(file.name)
        titlesMap.set(file.path, fallbackTitle)
      }
    }))
    
    // Merge new titles, but preserve existing ones (manually set titles)
    // Exception: Always update Excalidraw file titles from filename (they should always match filename)
    setFileTitles(prevTitles => {
      const merged = new Map(prevTitles)
      titlesMap.forEach((title, path) => {
        // Find the file to check its type
        const file = fileList.find(f => f.path === path)
        const isExcalidraw = file && (file.name.endsWith('.excalidraw.md') || file.name.endsWith('.excalidraw'))
        
        // Always update Excalidraw file titles to match filename (they don't have titles in content)
        // For other files, only update if we don't already have a manually set title
        if (isExcalidraw || !prevTitles.has(path)) {
          merged.set(path, title)
        }
      })
      return merged
    })
  }, [])

  // Load and watch files
  useEffect(() => {
    const loadFiles = async () => {
      const result = await watchFiles()
      if (result.success && result.files) {
        setFiles(result.files)
        // Load titles for all files
        await loadFileTitles(result.files)
      }
    }

    loadFiles()

    // Set up file change listener
    const cleanup = onFilesChanged(async (newFiles) => {
      setFiles(newFiles)
      // Reload titles when files change (loadFileTitles will preserve manually set titles)
      await loadFileTitles(newFiles)
    })
    
    return cleanup
  }, [loadFileTitles])
  
  // Function to refresh files
  const refreshFiles = useCallback(async () => {
    console.log('📄 Sidebar: Refreshing file list')
    const result = await watchFiles()
    if (result.success && result.files) {
      setFiles(result.files)
      await loadFileTitles(result.files)
    }
  }, [loadFileTitles])
  
  // Expose refreshFiles via ref
  useImperativeHandle(ref, () => ({
    refreshFiles
  }), [refreshFiles])

  // Close add menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false)
      }
    }

    if (showAddMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showAddMenu])

  const handleFileDoubleClick = async (file: FileItem) => {
    // Determine note type from file extension
    // Check .excalidraw.md first (longer extension), then .excalidraw
    const noteType = (file.name.endsWith('.excalidraw.md') || file.name.endsWith('.excalidraw')) ? 'excalidraw' : 'markdown'
    
    // Use onCreateNoteOnCanvas to open file as hover editor (without adding to canvas)
    if (onCreateNoteOnCanvas) {
      onCreateNoteOnCanvas(file.path, noteType)
    } else if ((window as any).__createNoteOnCanvas) {
      // Use global function exposed by MegaSurface
      (window as any).__createNoteOnCanvas(file.path, noteType)
    } else if (onOpenFile) {
      // Fallback to old behavior if neither is available
      const result = await loadNoteFromFile(file.path)
      if (result.success) {
        onOpenFile(file.path, result.content || '')
      } else {
        console.error('Failed to load file:', result.error)
      }
    }
  }

  const handleFileContextMenu = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenuFile(file)
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  const handleRename = async (file: FileItem) => {
    setContextMenuFile(null)
    setRenamingFile(file.path)
    // Extract filename without extension using utility function
    const fileNameWithoutExt = stripFileExtension(file.name)
    setNewFileName(fileNameWithoutExt)
    setTimeout(() => renameInputRef.current?.focus(), 0)
  }

  const handleDelete = async (file: FileItem) => {
    setContextMenuFile(null)
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete "${file.name}"? This action cannot be undone.`)) {
      return
    }

    const result = await deleteNoteFile(file.path)
    if (result.success) {
      // Remove file from list
      setFiles(prevFiles => prevFiles.filter(f => f.path !== file.path))
      
      // Remove note from all canvases in storage
      await removeNoteFromAllCanvases(file.path)
      
      // Notify Canvas to remove note immediately (if callback provided)
      if (onFileDelete) {
        onFileDelete(file.path)
      }
    } else {
      setWarningMessage(result.error || 'Failed to delete file')
    }
  }

  const handleAddCanvasSubmit = async () => {
    const trimmedName = newCanvasName.trim()
    
    // Validate name
    if (!trimmedName) {
      setIsAddingCanvas(false)
      setNewCanvasName('')
      return
    }

    // Check for duplicate names
    if (canvases.includes(trimmedName)) {
      setWarningMessage(`A canvas with the name "${trimmedName}" already exists. Please choose a different name.`)
      setIsAddingCanvas(false)
      setNewCanvasName('')
      return
    }

    // Create new canvas
    const newCanvases = [...canvases, trimmedName]
    onCanvasListUpdate(newCanvases)
    saveCanvasList(newCanvases)
    
    // Clear any existing state for this canvas name (in case it was previously deleted)
    // This ensures we start with a fresh canvas, not the old one's state
    await clearCanvasState(trimmedName)
    
    // Initialize new canvas with empty state (no notes, default zoom/pan)
    // This is handled by loadNotesForCanvas returning null for new canvases
    
    // Switch to the new canvas
    onCanvasChange(trimmedName)
    saveCurrentCanvas(trimmedName)
    
    // Reset state
    setIsAddingCanvas(false)
    setNewCanvasName('')
    setShowDeskMenu(false)
  }

  const handleRenameSubmit = async () => {
    if (!renamingFile || isSubmittingRef.current) {
      return
    }

    isSubmittingRef.current = true

    try {
      const trimmedName = newFileName.trim()
      
      // If empty, just cancel
      if (!trimmedName) {
        setRenamingFile(null)
        setNewFileName('')
        isSubmittingRef.current = false
        return
      }

      // Get original filename without extension for comparison
      const originalFile = files.find(f => f.path === renamingFile)
      if (originalFile) {
        // Extract original filename without extension using utility function
        const originalNameWithoutExt = stripFileExtension(originalFile.name)
        
        // If name hasn't changed, just cancel and return to normal
        if (trimmedName === originalNameWithoutExt) {
          setRenamingFile(null)
          setNewFileName('')
          isSubmittingRef.current = false
          return
        }
        
        // Check for duplicate names (excluding the current file)
        // Also check if the new name matches a file with a different extension
        const duplicateFile = files.find(f => {
          // Skip the current file being renamed
          if (f.path === renamingFile) return false
          
          // Extract name without extension for comparison using utility function
          const otherNameWithoutExt = stripFileExtension(f.name)
          
          // Check if names match (case-insensitive)
          return otherNameWithoutExt.toLowerCase() === trimmedName.toLowerCase()
        })
        
        if (duplicateFile) {
          setWarningMessage(`A file with the name "${trimmedName}" already exists. Please choose a different name.`)
          isSubmittingRef.current = false
          return
        }
      }

      // Perform rename
      // Capture the old file path before we clear the state
      const oldFilePath = renamingFile
      const result = await renameNoteFile(oldFilePath, trimmedName)
      
      if (result.success && result.newFilePath) {
        // Determine the original file extension to preserve it
        const originalFile = files.find(f => f.path === renamingFile)
        // Check for Excalidraw files (backward compatible with .excalidraw.md)
        const isExcalidraw = (originalFile?.name.endsWith('.excalidraw.md') || originalFile?.name.endsWith('.excalidraw')) ?? false
        // Only markdown if it's .md but NOT .excalidraw.md
        const isMarkdown = (originalFile?.name.endsWith('.md') && !originalFile?.name.endsWith('.excalidraw.md')) ?? false
        
        // Get the new file name with extension (preserve original extension)
        // New files use .excalidraw, but keep .excalidraw.md for backward compatibility
        const newFileNameWithExt = isExcalidraw
          ? (originalFile?.name.endsWith('.excalidraw.md') ? trimmedName + '.excalidraw.md' : trimmedName + '.excalidraw')
          : isMarkdown
          ? (trimmedName.endsWith('.md') ? trimmedName : trimmedName + '.md')
          : trimmedName
        const newTitle = trimmedName // Title is filename without extension
        
        // Immediately update the local state to show new name
        // Update the file with new name and path
        setFiles(prevFiles => prevFiles.map(f => 
          f.path === oldFilePath 
            ? { ...f, name: newFileNameWithExt, path: result.newFilePath! }
            : f
        ))
        
        // Immediately update fileTitles map with the new title
        setFileTitles(prevTitles => {
          const newTitles = new Map(prevTitles)
          newTitles.delete(oldFilePath) // Remove old path
          newTitles.set(result.newFilePath!, newTitle) // Set new path with new title
          return newTitles
        })
        
        // Notify Canvas to update note titles
        if (onFileRename) {
          onFileRename(oldFilePath, result.newFilePath, newTitle)
        }
        
        // Return to normal appearance - clear renaming state
        // This ensures the input disappears and shows the button with new name
        setRenamingFile(null)
        setNewFileName('')
        
        // The file watcher will update the list with the correct file metadata
        // but our immediate update ensures the UI shows the new name right away
      } else {
        console.error('Rename failed:', result.error)
        setWarningMessage(result.error || 'Failed to rename file')
        // Keep the input open so user can try again
      }
    } finally {
      isSubmittingRef.current = false
    }
  }

  // Focus new canvas input when adding canvas
  useEffect(() => {
    if (isAddingCanvas && newCanvasInputRef.current) {
      newCanvasInputRef.current.focus()
    }
  }, [isAddingCanvas])

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(event.target as Node)
      ) {
        setContextMenuFile(null)
      }
    }

    if (contextMenuFile) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [contextMenuFile])

  return (
    <div className={`relative bg-white border-r border-gray-200 flex flex-col h-full overflow-y-auto transition-all duration-300 ease-in-out ${
      isHidden ? 'w-0 overflow-hidden' : 'w-64'
    }`}>
      {/* Sidebar Content */}
      <div className={`flex flex-col h-full overflow-y-auto ${isHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      {/* Navigation Tabs */}

      <div className="flex-1 p-4 flex flex-col min-h-0">
        {/* My Desk Dropdown */}
        <div className="relative mb-6">
          <button 
            onClick={() => setShowDeskMenu(!showDeskMenu)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium">{currentCanvas}</span>
            <span className="ml-auto text-xs text-gray-400">⌘⇧D</span>
            <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showDeskMenu && (
            <>
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                <div className="py-1">
                  {/* Canvas List */}
                  {/* Ensure current canvas is always in the list */}
                  {(() => {
                    // Create a set of canvases that includes the current canvas if it's not already there
                    const canvasesToShow = [...canvases];
                    if (currentCanvas && !canvasesToShow.includes(currentCanvas)) {
                      canvasesToShow.unshift(currentCanvas); // Add current canvas at the beginning
                    }
                    return canvasesToShow;
                  })().map((canvas, index) => (
                    <div
                      key={index}
                      className={`group flex items-center ${
                        canvas === currentCanvas
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <button
                        draggable={true}
                        onDragStart={(e) => {
                          console.log('Drag start for canvas:', canvas);
                          // Set both custom MIME type and text/plain as fallback
                          e.dataTransfer.setData('application/canvas-id', canvas);
                          e.dataTransfer.setData('text/plain', `canvas:${canvas}`);
                          e.dataTransfer.effectAllowed = 'copy';
                          console.log('Set drag data - canvas-id:', e.dataTransfer.getData('application/canvas-id'), 'text/plain:', e.dataTransfer.getData('text/plain'));
                          // Prevent click from firing when dragging
                          e.stopPropagation();
                          // Don't close dropdown during drag - let it close on dragEnd
                        }}
                        onDragEnd={(_e) => {
                          console.log('Drag end for canvas:', canvas);
                          // Close dropdown after drag completes
                          setShowDeskMenu(false);
                        }}
                        onClick={(e) => {
                          // Only handle click if it wasn't a drag
                          if (e.defaultPrevented) return;
                          setShowDeskMenu(false)
                          onCanvasChange(canvas)
                          saveCurrentCanvas(canvas)
                        }}
                        className={`flex-1 px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                          canvas === currentCanvas
                            ? 'font-medium'
                            : ''
                        }`}
                      >
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>{canvas}</span>
                      </button>
                      {canvas !== 'My Desk' && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            
                            if (!confirm(`Are you sure you want to delete "${canvas}"? This will remove all notes on this canvas. This action cannot be undone.`)) {
                              return
                            }
                            
                            const result = await deleteCanvas(canvas)
                            if (result.success) {
                              // Update canvas list
                              const newCanvases = canvases.filter(c => c !== canvas)
                              onCanvasListUpdate(newCanvases)
                              
                              // If we deleted the current canvas, switch to "My Desk"
                              if (canvas === currentCanvas) {
                                onCanvasChange('My Desk')
                                await saveCurrentCanvas('My Desk')
                              }
                              
                              setShowDeskMenu(false)
                            } else {
                              setWarningMessage(result.error || 'Failed to delete canvas')
                            }
                          }}
                          className="px-2 py-2 text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete canvas"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  
                  {/* Divider */}
                  <div className="border-t border-gray-200 my-1"></div>
                  
                  {/* Add Canvas Button or Input */}
                  {isAddingCanvas ? (
                    <div className="px-4 py-2">
                      <input
                        ref={newCanvasInputRef}
                        type="text"
                        value={newCanvasName}
                        onChange={(e) => setNewCanvasName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddCanvasSubmit()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setIsAddingCanvas(false)
                            setNewCanvasName('')
                          }
                        }}
                        onBlur={() => {
                          // Small delay to allow Enter key handler to fire first
                          setTimeout(() => {
                            if (newCanvasName.trim()) {
                              handleAddCanvasSubmit()
                            } else {
                              setIsAddingCanvas(false)
                              setNewCanvasName('')
                            }
                          }, 150)
                        }}
                        placeholder="Canvas name..."
                        className="w-full px-3 py-1.5 text-sm border border-primary-500 rounded outline-none focus:ring-2 focus:ring-primary-500"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setIsAddingCanvas(true)
                        setNewCanvasName('')
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-primary-600 hover:bg-primary-50 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Add Canvas</span>
                    </button>
                  )}
                </div>
              </div>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowDeskMenu(false)}
                onDragOver={(e) => {
                  // Allow drag to pass through overlay to canvas
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  // Prevent drop on overlay, let it reach canvas
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            </>
          )}
        </div>

        {/* Files Section - Extended to bottom */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3 mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Files</h3>
            <div className="relative">
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Add new file"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              
              {/* Add Menu Dropdown */}
              {showAddMenu && (
                <div
                  ref={addMenuRef}
                  className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px]"
                >
                  <button
                    onClick={async () => {
                      setShowAddMenu(false)
                      console.log('➕ Sidebar: Add Note clicked, creating markdown file...')
                      
                      // Find the next available note number
                      // Check both .md and .excalidraw files (backward compatible with .excalidraw.md)
                      const getNextAvailableNoteNumber = () => {
                        const noteNumbers = new Set<number>()
                        files.forEach(file => {
                          // Match Note X.md, Note X.excalidraw.md (backward compat), or Note X.excalidraw
                          // Check longer extensions first (.excalidraw.md before .excalidraw)
                          const match = file.name.match(/^Note (\d+)\.(excalidraw\.md|excalidraw|md)$/)
                          if (match) {
                            noteNumbers.add(parseInt(match[1], 10))
                          }
                        })
                        
                        let nextNumber = 1
                        while (noteNumbers.has(nextNumber)) {
                          nextNumber++
                        }
                        return nextNumber
                      }
                      
                      const noteNumber = getNextAvailableNoteNumber()
                      const fileName = `Note ${noteNumber}`
                      const result = await createNoteFile(fileName, 'markdown')
                      
                      if (result.success && result.filePath) {
                        await new Promise(resolve => setTimeout(resolve, 100))
                        const newFile: FileItem = {
                          name: result.filePath,
                          path: result.filePath,
                          modified: Date.now(),
                          size: 0
                        }
                        setFiles(prevFiles => {
                          const exists = prevFiles.some(f => f.path === result.filePath)
                          if (exists) return prevFiles
                          return [...prevFiles, newFile]
                        })
                        
                        // Create note on canvas and open editor
                        if (onCreateNoteOnCanvas) {
                          onCreateNoteOnCanvas(result.filePath, 'markdown')
                        } else if (onOpenFile) {
                          const loadResult = await loadNoteFromFile(result.filePath)
                          if (loadResult.success) {
                            onOpenFile(result.filePath, loadResult.content || '')
                          }
                        }
                      }
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Add Note
                  </button>
                  <button
                    onClick={async () => {
                      setShowAddMenu(false)
                      console.log('➕ Sidebar: Add Drawing clicked, creating Excalidraw file...')
                      
                      // Find the next available note number
                      // Check both .md and .excalidraw files (backward compatible with .excalidraw.md)
                      const getNextAvailableNoteNumber = () => {
                        const noteNumbers = new Set<number>()
                        files.forEach(file => {
                          // Match Note X.md, Note X.excalidraw.md (backward compat), or Note X.excalidraw
                          // Check longer extensions first (.excalidraw.md before .excalidraw)
                          const match = file.name.match(/^Note (\d+)\.(excalidraw\.md|excalidraw|md)$/)
                          if (match) {
                            noteNumbers.add(parseInt(match[1], 10))
                          }
                        })
                        
                        let nextNumber = 1
                        while (noteNumbers.has(nextNumber)) {
                          nextNumber++
                        }
                        return nextNumber
                      }
                      
                      const noteNumber = getNextAvailableNoteNumber()
                      const fileName = `Note ${noteNumber}`
                      console.log('Sidebar: Creating Excalidraw file:', fileName)
                      const result = await createNoteFile(fileName, 'excalidraw')
                      console.log('Sidebar: Create result:', result)
                      
                      if (result.success && result.filePath) {
                        // Wait a bit longer for file to be fully written
                        await new Promise(resolve => setTimeout(resolve, 300))
                        const newFile: FileItem = {
                          name: result.filePath,
                          path: result.filePath,
                          modified: Date.now(),
                          size: 0
                        }
                        setFiles(prevFiles => {
                          const exists = prevFiles.some(f => f.path === result.filePath)
                          if (exists) return prevFiles
                          return [...prevFiles, newFile]
                        })
                        
                        // Create note on canvas and open Excalidraw editor
                        // Use the file path returned from createNoteFile (should be .excalidraw)
                        const finalFilePath = result.filePath;
                        console.log('Sidebar: Calling onCreateNoteOnCanvas with:', finalFilePath, 'excalidraw')
                        if (onCreateNoteOnCanvas) {
                          // Add a small delay to ensure file is readable
                          await new Promise(resolve => setTimeout(resolve, 100))
                          onCreateNoteOnCanvas(finalFilePath, 'excalidraw')
                        } else {
                          console.error('Sidebar: onCreateNoteOnCanvas is not defined!')
                        }
                      } else {
                        console.error('Sidebar: Failed to create Excalidraw file:', result.error)
                      }
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Add Drawing
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1 flex-1 overflow-y-auto">
            {files.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">
                No files found
              </div>
            ) : (
              [...files].sort((a, b) => {
                // Sort alphabetically by file name (case-insensitive)
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                return nameA.localeCompare(nameB);
              }).map((file) => {
                // Check if this file is being renamed
                const isRenaming = renamingFile === file.path
                
                // Check if this file is on the canvas
                const isOnCanvas = canvasNotes.some(note => {
                  if (!note.filePath) return false
                  // Normalize paths for comparison
                  const noteFilePath = note.filePath.split('/').pop() || note.filePath
                  const filePath = file.path.split('/').pop() || file.path
                  return noteFilePath === filePath
                })
                
                return (
                  <div key={`${file.path}-${file.name}`} className="relative">
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            e.stopPropagation()
                            // Directly trigger rename on Enter
                            // handleRenameSubmit will set isSubmittingRef to prevent blur handler
                            await handleRenameSubmit()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            e.stopPropagation()
                            isSubmittingRef.current = false
                            setRenamingFile(null)
                            setNewFileName('')
                          }
                        }}
                        onBlur={async () => {
                          // Only trigger on blur if we're not already submitting
                          if (isSubmittingRef.current) {
                            return
                          }
                          // Use a small delay to check if we're still renaming
                          await new Promise(resolve => setTimeout(resolve, 150))
                          // If still in rename mode and not submitting, submit
                          if (renamingFile && !isSubmittingRef.current) {
                            await handleRenameSubmit()
                          }
                        }}
                        className="w-full px-3 py-2 rounded-lg text-sm border border-primary-500 outline-none focus:ring-2 focus:ring-primary-500"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    ) : (
                    <button
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', file.path)
                        e.dataTransfer.effectAllowed = 'copy'
                        // Add visual feedback
                        e.currentTarget.style.opacity = '0.5'
                      }}
                      onDragEnd={(e) => {
                        e.currentTarget.style.opacity = '1'
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleFileDoubleClick(file)
                      }}
                      onContextMenu={(e) => handleFileContextMenu(e, file)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-move ${
                        isOnCanvas 
                          ? 'bg-gray-100 text-gray-900' 
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {(file.name.endsWith('.excalidraw.md') || file.name.endsWith('.excalidraw')) ? (
                        <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                      <span className="text-sm flex-1 break-words">
                        {fileTitles.get(file.path) || getTitleFromFilePath(file.name)}
                      </span>
                    </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>

      {/* Vault Section */}
      <div className="p-4 border-t border-gray-200">
        <div className="px-3 mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Vault</h3>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowVaultMenu(!showVaultMenu)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-left"
            title={vaultPath || 'No vault selected'}
          >
            <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="text-sm truncate flex-1">
              {vaultPath ? vaultPath.split('/').pop() || vaultPath : 'Select Vault'}
            </span>
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showVaultMenu && (
            <>
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="p-2">
                  <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-200 mb-2">
                    Current Vault:
                  </div>
                  <div className="px-3 py-2 text-xs text-gray-700 font-mono break-all mb-2 max-h-20 overflow-y-auto">
                    {vaultPath || 'No vault selected'}
                  </div>
                  <button
                    onClick={handleSelectVault}
                    className="w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 rounded transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    {vaultPath ? 'Change Vault Folder...' : 'Select Vault Folder...'}
                  </button>
                </div>
              </div>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowVaultMenu(false)}
              />
            </>
          )}
        </div>
      </div>

      {/* Recently Deleted */}
      <div className="p-4 border-t border-gray-200">
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span className="text-sm">Recently Deleted</span>
        </button>
      </div>

      </div>

      {/* File Context Menu - Outside content wrapper so it's always accessible */}
      {contextMenuFile && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white rounded-lg shadow-xl border border-gray-300 py-1 z-[1000] min-w-[180px]"
          style={{
            left: `${contextMenuPos.x}px`,
            top: `${contextMenuPos.y}px`,
          }}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onMouseDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
        >
          <button
            onClick={() => handleRename(contextMenuFile)}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Rename
          </button>
          <button
            onClick={() => handleDelete(contextMenuFile)}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}

      {/* Warning Modal - Outside content wrapper so it's always accessible */}
      {warningMessage && (
        <WarningModal
          message={warningMessage}
          onClose={() => setWarningMessage(null)}
        />
      )}
    </div>
  )
})

Sidebar.displayName = 'Sidebar'

export default Sidebar


