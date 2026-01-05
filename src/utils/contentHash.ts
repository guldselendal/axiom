/**
 * Content hashing utility for change detection
 * Uses simple string hash (FNV-1a) for fast comparison
 */

/**
 * Compute a hash of the content string
 * Returns a hex string hash that can be compared for equality
 */
export function hashContent(content: string): string {
  let hash = 2166136261 // FNV offset basis
  
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  
  // Convert to unsigned 32-bit and return as hex
  return (hash >>> 0).toString(16)
}

/**
 * Hash Excalidraw data by serializing to JSON
 * Ensures consistent hashing regardless of object reference equality
 */
export function hashExcalidrawData(data: {
  type: string
  version: number
  source: string
  elements: any[]
  appState: any
  files?: any
}): string {
  // Normalize: sort elements by id for consistent hashing
  const normalized = {
    type: data.type,
    version: data.version,
    source: data.source,
    elements: [...(data.elements || [])].sort((a, b) => (a.id || '').localeCompare(b.id || '')),
    appState: data.appState || {},
    files: data.files || {}
  }
  
  const serialized = JSON.stringify(normalized)
  return hashContent(serialized)
}

