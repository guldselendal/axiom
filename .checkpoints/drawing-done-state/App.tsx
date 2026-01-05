import { useState, useEffect, useRef } from 'react'
import HeaderBar from './components/HeaderBar'
import Sidebar, { SidebarHandle } from './components/Sidebar'
import MegaSurface from './components/MegaSurface'
import { Note, MarkdownNote, ExcalidrawNote, isMarkdownNote, isExcalidrawNote, getNoteTypeFromFilePath } from './types/notes'
import { saveZoom, loadZoom, loadCurrentCanvas, saveCurrentCanvas, loadCanvasList, forceSave, loadNotes, saveNotes } from './utils/storage'

function App() {
  // Load zoom from file system on mount
  const [zoom, setZoom] = useState(1)
  const [isZoomLoaded, setIsZoomLoaded] = useState(false)
  const [currentCanvas, setCurrentCanvas] = useState<string>('My Desk')
  const [canvases, setCanvases] = useState<string[]>(['My Desk'])
  const sidebarRef = useRef<SidebarHandle>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [isSidebarHidden, setIsSidebarHidden] = useState(false)
  const [isNotesLoaded, setIsNotesLoaded] = useState(false)

  // Load current canvas, canvas list, and zoom on mount
  useEffect(() => {
    const loadState = async () => {
      const canvasList = await loadCanvasList()
      if (canvasList.length > 0) {
        // Ensure "My Desk" is always first
        const deskIndex = canvasList.indexOf('My Desk')
        if (deskIndex === -1) {
          canvasList.unshift('My Desk')
        } else if (deskIndex > 0) {
          canvasList.splice(deskIndex, 1)
          canvasList.unshift('My Desk')
        }
        setCanvases(canvasList)
      }
      
      const savedCanvas = await loadCurrentCanvas()
      if (savedCanvas) {
        setCurrentCanvas(savedCanvas)
      }
      
      const savedZoom = await loadZoom(savedCanvas || 'My Desk')
      if (savedZoom !== null) {
        setZoom(savedZoom)
      }
      setIsZoomLoaded(true)
      
      // Load notes for initial canvas
      await loadNotesForCanvas(savedCanvas || 'My Desk')
    }
    loadState()
  }, [])

  // Load notes for a canvas (convert from old format to new format)
  const loadNotesForCanvas = async (canvasId: string) => {
    setIsNotesLoaded(false)
    
    const savedNotes = await loadNotes(canvasId)
    
    // Debug logging for "My Desk"
    if (canvasId === 'My Desk') {
      console.log('🔍 Loading notes for "My Desk":', {
        savedNotesCount: savedNotes?.length || 0,
        savedNotes: savedNotes?.map((n: any) => ({
          id: n.id,
          title: n.title,
          filePath: n.filePath,
          hasContent: !!(n.content || n.text),
          contentLength: (n.content || n.text || '').length,
        })),
      })
    }
    
    // Ensure we handle null, undefined, or empty array
    if (savedNotes && Array.isArray(savedNotes) && savedNotes.length > 0) {
      // Convert from old format (x, y) to new format (worldX, worldY)
      // Also refresh content from files
      const { loadNoteFromFile } = await import('./utils/fileSystem')
      const convertedNotes = await Promise.all(
        savedNotes.map(async (oldNote: any) => {
          const filePath = oldNote.filePath
          const noteType = filePath ? getNoteTypeFromFilePath(filePath) : 'markdown'
          
          // Refresh content from file if filePath exists (but not for canvas cards)
          // But also preserve the saved content as fallback
          const savedContent = oldNote.content || oldNote.text || ''
          
          // Debug logging for "My Desk" notes
          if (canvasId === 'My Desk') {
            console.log('🔍 Processing note for "My Desk":', {
              id: oldNote.id,
              filePath,
              savedContentLength: savedContent.length,
              hasSavedContent: savedContent.length > 0,
            })
          }
          
          if (filePath && !oldNote.canvasId) {
            try {
              const result = await loadNoteFromFile(filePath)
              if (result.success && result.content !== undefined) {
                if (noteType === 'excalidraw') {
                  // Parse Excalidraw JSON
                  try {
                    const excalidrawData = JSON.parse(result.content)
                    const note: ExcalidrawNote = {
                      id: oldNote.id,
                      type: 'excalidraw',
                      worldX: oldNote.worldX ?? oldNote.x ?? 0,
                      worldY: oldNote.worldY ?? oldNote.y ?? 0,
                      width: oldNote.width || 200,
                      height: oldNote.height || 150,
                      title: oldNote.title || (filePath.endsWith('.excalidraw') ? filePath.split('/').pop()?.slice(0, -11) : filePath.split('/').pop()),
                      color: oldNote.color || '#ffffff',
                      filePath: filePath,
                      excalidrawData: excalidrawData,
                    }
                    return note
                  } catch (parseError) {
                    console.error('Error parsing Excalidraw file:', parseError)
                    // Fall through to create default
                  }
                } else {
                  // Markdown note - use file content if available and non-empty, otherwise use saved content
                  // IMPORTANT: If file content is empty, prefer saved content (which might have links)
                  const fileContent = result.content || ''
                  const content = fileContent.trim().length > 0 ? fileContent : savedContent
                  const lines = content.split('\n')
                  const note: MarkdownNote = {
                    id: oldNote.id,
                    type: 'markdown',
                    worldX: oldNote.worldX ?? oldNote.x ?? 0,
                    worldY: oldNote.worldY ?? oldNote.y ?? 0,
                    width: oldNote.width || 200,
                    height: oldNote.height || 150,
                    content: content,
                    title: oldNote.title || (lines[0] || '').trim() || (filePath.endsWith('.md') ? filePath.split('/').pop()?.slice(0, -3) : filePath.split('/').pop()),
                    color: oldNote.color || '#ffffff',
                    filePath: filePath,
                    canvasId: oldNote.canvasId,
                  }
                  
                  // Debug logging for "My Desk"
                  if (canvasId === 'My Desk') {
                    console.log('✅ Loaded note from file for "My Desk":', {
                      id: note.id,
                      contentLength: note.content.length,
                      fileContentLength: fileContent.length,
                      savedContentLength: savedContent.length,
                      usingFileContent: fileContent.trim().length > 0,
                      title: note.title,
                    })
                  }
                  
                  return note
                }
              } else {
                // File loading failed or returned no content - use saved content
                if (canvasId === 'My Desk') {
                  console.log('⚠️ File loading failed for "My Desk" note, using saved content:', {
                    id: oldNote.id,
                    filePath,
                    savedContentLength: savedContent.length,
                    resultSuccess: result?.success,
                  })
                }
              }
            } catch (error) {
              console.error('Error loading note content:', error)
              // Fall through to use saved content
              if (canvasId === 'My Desk') {
                console.log('⚠️ Exception loading file for "My Desk" note, using saved content:', {
                  id: oldNote.id,
                  filePath,
                  savedContentLength: savedContent.length,
                  error: error,
                })
              }
            }
          }
          
          // Fallback: create note from old format (assume markdown for backward compatibility)
          // Use saved content if available
          const note: MarkdownNote = {
            id: oldNote.id,
            type: 'markdown',
            worldX: oldNote.worldX ?? oldNote.x ?? 0,
            worldY: oldNote.worldY ?? oldNote.y ?? 0,
            width: oldNote.width || 200,
            height: oldNote.height || 150,
            content: savedContent,
            title: oldNote.title,
            color: oldNote.color || '#ffffff',
            filePath: oldNote.filePath,
            canvasId: oldNote.canvasId,
          }
          
          // Debug logging for "My Desk"
          if (canvasId === 'My Desk') {
            console.log('⚠️ Using fallback content for "My Desk" note:', {
              id: note.id,
              contentLength: note.content.length,
              hasContent: note.content.length > 0,
              filePath: note.filePath,
            })
          }
          
          return note
        })
      )
      setNotes(convertedNotes)
    } else {
      // Canvas has no saved notes - start from scratch (empty)
      setNotes([])
    }
    setIsNotesLoaded(true)
  }

  // Handle canvas list update from Sidebar
  const handleCanvasListUpdate = (newCanvases: string[]) => {
    // Ensure "My Desk" is always first
    const deskIndex = newCanvases.indexOf('My Desk')
    if (deskIndex === -1) {
      newCanvases.unshift('My Desk')
    } else if (deskIndex > 0) {
      newCanvases.splice(deskIndex, 1)
      newCanvases.unshift('My Desk')
    }
    setCanvases(newCanvases)
  }

  // Save zoom to file system whenever it changes
  useEffect(() => {
    if (isZoomLoaded) {
      saveZoom(zoom, currentCanvas)
    }
  }, [zoom, isZoomLoaded, currentCanvas])

  // Save notes whenever they change
  useEffect(() => {
    if (isNotesLoaded && notes.length >= 0) {
      // Convert from new format (worldX, worldY) to old format (x, y) for storage
      const notesToSave = notes.map(note => {
        const { worldX, worldY, ...rest } = note;
        return {
          ...rest,
          x: worldX,
          y: worldY,
        };
      });
      saveNotes(notesToSave as any, currentCanvas);
    }
  }, [notes, isNotesLoaded, currentCanvas]);

  // Save state before page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = async () => {
      await forceSave()
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  // Handle canvas change
  const handleCanvasChange = async (canvasId: string) => {
    // Save current canvas state before switching
    if (isNotesLoaded && currentCanvas !== canvasId) {
      const notesToSave = notes.map(note => {
        const { worldX, worldY, ...rest } = note;
        return {
          ...rest,
          x: worldX,
          y: worldY,
        };
      });
      await saveNotes(notesToSave as any, currentCanvas);
    }
    
    // Immediately clear notes to ensure clean state
    setNotes([])
    setIsNotesLoaded(false)
    
    // Switch to new canvas
    setCurrentCanvas(canvasId)
    await saveCurrentCanvas(canvasId)
    
    // Load zoom for the new canvas
    const savedZoom = await loadZoom(canvasId)
    if (savedZoom !== null) {
      setZoom(savedZoom)
    } else {
      // New canvas - start with default zoom
      setZoom(1)
    }
    
    // Load notes for the new canvas (will start empty if no saved notes)
    await loadNotesForCanvas(canvasId)
  }


  return (
    <div className="flex flex-col h-screen bg-gray-50">
    <HeaderBar />
    <div className="flex flex-1 overflow-hidden relative">
      {/* Sidebar Toggle Button - Always visible */}
      <button
        onClick={() => setIsSidebarHidden(!isSidebarHidden)}
        className={`absolute top-1/2 -translate-y-1/2 z-50 bg-white border border-gray-200 rounded-r-lg shadow-md p-2 hover:bg-gray-50 transition-all duration-300 ${
          isSidebarHidden 
            ? 'left-0' 
            : 'left-64'
        }`}
        title={isSidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
      >
        <svg 
          className={`w-4 h-4 text-gray-600 transition-transform duration-300 ${isSidebarHidden ? '' : 'rotate-180'}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <Sidebar
        ref={sidebarRef}
        isHidden={isSidebarHidden}
        onToggleHide={() => setIsSidebarHidden(!isSidebarHidden)}
        onOpenFile={(_filePath, _content) => {
          // MegaSurface handles file operations
        }}
        onFileRename={(oldFilePath, newFilePath, newTitle) => {
          // Update note titles on canvas when file is renamed from sidebar
          setNotes(prevNotes => prevNotes.map(note => {
            // Normalize paths for comparison
            const noteFilePath = note.filePath?.split('/').pop() || note.filePath;
            const oldFilePathNormalized = oldFilePath.split('/').pop() || oldFilePath;
            
            if (noteFilePath === oldFilePathNormalized) {
              return {
                ...note,
                filePath: newFilePath,
                title: newTitle,
              };
            }
            return note;
          }));
        }}
        onFileDelete={(filePath) => {
          // Remove note from canvas when file is deleted from sidebar
          setNotes(prevNotes => {
            // Normalize filePath - handle both full paths and just filenames
            const normalizedFilePath = filePath.includes('/') 
              ? filePath.split('/').pop() || filePath
              : filePath;
            
            return prevNotes.filter(note => {
              if (!note.filePath) return true;
              
              // Normalize note's filePath for comparison
              const noteFilePath = note.filePath.includes('/')
                ? note.filePath.split('/').pop() || note.filePath
                : note.filePath;
              
              return noteFilePath !== normalizedFilePath;
            });
          });
        }}
        onFileCreated={async (_filePath) => {
          // Refresh sidebar file list when a new file is created
          // Small delay to ensure file is written to disk
          setTimeout(async () => {
            if (sidebarRef.current) {
              await sidebarRef.current.refreshFiles()
            }
          }, 100)
        }}
        currentCanvas={currentCanvas}
        onCanvasChange={handleCanvasChange}
        canvases={canvases}
        onCanvasListUpdate={handleCanvasListUpdate}
        canvasNotes={notes}
      />
      <div className="flex flex-col flex-1 relative">
        <MegaSurface 
          canvasId={currentCanvas}
          notes={notes}
          onNotesChange={setNotes}
          onCanvasChange={handleCanvasChange}
          canvases={canvases}
          zoom={zoom}
          onZoomChange={setZoom}
          onFileCreated={async (_filePath) => {
            // Refresh sidebar file list when a new file is created
            setTimeout(async () => {
              if (sidebarRef.current) {
                await sidebarRef.current.refreshFiles();
              }
            }, 100);
          }}
          onFileRename={(oldFilePath, newFilePath, newTitle) => {
            // Update note titles on canvas when file is renamed
            setNotes(prevNotes => prevNotes.map(note => {
              // Normalize paths for comparison
              const noteFilePath = note.filePath?.split('/').pop() || note.filePath;
              const oldFilePathNormalized = oldFilePath.split('/').pop() || oldFilePath;
              
              if (noteFilePath === oldFilePathNormalized) {
                return {
                  ...note,
                  filePath: newFilePath,
                  title: newTitle,
                };
              }
              return note;
            }));
            
            // Refresh sidebar to show updated file name
            setTimeout(async () => {
              if (sidebarRef.current) {
                await sidebarRef.current.refreshFiles();
              }
            }, 100);
          }}
          onFileDelete={(filePath) => {
            // Remove note from canvas when file is deleted from canvas context menu
            setNotes(prevNotes => {
              // Normalize filePath - handle both full paths and just filenames
              const normalizedFilePath = filePath.includes('/') 
                ? filePath.split('/').pop() || filePath
                : filePath;
              
              return prevNotes.filter(note => {
                if (!note.filePath) return true;
                
                // Normalize note's filePath for comparison
                const noteFilePath = note.filePath.includes('/')
                  ? note.filePath.split('/').pop() || note.filePath
                  : note.filePath;
                
                return noteFilePath !== normalizedFilePath;
              });
            });
            
            // Refresh sidebar to reflect file deletion
            setTimeout(async () => {
              if (sidebarRef.current) {
                await sidebarRef.current.refreshFiles();
              }
            }, 100);
          }}
        />
      </div>
    </div>
  </div>

  )
}

export default App

