/**
 * File extension utilities for handling .excalidraw.md (Obsidian format) and .excalidraw (legacy) files
 */

/**
 * Check if a file path is an Excalidraw file (supports both .excalidraw.md and .excalidraw)
 */
export function isExcalidrawFile(filePath: string): boolean {
  return filePath.endsWith('.excalidraw.md') || filePath.endsWith('.excalidraw')
}

/**
 * Get the title from a file path (removes extension)
 * Supports .excalidraw.md, .excalidraw, and .md extensions
 */
export function getTitleFromFilePath(filePath: string): string {
  const fileName = filePath.split('/').pop() || filePath
  if (fileName.endsWith('.excalidraw.md')) {
    return fileName.slice(0, -15) // Remove '.excalidraw.md'
  } else if (fileName.endsWith('.excalidraw')) {
    return fileName.slice(0, -11) // Remove '.excalidraw'
  } else if (fileName.endsWith('.md')) {
    return fileName.slice(0, -3) // Remove '.md'
  }
  return fileName
}

/**
 * Remove file extension from filename
 * Supports .excalidraw.md, .excalidraw, and .md extensions
 */
export function stripFileExtension(fileName: string): string {
  if (fileName.endsWith('.excalidraw.md')) {
    return fileName.slice(0, -15) // Remove '.excalidraw.md'
  } else if (fileName.endsWith('.excalidraw')) {
    return fileName.slice(0, -11) // Remove '.excalidraw'
  } else if (fileName.endsWith('.md')) {
    return fileName.slice(0, -3) // Remove '.md'
  }
  return fileName
}

/**
 * Get the file extension for a note type
 */
export function getFileExtensionForNoteType(type: 'markdown' | 'excalidraw'): string {
  return type === 'excalidraw' ? '.excalidraw' : '.md'
}

