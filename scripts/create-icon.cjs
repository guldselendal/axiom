// Script to create an app icon with the letter "A"
const fs = require('fs');
const path = require('path');

// Check if canvas is available
let canvas;
try {
  canvas = require('canvas');
} catch (e) {
  console.error('Canvas package not found. Installing...');
  console.error('Please run: npm install canvas');
  process.exit(1);
}

const { createCanvas } = canvas;

// Create a 1024x1024 canvas
const size = 1024;
const canvasEl = createCanvas(size, size);
const ctx = canvasEl.getContext('2d');

// Background - gradient from purple to blue
const gradient = ctx.createLinearGradient(0, 0, size, size);
gradient.addColorStop(0, '#6366f1'); // indigo-500
gradient.addColorStop(1, '#8b5cf6'); // purple-500
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, size, size);

// Add a subtle pattern or texture
ctx.globalAlpha = 0.1;
for (let i = 0; i < 20; i++) {
  ctx.beginPath();
  ctx.arc(
    Math.random() * size,
    Math.random() * size,
    Math.random() * 100 + 50,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}
ctx.globalAlpha = 1.0;

// Draw the letter "A"
ctx.fillStyle = '#ffffff';
ctx.font = `bold ${size * 0.6}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Add text shadow for depth
ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
ctx.shadowBlur = 20;
ctx.shadowOffsetX = 0;
ctx.shadowOffsetY = 10;

// Draw the letter A
ctx.fillText('A', size / 2, size / 2);

// Reset shadow
ctx.shadowColor = 'transparent';
ctx.shadowBlur = 0;
ctx.shadowOffsetX = 0;
ctx.shadowOffsetY = 0;

// Save as PNG
const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const outputPath = path.join(assetsDir, 'icon.png');
const buffer = canvasEl.toBuffer('image/png');
fs.writeFileSync(outputPath, buffer);

console.log(`✅ Icon created successfully at: ${outputPath}`);
console.log(`   Size: ${size}x${size} pixels`);

