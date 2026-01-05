// File system utilities for Electron (native app only)

export const saveNoteToFile = async (filePath: string, content: string): Promise<{ success: boolean; error?: string }> => {
  console.error('🔵 fileSystem.saveNoteToFile: Called with filePath:', filePath, 'content length:', content.length)
  
  // Check if we're in Electron environment
  if (typeof window === 'undefined') {
    const error = 'Window object not available'
    console.error('🔴 fileSystem.saveNoteToFile: ERROR -', error)
    return { success: false, error }
  }
  
  if (!window.electronAPI) {
    const error = 'Electron API not available. This app requires Electron. Preload script may not have loaded correctly.'
    console.error('🔴🔴🔴 fileSystem.saveNoteToFile: CRITICAL ERROR -', error)
    console.error('🔴 fileSystem.saveNoteToFile: window.electronAPI is:', window.electronAPI)
    console.error('🔴 fileSystem.saveNoteToFile: window object keys:', Object.keys(window))
    return { success: false, error }
  }
  
  if (!window.electronAPI.saveNoteFile) {
    const error = 'saveNoteFile method not available on electronAPI'
    console.error('🔴🔴🔴 fileSystem.saveNoteToFile: CRITICAL ERROR -', error)
    console.error('🔴 fileSystem.saveNoteToFile: electronAPI methods:', Object.keys(window.electronAPI))
    return { success: false, error: error }
  }
  
  console.error('🔵 fileSystem.saveNoteToFile: Calling electronAPI.saveNoteFile...')
  try {
    const result = await window.electronAPI.saveNoteFile(filePath, content)
    console.error('🔵 fileSystem.saveNoteToFile: Result:', JSON.stringify(result))
    
    if (!result.success) {
      console.error('🔴 fileSystem.saveNoteToFile: Save failed with error:', result.error)
    }
    
    return result
  } catch (error: any) {
    const errorMessage = error?.message || String(error)
    console.error('🔴 fileSystem.saveNoteToFile: Exception caught:', errorMessage, error)
    return { success: false, error: errorMessage }
  }
}

export const loadNoteFromFile = async (filePath: string): Promise<{ success: boolean; content?: string; error?: string }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.loadNoteFile(filePath)
}

export const deleteNoteFile = async (filePath: string): Promise<{ success: boolean; error?: string }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.deleteNoteFile(filePath)
}

export const renameNoteFile = async (oldFilePath: string, newFileName: string): Promise<{ success: boolean; newFilePath?: string; error?: string }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.renameNoteFile(oldFilePath, newFileName)
}

export const createNoteFile = async (fileName: string, noteType: 'markdown' | 'excalidraw' = 'markdown'): Promise<{ success: boolean; filePath?: string; error?: string }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.createNoteFile(fileName, noteType)
}

export const createExcalidrawFile = async (fileName: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
  return createNoteFile(fileName, 'excalidraw')
}

export const saveImageFile = async (fileName: string, imageData: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.saveImageFile(fileName, imageData)
}

export const listNoteFiles = async (): Promise<{ success: boolean; files?: any[]; error?: string }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.listNoteFiles()
}

export const showSaveDialog = async (): Promise<{ cancelled?: boolean; filePath?: string }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.saveFileDialog()
}

export const showOpenDialog = async (): Promise<{ cancelled?: boolean; filePath?: string; content?: string; error?: string }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.openFileDialog()
}

export const watchFiles = async (): Promise<{ success: boolean; files?: any[]; error?: string }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.watchFiles()
}

export const stopWatchingFiles = async (): Promise<void> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  await window.electronAPI.stopWatchingFiles()
}

export const onFilesChanged = (callback: (files: any[]) => void): (() => void) => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  window.electronAPI.onFilesChanged(callback)
  return () => {
    window.electronAPI?.removeFilesChangedListener()
  }
}

export const selectVaultFolder = async (): Promise<{ cancelled?: boolean; vaultPath?: string }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.selectVaultFolder()
}

export const getVaultPath = async (): Promise<{ vaultPath: string; isDefault?: boolean }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.getVaultPath()
}

