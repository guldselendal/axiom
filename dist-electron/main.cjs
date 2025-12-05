const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { readFile, writeFile, mkdir, readdir, stat, unlink, rename } = require('fs/promises');
const { join, dirname, basename } = require('path');
const { existsSync, watch } = require('fs');
const isDev = process.env.NODE_ENV === 'development';
let mainWindow = null;
let fileWatcher = null;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'default', // Use default title bar so window is draggable
    });
    // Load the app
    if (isDev) {
        // Try to load from Vite dev server (try common ports)
        const tryLoadVite = async (port) => {
            try {
                const http = require('http');
                return new Promise((resolve, reject) => {
                    const req = http.get(`http://localhost:${port}`, (res) => {
                        resolve(port);
                    });
                    req.on('error', () => reject());
                    req.setTimeout(1000, () => {
                        req.destroy();
                        reject();
                    });
                });
            }
            catch {
                return Promise.reject();
            }
        };
        // Try ports 5173, 5174, 5175, etc.
        const tryPorts = async () => {
            for (let port = 5173; port <= 5180; port++) {
                try {
                    await tryLoadVite(port);
                    // Add cache-busting timestamp to force fresh load
                    const timestamp = Date.now();
                    mainWindow.loadURL(`http://localhost:${port}?v=${timestamp}`);
                    // Clear cache before loading
                    mainWindow.webContents.session.clearCache();
                    // Open DevTools after page loads
                    mainWindow.webContents.once('did-finish-load', () => {
                        mainWindow?.webContents.openDevTools();
                    });
                    return;
                }
                catch {
                    // Try next port
                }
            }
            // If no port works, show error
            console.error('Could not find Vite dev server on ports 5173-5180');
        };
        tryPorts();
    }
    else {
        mainWindow.loadFile(join(__dirname, '../dist/index.html'));
    }
}
app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
// File system operations
// Get or set vault path (folder where notes are stored)
const getVaultPathFromPrefs = async () => {
    try {
        const vaultPath = app.getPath('userData');
        const prefsFile = join(vaultPath, 'preferences.json');
        if (existsSync(prefsFile)) {
            const content = await readFile(prefsFile, 'utf-8');
            const prefs = JSON.parse(content);
            return prefs.vaultPath || null;
        }
    }
    catch (error) {
        console.error('Error reading vault path:', error);
    }
    return null;
};
const setVaultPathInPrefs = async (vaultPath) => {
    try {
        const userDataPath = app.getPath('userData');
        const prefsFile = join(userDataPath, 'preferences.json');
        const prefs = existsSync(prefsFile) ? require(prefsFile) : {};
        prefs.vaultPath = vaultPath;
        await writeFile(prefsFile, JSON.stringify(prefs, null, 2), 'utf-8');
    }
    catch (error) {
        console.error('Error saving vault path:', error);
    }
};
const getDataDir = async () => {
    // Check if vault path is set in preferences
    let vaultPath = await getVaultPathFromPrefs();
    // If no vault is set, use default location
    if (!vaultPath) {
        const userDataPath = app.getPath('userData');
        vaultPath = join(userDataPath, 'mindz-data');
        if (!existsSync(vaultPath)) {
            await mkdir(vaultPath, { recursive: true });
        }
    }
    // Ensure vault directory exists
    if (!existsSync(vaultPath)) {
        await mkdir(vaultPath, { recursive: true });
    }
    return vaultPath;
};
// Helper to list files with metadata
const listFilesInDir = async (dir) => {
    try {
        const files = await readdir(dir);
        const fileList = [];
        for (const file of files) {
            if (file.endsWith('.md')) {
                const filePath = join(dir, file);
                const stats = await stat(filePath);
                fileList.push({
                    name: file,
                    path: file,
                    modified: stats.mtime.getTime(),
                    size: stats.size,
                });
            }
        }
        // Sort by modified date (newest first)
        fileList.sort((a, b) => b.modified - a.modified);
        return fileList;
    }
    catch (error) {
        console.error('Error listing files:', error);
        return [];
    }
};
// IPC Handlers for file operations
ipcMain.handle('save-note-file', async (_event, filePath, content) => {
    try {
        const dataDir = await getDataDir();
        // Handle both relative and absolute paths
        // If filePath is already an absolute path, use it directly
        // Otherwise, join it with dataDir
        const fullPath = filePath.startsWith('/') || filePath.match(/^[A-Z]:\\/)
            ? filePath
            : join(dataDir, filePath);
        console.log('main.ts: Saving file, filePath:', filePath, 'fullPath:', fullPath);
        await writeFile(fullPath, content, 'utf-8');
        return { success: true };
    }
    catch (error) {
        console.error('Error saving file:', error);
        return { success: false, error: String(error) };
    }
});
ipcMain.handle('load-note-file', async (_event, filePath) => {
    try {
        const dataDir = await getDataDir();
        const fullPath = join(dataDir, filePath);
        const content = await readFile(fullPath, 'utf-8');
        return { success: true, content };
    }
    catch (error) {
        console.error('Error loading file:', error);
        return { success: false, error: String(error) };
    }
});
ipcMain.handle('delete-note-file', async (_event, filePath) => {
    try {
        const dataDir = await getDataDir();
        const fullPath = join(dataDir, filePath);
        await unlink(fullPath);
        return { success: true };
    }
    catch (error) {
        console.error('Error deleting file:', error);
        return { success: false, error: String(error) };
    }
});
ipcMain.handle('rename-note-file', async (_event, oldFilePath, newFileName) => {
    try {
        const dataDir = await getDataDir();
        // Handle both relative and absolute paths
        // If oldFilePath is already an absolute path, use it directly
        // Otherwise, join it with dataDir
        const oldFullPath = oldFilePath.startsWith('/') || oldFilePath.match(/^[A-Z]:\\/)
            ? oldFilePath
            : join(dataDir, oldFilePath);
        // Check if old file exists
        if (!existsSync(oldFullPath)) {
            return { success: false, error: `File not found: ${oldFullPath}` };
        }
        // Ensure new filename has .md extension
        const newFileNameWithExt = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`;
        // newFilePath should be just the filename (relative to dataDir)
        const newFilePath = newFileNameWithExt;
        // Construct new full path - always relative to dataDir (even if old path was absolute)
        const newFullPath = join(dataDir, newFilePath);
        // Check if new file already exists
        if (existsSync(newFullPath)) {
            return { success: false, error: 'A file with this name already exists' };
        }
        // Read current file content
        const currentContent = await readFile(oldFullPath, 'utf-8');
        const lines = currentContent.split('\n');
        // Update first line to match new filename (without extension)
        const newTitle = newFileName.endsWith('.md') ? newFileName.slice(0, -3) : newFileName;
        // Update or set the first line to the new title
        if (lines.length === 0) {
            lines.push(newTitle);
        }
        else {
            lines[0] = newTitle;
        }
        // Write updated content back to file
        const updatedContent = lines.join('\n');
        await writeFile(oldFullPath, updatedContent, 'utf-8');
        // Perform the rename using fs/promises (async/await version)
        // This is equivalent to fs.rename but returns a Promise for use with async/await
        console.log('main.ts: Renaming from', oldFullPath, 'to', newFullPath);
        await rename(oldFullPath, newFullPath);
        console.log('main.ts: Rename successful, returning newFilePath:', newFilePath);
        return { success: true, newFilePath };
    }
    catch (error) {
        console.error('Error renaming file:', error);
        return { success: false, error: String(error) };
    }
});
ipcMain.handle('save-image-file', async (_event, fileName, imageData) => {
    try {
        const dataDir = await getDataDir();
        // Convert base64 data URL to buffer
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const fullPath = join(dataDir, fileName);
        await writeFile(fullPath, buffer);
        return { success: true, filePath: fileName };
    }
    catch (error) {
        console.error('Error saving image:', error);
        return { success: false, error: String(error) };
    }
});
ipcMain.handle('create-note-file', async (_event, fileName) => {
    try {
        const dataDir = await getDataDir();
        // Ensure filename has .md extension
        const fileNameWithExt = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
        const fullPath = join(dataDir, fileNameWithExt);
        // Check if file already exists
        if (existsSync(fullPath)) {
            return { success: false, error: 'A file with this name already exists' };
        }
        // Create file with filename (without extension) as default title
        const fileNameWithoutExt = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
        await writeFile(fullPath, fileNameWithoutExt, 'utf-8');
        return { success: true, filePath: fileNameWithExt };
    }
    catch (error) {
        console.error('Error creating file:', error);
        return { success: false, error: String(error) };
    }
});
ipcMain.handle('list-note-files', async () => {
    try {
        const dataDir = await getDataDir();
        const files = await listFilesInDir(dataDir);
        return { success: true, files };
    }
    catch (error) {
        console.error('Error listing files:', error);
        return { success: false, error: String(error), files: [] };
    }
});
ipcMain.handle('save-file-dialog', async () => {
    if (!mainWindow)
        return { cancelled: true };
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Note',
        defaultPath: 'note.md',
        filters: [
            { name: 'Markdown', extensions: ['md'] },
            { name: 'All Files', extensions: ['*'] },
        ],
    });
    if (result.canceled) {
        return { cancelled: true };
    }
    return { filePath: result.filePath };
});
ipcMain.handle('open-file-dialog', async () => {
    if (!mainWindow)
        return { cancelled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Note',
        filters: [
            { name: 'Markdown', extensions: ['md'] },
            { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
    });
    if (result.canceled) {
        return { cancelled: true };
    }
    try {
        const content = await readFile(result.filePaths[0], 'utf-8');
        return { filePath: result.filePaths[0], content };
    }
    catch (error) {
        return { error: String(error) };
    }
});
// File watching
ipcMain.handle('watch-files', async () => {
    try {
        const dataDir = await getDataDir();
        // Close existing watcher if any
        if (fileWatcher) {
            fileWatcher.close();
        }
        // Watch directory for changes
        fileWatcher = watch(dataDir, { recursive: false }, async (eventType, filename) => {
            if (eventType === 'rename' && filename && mainWindow) {
                // File added or removed
                const files = await listFilesInDir(dataDir);
                mainWindow.webContents.send('files-changed', files);
            }
        });
        // Send initial file list
        const files = await listFilesInDir(dataDir);
        return { success: true, files };
    }
    catch (error) {
        console.error('Error watching files:', error);
        return { success: false, error: String(error) };
    }
});
ipcMain.handle('stop-watching-files', () => {
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = null;
    }
});
// App state persistence (notes, pan, zoom)
const getStateFile = async () => {
    // Save state file in vault folder, not userData
    const dataDir = await getDataDir();
    return join(dataDir, 'canvas-positions.json');
};
ipcMain.handle('save-app-state', async (_event, state) => {
    try {
        const stateFile = await getStateFile();
        await writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');
        return { success: true };
    }
    catch (error) {
        console.error('Error saving app state:', error);
        return { success: false, error: String(error) };
    }
});
ipcMain.handle('load-app-state', async () => {
    try {
        const stateFile = await getStateFile();
        if (existsSync(stateFile)) {
            const content = await readFile(stateFile, 'utf-8');
            return { success: true, state: JSON.parse(content) };
        }
        return { success: true, state: null };
    }
    catch (error) {
        console.error('Error loading app state:', error);
        return { success: false, error: String(error), state: null };
    }
});
// Vault selection handlers
ipcMain.handle('select-vault-folder', async () => {
    if (!mainWindow)
        return { cancelled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Vault Folder',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Select Vault',
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { cancelled: true };
    }
    const vaultPath = result.filePaths[0];
    await setVaultPathInPrefs(vaultPath);
    return { vaultPath };
});
ipcMain.handle('get-vault-path', async () => {
    const vaultPath = await getVaultPathFromPrefs();
    if (vaultPath) {
        return { vaultPath };
    }
    // Return default if no vault is set
    const userDataPath = app.getPath('userData');
    const defaultPath = join(userDataPath, 'mindz-data');
    return { vaultPath: defaultPath, isDefault: true };
});
