// Utility to parse and handle note links in markdown content
// Supports Obsidian-style links: [[file name]]

export interface LinkMatch {
  fullMatch: string
  fileName: string
  displayText?: string
  startIndex: number
  endIndex: number
}

/**
 * Find all note links in markdown content
 * Formats: [[file name]] or [[file name|display text]]
 */
export function findLinks(content: string): LinkMatch[] {
  const links: LinkMatch[] = []
  
  // Match Obsidian-style links: [[file name]] or [[file name|display text]]
  const linkRegex = /\[\[([^\]]+)\]\]/g
  let match
  while ((match = linkRegex.exec(content)) !== null) {
    const linkContent = match[1]
    // Check if it's in format fileName|displayText
    const pipeIndex = linkContent.indexOf('|')
    if (pipeIndex !== -1) {
      const fileName = linkContent.substring(0, pipeIndex).trim()
      const displayText = linkContent.substring(pipeIndex + 1).trim()
      links.push({
        fullMatch: match[0],
        fileName: fileName,
        displayText: displayText,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      })
    } else {
      links.push({
        fullMatch: match[0],
        fileName: linkContent,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      })
    }
  }
  
  // Sort by position in content
  return links.sort((a, b) => a.startIndex - b.startIndex)
}

/**
 * Strip file extension from a filename for display purposes
 * Removes .md and .excalidraw extensions
 */
export function stripFileExtension(fileName: string): string {
  if (fileName.endsWith('.excalidraw')) {
    return fileName.slice(0, -11) // Remove '.excalidraw'
  }
  if (fileName.endsWith('.md')) {
    return fileName.slice(0, -3) // Remove '.md'
  }
  return fileName
}

