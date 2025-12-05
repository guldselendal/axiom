import { useState, useEffect, useRef } from 'react'
import HeaderBar from './components/HeaderBar'
import Sidebar, { SidebarHandle } from './components/Sidebar'
import Canvas, { CanvasHandle } from './components/Canvas'
import Toolbar from './components/Toolbar'
import { saveZoom, loadZoom, loadCurrentCanvas, saveCurrentCanvas, loadCanvasList, saveCanvasList, forceSave } from './utils/storage'

function App() {
  // Load zoom from file system on mount
  const [zoom, setZoom] = useState(1)
  const [isZoomLoaded, setIsZoomLoaded] = useState(false)
  const [activeTool, setActiveTool] = useState('hand')
  const [currentCanvas, setCurrentCanvas] = useState<string>('My Desk')
  const [canvases, setCanvases] = useState<string[]>(['My Desk'])
  const canvasRef = useRef<CanvasHandle>(null)
  const sidebarRef = useRef<SidebarHandle>(null)

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
    }
    loadState()
  }, [])

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
    setCurrentCanvas(canvasId)
    await saveCurrentCanvas(canvasId)
    
    // Load zoom for the new canvas
    const savedZoom = await loadZoom(canvasId)
    if (savedZoom !== null) {
      setZoom(savedZoom)
    }
  }


  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <HeaderBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          ref={sidebarRef}
          onOpenFile={(filePath, content) => {
            // Open file in hover editor
            if (canvasRef.current) {
              canvasRef.current.openFile(filePath, content)
            }
          }}
          onFileRename={(oldFilePath, newFilePath, newTitle) => {
            // Update note titles on canvas when file is renamed
            if (canvasRef.current) {
              canvasRef.current.updateNoteTitle(oldFilePath, newFilePath, newTitle)
            }
          }}
          onFileDelete={(filePath) => {
            // Remove note from canvas immediately when file is deleted
            if (canvasRef.current) {
              canvasRef.current.removeNoteByFilePath(filePath)
            }
          }}
          onFileCreated={async (filePath) => {
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
        />
        <div className="flex flex-col flex-1 relative">
          <Canvas 
            ref={canvasRef}
            zoom={zoom} 
            onZoomChange={setZoom} 
            activeTool={activeTool}
            canvasId={currentCanvas}
            onFileCreated={async (filePath) => {
              // Refresh sidebar file list when a new file is created
              // Small delay to ensure file is written to disk
              setTimeout(async () => {
                if (sidebarRef.current) {
                  await sidebarRef.current.refreshFiles()
                }
              }, 100)
            }}
          />
          <Toolbar zoom={zoom} onZoomChange={setZoom} activeTool={activeTool} onToolChange={setActiveTool} />
        </div>
      </div>
    </div>
  )
}

export default App

