// File system utilities for Electron (native app only)

export const saveNoteToFile = async (filePath: string, content: string): Promise<{ success: boolean; error?: string }> => {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. This app requires Electron.')
  }
  return await window.electronAPI.saveNoteFile(filePath, content)
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

