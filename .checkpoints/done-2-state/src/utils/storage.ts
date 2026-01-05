import { Note } from '../components/Canvas'

// App state management using Electron file system
const checkElectronAPI = () => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
}

interface CanvasState {
  notes?: Note[]
  pan?: { x: number; y: number }
  zoom?: number
}

interface AppState {
  canvases?: { [canvasId: string]: CanvasState }
  canvasList?: string[]
  currentCanvas?: string
}

let appStateCache: AppState | null = null

// Clear state cache (useful when switching vaults)
export const clearStateCache = () => {
  appStateCache = null
}

// Load app state cache on module load
const loadStateCache = async (): Promise<AppState> => {
  checkElectronAPI()
  if (!appStateCache) {
    const result = await window.electronAPI!.loadAppState()
    if (result.success && result.state) {
      appStateCache = result.state as AppState
    } else {
      // No state file exists - start with empty vault
      appStateCache = { canvases: {}, canvasList: ['My Desk'], currentCanvas: 'My Desk' }
    }
    // Ensure structure exists
    if (!appStateCache.canvases) {
      appStateCache.canvases = {}
    }
    if (!appStateCache.canvasList) {
      appStateCache.canvasList = ['My Desk']
    }
    if (!appStateCache.currentCanvas) {
      appStateCache.currentCanvas = 'My Desk'
    }
  }
  return appStateCache
}

// Save app state to file (debounced)
let saveTimeout: ReturnType<typeof setTimeout> | null = null
const debouncedSave = () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = setTimeout(async () => {
    checkElectronAPI()
    if (appStateCache) {
      await window.electronAPI!.saveAppState(appStateCache as any)
    }
  }, 500) // Debounce by 500ms
}

// Force immediate save (for critical operations like page unload)
export const forceSave = async () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  checkElectronAPI()
  if (appStateCache) {
    await window.electronAPI!.saveAppState(appStateCache as any)
  }
}

// Get or create canvas state
const getCanvasState = async (canvasId: string): Promise<CanvasState> => {
  const state = await loadStateCache()
  if (!state.canvases![canvasId]) {
    state.canvases![canvasId] = {}
  }
  return state.canvases![canvasId]
}

export const saveNotes = async (notes: Note[], canvasId: string) => {
  try {
    const canvasState = await getCanvasState(canvasId)
    canvasState.notes = notes
    appStateCache!.canvases![canvasId] = canvasState
    debouncedSave()
  } catch (error) {
    console.error('Failed to save notes:', error)
  }
}

export const loadNotes = async (canvasId: string): Promise<Note[] | null> => {
  try {
    const canvasState = await getCanvasState(canvasId)
    // Return null if notes don't exist or is empty array (new canvas)
    // Only return notes if they actually exist and have content
    if (canvasState.notes && Array.isArray(canvasState.notes) && canvasState.notes.length > 0) {
      return canvasState.notes
    }
    return null
  } catch (error) {
    console.error('Failed to load notes:', error)
    return null
  }
}

export const savePan = async (pan: { x: number; y: number }, canvasId: string) => {
  try {
    const canvasState = await getCanvasState(canvasId)
    canvasState.pan = pan
    appStateCache!.canvases![canvasId] = canvasState
    debouncedSave()
  } catch (error) {
    console.error('Failed to save pan:', error)
  }
}

export const loadPan = async (canvasId: string): Promise<{ x: number; y: number } | null> => {
  try {
    const canvasState = await getCanvasState(canvasId)
    return canvasState.pan || null
  } catch (error) {
    console.error('Failed to load pan:', error)
    return null
  }
}

export const saveZoom = async (zoom: number, canvasId: string) => {
  try {
    const canvasState = await getCanvasState(canvasId)
    canvasState.zoom = zoom
    appStateCache!.canvases![canvasId] = canvasState
    debouncedSave()
  } catch (error) {
    console.error('Failed to save zoom:', error)
  }
}

export const loadZoom = async (canvasId: string): Promise<number | null> => {
  try {
    const canvasState = await getCanvasState(canvasId)
    return canvasState.zoom || null
  } catch (error) {
    console.error('Failed to load zoom:', error)
    return null
  }
}

// Canvas list management
export const saveCanvasList = async (canvasList: string[]) => {
  try {
    const state = await loadStateCache()
    state.canvasList = canvasList
    appStateCache = state
    debouncedSave()
  } catch (error) {
    console.error('Failed to save canvas list:', error)
  }
}

export const loadCanvasList = async (): Promise<string[]> => {
  try {
    const state = await loadStateCache()
    return state.canvasList || ['My Desk']
  } catch (error) {
    console.error('Failed to load canvas list:', error)
    return ['My Desk']
  }
}

export const saveCurrentCanvas = async (canvasId: string) => {
  try {
    const state = await loadStateCache()
    state.currentCanvas = canvasId
    appStateCache = state
    debouncedSave()
  } catch (error) {
    console.error('Failed to save current canvas:', error)
  }
}

export const loadCurrentCanvas = async (): Promise<string> => {
  try {
    const state = await loadStateCache()
    return state.currentCanvas || 'My Desk'
  } catch (error) {
    console.error('Failed to load current canvas:', error)
    return 'My Desk'
  }
}

export const deleteCanvas = async (canvasId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const state = await loadStateCache()
    
    // Don't allow deleting "My Desk"
    if (canvasId === 'My Desk') {
      return { success: false, error: 'Cannot delete "My Desk" canvas' }
    }
    
    // Remove canvas from list
    if (state.canvasList) {
      state.canvasList = state.canvasList.filter(id => id !== canvasId)
    }
    
    // Remove canvas state
    if (state.canvases && state.canvases[canvasId]) {
      delete state.canvases[canvasId]
    }
    
    // If deleted canvas was current, switch to "My Desk"
    if (state.currentCanvas === canvasId) {
      state.currentCanvas = 'My Desk'
    }
    
    appStateCache = state
    // Force immediate save to ensure deletion is persisted
    await forceSave()
    
    return { success: true }
  } catch (error) {
    console.error('Failed to delete canvas:', error)
    return { success: false, error: String(error) }
  }
}

// Clear canvas state (useful when recreating a canvas with the same name)
export const clearCanvasState = async (canvasId: string): Promise<void> => {
  try {
    const state = await loadStateCache()
    if (state.canvases && state.canvases[canvasId]) {
      // Clear all state for this canvas
      state.canvases[canvasId] = {}
      appStateCache = state
      debouncedSave()
    }
  } catch (error) {
    console.error('Failed to clear canvas state:', error)
  }
}

// Remove notes with matching filePath from all canvases
export const removeNoteFromAllCanvases = async (filePath: string): Promise<void> => {
  try {
    const state = await loadStateCache()
    
    // Normalize filePath - extract just the filename (e.g., "Note 1.md")
    let normalizedFilePath = filePath
    if (normalizedFilePath.includes('/')) {
      normalizedFilePath = normalizedFilePath.split('/').pop() || normalizedFilePath
    }
    if (normalizedFilePath.startsWith('/')) {
      normalizedFilePath = normalizedFilePath.slice(1)
    }
    
    console.log('🗑️ Removing note from all canvases - filePath:', filePath, 'normalized:', normalizedFilePath)
    
    // Remove notes with matching filePath from all canvases
    let removedCount = 0
    if (state.canvases) {
      for (const canvasId in state.canvases) {
        const canvasState = state.canvases[canvasId]
        if (canvasState.notes) {
          const beforeCount = canvasState.notes.length
          canvasState.notes = canvasState.notes.filter(note => {
            // Match by filePath (normalized)
            const noteFilePath = note.filePath || ''
            const noteNormalized = noteFilePath.includes('/') 
              ? noteFilePath.split('/').pop() || noteFilePath
              : noteFilePath
            const matches = noteNormalized === normalizedFilePath
            if (matches) {
              console.log(`🗑️ Removing note ${note.id} from canvas "${canvasId}"`)
            }
            return !matches
          })
          const afterCount = canvasState.notes.length
          removedCount += (beforeCount - afterCount)
        }
      }
    }
    
    console.log(`🗑️ Removed ${removedCount} note(s) from all canvases`)
    
    // Save the updated state
    appStateCache = state
    // Force immediate save (don't debounce for deletions)
    checkElectronAPI()
    if (appStateCache) {
      await window.electronAPI!.saveAppState(appStateCache)
    }
  } catch (error) {
    console.error('Failed to remove note from all canvases:', error)
  }
}

// Get all canvases that contain a note with the given filePath
export const getCanvasesForNote = async (filePath: string): Promise<string[]> => {
  try {
    if (!filePath) {
      return []
    }
    
    // Check if Electron API is available before proceeding
    if (!window.electronAPI) {
      console.warn('Electron API not available, returning empty canvas list')
      return []
    }
    
    const state = await loadStateCache()
    
    // Normalize filePath - extract just the filename (e.g., "Note 1.md")
    let normalizedFilePath = filePath
    if (normalizedFilePath.includes('/')) {
      normalizedFilePath = normalizedFilePath.split('/').pop() || normalizedFilePath
    }
    if (normalizedFilePath.startsWith('/')) {
      normalizedFilePath = normalizedFilePath.slice(1)
    }
    
    const canvasesWithNote: string[] = []
    
    if (state.canvases) {
      for (const canvasId in state.canvases) {
        const canvasState = state.canvases[canvasId]
        if (canvasState.notes && Array.isArray(canvasState.notes)) {
          try {
            const hasNote = canvasState.notes.some(note => {
              // Safely access filePath - handle both old and new note formats
              const noteFilePath = (note as any).filePath || ''
              if (!noteFilePath) {
                return false
              }
              // Match by filePath (normalized)
              const noteNormalized = noteFilePath.includes('/') 
                ? noteFilePath.split('/').pop() || noteFilePath
                : noteFilePath
              return noteNormalized === normalizedFilePath
            })
            if (hasNote) {
              canvasesWithNote.push(canvasId)
            }
          } catch (error) {
            // Skip this canvas if there's an error processing notes
            console.error(`Error processing notes for canvas ${canvasId}:`, error)
            continue
          }
        }
      }
    }
    
    return canvasesWithNote
  } catch (error) {
    console.error('Failed to get canvases for note:', error)
    return []
  }
}

