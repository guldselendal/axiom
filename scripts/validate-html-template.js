#!/usr/bin/env node
/**
 * Pre-build validation: Ensure index.html template is not corrupted with hardcoded build artifacts
 */
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

// Check for hardcoded asset paths (build artifacts that should not be in source)
const hardcodedAssetPattern = /(src|href)=["'][^"']*\/assets\/index-[A-Za-z0-9_-]+\.(js|css)["']/;
const hasHardcodedAssets = hardcodedAssetPattern.test(html);

if (hasHardcodedAssets) {
  console.error('❌ ERROR: index.html contains hardcoded asset paths!');
  console.error('❌ This breaks Vite\'s build process.');
  console.error('❌ Expected: <script type="module" src="/src/main.tsx"></script>');
  console.error('❌ Found hardcoded build artifacts in source template.');
  process.exit(1);
}

// Verify the correct entry point exists
if (!html.includes('/src/main.tsx')) {
  console.error('❌ ERROR: index.html is missing the correct entry point!');
  console.error('❌ Expected: <script type="module" src="/src/main.tsx"></script>');
  process.exit(1);
}

console.log('✅ index.html template is valid');



