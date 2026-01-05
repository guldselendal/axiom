#!/usr/bin/env node
/**
 * CI/CD Check: Verify that all assets referenced in dist/index.html actually exist
 * This ensures build integrity before packaging
 */
const fs = require('fs');
const path = require('path');

const rendererDir = path.join(__dirname, '..', 'dist', 'renderer');
const indexPath = path.join(rendererDir, 'index.html');

// Check if dist/renderer/index.html exists
if (!fs.existsSync(indexPath)) {
  console.error('❌ ERROR: dist/renderer/index.html does not exist!');
  console.error('❌ Run "npm run build" first.');
  process.exit(1);
}

// Read index.html
const html = fs.readFileSync(indexPath, 'utf8');

// Extract all asset references (src and href attributes)
const assetPattern = /(src|href)=["']([^"']+)["']/g;
const assets = [];
let match;

while ((match = assetPattern.exec(html)) !== null) {
  const assetPath = match[2];
  // Skip data URLs, external URLs, and non-asset references
  if (!assetPath.startsWith('data:') && 
      !assetPath.startsWith('http://') && 
      !assetPath.startsWith('https://') &&
      !assetPath.startsWith('mailto:') &&
      assetPath !== '#') {
    assets.push(assetPath);
  }
}

// Verify each asset exists
const missingAssets = [];
const resolvedAssets = [];

for (const asset of assets) {
  // Resolve relative paths (all relative to renderer directory)
  let assetFullPath;
  if (asset.startsWith('./')) {
    assetFullPath = path.join(rendererDir, asset.slice(2));
  } else if (asset.startsWith('/')) {
    // Absolute path from renderer root
    assetFullPath = path.join(rendererDir, asset.slice(1));
  } else {
    // Relative to dist/renderer/index.html
    assetFullPath = path.join(rendererDir, asset);
  }
  
  resolvedAssets.push({ original: asset, resolved: assetFullPath });
  
  if (!fs.existsSync(assetFullPath)) {
    missingAssets.push({ original: asset, resolved: assetFullPath });
  }
}

// Report results
if (missingAssets.length > 0) {
  console.error('❌ ERROR: Missing assets referenced in dist/renderer/index.html:');
  missingAssets.forEach(({ original, resolved }) => {
    console.error(`   - ${original} (expected at: ${resolved})`);
  });
  console.error('');
  console.error('❌ Build integrity check failed!');
  console.error('❌ Run "npm run build" to regenerate assets.');
  process.exit(1);
}

console.log('✅ Build integrity check passed!');
console.log(`✅ Verified ${resolvedAssets.length} asset(s) exist:`);
resolvedAssets.forEach(({ original }) => {
  console.log(`   ✓ ${original}`);
});

