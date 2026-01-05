#!/usr/bin/env node
/**
 * Diagnostic script to identify index.html corruption
 * Checks all possible locations and compares with main.js
 */
const fs = require('fs');
const path = require('path');

console.log('=== Index.html Corruption Diagnostic ===\n');

// Check locations
const locations = [
  { name: 'Local dist/renderer/index.html', path: path.join(__dirname, '..', 'dist', 'renderer', 'index.html') },
  { name: 'Local dist/index.html (old location)', path: path.join(__dirname, '..', 'dist', 'index.html') },
  { name: 'Packaged app.asar/dist/renderer/index.html', path: null }, // Will check separately
];

const mainJsPath = path.join(__dirname, '..', 'dist-electron', 'main.js');
const mainCjsPath = path.join(__dirname, '..', 'dist-electron', 'main.cjs');

// Read main.js for comparison
let mainJsContent = '';
if (fs.existsSync(mainJsPath)) {
  mainJsContent = fs.readFileSync(mainJsPath, 'utf8').substring(0, 200);
} else if (fs.existsSync(mainCjsPath)) {
  mainJsContent = fs.readFileSync(mainCjsPath, 'utf8').substring(0, 200);
}

console.log('Main.js first 200 chars:');
console.log(mainJsContent);
console.log('\n---\n');

// Check each location
for (const loc of locations) {
  console.log(`Checking: ${loc.name}`);
  
  if (loc.path && fs.existsSync(loc.path)) {
    const content = fs.readFileSync(loc.path, 'utf8');
    const firstLine = content.split('\n')[0];
    const first200 = content.substring(0, 200);
    
    console.log(`  ✅ File exists`);
    console.log(`  First line: ${firstLine}`);
    console.log(`  File size: ${content.length} bytes`);
    
    // Check if it contains Electron code
    const hasElectronCode = /ipcMain|mainWindow|require\(['"]electron['"]\)|BrowserWindow/.test(content);
    const isHTML = /^<!doctype\s+html/i.test(content.trim());
    
    if (hasElectronCode) {
      console.log(`  ❌ CONTAINS ELECTRON CODE!`);
      console.log(`  First 200 chars: ${first200}`);
      
      // Compare with main.js
      if (content.substring(0, 200) === mainJsContent) {
        console.log(`  ⚠️  FIRST 200 CHARS MATCH main.js - FILE IS CORRUPTED!`);
      }
    } else if (isHTML) {
      console.log(`  ✅ Valid HTML`);
    } else {
      console.log(`  ⚠️  Unknown format`);
      console.log(`  First 200 chars: ${first200}`);
    }
  } else {
    console.log(`  ❌ File does not exist`);
  }
  console.log('');
}

// Check packaged app if it exists
const asarPath = path.join(__dirname, '..', 'release', 'mac-arm64', 'Axiom.app', 'Contents', 'Resources', 'app.asar');
if (fs.existsSync(asarPath)) {
  console.log('Checking packaged app.asar...');
  console.log('  (Run: npx asar extract to inspect contents)');
  console.log(`  ASAR exists: ${fs.existsSync(asarPath)}`);
  console.log(`  ASAR size: ${fs.statSync(asarPath).size} bytes`);
  console.log(`  ASAR modified: ${fs.statSync(asarPath).mtime}`);
} else {
  console.log('Packaged app.asar not found');
}

console.log('\n=== Diagnostic Complete ===');



