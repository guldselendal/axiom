# App Icons

Place your app icon files in this directory:

- **macOS**: `icon.icns` (Icon Container format)
- **Windows**: `icon.ico` (Icon format)
- **Linux**: `icon.png` (PNG format, recommended 512x512 or 1024x1024)

## Creating Icons

### macOS (.icns)
You can create an .icns file from a PNG using:
- Online tools: https://cloudconvert.com/png-to-icns
- Command line: Use `iconutil` on macOS
- Or use tools like IconGenerator

### Windows (.ico)
You can create an .ico file from a PNG using:
- Online tools: https://convertio.co/png-ico/
- Or use tools like IcoFX

### Linux (.png)
Use a PNG file (512x512 or 1024x1024 pixels recommended).

## Quick Setup

1. Create your icon image (recommended: 1024x1024 PNG)
2. Convert to the required formats for each platform
3. Place the files in this `assets/` directory
4. Rebuild the app: `npm run electron:build`

The icon will appear in:
- macOS: Dock and app window
- Windows: Taskbar and app window
- Linux: Application launcher and app window

