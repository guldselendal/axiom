import { useState, useEffect, useRef } from 'react'
import HeaderBar from './components/HeaderBar'
import Sidebar, { SidebarHandle } from './components/Sidebar'
import MegaSurface, { Note } from './components/MegaSurface'
import { MarkdownNote } from './types/notes'
import { saveZoom, loadZoom, loadCurrentCanvas, saveCurrentCanvas, loadCanvasList, forceSave, loadNotes, saveNotes, saveCanvasList } from './utils/storage'

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
    
    // Ensure we handle null, undefined, or empty array
    if (savedNotes && Array.isArray(savedNotes) && savedNotes.length > 0) {
      // Convert from old format (x, y) to new format (worldX, worldY)
      // Also refresh content from files
      const { loadNoteFromFile } = await import('./utils/fileSystem')
      const convertedNotes = await Promise.all(
        savedNotes.map(async (oldNote: any) => {
          // Determine note type from filePath or default to markdown
          const noteType = oldNote.filePath?.endsWith('.excalidraw') ? 'excalidraw' : 'markdown'
          
          let note: Note = {
            id: oldNote.id,
            type: noteType,
            worldX: oldNote.worldX ?? oldNote.x ?? 0,  // Use worldX if exists, else x
            worldY: oldNote.worldY ?? oldNote.y ?? 0,  // Use worldY if exists, else y
            width: oldNote.width || 200,
            height: oldNote.height || 150,
            title: oldNote.title,
            color: oldNote.color || '#ffffff',
            filePath: oldNote.filePath,
            canvasId: oldNote.canvasId, // Preserve canvasId for canvas cards
            ...(noteType === 'markdown' ? { content: oldNote.content || oldNote.text || '' } : {}),
            ...(noteType === 'excalidraw' && oldNote.excalidrawData ? { excalidrawData: oldNote.excalidrawData } : {}),
          } as Note
          
          // Refresh content from file if filePath exists (but not for canvas cards)
          if (note.filePath && !note.canvasId) {
            try {
              const result = await loadNoteFromFile(note.filePath)
              if (result.success && result.content !== undefined) {
                // Check if it's an Excalidraw file
                if (note.filePath.endsWith('.excalidraw')) {
                  try {
                    const excalidrawData = JSON.parse(result.content)
                    note = {
                      ...note,
                      type: 'excalidraw',
                      excalidrawData,
                      title: note.title || (note.filePath.endsWith('.excalidraw') ? note.filePath.split('/').pop()?.slice(0, -11) : note.filePath.split('/').pop()),
                    }
                  } catch (parseError) {
                    console.error('Error parsing Excalidraw file:', parseError)
                  }
                } else {
                  // Markdown file
                  const lines = result.content.split('\n')
                  note = {
                    ...note,
                    type: 'markdown',
                    content: result.content,
                    title: (lines[0] || '').trim() || (note.filePath.endsWith('.md') ? note.filePath.split('/').pop()?.slice(0, -3) : note.filePath.split('/').pop())
                  }
                }
              }
            } catch (error) {
              console.error('Error loading note content:', error)
            }
          } else if (!note.type) {
            // Default to markdown if no type specified (backward compatibility)
            const baseNote = note as any
            note = { 
              id: baseNote.id,
              type: 'markdown' as const, 
              worldX: baseNote.worldX,
              worldY: baseNote.worldY,
              width: baseNote.width,
              height: baseNote.height,
              content: baseNote.content || '',
              title: baseNote.title,
              color: baseNote.color,
              filePath: baseNote.filePath,
              canvasId: baseNote.canvasId,
            } as MarkdownNote
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

  // Save canvas list whenever it changes
  useEffect(() => {
    if (canvases.length > 0) {
      saveCanvasList(canvases)
    }
  }, [canvases])

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
        onCreateNoteOnCanvas={async (filePath, noteType) => {
          // Trigger note creation in MegaSurface
          if ((window as any).__createNoteOnCanvas) {
            (window as any).__createNoteOnCanvas(filePath, noteType);
          }
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
          onCreateNoteOnCanvas={async (filePath, noteType) => {
            // Trigger note creation in MegaSurface
            console.log('App: onCreateNoteOnCanvas called with:', filePath, noteType);
            if ((window as any).__createNoteOnCanvas) {
              console.log('App: Calling __createNoteOnCanvas');
              (window as any).__createNoteOnCanvas(filePath, noteType);
            } else {
              console.error('App: __createNoteOnCanvas is not available!');
            }
          }}
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

