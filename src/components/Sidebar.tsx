import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { loadNoteFromFile, watchFiles, onFilesChanged, selectVaultFolder, getVaultPath, renameNoteFile, createNoteFile, deleteNoteFile } from '../utils/fileSystem'
import { saveCanvasList, saveCurrentCanvas, removeNoteFromAllCanvases } from '../utils/storage'
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
  currentCanvas: string
  onCanvasChange: (canvasId: string) => void
  canvases: string[]
  onCanvasListUpdate: (canvases: string[]) => void
}

export interface SidebarHandle {
  refreshFiles: () => Promise<void>
}

const Sidebar = forwardRef<SidebarHandle, SidebarProps>(({ onOpenFile, onFileRename, onFileDelete, currentCanvas, onCanvasChange, canvases, onCanvasListUpdate }, ref) => {
  const [activeTab, setActiveTab] = useState<'home' | 'search'>('home')
  const [files, setFiles] = useState<FileItem[]>([])
  const [fileTitles, setFileTitles] = useState<Map<string, string>>(new Map()) // Map file path to title (first line)
  const [vaultPath, setVaultPath] = useState<string>('')
  const [showVaultMenu, setShowVaultMenu] = useState(false)
  const [showDeskMenu, setShowDeskMenu] = useState(false)
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
        setVaultPath(result.vaultPath)
        // Reload the window to apply new vault
        window.location.reload()
      }
    } catch (error) {
      console.error('Error selecting vault:', error)
    }
    setShowVaultMenu(false)
  }

  // Load titles for files
  const loadFileTitles = useCallback(async (fileList: FileItem[]) => {
    const titlesMap = new Map<string, string>()
    await Promise.all(fileList.map(async (file) => {
      try {
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
      } catch (error) {
        // Fallback to filename on error
        const fallbackTitle = file.name.endsWith('.md') ? file.name.slice(0, -3) : file.name
        titlesMap.set(file.path, fallbackTitle)
      }
    }))
    setFileTitles(titlesMap)
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
      // Reload titles when files change
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

  const handleFileDoubleClick = async (file: FileItem) => {
    if (onOpenFile) {
      const result = await loadNoteFromFile(file.path)
      if (result.success) {
        // Allow opening even if content is empty (for new files)
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
    // Extract filename without extension
    const fileNameWithoutExt = file.name.endsWith('.md') ? file.name.slice(0, -3) : file.name
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

  const handleAddCanvasSubmit = () => {
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
        const originalNameWithoutExt = originalFile.name.endsWith('.md') 
          ? originalFile.name.slice(0, -3) 
          : originalFile.name
        
        // If name hasn't changed, just cancel and return to normal
        if (trimmedName === originalNameWithoutExt) {
          setRenamingFile(null)
          setNewFileName('')
          isSubmittingRef.current = false
          return
        }
        
        // Check for duplicate names (excluding the current file)
        const duplicateFile = files.find(f => {
          if (f.path === renamingFile) return false // Skip current file
          const otherNameWithoutExt = f.name.endsWith('.md') 
            ? f.name.slice(0, -3) 
            : f.name
          return otherNameWithoutExt === trimmedName
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
        // Get the new file name with extension
        const newFileNameWithExt = trimmedName.endsWith('.md') ? trimmedName : trimmedName + '.md'
        const newTitle = trimmedName // Title is filename without extension
        
        // Immediately update the local state to show new name
        // Update the file with new name and path
        setFiles(prevFiles => prevFiles.map(f => 
          f.path === oldFilePath 
            ? { ...f, name: newFileNameWithExt, path: result.newFilePath! }
            : f
        ))
        
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
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full overflow-y-auto">
      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
            activeTab === 'home'
              ? 'text-gray-900 border-b-2 border-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Home
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
            activeTab === 'search'
              ? 'text-gray-900 border-b-2 border-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Search
        </button>
      </div>

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
                  {canvases.map((canvas, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setShowDeskMenu(false)
                        onCanvasChange(canvas)
                        saveCurrentCanvas(canvas)
                      }}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                        canvas === currentCanvas
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span>{canvas}</span>
                    </button>
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
              />
            </>
          )}
        </div>

        {/* Files Section - Extended to bottom */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3 mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Files</h3>
            <button
              onClick={async () => {
                console.log('➕ Sidebar: + button clicked, creating new file...')
                
                // Find the next available note number
                const getNextAvailableNoteNumber = () => {
                  // Extract all note numbers from existing files
                  const noteNumbers = new Set<number>()
                  files.forEach(file => {
                    const match = file.name.match(/^Note (\d+)\.md$/)
                    if (match) {
                      noteNumbers.add(parseInt(match[1], 10))
                    }
                  })
                  
                  // Find the first available number starting from 1
                  let nextNumber = 1
                  while (noteNumbers.has(nextNumber)) {
                    nextNumber++
                  }
                  
                  return nextNumber
                }
                
                const noteNumber = getNextAvailableNoteNumber()
                const fileName = `Note ${noteNumber}`
                console.log('➕ Sidebar: File name will be:', fileName, '(checked existing files:', files.map(f => f.name).join(', '), ')')
                const result = await createNoteFile(fileName)
                console.log('➕ Sidebar: createNoteFile result:', result)
                if (result.success && result.filePath) {
                  // Manually add file to list immediately (file watcher will update it later with full metadata)
                  // Use a small delay to ensure file is fully written
                  await new Promise(resolve => setTimeout(resolve, 100))
                  const newFile: FileItem = {
                    name: result.filePath,
                    path: result.filePath,
                    modified: Date.now(),
                    size: 0
                  }
                  setFiles(prevFiles => {
                    // Check if file already exists (from file watcher)
                    const exists = prevFiles.some(f => f.path === result.filePath)
                    if (exists) {
                      return prevFiles
                    }
                    return [...prevFiles, newFile]
                  })
                  
                  // Open the new file in hover editor
                  if (onOpenFile) {
                    console.log('➕ Sidebar: onOpenFile callback exists, loading file content...')
                    // Load the file content (will be empty for new files)
                    const loadResult = await loadNoteFromFile(result.filePath)
                    console.log('➕ Sidebar: loadNoteFromFile result:', loadResult)
                    if (loadResult.success) {
                      console.log('➕ Sidebar: Calling onOpenFile with filePath:', result.filePath, 'content length:', (loadResult.content || '').length)
                      onOpenFile(result.filePath, loadResult.content || '')
                    } else {
                      console.error('➕ Sidebar: Failed to load file:', loadResult.error)
                    }
                  } else {
                    console.error('➕ Sidebar: onOpenFile callback is not defined!')
                  }
                }
              }}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title="Add new file"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <div className="space-y-1 flex-1 overflow-y-auto">
            {files.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">
                No files found
              </div>
            ) : (
              files.map((file) => {
                // Check if this file is being renamed
                const isRenaming = renamingFile === file.path
                
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
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors text-gray-700 hover:bg-gray-50 cursor-move"
                    >
                      <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm truncate flex-1">
                        {fileTitles.get(file.path) || (file.name.endsWith('.md') ? file.name.slice(0, -3) : file.name)}
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

      {/* File Context Menu */}
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

Sidebar.displayName = 'Sidebar'

export default Sidebar


