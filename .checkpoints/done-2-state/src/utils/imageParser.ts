// Utility to parse and render images in markdown content
// Supports both Obsidian-style ![[image.png]] and standard markdown ![](path)

export interface ImageMatch {
  type: 'obsidian' | 'markdown'
  fullMatch: string
  path: string
  alt?: string
  startIndex: number
  endIndex: number
}

/**
 * Find all image references in markdown content
 */
export function findImages(content: string): ImageMatch[] {
  const images: ImageMatch[] = []
  
  // Match (image)[url] format: (image)[data:image/png;base64,...] or (image)[file://path]
  const imageUrlRegex = /\(image\)\[([^\]]+)\]/g
  let match
  while ((match = imageUrlRegex.exec(content)) !== null) {
    images.push({
      type: 'markdown',
      fullMatch: match[0],
      path: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }
  
  // Match Obsidian-style images: ![[image.png]] or ![[path/to/image.png]]
  const obsidianRegex = /!\[\[([^\]]+)\]\]/g
  while ((match = obsidianRegex.exec(content)) !== null) {
    images.push({
      type: 'obsidian',
      fullMatch: match[0],
      path: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }
  
  // Match standard markdown images: ![alt](path) or ![](path)
  const markdownRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  while ((match = markdownRegex.exec(content)) !== null) {
    images.push({
      type: 'markdown',
      fullMatch: match[0],
      path: match[2],
      alt: match[1] || undefined,
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }
  
  // Sort by position in content
  return images.sort((a, b) => a.startIndex - b.startIndex)
}

/**
 * Convert image path to file:// URL for Electron
 */
export async function getImageUrl(imagePath: string, vaultPath?: string): Promise<string> {
  // If it's a data URL, return as is
  if (imagePath.startsWith('data:')) {
    return imagePath
  }
  
  if (!window.electronAPI) {
    return ''
  }
  
  // If path is already absolute or starts with file://, return as is
  if (imagePath.startsWith('file://')) {
    return imagePath
  }
  
  // Get vault path if not provided
  if (!vaultPath) {
    try {
      const vaultResult = await window.electronAPI.getVaultPath()
      vaultPath = vaultResult.vaultPath
    } catch (e) {
      console.error('Failed to get vault path:', e)
    }
  }
  
  if (!vaultPath) {
    return ''
  }
  
  // Normalize path separators
  const normalizedVaultPath = vaultPath.replace(/\\/g, '/')
  const normalizedImagePath = imagePath.replace(/\\/g, '/')
  
  // If image path is absolute (starts with /), use as is
  if (normalizedImagePath.startsWith('/')) {
    return `file://${normalizedImagePath}`
  }
  
  // Combine vault path with image path
  const vaultPathEndsWithSlash = normalizedVaultPath.endsWith('/')
  const imagePathStartsWithSlash = normalizedImagePath.startsWith('/')
  
  let fullPath: string
  if (vaultPathEndsWithSlash && imagePathStartsWithSlash) {
    fullPath = normalizedVaultPath + normalizedImagePath.slice(1)
  } else if (!vaultPathEndsWithSlash && !imagePathStartsWithSlash) {
    fullPath = normalizedVaultPath + '/' + normalizedImagePath
  } else {
    fullPath = normalizedVaultPath + normalizedImagePath
  }
  
  // Convert to file:// URL
  return `file://${fullPath}`
}

/**
 * Render content with images replaced by img tags (async version)
 */
export async function renderContentWithImages(
  content: string, 
  vaultPath?: string
): Promise<{ html: string; hasImages: boolean }> {
  const images = findImages(content)
  
  if (images.length === 0) {
    return { html: content, hasImages: false }
  }
  
  let result = ''
  let lastIndex = 0
  
  for (const image of images) {
    // Add text before image
    result += content.slice(lastIndex, image.startIndex)
    
    // Get image URL
    const imageUrl = await getImageUrl(image.path, vaultPath)
    
    // Create img tag
    const altText = image.alt || image.path.split('/').pop()?.split('\\').pop() || 'Image'
    result += `<img src="${imageUrl}" alt="${altText}" style="max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0;" />`
    
    lastIndex = image.endIndex
  }
  
  // Add remaining text
  result += content.slice(lastIndex)
  
  return { html: result, hasImages: true }
}

