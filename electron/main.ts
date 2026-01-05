const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { readFile, writeFile, mkdir, readdir, stat, unlink, rename } = require('fs/promises')
const { promises: fsPromises } = require('fs')
const { join, dirname, basename, extname } = require('path')
const { existsSync, watch } = require('fs')
const { pathToFileURL, format } = require('url')

const isDev = process.env.NODE_ENV === 'development'

// Safe logging function that catches EPIPE and other write errors
// Uses process.stdout.write with error handling to avoid EPIPE crashes
const safeLog = (...args: any[]) => {
  try {
    // Use process.stdout.write instead of console.log to have better control
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ') + '\n'
    
    if (process.stdout.writable && !process.stdout.destroyed) {
      process.stdout.write(message, (err) => {
        // Silently ignore write errors
      })
    }
  } catch (error: any) {
    // Completely ignore all errors including EPIPE, ENOTCONN, etc.
  }
}

const safeError = (...args: any[]) => {
  try {
    // Use process.stderr.write instead of console.error to have better control
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ') + '\n'
    
    if (process.stderr.writable && !process.stderr.destroyed) {
      process.stderr.write(message, (err) => {
        // Silently ignore write errors
      })
    }
  } catch (error: any) {
    // Completely ignore all errors including EPIPE, ENOTCONN, etc.
  }
}

let mainWindow: InstanceType<typeof BrowserWindow> | null = null
let fileWatcher: any = null

function createWindow() {
  // Get preload script path
  const preloadPath = join(__dirname, 'preload.cjs')
  safeLog('main.ts: Preload script path:', preloadPath, 'exists:', existsSync(preloadPath))
  
  if (!existsSync(preloadPath)) {
    safeError('main.ts: CRITICAL - Preload script not found at:', preloadPath)
    safeError('main.ts: __dirname is:', __dirname)
    safeError('main.ts: This will cause Electron API to be unavailable!')
  }
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    // Removed icon to avoid potential issues
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'default', // Use default title bar so window is draggable
  })
  
  // Log when window is ready to verify preload loaded
  mainWindow.webContents.once('did-finish-load', () => {
    safeLog('main.ts: Window finished loading, preload should be active')
    const url = mainWindow.webContents.getURL()
    safeLog('main.ts: Current URL:', url)
  })
  
  // Log any load failures
  mainWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    safeError('main.ts: Failed to load:', validatedURL)
    safeError('main.ts: Error code:', errorCode, 'Description:', errorDescription)
  })

  // Load the app
  if (isDev) {
    // Try to load from Vite dev server (try common ports)
    const tryLoadVite = async (port: number) => {
      try {
        const http = require('http')
        return new Promise((resolve, reject) => {
          const req = http.get(`http://localhost:${port}`, (res: any) => {
            resolve(port)
          })
          req.on('error', () => reject())
          req.setTimeout(1000, () => {
            req.destroy()
            reject()
          })
        })
      } catch {
        return Promise.reject()
      }
    }

    // Try ports 5173, 5174, 5175, etc.
    const tryPorts = async () => {
      for (let port = 5173; port <= 5180; port++) {
        try {
          await tryLoadVite(port)
          // Add cache-busting timestamp to force fresh load
          const timestamp = Date.now()
          mainWindow.loadURL(`http://localhost:${port}?v=${timestamp}`)
          // Clear cache before loading
          mainWindow.webContents.session.clearCache()
          return
        } catch {
          // Try next port
        }
      }
      // If no port works, show error
      safeError('Could not find Vite dev server on ports 5173-5180')
    }
    
    tryPorts()
  } else {
    // In production, load from asar archive
    // loadFile automatically handles asar archives
    const appPath = app.getAppPath()
    const rendererDir = join(appPath, 'dist', 'renderer')
    const indexPath = join(rendererDir, 'index.html')
    
    safeLog('main.ts: Production mode')
    safeLog('main.ts: app.getAppPath():', appPath)
    safeLog('main.ts: rendererDir:', rendererDir)
    safeLog('main.ts: Loading index.html from:', indexPath)
    
    // Add event listeners before loading to catch any errors
    mainWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      safeError('main.ts: Failed to load file:', validatedURL)
      safeError('main.ts: Error code:', errorCode, 'Description:', errorDescription)
    })
    
    mainWindow.webContents.once('did-finish-load', () => {
      const url = mainWindow.webContents.getURL()
      safeLog('main.ts: Successfully loaded URL:', url)
    })
    
    // loadFile handles asar archives automatically and sets correct base URL for relative paths
    mainWindow.loadFile(indexPath).catch((error: any) => {
      safeError('main.ts: loadFile failed:', error)
    })
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// File system operations
// Get or set vault path (folder where notes are stored)
const getVaultPathFromPrefs = async (): Promise<string | null> => {
  try {
    const vaultPath = app.getPath('userData')
    const prefsFile = join(vaultPath, 'preferences.json')
    if (existsSync(prefsFile)) {
      const content = await readFile(prefsFile, 'utf-8')
      const prefs = JSON.parse(content)
      return prefs.vaultPath || null
    }
  } catch (error) {
    safeError('Error reading vault path:', error)
  }
  return null
}

const setVaultPathInPrefs = async (vaultPath: string) => {
  try {
    const userDataPath = app.getPath('userData')
    const prefsFile = join(userDataPath, 'preferences.json')
    const prefs = existsSync(prefsFile) ? require(prefsFile) : {}
    prefs.vaultPath = vaultPath
    await writeFile(prefsFile, JSON.stringify(prefs, null, 2), 'utf-8')
  } catch (error) {
    safeError('Error saving vault path:', error)
  }
}

const getDataDir = async (): Promise<string> => {
  // Check if vault path is set in preferences
  let vaultPath = await getVaultPathFromPrefs()
  
  // If no vault is set, use default location
  if (!vaultPath) {
    const userDataPath = app.getPath('userData')
    vaultPath = join(userDataPath, 'axiom-data')
    if (!existsSync(vaultPath)) {
      await mkdir(vaultPath, { recursive: true })
    }
  }
  
  // Ensure vault directory exists
  if (!existsSync(vaultPath)) {
    await mkdir(vaultPath, { recursive: true })
  }
  
  // vaultPath is guaranteed to be a string at this point
  return vaultPath as string
}

// Helper to list files with metadata
interface FileItem {
  name: string
  path: string
  modified: number
  size: number
}

const listFilesInDir = async (dir: string): Promise<FileItem[]> => {
  try {
    const files = await readdir(dir)
    const fileList: FileItem[] = []
    
    for (const file of files) {
      // Include .md, .excalidraw.md (Obsidian format), and .excalidraw (legacy) files
      if (file.endsWith('.md') || file.endsWith('.excalidraw.md') || file.endsWith('.excalidraw')) {
        const filePath = join(dir, file)
        const stats = await stat(filePath)
        fileList.push({
          name: file,
          path: file,
          modified: stats.mtime.getTime(),
          size: stats.size,
        })
      }
    }
    
    // Sort by modified date (newest first)
    fileList.sort((a, b) => b.modified - a.modified)
    return fileList
  } catch (error) {
    safeError('Error listing files:', error)
    return []
  }
}

// IPC Handlers for file operations
/**
 * Atomic file write with crash-safety
 * Pattern: temp file → fsync → rename
 * Prevents corruption on crash/power loss
 */
ipcMain.handle('save-note-file', async (_event: any, filePath: string, content: string) => {
  let tempPath: string | null = null
  try {
    const dataDir = await getDataDir()
    // Handle both relative and absolute paths
    // If filePath is already an absolute path, use it directly
    // Otherwise, join it with dataDir
    const fullPath = filePath.startsWith('/') || filePath.match(/^[A-Z]:\\/)
      ? filePath 
      : join(dataDir, filePath)
    
    safeLog('main.ts: Saving file atomically, filePath:', filePath, 'fullPath:', fullPath, 'content length:', content.length)
    
    // Ensure directory exists
    const dir = dirname(fullPath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
      safeLog('main.ts: Created directory:', dir)
    }
    
    // Step 1: Write to temporary file
    tempPath = fullPath + '.tmp'
    await writeFile(tempPath, content, 'utf-8')
    safeLog('main.ts: Written to temp file:', tempPath)
    
    // Step 2: Force data to disk (fsync)
    // Use fs.open + fd.sync for proper async fsync
    const fd = await fsPromises.open(tempPath, 'r+')
    try {
      await fd.sync() // fsync on the file descriptor
    } finally {
      await fd.close()
    }
    safeLog('main.ts: Temp file synced to disk')
    
    // Step 3: Atomic rename (replaces target file atomically)
    await rename(tempPath, fullPath)
    tempPath = null // Clear so we don't try to clean it up
    safeLog('main.ts: File renamed atomically, save complete:', fullPath)
    
    // Verify file was written
    try {
      const stats = await stat(fullPath)
      safeLog('main.ts: File verified, size:', stats.size, 'bytes')
    } catch (verifyError) {
      safeError('main.ts: Warning - Could not verify file after write:', verifyError)
    }
    
    return { success: true }
  } catch (error: any) {
    // Clean up temp file on error
    if (tempPath && existsSync(tempPath)) {
      try {
        await unlink(tempPath)
        safeLog('main.ts: Cleaned up temp file after error:', tempPath)
      } catch (cleanupError) {
        safeError('main.ts: Failed to clean up temp file:', cleanupError)
      }
    }
    
    const errorMessage = error?.message || String(error)
    const errorCode = error?.code || 'UNKNOWN'
    safeError('Error saving file atomically:', {
      filePath,
      error: errorMessage,
      code: errorCode,
      stack: error?.stack
    })
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('load-note-file', async (_event: any, filePath: string) => {
  try {
    const dataDir = await getDataDir()
    const fullPath = join(dataDir, filePath)
    const content = await readFile(fullPath, 'utf-8')
    return { success: true, content }
  } catch (error) {
    safeError('Error loading file:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('delete-note-file', async (_event: any, filePath: string) => {
  try {
    const dataDir = await getDataDir()
    const fullPath = join(dataDir, filePath)
    await unlink(fullPath)
    return { success: true }
  } catch (error) {
    safeError('Error deleting file:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('rename-note-file', async (_event: any, oldFilePath: string, newFileName: string) => {
  try {
    const dataDir = await getDataDir()
    // Handle both relative and absolute paths
    // If oldFilePath is already an absolute path, use it directly
    // Otherwise, join it with dataDir
    const oldFullPath = oldFilePath.startsWith('/') || oldFilePath.match(/^[A-Z]:\\/) 
      ? oldFilePath 
      : join(dataDir, oldFilePath)
    
    // Check if old file exists
    if (!existsSync(oldFullPath)) {
      return { success: false, error: `File not found: ${oldFullPath}` }
    }
    
    // Extract the original file extension
    const oldFileName = basename(oldFullPath)
    let oldExtension = extname(oldFileName) // Will be '.md' or '.excalidraw' or ''
    
    // Fallback: if extname doesn't detect .excalidraw (shouldn't happen, but just in case)
    if (!oldExtension && oldFileName.endsWith('.excalidraw')) {
      oldExtension = '.excalidraw'
    } else if (!oldExtension && oldFileName.endsWith('.md')) {
      oldExtension = '.md'
    }
    
    safeLog('🔍 Rename: oldFileName =', oldFileName, 'oldExtension =', oldExtension, 'newFileName =', newFileName)
    
    // Preserve the original extension when renaming
    // Remove any extension from newFileName if it has one, then add the original extension
    let newFileNameWithExt = newFileName
    // Remove any existing extension from newFileName
    if (newFileName.endsWith('.md') || newFileName.endsWith('.excalidraw')) {
      if (newFileName.endsWith('.excalidraw')) {
        newFileNameWithExt = newFileName.slice(0, -11)
      } else if (newFileName.endsWith('.md')) {
        newFileNameWithExt = newFileName.slice(0, -3)
      }
    }
    // Add the original extension - CRITICAL: preserve the original file type
    if (oldExtension) {
      newFileNameWithExt = newFileNameWithExt + oldExtension
    } else {
      // If old file has no extension, default to .md for backward compatibility
      newFileNameWithExt = newFileNameWithExt + '.md'
    }
    
    safeLog('🔍 Rename: newFileNameWithExt =', newFileNameWithExt, 'oldExtension was =', oldExtension)
    
    // newFilePath should be just the filename (relative to dataDir)
    const newFilePath = newFileNameWithExt
    // Construct new full path - always relative to dataDir (even if old path was absolute)
    const newFullPath = join(dataDir, newFilePath)
    
    // Check if new file already exists
    if (existsSync(newFullPath)) {
      return { success: false, error: 'A file with this name already exists' }
    }
    
    // Handle renaming based on file type
    if (oldExtension === '.excalidraw') {
      // For Excalidraw files, update the title in metadata if needed
      // Just rename the file, Excalidraw data structure doesn't have a title field
      // The title is derived from filename
    } else {
      // For markdown files, update first line
      const currentContent = await readFile(oldFullPath, 'utf-8')
      const lines = currentContent.split('\n')
      
      // Update first line to match new filename (without extension)
      const newTitle = newFileNameWithExt.endsWith('.md') ? newFileNameWithExt.slice(0, -3) : newFileNameWithExt
      // Update or set the first line to the new title
      if (lines.length === 0) {
        lines.push(newTitle)
      } else {
        lines[0] = newTitle
      }
      
      // Write updated content back to file
      const updatedContent = lines.join('\n')
      await writeFile(oldFullPath, updatedContent, 'utf-8')
    }
    
    // Perform the rename using fs/promises (async/await version)
    // This is equivalent to fs.rename but returns a Promise for use with async/await
    safeLog('main.ts: Renaming from', oldFullPath, 'to', newFullPath)
    await rename(oldFullPath, newFullPath)
    safeLog('main.ts: Rename successful, returning newFilePath:', newFilePath)
    
    return { success: true, newFilePath }
  } catch (error) {
    safeError('Error renaming file:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('save-image-file', async (_event: any, fileName: string, imageData: string) => {
  try {
    const dataDir = await getDataDir()
    // Convert base64 data URL to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    const fullPath = join(dataDir, fileName)
    await writeFile(fullPath, buffer)
    return { success: true, filePath: fileName }
  } catch (error) {
    safeError('Error saving image:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('create-note-file', async (_event: any, fileName: string, noteType: 'markdown' | 'excalidraw' = 'markdown') => {
  try {
    const dataDir = await getDataDir()
    
    // Determine file extension based on note type
    const extension = noteType === 'excalidraw' ? '.excalidraw' : '.md'
    
    // Remove any existing extension and add the correct one based on noteType
    let fileNameWithExt = fileName
    // Remove any existing extensions (check longer extensions first for backward compatibility)
    if (fileName.endsWith('.excalidraw.md')) {
      fileNameWithExt = fileName.slice(0, -15) // Remove '.excalidraw.md' (backward compatibility)
    } else if (fileName.endsWith('.excalidraw')) {
      fileNameWithExt = fileName.slice(0, -11) // Remove '.excalidraw'
    } else if (fileName.endsWith('.md')) {
      fileNameWithExt = fileName.slice(0, -3) // Remove '.md'
    }
    // Always add the correct extension based on noteType
    fileNameWithExt = `${fileNameWithExt}${extension}`
    
    safeLog(`[create-note-file] fileName: "${fileName}", noteType: "${noteType}", extension: "${extension}", fileNameWithExt: "${fileNameWithExt}"`)
    
    const fullPath = join(dataDir, fileNameWithExt)
    
    // Check if file already exists
    if (existsSync(fullPath)) {
      return { success: false, error: 'A file with this name already exists' }
    }
    
    if (noteType === 'excalidraw') {
      // Create Excalidraw file with initial empty structure
      const initialData = {
        type: 'excalidraw',
        version: 2,
        source: 'https://excalidraw.com',
        elements: [],
        appState: {
          gridSize: null,
          viewBackgroundColor: '#ffffff',
        },
        files: {},
      }
      await writeFile(fullPath, JSON.stringify(initialData, null, 2), 'utf-8')
    } else {
      // Create markdown file with filename (without extension) as default title
      const fileNameWithoutExt = fileNameWithExt.endsWith('.md') ? fileNameWithExt.slice(0, -3) : fileNameWithExt
      await writeFile(fullPath, fileNameWithoutExt, 'utf-8')
    }
    
    return { success: true, filePath: fileNameWithExt }
  } catch (error) {
    safeError('Error creating file:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('list-note-files', async () => {
  try {
    const dataDir = await getDataDir()
    const files = await listFilesInDir(dataDir)
    return { success: true, files }
  } catch (error) {
    safeError('Error listing files:', error)
    return { success: false, error: String(error), files: [] }
  }
})

ipcMain.handle('save-file-dialog', async () => {
  if (!mainWindow) return { cancelled: true }
  
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Note',
    defaultPath: 'note.md',
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  
  if (result.canceled) {
    return { cancelled: true }
  }
  
  return { filePath: result.filePath || '' }
})

ipcMain.handle('open-file-dialog', async () => {
  if (!mainWindow) return { cancelled: true }
  
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Note',
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  
  if (result.canceled) {
    return { cancelled: true }
  }
  
  try {
    const content = await readFile(result.filePaths[0], 'utf-8')
    return { filePath: result.filePaths[0], content }
  } catch (error) {
    return { error: String(error) }
  }
})

// File watching
ipcMain.handle('watch-files', async () => {
  try {
    const dataDir = await getDataDir()
    
    // Close existing watcher if any
    if (fileWatcher) {
      fileWatcher.close()
    }
    
    // Watch directory for changes
    fileWatcher = watch(dataDir, { recursive: false }, async (eventType: string, filename: string | null) => {
      if (eventType === 'rename' && filename && mainWindow) {
        // File added or removed
        const files = await listFilesInDir(dataDir)
        mainWindow.webContents.send('files-changed', files)
      }
    })
    
    // Send initial file list
    const files = await listFilesInDir(dataDir)
    return { success: true, files }
  } catch (error) {
    safeError('Error watching files:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('stop-watching-files', () => {
  if (fileWatcher) {
    fileWatcher.close()
    fileWatcher = null
  }
})

// App state persistence (notes, pan, zoom)
const getStateFile = async () => {
  // Save state file in .axiom folder within vault directory
  const dataDir = await getDataDir()
  const axiomDir = join(dataDir, '.axiom')
  // Ensure .axiom directory exists
  if (!existsSync(axiomDir)) {
    await mkdir(axiomDir, { recursive: true })
  }
  return join(axiomDir, 'canvas-positions.json')
}

ipcMain.handle('save-app-state', async (_event: any, state: { notes?: any; pan?: any; zoom?: number }) => {
  try {
    const stateFile = await getStateFile()
    await writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    safeError('Error saving app state:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('load-app-state', async () => {
  try {
    const stateFile = await getStateFile()
    if (existsSync(stateFile)) {
      const content = await readFile(stateFile, 'utf-8')
      return { success: true, state: JSON.parse(content) }
    }
    return { success: true, state: null }
  } catch (error) {
    safeError('Error loading app state:', error)
    return { success: false, error: String(error), state: null }
  }
})

// Vault selection handlers
ipcMain.handle('select-vault-folder', async () => {
  if (!mainWindow) return { cancelled: true }
  
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Vault Folder',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Select Vault',
  })
  
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { cancelled: true }
  }
  
  const vaultPath = result.filePaths[0]
  await setVaultPathInPrefs(vaultPath)
  
  return { vaultPath }
})

ipcMain.handle('get-vault-path', async () => {
  const vaultPath = await getVaultPathFromPrefs()
  if (vaultPath) {
    return { vaultPath }
  }
  
  // Return default if no vault is set
  const userDataPath = app.getPath('userData')
  const defaultPath = join(userDataPath, 'axiom-data')
  return { vaultPath: defaultPath, isDefault: true }
})

