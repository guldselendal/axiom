const { contextBridge, ipcRenderer } = require('electron');
// Log preload script execution for debugging
console.log('[PRELOAD] Preload script loading...');
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
console.log('[PRELOAD] Exposing electronAPI to window...');
contextBridge.exposeInMainWorld('electronAPI', {
    // File operations
    saveNoteFile: (filePath, content) => ipcRenderer.invoke('save-note-file', filePath, content),
    loadNoteFile: (filePath) => ipcRenderer.invoke('load-note-file', filePath),
    deleteNoteFile: (filePath) => ipcRenderer.invoke('delete-note-file', filePath),
    renameNoteFile: (oldFilePath, newFileName) => ipcRenderer.invoke('rename-note-file', oldFilePath, newFileName),
    createNoteFile: (fileName, noteType) => ipcRenderer.invoke('create-note-file', fileName, noteType || 'markdown'),
    saveImageFile: (fileName, imageData) => ipcRenderer.invoke('save-image-file', fileName, imageData),
    listNoteFiles: () => ipcRenderer.invoke('list-note-files'),
    saveFileDialog: () => ipcRenderer.invoke('save-file-dialog'),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    watchFiles: () => ipcRenderer.invoke('watch-files'),
    stopWatchingFiles: () => ipcRenderer.invoke('stop-watching-files'),
    onFilesChanged: (callback) => {
        ipcRenderer.on('files-changed', (_event, files) => callback(files));
    },
    removeFilesChangedListener: () => {
        ipcRenderer.removeAllListeners('files-changed');
    },
    // App state operations
    saveAppState: (state) => ipcRenderer.invoke('save-app-state', state),
    loadAppState: () => ipcRenderer.invoke('load-app-state'),
    // Vault operations
    selectVaultFolder: () => ipcRenderer.invoke('select-vault-folder'),
    getVaultPath: () => ipcRenderer.invoke('get-vault-path'),
});
console.log('[PRELOAD] electronAPI exposed successfully');
