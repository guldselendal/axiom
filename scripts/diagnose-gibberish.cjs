#!/usr/bin/env node
/**
 * Diagnose why the app shows gibberish text
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Diagnosing gibberish text issue...\n');

// 1. Check source template
console.log('1. Checking source template (index.html):');
const sourceHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const hasHardcodedAssets = /src=.*\/assets\/index-[A-Za-z0-9_-]+\.js/.test(sourceHtml);
if (hasHardcodedAssets) {
  console.log('   ❌ Source template has hardcoded assets!');
} else {
  console.log('   ✅ Source template is correct (uses /src/main.tsx)');
}

// 2. Check local build
console.log('\n2. Checking local build (dist/renderer/index.html):');
const buildHtmlPath = path.join(__dirname, '..', 'dist', 'renderer', 'index.html');
if (fs.existsSync(buildHtmlPath)) {
  const buildHtml = fs.readFileSync(buildHtmlPath, 'utf8');
  const startsWithDoctype = /^<!doctype\s+html/i.test(buildHtml.trim());
  const hasElectronCode = /ipcMain|BrowserWindow|require\(['"]electron['"]\)/.test(buildHtml);
  
  if (hasElectronCode) {
    console.log('   ❌ Build HTML contains Electron code!');
    console.log('   First 200 chars:', buildHtml.substring(0, 200));
  } else if (!startsWithDoctype) {
    console.log('   ❌ Build HTML does not start with <!doctype html>');
    console.log('   First 200 chars:', buildHtml.substring(0, 200));
  } else {
    console.log('   ✅ Build HTML is valid');
    const jsFile = buildHtml.match(/src="([^"]+\.js)"/)?.[1];
    console.log('   References JS:', jsFile);
    if (jsFile) {
      const jsPath = path.join(__dirname, '..', 'dist', 'renderer', jsFile);
      if (fs.existsSync(jsPath)) {
        console.log('   ✅ JS file exists');
      } else {
        console.log('   ❌ JS file NOT found:', jsPath);
      }
    }
  }
} else {
  console.log('   ❌ Build HTML does not exist! Run "npm run build"');
}

// 3. Check Electron main code
console.log('\n3. Checking Electron main.ts source:');
const mainTs = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.ts'), 'utf8');
const hasCorrectPath = mainTs.includes("join(appPath, 'dist', 'renderer')");
if (hasCorrectPath) {
  console.log('   ✅ Electron loads from dist/renderer/index.html');
} else {
  console.log('   ❌ Electron might be loading from wrong path');
  const pathMatch = mainTs.match(/join\(appPath, ['"]([^'"]+)['"]\)/);
  if (pathMatch) {
    console.log('   Found path:', pathMatch[1]);
  }
}

// 4. Check packaged app (if exists)
console.log('\n4. Checking packaged app:');
const asarPath = path.join(__dirname, '..', 'release', 'mac-arm64', 'Axiom.app', 'Contents', 'Resources', 'app.asar');
if (fs.existsSync(asarPath)) {
  try {
    execSync(`npx asar extract-file "${asarPath}" dist/renderer/index.html /tmp/packaged-check.html 2>&1`, { encoding: 'utf8' });
    if (fs.existsSync('/tmp/packaged-check.html')) {
      const packagedHtml = fs.readFileSync('/tmp/packaged-check.html', 'utf8');
      const hasElectronCode = /ipcMain|BrowserWindow|require\(['"]electron['"]\)/.test(packagedHtml);
      const startsWithDoctype = /^<!doctype\s+html/i.test(packagedHtml.trim());
      
      if (hasElectronCode) {
        console.log('   ❌ Packaged HTML contains Electron code!');
        console.log('   First 200 chars:', packagedHtml.substring(0, 200));
      } else if (!startsWithDoctype) {
        console.log('   ❌ Packaged HTML does not start with <!doctype html>');
        console.log('   First 200 chars:', packagedHtml.substring(0, 200));
      } else {
        console.log('   ✅ Packaged HTML is valid');
      }
    }
  } catch (error) {
    console.log('   ⚠️  Could not extract packaged HTML');
  }
} else {
  console.log('   ⚠️  Packaged app not found. Run "npm run electron:pack"');
}

console.log('\n✅ Diagnosis complete!');



