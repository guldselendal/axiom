// Type definitions for Electron API exposed via preload script

declare global {
  interface Window {
    electronAPI?: {
      saveNoteFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
      loadNoteFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
      deleteNoteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
      renameNoteFile: (oldFilePath: string, newFileName: string) => Promise<{ success: boolean; newFilePath?: string; error?: string }>
      createNoteFile: (fileName: string, noteType?: 'markdown' | 'excalidraw') => Promise<{ success: boolean; filePath?: string; error?: string }>
      saveImageFile: (fileName: string, imageData: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
      listNoteFiles: () => Promise<{ success: boolean; files?: Array<{ name: string; path: string; modified: number; size: number }>; error?: string }>
      saveFileDialog: () => Promise<{ cancelled?: boolean; filePath?: string }>
      openFileDialog: () => Promise<{ cancelled?: boolean; filePath?: string; content?: string; error?: string }>
      watchFiles: () => Promise<{ success: boolean; files?: Array<{ name: string; path: string; modified: number; size: number }>; error?: string }>
      stopWatchingFiles: () => Promise<void>
      onFilesChanged: (callback: (event: any, files: Array<{ name: string; path: string; modified: number; size: number }>) => void) => void
      removeFilesChangedListener: () => void
      saveAppState: (state: { notes?: any; pan?: any; zoom?: number }) => Promise<{ success: boolean; error?: string }>
      loadAppState: () => Promise<{ success: boolean; state?: any; error?: string }>
      selectVaultFolder: () => Promise<{ cancelled?: boolean; vaultPath?: string }>
      getVaultPath: () => Promise<{ vaultPath: string; isDefault?: boolean }>
    }
  }
}

export {}

