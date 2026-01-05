#!/usr/bin/env node
/**
 * Guard Check: Verify that dist/renderer/index.html is valid HTML and not corrupted
 * Fails if index.html contains Electron main process code
 */
const fs = require('fs');
const path = require('path');

const rendererDir = path.join(__dirname, '..', 'dist', 'renderer');
const indexPath = path.join(rendererDir, 'index.html');

// Check if index.html exists
if (!fs.existsSync(indexPath)) {
  console.error('❌ ERROR: dist/renderer/index.html does not exist!');
  console.error('❌ Run "npm run build" first.');
  process.exit(1);
}

// Read index.html
const html = fs.readFileSync(indexPath, 'utf8').trim();

// Check 1: Must start with <!doctype html> (case-insensitive)
if (!/^<!doctype\s+html/i.test(html)) {
  console.error('❌ ERROR: dist/renderer/index.html does not start with <!doctype html>');
  console.error('❌ First 100 characters:', html.substring(0, 100));
  console.error('❌ File may be corrupted or overwritten by wrong build artifact');
  process.exit(1);
}

// Check 2: Must NOT contain Electron main process code patterns
const electronMainPatterns = [
  /ipcMain\.handle/i,
  /mainWindow\.webContents/i,
  /require\(['"]electron['"]\)/,
  /BrowserWindow/,
  /app\.whenReady/,
];

for (const pattern of electronMainPatterns) {
  if (pattern.test(html)) {
    console.error('❌ ERROR: dist/renderer/index.html contains Electron main process code!');
    console.error('❌ Detected pattern:', pattern.toString());
    console.error('❌ This indicates index.html was overwritten by main.js/main.cjs');
    console.error('❌ First 200 characters:', html.substring(0, 200));
    process.exit(1);
  }
}

// Check 3: Must contain HTML structure
if (!html.includes('<html') || !html.includes('</html>')) {
  console.error('❌ ERROR: dist/renderer/index.html does not contain valid HTML structure');
  console.error('❌ File may be corrupted');
  process.exit(1);
}

// Check 4: Must contain root div
if (!html.includes('<div id="root"')) {
  console.error('❌ WARNING: dist/renderer/index.html does not contain <div id="root">');
  console.error('❌ React app may not mount correctly');
  // This is a warning, not a fatal error
}

console.log('✅ HTML integrity check passed!');
console.log('✅ dist/renderer/index.html is valid HTML and not corrupted');



