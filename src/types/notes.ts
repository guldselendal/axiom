/**
 * Note type definitions
 * Supports polymorphic note types: markdown and excalidraw
 */

// Excalidraw types (minimal subset needed for persistence)
export interface ExcalidrawElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  angle: number
  strokeColor?: string
  backgroundColor?: string
  fillStyle?: string
  strokeWidth?: number
  strokeStyle?: string
  roughness?: number
  opacity?: number
  groupIds?: string[]
  frameId?: string | null
  roundness?: any
  seed?: number
  versionNonZero?: number
  version?: number
  boundElements?: any[]
  updated?: number
  link?: string | null
  locked?: boolean
  [key: string]: any // Allow additional Excalidraw properties
}

export interface ExcalidrawAppState {
  viewBackgroundColor?: string
  currentItemStrokeColor?: string
  currentItemBackgroundColor?: string
  currentItemFillStyle?: string
  currentItemStrokeStyle?: string
  currentItemRoughness?: number
  currentItemOpacity?: number
  currentItemFontFamily?: number
  currentItemFontSize?: number
  currentItemTextAlign?: string
  currentItemStrokeWidth?: number
  currentItemRoundness?: string
  gridSize?: number | null
  zoom?: { value: number }
  scrollX?: number
  scrollY?: number
  [key: string]: any // Allow additional appState properties
}

export interface ExcalidrawBinaryFile {
  id: string
  dataURL: string
  mimeType: string
  created?: number
  [key: string]: any
}

export interface ExcalidrawData {
  type: 'excalidraw'
  version: number
  source: string
  elements: ExcalidrawElement[]
  appState: ExcalidrawAppState
  files?: Record<string, ExcalidrawBinaryFile>
}

// Base note interface
export interface BaseNote {
  id: string
  worldX: number
  worldY: number
  width: number
  height: number
  title?: string
  color?: string
  filePath?: string
  canvasId?: string
  createdAt?: number
  updatedAt?: number
}

// Markdown note
export interface MarkdownNote extends BaseNote {
  type: 'markdown'
  content: string // Markdown text content
}

// Excalidraw note
export interface ExcalidrawNote extends BaseNote {
  type: 'excalidraw'
  excalidrawData: ExcalidrawData
}

// Union type for all notes
export type Note = MarkdownNote | ExcalidrawNote

// Type guards
export function isMarkdownNote(note: Note): note is MarkdownNote {
  return note.type === 'markdown' || (!('type' in note) && 'content' in note && typeof (note as any).content === 'string')
}

export function isExcalidrawNote(note: Note): note is ExcalidrawNote {
  return note.type === 'excalidraw' || ('excalidrawData' in note && note.excalidrawData !== undefined)
}

// Helper to get note type from file extension
export function getNoteTypeFromFilePath(filePath?: string): 'markdown' | 'excalidraw' {
  if (!filePath) return 'markdown' // Default to markdown for backward compatibility
  // Support both .excalidraw.md (Obsidian format) and .excalidraw (standard format)
  if (filePath.endsWith('.excalidraw.md') || filePath.endsWith('.excalidraw')) return 'excalidraw'
  return 'markdown'
}

// Helper to get file extension from note type
export function getFileExtensionForNoteType(type: 'markdown' | 'excalidraw'): string {
  return type === 'excalidraw' ? '.excalidraw' : '.md'
}

