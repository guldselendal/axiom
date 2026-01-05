import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react'
import { getVaultPath, listNoteFiles, createNoteFile, loadNoteFromFile } from '../utils/fileSystem'
import { findImages, getImageUrl } from '../utils/imageParser'
import { findLinks, stripFileExtension } from '../utils/linkParser'
import { getCanvasesForNote } from '../utils/storage'

interface Note {
  id: string
  x: number
  y: number
  width: number
  height: number
  content: string
  color?: string
}

export interface HoverEditorHandle {
  focus: () => void
}

interface HoverEditorProps {
  note: Note
  position: { x: number; y: number }
  filePath?: string
  onSave: (content: string, newFilePath?: string) => void
  onClose: () => void
  onLinkClick?: (fileName: string) => void
  onDelete?: (note: Note) => void
  onFileCreated?: (filePath: string) => void
  allNotes?: Array<{ content: string; filePath?: string; title?: string; id: string }> // All notes to find backlinks
  onPositionChange?: (position: { x: number; y: number }) => void // Callback when position changes (e.g., after drag)
  canvases?: string[] // List of all available canvases for linking
  onCanvasChange?: (canvasName: string) => void // Callback to navigate to a canvas
}

const HoverEditor = forwardRef<HoverEditorHandle, HoverEditorProps>((props, ref) => {
  const { note, position, filePath, onSave, onClose, onLinkClick, onDelete, onFileCreated, allNotes = [], onPositionChange, canvases = [], onCanvasChange } = props
  
  // Safety checks for note object
  if (!note || typeof note !== 'object') {
    console.error('HoverEditor: Invalid note object', note)
    return null
  }
  
  // Split note content into title and body
  // Safety check: ensure content exists (for Markdown notes)
  const noteContent = (note as any)?.content || ''
  const lines = (noteContent || '').split('\n')
  const initialTitle = lines[0] || ''
  const initialBody = lines.slice(1).join('\n')
  
  // Extract filename from filePath (remove .md extension for display)
  const getFileName = (path?: string) => {
    if (!path) return ''
    const fileName = path.split('/').pop() || path
    return fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName
  }
  
  // If title is empty or "Untitled", use filename as default
  const defaultTitle = initialTitle.trim() === '' || initialTitle.trim() === 'Untitled' 
    ? getFileName(filePath) 
    : initialTitle.trim()
  const [title, setTitle] = useState(defaultTitle)
  const [body, setBody] = useState(initialBody)
  const [fileName, setFileName] = useState(getFileName(filePath))
  const [isEditingFileName, setIsEditingFileName] = useState(false)
  const [editorPosition, setEditorPosition] = useState(position)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 })
  
  // Track if position has been manually set (via drag)
  const hasManualPositionRef = useRef(false)
  
  // Reset manual position flag when note changes
  useEffect(() => {
    hasManualPositionRef.current = false
    setEditorPosition(position)
  }, [note.id])
  
  // Update editor position when position prop changes (but not while dragging or if manually positioned)
  useEffect(() => {
    if (!isDragging && !hasManualPositionRef.current) {
      setEditorPosition(position)
    }
  }, [position, isDragging])
  const [vaultPath, setVaultPath] = useState<string>('')
  const [existingFiles, setExistingFiles] = useState<Set<string>>(new Set())
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [noteCanvases, setNoteCanvases] = useState<string[]>([])
  const editorRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const fileNameInputRef = useRef<HTMLInputElement>(null)
  const contentEditableRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const isUpdatingFromMarkdown = useRef(false)
  const linkSelectionRangeRef = useRef<Range | null>(null)
  const linkDisplayTextRef = useRef<string | null>(null)
  const isRenamingRef = useRef(false) // Prevent double rename calls
  const originalTitleRef = useRef<string>(defaultTitle) // Store original title when editor opens

  // Convert HTML content back to markdown
  const convertHtmlToMarkdown = useCallback((html: string): string => {
    if (!html || html === '<br>') return ''
    
    // Create a temporary div to parse HTML
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html
    
    // First, remove any duplicate link syntax that might be adjacent to link buttons
    const linkButtons = tempDiv.querySelectorAll('.note-link')
    linkButtons.forEach(button => {
      const buttonElement = button as HTMLElement
      const fileName = buttonElement.getAttribute('data-file-name')
      if (fileName) {
        // Remove any adjacent text nodes that contain the same link syntax
        let nextSibling = buttonElement.nextSibling
        while (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
          const text = nextSibling.textContent || ''
          if (text.includes(`[[${fileName}]]`)) {
            nextSibling.remove()
            break
          }
          nextSibling = nextSibling.nextSibling
        }
        
        let prevSibling = buttonElement.previousSibling
        while (prevSibling && prevSibling.nodeType === Node.TEXT_NODE) {
          const text = prevSibling.textContent || ''
          if (text.includes(`[[${fileName}]]`)) {
            prevSibling.remove()
            break
          }
          prevSibling = prevSibling.previousSibling
        }
      }
    })
    
    // Helper function to process a node and return its markdown
    const nodeToMarkdown = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || ''
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement
        if (element.tagName === 'IMG') {
          const img = element as HTMLImageElement
          const src = img.src
          return `(image)[${src}]`
        } else if (element.tagName === 'SPAN' && element.classList.contains('note-link-text')) {
          const fileName = element.getAttribute('data-file-name') || element.textContent?.replace(/[\[\]]/g, '') || ''
          const displayText = element.textContent || fileName
          // If display text is different from fileName, use format [[fileName|displayText]]
          if (fileName && displayText !== fileName) {
            return `[[${fileName}|${displayText}]]`
          }
          return fileName ? `[[${fileName}]]` : ''
        } else if (element.tagName === 'BUTTON' && element.classList.contains('note-link')) {
          const fileName = element.getAttribute('data-file-name') || ''
          return fileName ? `[[${fileName}]]` : ''
        } else if (element.tagName === 'BR') {
          return '\n'
        } else if (element.tagName === 'STRONG' || element.tagName === 'B') {
          // Bold text: **text**
          const innerMarkdown = Array.from(element.childNodes).map(nodeToMarkdown).join('')
          return innerMarkdown ? `**${innerMarkdown}**` : ''
        } else if (element.tagName === 'EM' || element.tagName === 'I') {
          // Italic text: *text*
          const innerMarkdown = Array.from(element.childNodes).map(nodeToMarkdown).join('')
          return innerMarkdown ? `*${innerMarkdown}*` : ''
        } else if (element.tagName === 'U') {
          // Underline text: <u>text</u>
          const innerMarkdown = Array.from(element.childNodes).map(nodeToMarkdown).join('')
          return innerMarkdown ? `<u>${innerMarkdown}</u>` : ''
        } else if (element.tagName === 'DIV' || element.tagName === 'P') {
          const innerMarkdown = Array.from(element.childNodes).map(nodeToMarkdown).join('')
          return innerMarkdown + '\n'
        } else {
          // Process children for other elements
          return Array.from(element.childNodes).map(nodeToMarkdown).join('')
        }
      }
      return ''
    }
    
    const markdown = Array.from(tempDiv.childNodes).map(nodeToMarkdown).join('')
    
    // Clean up multiple newlines and trim
    return markdown.replace(/\n{3,}/g, '\n\n').trim()
  }, [])

  const handleSave = useCallback(async () => {
    console.log('🔵 HoverEditor: handleSave called')
    // Get content from contenteditable div and convert to markdown
    let bodyMarkdown = body
    if (contentEditableRef.current) {
      bodyMarkdown = convertHtmlToMarkdown(contentEditableRef.current.innerHTML)
      setBody(bodyMarkdown)
    }
    
    // Combine title and body with newline separator
    const combinedContent = title + (bodyMarkdown ? '\n' + bodyMarkdown : '')
    // If fileName was edited and filePath exists, pass new filename
    if (isEditingFileName && filePath) {
      const originalFileName = filePath.split('/').pop() || filePath
      const originalNameWithoutExt = originalFileName.endsWith('.md') ? originalFileName.slice(0, -3) : originalFileName
      if (fileName !== originalNameWithoutExt) {
        console.log('🔵 HoverEditor: Calling onSave with new fileName, then onClose')
        await onSave(combinedContent, fileName)
        console.log('🔵 HoverEditor: Calling onClose() after save with fileName')
        onClose()
        return
      }
    }
    console.log('🔵 HoverEditor: Calling onSave, then onClose')
    await onSave(combinedContent)
    console.log('🔵 HoverEditor: Calling onClose() after save')
    onClose()
  }, [title, body, fileName, isEditingFileName, filePath, onSave, onClose, convertHtmlToMarkdown])

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      // Focus the content editable area
      if (contentEditableRef.current) {
        contentEditableRef.current.focus()
        // Move cursor to end
        const range = document.createRange()
        range.selectNodeContents(contentEditableRef.current)
        range.collapse(false)
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }
    }
  }), [])

  useEffect(() => {
    console.log('🟢 HoverEditor: Component mounted for note:', note.id, 'filePath:', filePath)
    // Focus title input when editor opens
    if (titleInputRef.current) {
      titleInputRef.current.focus()
      // Select all text if there's content
      if (titleInputRef.current.value) {
        titleInputRef.current.select()
      }
    }
    
    return () => {
      console.log('🔴 HoverEditor: Component UNMOUNTING for note:', note.id, 'filePath:', filePath)
    }
  }, [])

  // Load vault path and list of existing files
  useEffect(() => {
    const loadVaultPath = async () => {
      try {
        const result = await getVaultPath()
        setVaultPath(result.vaultPath)
        
        // Load list of existing files
        const filesResult = await listNoteFiles()
        if (filesResult.success && filesResult.files) {
          // Create a set of file names without .md extension for quick lookup
          const fileNames = new Set(
            filesResult.files.map((file: any) => {
              const fileName = file.name || file
              return fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName
            })
          )
          setExistingFiles(fileNames)
          setAllFiles(Array.from(fileNames))
        }
      } catch (error) {
        console.error('Error loading vault path:', error)
      }
    }
    loadVaultPath()
  }, [])

  // Load canvases that contain this note
  useEffect(() => {
    // Initialize with empty array immediately
    setNoteCanvases([])
    
    // Only load if filePath exists
    if (!filePath) {
      return
    }
    
    let isMounted = true
    
    const loadNoteCanvases = async () => {
      try {
        const canvases = await getCanvasesForNote(filePath)
        if (isMounted && Array.isArray(canvases)) {
          setNoteCanvases(canvases)
        }
      } catch (error) {
        console.error('Error loading note canvases:', error)
        if (isMounted) {
          setNoteCanvases([])
        }
      }
    }
    
    // Use setTimeout to defer execution and prevent blocking render
    const timeoutId = setTimeout(() => {
      loadNoteCanvases()
    }, 100) // Increased delay to ensure component is fully mounted
    
    return () => {
      isMounted = false
      clearTimeout(timeoutId)
    }
  }, [filePath])


  // Initial render of body content with styled links (no buttons)
  useEffect(() => {
    if (contentEditableRef.current && !vaultPath) {
      // Only update if we're not currently updating from markdown (user is not typing)
      if (isUpdatingFromMarkdown.current) return
      
      // Check if contenteditable has focus - if so, don't overwrite user's typing
      if (document.activeElement === contentEditableRef.current) {
        // User is actively typing, don't interfere
        return
      }
      
      // Render with styled links (as spans, not buttons)
      const links = findLinks(body)
      let html = ''
      let lastIndex = 0
      
      for (const link of links) {
        // Add text before link
        const textBefore = body.slice(lastIndex, link.startIndex)
        if (textBefore) {
          html += textBefore.replace(/\n/g, '<br>')
        }
        
        // Check if file exists or if it's a canvas (canvases always exist)
        const isCanvas = canvases.includes(link.fileName)
        const fileExists = existingFiles.has(link.fileName) || isCanvas
        const opacity = fileExists ? '1' : '0.5'
        // Check if link has display text (format: [[fileName|displayText]])
        // If no explicit display text, strip file extension for cleaner display
        const displayText = link.displayText || stripFileExtension(link.fileName)
        // Add styled link span with contenteditable="false" to prevent editing inside
        html += `<span class="note-link-text" contenteditable="false" data-file-name="${link.fileName.replace(/"/g, '&quot;')}" style="color: rgb(99, 102, 241); font-weight: 500; cursor: pointer; opacity: ${opacity};">${displayText}</span>`
        
        lastIndex = link.endIndex
      }
      
      // Add remaining text
      const textAfter = body.slice(lastIndex)
      if (textAfter) {
        html += textAfter.replace(/\n/g, '<br>')
      }
      
      if (!html) {
        html = body.replace(/\n/g, '<br>') || '<br>'
      }
      
      if (contentEditableRef.current.innerHTML !== html) {
        isUpdatingFromMarkdown.current = true
        contentEditableRef.current.innerHTML = html || '<br>'
        isUpdatingFromMarkdown.current = false
      }
    }
  }, [body, vaultPath, existingFiles, canvases])

  // Render body with images and styled links (spans, not buttons)
  useEffect(() => {
    const renderBodyWithImagesAndLinks = async () => {
      if (!contentEditableRef.current || isUpdatingFromMarkdown.current || !vaultPath) {
        return
      }

      // Check if contenteditable has focus - if so, don't overwrite user's typing
      if (document.activeElement === contentEditableRef.current) {
        // User is actively typing, don't interfere
        return
      }

      const images = findImages(body)
      const links = findLinks(body)
      
      // Combine and sort by position
      type Element = 
        | ({ type: 'image' } & { startIndex: number; endIndex: number; path: string; alt?: string })
        | ({ type: 'link' } & { startIndex: number; endIndex: number; fileName: string })
      
      const allElements: Element[] = [
        ...images.map(img => ({ type: 'image' as const, startIndex: img.startIndex, endIndex: img.endIndex, path: img.path, alt: img.alt })),
        ...links.map(link => ({ type: 'link' as const, startIndex: link.startIndex, endIndex: link.endIndex, fileName: link.fileName }))
      ].sort((a, b) => a.startIndex - b.startIndex)
      
      if (allElements.length === 0) {
        // No images or links, just set text content with line breaks and formatting
        // Helper function to convert markdown formatting to HTML
        const markdownToHtml = (text: string): string => {
          // Process bold (**text** or __text__)
          text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          text = text.replace(/__(.+?)__/g, '<strong>$1</strong>')
          
          // Process italic (*text* or _text_)
          text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
          text = text.replace(/_(.+?)_/g, '<em>$1</em>')
          
          return text
        }
        const textWithBreaks = markdownToHtml(body).replace(/\n/g, '<br>')
        if (contentEditableRef.current.innerHTML !== textWithBreaks) {
          isUpdatingFromMarkdown.current = true
          contentEditableRef.current.innerHTML = textWithBreaks || '<br>'
          isUpdatingFromMarkdown.current = false
        }
        return
      }

      // Helper function to convert markdown formatting to HTML
      const markdownToHtml = (text: string): string => {
        // Process bold (**text** or __text__)
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        text = text.replace(/__(.+?)__/g, '<strong>$1</strong>')
        
        // Process italic (*text* or _text_)
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
        text = text.replace(/_(.+?)_/g, '<em>$1</em>')
        
        // Process underline (<u>text</u>)
        // Already in HTML format, so we keep it
        
        return text
      }

      // Build HTML with images and styled links
      let html = ''
      let lastIndex = 0

      for (const element of allElements) {
        // Add text before element
        const textBefore = body.slice(lastIndex, element.startIndex)
        if (textBefore) {
          html += markdownToHtml(textBefore).replace(/\n/g, '<br>')
        }

        if (element.type === 'image') {
          // Get image URL
          const imageUrl = await getImageUrl(element.path, vaultPath || undefined)
          const altText = (element.alt || element.path.split('/').pop()?.split('\\').pop() || 'Image')
          
          // Create img tag
          html += `<img src="${imageUrl}" alt="${altText}" style="max-width: 100%; height: auto; max-height: 300px; object-fit: contain; border-radius: 4px; margin: 8px 0; display: block;" />`
        } else if (element.type === 'link') {
          // Create styled link span with contenteditable="false" to prevent editing inside
          const fileName = element.fileName
          const displayText = element.displayText || stripFileExtension(fileName)
          // Check if file exists or if it's a canvas (canvases always exist)
          const isCanvas = canvases.includes(fileName)
          const fileExists = existingFiles.has(fileName) || isCanvas
          const opacity = fileExists ? '1' : '0.5'
          html += `<span class="note-link-text" contenteditable="false" data-file-name="${fileName.replace(/"/g, '&quot;')}" style="color: rgb(99, 102, 241); font-weight: 500; cursor: pointer; opacity: ${opacity};">${displayText}</span>`
        }

        lastIndex = element.endIndex
      }

      // Add remaining text
      const textAfter = body.slice(lastIndex)
      if (textAfter) {
        html += markdownToHtml(textAfter).replace(/\n/g, '<br>')
      }

      // Update contenteditable if different
      if (contentEditableRef.current.innerHTML !== html) {
        isUpdatingFromMarkdown.current = true
        contentEditableRef.current.innerHTML = html || '<br>'
        isUpdatingFromMarkdown.current = false
      }
    }

    if (vaultPath) {
      renderBodyWithImagesAndLinks()
    }
  }, [body, vaultPath, existingFiles, canvases])

  // Focus rename input when editing starts
  useEffect(() => {
    if (isEditingFileName && fileNameInputRef.current) {
      fileNameInputRef.current.focus()
      fileNameInputRef.current.select()
    }
  }, [isEditingFileName])

  // Escape key handler removed - editor only closes via close button

  // Handle dragging
  useEffect(() => {
    const handleMove = (e: MouseEvent | PointerEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x
        const deltaY = e.clientY - dragStartRef.current.y
        const newPosition = {
          x: dragStartRef.current.startX + deltaX,
          y: dragStartRef.current.startY + deltaY,
        }
        setEditorPosition(newPosition)
        // Notify parent of position change during drag (for real-time updates)
        if (onPositionChange) {
          onPositionChange(newPosition)
        }
      }
    }

    const handleUp = () => {
      if (isDragging) {
        setIsDragging(false)
        // Mark position as manually set
        hasManualPositionRef.current = true
      }
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      return () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }
    }
  }, [isDragging])

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    // Only start dragging if clicking on the header, not on buttons
    if (e.target === headerRef.current || (e.target as HTMLElement).closest('.header-drag-area')) {
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: editorPosition.x,
        startY: editorPosition.y,
      }
      setIsDragging(true)
      e.preventDefault()
    }
  }

  // Don't close on click outside - let user explicitly close with Escape or close button
  // This allows clicking on canvas without closing the editor

  // Calculate editor position (smart positioning near the note, or use dragged position)
  const editorWidth = 420
  const editorHeight = 500 // Fixed height - short side is width
  const padding = 20
  
  // Use dragged position if available, otherwise calculate initial position
  let screenX = editorPosition.x - editorWidth / 2
  let screenY = editorPosition.y + 40
  
  // Keep within viewport bounds
  if (screenX < padding) {
    screenX = padding
  } else if (screenX + editorWidth > window.innerWidth - padding) {
    screenX = window.innerWidth - editorWidth - padding
  }
  
  if (screenY + editorHeight > window.innerHeight - padding) {
    screenY = editorPosition.y - editorHeight - 20
  }
  if (screenY < padding) {
    screenY = padding
  }

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [showFormatToolbar, setShowFormatToolbar] = useState(false)
  const [formatToolbarPos, setFormatToolbarPos] = useState({ x: 0, y: 0 })
  const formatToolbarRef = useRef<HTMLDivElement>(null)
  const [showLinkDropdown, setShowLinkDropdown] = useState(false)
  const [linkDropdownPos, setLinkDropdownPos] = useState({ x: 0, y: 0 })
  const [linkSearchText, setLinkSearchText] = useState('')
  const [linkDropdownIndex, setLinkDropdownIndex] = useState(0)
  const linkDropdownRef = useRef<HTMLDivElement>(null)
  const [availableFiles, setAvailableFiles] = useState<string[]>([])
  const originalPositionRef = useRef(position)
  const originalSizeRef = useRef({ width: editorWidth, height: editorHeight })
  const [showBacklinks, setShowBacklinks] = useState(false)
  const [allVaultNotes, setAllVaultNotes] = useState<Array<{ content: string; filePath?: string; title?: string; id: string }>>([])
  
  // Load all notes from vault for backlink calculation
  useEffect(() => {
    const loadAllNotes = async () => {
      if (!filePath) return
      
      try {
        const filesResult = await listNoteFiles()
        if (filesResult.success && filesResult.files) {
          const loadedNotes: Array<{ content: string; filePath?: string; title?: string; id: string }> = []
          
          // Load content for all files
          await Promise.all(filesResult.files.map(async (file: any) => {
            const filePath = file.path || file.name || file
            try {
              const loadResult = await loadNoteFromFile(filePath)
              if (loadResult.success && loadResult.content !== undefined) {
                const content = loadResult.content || ''
                const lines = content.split('\n')
                const title = (lines[0] || '').trim() || (filePath.split('/').pop() || filePath).replace('.md', '')
                loadedNotes.push({
                  id: filePath, // Use filePath as ID for vault notes
                  content,
                  title,
                  filePath,
                })
              }
            } catch (error) {
              console.error(`Error loading file ${filePath}:`, error)
            }
          }))
          
          setAllVaultNotes(loadedNotes)
        }
      } catch (error) {
        console.error('Error loading all notes for backlinks:', error)
      }
    }
    
    loadAllNotes()
  }, [filePath])
  
  // Calculate backlinks - notes that link to this note
  const backlinks = useMemo(() => {
    if (!filePath) return []
    
    // Get current note's filename (without extension) for comparison
    const currentFileName = filePath.split('/').pop() || filePath
    const normalizedCurrentFileName = currentFileName.endsWith('.md') 
      ? currentFileName.slice(0, -3) 
      : currentFileName
    
    const backlinkNotes: Array<{ id: string; title: string; filePath?: string }> = []
    
    // Combine canvas notes and vault notes, prioritizing canvas notes
    const notesToCheck = [...allNotes, ...allVaultNotes.filter(vaultNote => 
      !allNotes.some(canvasNote => canvasNote.filePath === vaultNote.filePath)
    )]
    
    notesToCheck.forEach(otherNote => {
      // Skip self
      if (otherNote.filePath === filePath || otherNote.id === note.id) return
      
      // Check if this note links to the current note
      if (otherNote.content) {
        const links = findLinks(otherNote.content)
        const linksToCurrent = links.some(link => {
          const linkFileName = link.fileName.trim()
          const normalizedLinkFileName = linkFileName.endsWith('.md')
            ? linkFileName.slice(0, -3)
            : linkFileName
          return normalizedLinkFileName === normalizedCurrentFileName
        })
        
        if (linksToCurrent) {
          backlinkNotes.push({
            id: otherNote.id,
            title: otherNote.title || (otherNote.content.split('\n')[0] || '').trim() || 'Untitled',
            filePath: otherNote.filePath,
          })
        }
      }
    })
    
    return backlinkNotes
  }, [filePath, allNotes, allVaultNotes, note.id])

  // Store original position and size on mount
  useEffect(() => {
    originalPositionRef.current = position
    originalSizeRef.current = { width: editorWidth, height: editorHeight }
  }, [])

  // Handle image paste (extracted to reusable function)
  const handleImagePaste = useCallback(async (imageData: string, _mimeType: string) => {
    if (!contentEditableRef.current) return

    // Create img element
    const img = document.createElement('img')
    img.src = imageData
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.style.maxHeight = '300px'
    img.style.objectFit = 'contain'
    img.style.borderRadius = '4px'
    img.style.margin = '8px 0'
    img.style.display = 'block'

    // Insert at cursor position
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      range.deleteContents()
      range.insertNode(img)
      
      // Move cursor after image
      range.setStartAfter(img)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    } else {
      // If no selection, append to end
      contentEditableRef.current.appendChild(img)
    }

    // Update body markdown to include the image
    const currentMarkdown = convertHtmlToMarkdown(contentEditableRef.current.innerHTML)
    setBody(currentMarkdown)
  }, [convertHtmlToMarkdown])

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(event.target as Node)
      ) {
        setShowContextMenu(false)
      }
      // For format toolbar, only hide if clicking outside the editor or on non-selected text
      if (formatToolbarRef.current && showFormatToolbar) {
        const target = event.target as Node
        // Check if click is outside the format toolbar
        if (!formatToolbarRef.current.contains(target)) {
          // Check if click is in the contenteditable and if there's still a selection
          if (contentEditableRef.current && contentEditableRef.current.contains(target)) {
            // Click is in contenteditable - check if there's still a selection
            const selection = window.getSelection()
            if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
              // No selection or empty selection - hide toolbar
              setShowFormatToolbar(false)
            }
            // If there's still a selection, keep toolbar visible
          } else {
            // Click is outside contenteditable - hide toolbar
            setShowFormatToolbar(false)
          }
        }
      }
    }

    if (showContextMenu || showFormatToolbar) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showContextMenu, showFormatToolbar])

  // Handle text selection and show formatting toolbar
  const handleTextSelection = useCallback(() => {
    // Don't show formatting toolbar if context menu is showing
    if (showContextMenu) {
      setShowFormatToolbar(false)
      return
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !contentEditableRef.current) {
      setShowFormatToolbar(false)
      return
    }

    const range = selection.getRangeAt(0)
    const selectedText = selection.toString().trim()
    
    // Only show toolbar if there's actual text selected (not just cursor)
    if (selectedText.length === 0) {
      setShowFormatToolbar(false)
      return
    }

    // Check if selection is within our contenteditable div
    if (!contentEditableRef.current.contains(range.commonAncestorContainer)) {
      setShowFormatToolbar(false)
      return
    }

    // Log the selected text
    console.log('Text selected:', selectedText)

    // Get position of selection
    const rect = range.getBoundingClientRect()
    const toolbarX = rect.left + (rect.width / 2) - 60 // Center toolbar above selection
    const toolbarY = rect.top - 45 // Position above selection

    setFormatToolbarPos({ x: toolbarX, y: toolbarY })
    setShowFormatToolbar(true)
  }, [showContextMenu])

  // Detect text selection (only when hover editor is active)
  useEffect(() => {
    const handleSelectionChange = () => {
      // Only handle selection if the hover editor's contenteditable is focused or contains the selection
      if (!contentEditableRef.current) {
        return // Don't hide, just return
      }

      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) {
        // No selection - don't hide toolbar, just return
        return
      }

      const range = selection.getRangeAt(0)
      // Only show toolbar if selection is within our contenteditable div
      if (!contentEditableRef.current.contains(range.commonAncestorContainer)) {
        return // Don't hide, just return
      }

      // Check if there's actual selected text
      const selectedText = selection.toString().trim()
      if (selectedText.length === 0) {
        return // Don't hide, just return
      }

      // Immediately show formatting toolbar when text is selected
      handleTextSelection()
    }

    const handleMouseUp = (e: MouseEvent) => {
      // Only handle if click is within the hover editor
      if (!contentEditableRef.current || !editorRef.current) {
        return
      }

      // Check if the click is within the editor
      const target = e.target as Node
      if (!editorRef.current.contains(target)) {
        // Click outside editor - hide toolbar
        setShowFormatToolbar(false)
        return
      }

      // Only check selection if click is within contenteditable area
      if (contentEditableRef.current.contains(target)) {
        // Small delay to ensure selection is complete after mouse release
        setTimeout(() => {
          handleSelectionChange()
        }, 10)
      }
      // Don't hide toolbar if click is elsewhere in editor
    }


    const handleBlur = () => {
      // When contenteditable loses focus, hide toolbar
      setShowFormatToolbar(false)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      // Only handle if contenteditable is focused
      if (document.activeElement !== contentEditableRef.current) {
        return
      }

      // Check if selection keys were pressed (Shift + Arrow, etc.)
      if (e.shiftKey || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
          e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
          (e.metaKey && e.key === 'a')) {
        handleSelectionChange()
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keyup', handleKeyUp)
    
    // Add blur handler to contenteditable
    if (contentEditableRef.current) {
      contentEditableRef.current.addEventListener('blur', handleBlur)
    }

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('keyup', handleKeyUp)
      if (contentEditableRef.current) {
        contentEditableRef.current.removeEventListener('blur', handleBlur)
      }
    }
  }, [handleTextSelection, showContextMenu])

  // Check for ]] pattern at cursor position and convert to link
  const checkAndConvertLink = useCallback(() => {
    if (isUpdatingFromMarkdown.current || !contentEditableRef.current) return false
    
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return false
    
    const range = selection.getRangeAt(0)
    
    // Check if cursor is inside an existing link span - if so, don't interfere
    const container = range.commonAncestorContainer
    const linkSpan = container.nodeType === Node.TEXT_NODE
      ? (container.parentElement as HTMLElement)?.closest('.note-link-text')
      : (container as HTMLElement).closest('.note-link-text')
    
    if (linkSpan) {
      return false // Don't convert if inside a link span
    }
    
    // Convert HTML to markdown first
    const html = contentEditableRef.current.innerHTML
    const markdown = convertHtmlToMarkdown(html)
    
    // Get text content up to cursor position
    const preCaretRange = range.cloneRange()
    preCaretRange.selectNodeContents(contentEditableRef.current)
    preCaretRange.setEnd(range.endContainer, range.endOffset)
    const textBeforeCursor = preCaretRange.toString()
    
    // Check if the last 2 characters in the text before cursor are ]]
    // This works because textBeforeCursor is the plain text representation
    if (textBeforeCursor.length >= 2 && textBeforeCursor.slice(-2) === ']]') {
      
      const links = findLinks(markdown)
      if (links.length > 0) {
        // Check if any of these links are already rendered as spans
        const existingLinkSpans = contentEditableRef.current.querySelectorAll('.note-link-text')
        const existingLinkFileNames = Array.from(existingLinkSpans).map(span => 
          (span as HTMLElement).getAttribute('data-file-name')
        )
        
        // Only convert links that aren't already rendered as spans
        const linksToConvert = links.filter(link => 
          !existingLinkFileNames.includes(link.fileName)
        )
        
        if (linksToConvert.length > 0) {
          // Find the link that was just completed by checking which link ends right before cursor
          // We'll find the link that matches the ]] pattern we just detected
          const cursorOffsetInMarkdown = textBeforeCursor.length
          const justCompletedLink = linksToConvert.find(link => {
            // Check if this link ends right before the cursor
            // The link should end at cursorOffsetInMarkdown (right after the second ])
            return cursorOffsetInMarkdown >= link.endIndex - 1 && cursorOffsetInMarkdown <= link.endIndex + 1
          })
          
          if (justCompletedLink) {
            // Immediately render ALL links as styled spans (including existing ones)
            const allLinks = findLinks(markdown)
            let newHtml = ''
            let lastIndex = 0
            
            for (const link of allLinks) {
              // Add text before link
              const textBefore = markdown.slice(lastIndex, link.startIndex)
              if (textBefore) {
                newHtml += textBefore.replace(/\n/g, '<br>')
              }
              
              // Check if file exists to determine opacity
              const fileExists = existingFiles.has(link.fileName)
              const opacity = fileExists ? '1' : '0.5'
              // Check if link has display text
              const displayText = link.displayText || stripFileExtension(link.fileName)
              // Add styled link span
              newHtml += `<span class="note-link-text" contenteditable="false" data-file-name="${link.fileName.replace(/"/g, '&quot;')}" style="color: rgb(99, 102, 241); font-weight: 500; cursor: pointer; opacity: ${opacity};">${displayText}</span>`
              
              lastIndex = link.endIndex
            }
            
            // Add remaining text
            const textAfter = markdown.slice(lastIndex)
            if (textAfter) {
              newHtml += textAfter.replace(/\n/g, '<br>')
            }
            
            if (!newHtml) {
              newHtml = markdown.replace(/\n/g, '<br>') || '<br>'
            }
            
            // Update HTML
            isUpdatingFromMarkdown.current = true
            contentEditableRef.current.innerHTML = newHtml || '<br>'
            isUpdatingFromMarkdown.current = false
            
            // Restore cursor position after the completed link
            setTimeout(() => {
              const newSelection = window.getSelection()
              if (newSelection && contentEditableRef.current) {
                const completedLinkSpan = contentEditableRef.current.querySelector(`.note-link-text[data-file-name="${justCompletedLink.fileName.replace(/"/g, '&quot;')}"]`)
                if (completedLinkSpan) {
                  const newRange = document.createRange()
                  newRange.setStartAfter(completedLinkSpan)
                  newRange.collapse(true)
                  newSelection.removeAllRanges()
                  newSelection.addRange(newRange)
                }
              }
            }, 0)
            
            // Update body state
            setBody(markdown)
            return true
          }
        }
      }
    }
    return false
  }, [convertHtmlToMarkdown, existingFiles, setBody])

  // Handle content changes from contenteditable
  const handleContentChange = useCallback(() => {
    if (isUpdatingFromMarkdown.current || !contentEditableRef.current) return
    
    const html = contentEditableRef.current.innerHTML
    const markdown = convertHtmlToMarkdown(html)
    
    // Always check for ]] pattern at cursor position when content changes
    // This handles both typing new text and editing existing text
    const converted = checkAndConvertLink()
    if (converted) {
      return // Link was converted, don't update body again (checkAndConvertLink already did)
    }
    
    // Update body state normally if no link conversion happened
    setBody(markdown)
  }, [convertHtmlToMarkdown, checkAndConvertLink])

  // Format text functions
  const applyFormat = useCallback((command: string, value?: string) => {
    if (!contentEditableRef.current) return

    // Restore selection if needed
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      return
    }

    // Apply formatting using execCommand (deprecated but still works)
    document.execCommand(command, false, value)
    
    // Trigger content change to update markdown
    handleContentChange()
    
    // Hide toolbar after formatting
    setShowFormatToolbar(false)
  }, [handleContentChange])

  const handleBold = useCallback(() => {
    applyFormat('bold')
  }, [applyFormat])

  const handleItalic = useCallback(() => {
    applyFormat('italic')
  }, [applyFormat])

  const handleUnderline = useCallback(() => {
    applyFormat('underline')
  }, [applyFormat])

  const handleLink = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !contentEditableRef.current) {
      return
    }

    const range = selection.getRangeAt(0)
    const selectedText = selection.toString().trim()
    
    if (selectedText.length === 0) {
      return
    }

    // Check if selection is within our contenteditable div
    if (!contentEditableRef.current.contains(range.commonAncestorContainer)) {
      return
    }

    // Store the selection range and display text for later use when a file is selected
    linkSelectionRangeRef.current = range.cloneRange()
    linkDisplayTextRef.current = selectedText // Store the selected text to display
    
    // Show dropdown menu at the selection position
    const rect = range.getBoundingClientRect()
    setLinkDropdownPos({ x: rect.left, y: rect.top + rect.height + 5 })
    setLinkSearchText('')
    setLinkDropdownIndex(0)
    // Combine files and canvases, excluding "My Desk"
    const filteredCanvases = canvases.filter(canvas => canvas !== 'My Desk')
    const combined = [...allFiles, ...filteredCanvases]
    setAvailableFiles(combined)
    setShowLinkDropdown(true)
  }, [allFiles, canvases])

  // Check for [[ pattern and show dropdown
  const checkForLinkDropdown = useCallback(() => {
    if (!contentEditableRef.current) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (!contentEditableRef.current.contains(range.commonAncestorContainer)) return

    // Get text before cursor
    const textBeforeCursor = range.cloneRange()
    textBeforeCursor.setStart(contentEditableRef.current, 0)
    const text = textBeforeCursor.toString()

    // Check if last two characters are [[
    if (text.endsWith('[[')) {
      // Show dropdown at cursor position
      const rect = range.getBoundingClientRect()
      setLinkDropdownPos({ x: rect.left, y: rect.top + rect.height + 5 })
      setLinkSearchText('')
      setLinkDropdownIndex(0)
      // Combine files and canvases, excluding "My Desk"
      const filteredCanvases = canvases.filter(canvas => canvas !== 'My Desk')
      const combined = [...allFiles, ...filteredCanvases]
      setAvailableFiles(combined)
      setShowLinkDropdown(true)
    } else if (text.match(/\[\[([^\]]*)$/)) {
      // User is typing after [[ - filter files and canvases
      const match = text.match(/\[\[([^\]]*)$/)
      if (match) {
        const searchText = match[1]
        setLinkSearchText(searchText)
        const searchTextLower = searchText.toLowerCase()
        
        // Filter files and canvases that start with the search text (case-insensitive), excluding "My Desk"
        const filteredFiles = allFiles.filter(file => 
          file.toLowerCase().startsWith(searchTextLower)
        )
        const filteredCanvases = canvases.filter(canvas => 
          canvas !== 'My Desk' && canvas.toLowerCase().startsWith(searchTextLower)
        )
        const filtered = [...filteredFiles, ...filteredCanvases]
        
        setAvailableFiles(filtered)
        setLinkDropdownIndex(0)
        setShowLinkDropdown(true) // Always show dropdown when typing after [[
      }
    } else {
      setShowLinkDropdown(false)
    }
  }, [allFiles, canvases])

  // Insert selected file name into [[...]]
  const insertLinkFileName = useCallback((fileName: string) => {
    if (!contentEditableRef.current) return

    const selection = window.getSelection()
    
    // Check if we have a stored selection range from the +Link button
    let range: Range
    if (linkSelectionRangeRef.current) {
      // Use the stored selection range from +Link button
      range = linkSelectionRangeRef.current
      linkSelectionRangeRef.current = null // Clear the stored range
    } else {
      // Otherwise, use current selection (from typing [[)
      if (!selection || selection.rangeCount === 0) return
      range = selection.getRangeAt(0)
      if (!contentEditableRef.current.contains(range.commonAncestorContainer)) return
    }

    // Get text content before cursor to find [[
    const textBeforeCursor = range.cloneRange()
    textBeforeCursor.setStart(contentEditableRef.current, 0)
    const text = textBeforeCursor.toString()

    // Find the position of [[
    const bracketPos = text.lastIndexOf('[[')
    
    // If no [[ found, this is from +Link button - wrap selected text with link
    if (bracketPos === -1) {
      // Get the display text (the originally selected text)
      const displayText = linkDisplayTextRef.current || fileName
      linkDisplayTextRef.current = null // Clear the stored display text
      
      // Replace selected text with a link span that shows displayText but links to fileName
      // We'll use format: [[fileName|displayText]] for markdown
      range.deleteContents()
      
      // Create a span element for the link
      const linkSpan = document.createElement('span')
      linkSpan.className = 'note-link-text'
      linkSpan.setAttribute('contenteditable', 'false')
      linkSpan.setAttribute('data-file-name', fileName)
      linkSpan.textContent = displayText
      linkSpan.style.color = 'rgb(99, 102, 241)'
      linkSpan.style.fontWeight = '500'
      linkSpan.style.cursor = 'pointer'
      
      // Check if file exists for opacity
      const fileExists = existingFiles.has(fileName)
      linkSpan.style.opacity = fileExists ? '1' : '0.5'
      
      // Add click handler
      linkSpan.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (onLinkClick) {
          onLinkClick(fileName)
        }
      }
      
      range.insertNode(linkSpan)
      
      // Move cursor to after the inserted link
      range.setStartAfter(linkSpan)
      range.collapse(true)
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(range)
      }
      
      // Hide dropdown
      setShowLinkDropdown(false)
      
      // Update body markdown - use format [[fileName|displayText]]
      setTimeout(() => {
        if (contentEditableRef.current) {
          const html = contentEditableRef.current.innerHTML
          const markdown = convertHtmlToMarkdown(html)
          setBody(markdown)
        }
      }, 10)
      return
    }

    // Create a range that starts right after [[ and ends at the current cursor
    const replaceRange = range.cloneRange()
    
    // Find the start position (right after [[)
    const walker = document.createTreeWalker(
      contentEditableRef.current,
      NodeFilter.SHOW_TEXT,
      null
    )

    let currentPos = 0
    let startNode: Text | null = null
    let startOffset = 0
    
    // Find the position right after [[
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text
      const textLength = textNode.textContent?.length || 0
      
      if (currentPos + textLength >= bracketPos + 2) {
        startNode = textNode
        startOffset = bracketPos + 2 - currentPos
        break
      }
      currentPos += textLength
    }

    if (!startNode) return

    // Set the range to replace from after [[ to cursor
    replaceRange.setStart(startNode, startOffset)
    replaceRange.setEnd(range.endContainer, range.endOffset)
    
    // Delete the text between [[ and cursor
    replaceRange.deleteContents()
    
    // Insert the file name followed by ]]
    const linkText = fileName + ']]'
    const textNode = document.createTextNode(linkText)
    replaceRange.insertNode(textNode)
    
    // Move cursor to after the inserted file name and closing brackets
    replaceRange.setStartAfter(textNode)
    replaceRange.collapse(true)
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(replaceRange)
    }

    // Hide dropdown
    setShowLinkDropdown(false)

    // Update body markdown and trigger link conversion
    setTimeout(() => {
      if (contentEditableRef.current) {
        const html = contentEditableRef.current.innerHTML
        const markdown = convertHtmlToMarkdown(html)
        setBody(markdown)
        
        // Trigger link conversion to make it a styled link
        checkAndConvertLink()
      }
    }, 10)
  }, [convertHtmlToMarkdown, checkAndConvertLink])

  // Create new file and insert as link
  const createAndInsertLink = useCallback(async (fileName: string) => {
    if (!fileName || fileName.trim().length === 0) return

    try {
      // Create the file
      const result = await createNoteFile(fileName)
      if (result.success && result.filePath) {
        // Add to file lists
        const newFileName = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName
        setAllFiles(prev => [...prev, newFileName])
        setExistingFiles(prev => new Set([...prev, newFileName]))
        
        // Insert the link
        insertLinkFileName(newFileName)
        
        // Refresh file list
        const filesResult = await listNoteFiles()
        if (filesResult.success && filesResult.files) {
          const fileNames = filesResult.files.map((file: any) => {
            const name = file.name || file
            return name.endsWith('.md') ? name.slice(0, -3) : name
          })
          setAllFiles(fileNames)
          setExistingFiles(new Set(fileNames))
        }
        
        // Notify parent that a file was created
        if (onFileCreated) {
          onFileCreated(result.filePath)
        }
      }
    } catch (error) {
      console.error('Error creating file:', error)
    }
  }, [insertLinkFileName])

  // Handle context menu paste
  const handleContextMenuPaste = useCallback(async () => {
    setShowContextMenu(false)
    
    try {
      // Check clipboard for images
      const clipboardItems = await navigator.clipboard.read()
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type)
            const reader = new FileReader()
            reader.onload = (event) => {
              const base64Data = event.target?.result as string
              if (base64Data) {
                handleImagePaste(base64Data, type)
              }
            }
            reader.readAsDataURL(blob)
            return
          }
        }
      }
      // If no image found, paste as text (browser default will handle it)
      document.execCommand('paste')
    } catch (error) {
      console.error('Error reading clipboard:', error)
    }
  }, [handleImagePaste])


  // Recalculate position for fullscreen (zoomed mode)
  const headerBarHeight = 56 // h-14 = 3.5rem = 56px

  // Adjust editor size for fullscreen (which triggers zoom behavior)
  const finalEditorWidth = isFullscreen 
    ? Math.floor(window.innerWidth * 0.5) // Half screen width when in fullscreen/zoomed
    : editorWidth
  const finalEditorHeight = isFullscreen 
    ? window.innerHeight - (headerBarHeight + 20) 
    : editorHeight // Fixed height - rectangle with width as short side
  let finalScreenX = screenX
  let finalScreenY = screenY
  if (isFullscreen) {
    // Position on the right side of the screen when in fullscreen/zoomed mode
    finalScreenX = window.innerWidth - finalEditorWidth - 20 // Right side with 20px padding
    finalScreenY = headerBarHeight + 10 // Position below header bar with 10px padding
  }

  return (
    <div
      ref={editorRef}
      className={`fixed bg-white shadow-md border border-gray-200 flex flex-col ${isFullscreen ? 'z-[99999]' : 'z-[9999]'}`}
      style={{
        left: `${finalScreenX}px`,
        top: `${finalScreenY}px`,
        width: `${finalEditorWidth}px`,
        height: `${finalEditorHeight}px`,
        borderRadius: '8px',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div 
        ref={headerRef}
        className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white header-drag-area"
        onMouseDown={handleHeaderMouseDown}
        onPointerDown={(e) => {
          e.stopPropagation();
          // Only start dragging if clicking on the header, not on buttons
          if (e.target === headerRef.current || (e.target as HTMLElement).closest('.header-drag-area')) {
            dragStartRef.current = {
              x: e.clientX,
              y: e.clientY,
              startX: editorPosition.x,
              startY: editorPosition.y,
            }
            setIsDragging(true)
            e.preventDefault()
          }
        }}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {/* Title Input - moved to header */}
        <div className="flex-1 min-w-0 mr-4">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                console.log('🟢 HoverEditor: Title input Enter key pressed')
                // Prevent blur handler from firing
                isRenamingRef.current = true
                
                const newTitle = (e.target as HTMLInputElement).value.trim()
                const originalTitle = originalTitleRef.current.trim()
                console.log('🟢 HoverEditor: Title input Enter - originalTitle:', originalTitle, 'newTitle:', newTitle)
                
                // Always save the content when Enter is pressed (user explicitly wants to save)
                const combinedContent = newTitle + (body ? '\n' + body : '')
                
                // If title is different from filename and filePath exists, rename the file
                if (filePath && newTitle) {
                  const currentFileName = getFileName(filePath)
                  if (newTitle !== currentFileName) {
                    console.log('🟢 HoverEditor: Title different from filename on Enter, calling onSave with newTitle to rename (NOT closing)')
                    // Update original title ref for next comparison
                    originalTitleRef.current = newTitle
                    // Save with new filename based on title (but don't close editor)
                    onSave(combinedContent, newTitle)
                    // Don't close - just move focus to contenteditable
                    setTimeout(() => {
                      isRenamingRef.current = false
                      contentEditableRef.current?.focus()
                    }, 100)
                    return
                  }
                }
                
                // Title matches filename or no filePath - just save content to update title
                console.log('🟢 HoverEditor: Title Enter - calling onSave to update content (NOT closing)')
                // Update original title ref
                originalTitleRef.current = newTitle
                onSave(combinedContent)
                // Don't close - just move focus to contenteditable
                setTimeout(() => {
                  isRenamingRef.current = false
                  contentEditableRef.current?.focus()
                }, 100)
              }
            }}
            onBlur={(e) => {
              console.log('🟡 HoverEditor: Title input onBlur triggered')
              // Skip if we just handled Enter key (to prevent double rename)
              if (isRenamingRef.current) {
                console.log('🟡 HoverEditor: Skipping blur - isRenamingRef is true')
                return
              }
              
              const newTitle = (e.target as HTMLInputElement).value.trim()
              const originalTitle = originalTitleRef.current.trim()
              console.log('🟡 HoverEditor: Title input blur - originalTitle:', originalTitle, 'newTitle:', newTitle)
              
              // Only save if title actually changed from original
              if (newTitle === originalTitle) {
                console.log('🟡 HoverEditor: Title unchanged from original, not calling onSave')
                return
              }
              
              // Title changed - save the content
              const combinedContent = newTitle + (body ? '\n' + body : '')
              
              // If title is different from filename and filePath exists, rename the file
              if (filePath && newTitle) {
                const currentFileName = getFileName(filePath)
                if (newTitle !== currentFileName) {
                  console.log('🟡 HoverEditor: Title changed and different from filename, calling onSave with newTitle (NOT closing)')
                  // Update original title ref for next comparison
                  originalTitleRef.current = newTitle
                  // Save with new filename based on title
                  onSave(combinedContent, newTitle)
                  return
                }
              }
              
              // Title changed but matches filename - just save content to update title
              console.log('🟡 HoverEditor: Title changed, calling onSave to update content (NOT closing)')
              // Update original title ref
              originalTitleRef.current = newTitle
              onSave(combinedContent)
            }}
            className="w-full font-semibold text-gray-900 bg-transparent border-none outline-none placeholder:text-gray-400 truncate"
            placeholder={getFileName(filePath) || "Note title..."}
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '18px', fontWeight: 500 }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
        
        {/* Right side - Control buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Three dots menu */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-1.5 hover:bg-gray-50 rounded transition-colors opacity-60 hover:opacity-100"
            title="More options"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>

          {/* Fullscreen toggle - triggers zoom behavior (right side, half width) */}
          {!isFullscreen && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsFullscreen(true)
              }}
              className="p-1.5 hover:bg-gray-50 rounded transition-colors opacity-60 hover:opacity-100"
              title="Fullscreen"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          )}

          {/* Close button - show when in fullscreen, otherwise show regular close */}
          {isFullscreen ? (
            <button
              onClick={(e) => {
                console.log('🟠 HoverEditor: Exit fullscreen button clicked (NOT closing)')
                e.stopPropagation()
                setIsFullscreen(false)
              }}
              className="p-1.5 hover:bg-gray-50 rounded transition-colors opacity-60 hover:opacity-100"
              title="Exit fullscreen"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                await handleSave()
              }}
              className="p-1.5 hover:bg-gray-50 rounded transition-colors opacity-60 hover:opacity-100"
              title="Close"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* File Name Editor (shown when editing) */}
      {isEditingFileName && filePath && (
        <div className="px-6 py-2 border-b border-gray-200 bg-gray-50">
          <input
            ref={fileNameInputRef}
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            onBlur={() => setIsEditingFileName(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsEditingFileName(false)
                fileNameInputRef.current?.blur()
              } else if (e.key === 'Escape') {
                setFileName(getFileName(filePath))
                setIsEditingFileName(false)
                fileNameInputRef.current?.blur()
              }
            }}
            className="w-full text-sm text-gray-600 bg-white border border-gray-300 rounded px-3 py-1.5 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            placeholder="File name..."
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Editor Content */}
      <div className="px-6 py-6 overflow-y-auto flex flex-col" style={{ backgroundColor: '#ffffff', height: `${finalEditorHeight - 180}px`, overflowY: 'auto' }}>
        {/* Body ContentEditable */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div
            ref={contentEditableRef}
            contentEditable
            onInput={(e) => {
              handleContentChange(e)
              // Check for [[ pattern on input
              setTimeout(() => {
                checkForLinkDropdown()
              }, 10)
            }}
            onKeyDown={(e) => {
              // Handle link dropdown navigation
              if (showLinkDropdown) {
                // Show create option only if no files start with the search text
                const hasCreateOption = linkSearchText.trim().length > 0 && 
                  availableFiles.length === 0
                const maxIndex = hasCreateOption ? availableFiles.length : availableFiles.length - 1
                
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setLinkDropdownIndex(prev => {
                    if (prev === -1) return 0 // From create option to first file
                    return Math.min(prev + 1, maxIndex)
                  })
                  return
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setLinkDropdownIndex(prev => {
                    if (prev === 0 && hasCreateOption) return -1 // From first file to create option
                    return Math.max(prev - 1, hasCreateOption ? -1 : 0)
                  })
                  return
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (linkDropdownIndex === -1 && hasCreateOption) {
                    // Create new file
                    createAndInsertLink(linkSearchText.trim())
                  } else if (availableFiles.length > 0 && availableFiles[linkDropdownIndex] !== undefined) {
                    insertLinkFileName(availableFiles[linkDropdownIndex])
                  } else if (linkSearchText.trim().length > 0) {
                    // Fallback: create new file with the search text
                    createAndInsertLink(linkSearchText.trim())
                  }
                  return
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setShowLinkDropdown(false)
                  return
                }
              }

              // Detect when [ key is pressed - check for [[ pattern
              if (e.key === '[') {
                setTimeout(() => {
                  checkForLinkDropdown()
                }, 10)
              }

              // Detect when ] key is pressed and check for ]] pattern
              if (e.key === ']') {
                // Hide dropdown if open
                if (showLinkDropdown) {
                  setShowLinkDropdown(false)
                }
                // Use setTimeout to check after the character is inserted into the DOM
                setTimeout(() => {
                  checkAndConvertLink()
                  // If link was converted, we don't need to do anything else
                  // The checkAndConvertLink already updated the HTML and body state
                }, 10) // Small delay to ensure character is inserted
              }
            }}
            onClick={(e) => {
              // Handle clicks on styled link spans
              const target = e.target as HTMLElement
              if (target.classList.contains('note-link-text')) {
                e.preventDefault()
                e.stopPropagation()
                const fileName = target.getAttribute('data-file-name')
                if (fileName && onLinkClick) {
                  onLinkClick(fileName)
                  // Refresh file list after link click in case a new file was created
                  setTimeout(async () => {
                    try {
                      const filesResult = await listNoteFiles()
                      if (filesResult.success && filesResult.files) {
                        const fileNames = new Set(
                          filesResult.files.map((file: any) => {
                            const fileName = file.name || file
                            return fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName
                          })
                        )
                        setExistingFiles(fileNames)
                        // Force re-render of links with updated opacity by triggering body update
                        // The useEffect hooks will pick up the existingFiles change and re-render
                        if (contentEditableRef.current) {
                          // Temporarily set flag to allow re-render even if focused
                          const wasFocused = document.activeElement === contentEditableRef.current
                          if (wasFocused) {
                            // Blur and re-focus to allow re-render
                            contentEditableRef.current.blur()
                            setTimeout(() => {
                              const html = contentEditableRef.current?.innerHTML
                              if (html) {
                                const markdown = convertHtmlToMarkdown(html)
                                setBody(markdown)
                                // Re-focus after a moment
                                setTimeout(() => {
                                  contentEditableRef.current?.focus()
                                }, 50)
                              }
                            }, 10)
                          } else {
                            const html = contentEditableRef.current.innerHTML
                            const markdown = convertHtmlToMarkdown(html)
                            setBody(markdown)
                          }
                        }
                      }
                    } catch (error) {
                      console.error('Error refreshing file list:', error)
                    }
                  }, 300) // Delay to ensure file is created and file watcher has updated
                }
              }
            }}
            onPaste={async (e) => {
              // Handle image paste
              const items = e.clipboardData.items
              for (let i = 0; i < items.length; i++) {
                const item = items[i]
                if (item.type.indexOf('image') !== -1) {
                  e.preventDefault()
                  
                  const file = item.getAsFile()
                  if (!file) continue
                  
                  // Convert file to base64
                  const reader = new FileReader()
                  reader.onload = async (event) => {
                    const base64Data = event.target?.result as string
                    if (!base64Data) return
                    handleImagePaste(base64Data, item.type)
                  }
                  reader.readAsDataURL(file)
                  break
                }
              }
              // For text paste, let browser handle it normally
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setShowFormatToolbar(false) // Hide formatting toolbar when showing context menu
              setShowContextMenu(true)
              setContextMenuPos({ x: e.clientX, y: e.clientY })
            }}
            className="w-full h-full border-none outline-none text-base text-gray-900 bg-transparent font-normal leading-relaxed focus:outline-none overflow-y-auto"
            style={{ 
              fontFamily: 'system-ui, -apple-system, sans-serif',
              lineHeight: '1.6'
            }}
            suppressContentEditableWarning={true}
          />
        </div>
        
        {/* Backlinks Section */}
        {backlinks.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={() => setShowBacklinks(!showBacklinks)}
              className="w-full flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span className="font-medium">Backlinks ({backlinks.length})</span>
              <svg 
                className={`w-4 h-4 transition-transform ${showBacklinks ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showBacklinks && (
              <div className="mt-2 space-y-1">
                {backlinks.map((backlink) => (
                  <button
                    key={backlink.id}
                    onClick={() => {
                      if (onLinkClick && backlink.filePath) {
                        const fileName = backlink.filePath.split('/').pop() || backlink.filePath
                        const fileNameWithoutExt = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName
                        onLinkClick(fileNameWithoutExt)
                      }
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    {backlink.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with Canvases list */}
      {noteCanvases.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span className="text-sm font-medium text-gray-700">Canvases</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {noteCanvases.map((canvasName) => (
              <button
                key={canvasName}
                onClick={(e) => {
                  e.stopPropagation()
                  // Use onCanvasChange if available, otherwise fall back to onLinkClick
                  if (onCanvasChange) {
                    onCanvasChange(canvasName)
                  } else if (onLinkClick) {
                    onLinkClick(canvasName)
                  }
                }}
                className="px-3 py-1.5 text-xs text-gray-700 bg-gray-50 hover:bg-gray-100 rounded transition-colors"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {canvasName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Formatting Toolbar */}
      {showFormatToolbar && (
        <>
          <div
            ref={formatToolbarRef}
            className={`fixed bg-white rounded-lg shadow-xl border border-gray-300 py-1 flex items-center gap-1 ${isFullscreen ? 'z-[100000]' : 'z-[10000]'}`}
            style={{
              left: `${formatToolbarPos.x}px`,
              top: `${formatToolbarPos.y}px`,
            }}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
          >
            <button
              onClick={handleBold}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors rounded flex items-center justify-center"
              title="Bold"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6zM6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
              </svg>
            </button>
            <button
              onClick={handleItalic}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors rounded flex items-center justify-center"
              title="Italic"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </button>
            <button
              onClick={handleUnderline}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors rounded flex items-center justify-center"
              title="Underline"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5h14M5 19h14" />
              </svg>
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <button
              onClick={handleLink}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors rounded flex items-center justify-center"
              title="Add Link"
            >
              <span className="text-xs font-medium">+Link</span>
            </button>
          </div>
          <div
            className={`fixed inset-0 ${isFullscreen ? 'z-[99998]' : 'z-[9998]'}`}
            onClick={() => setShowFormatToolbar(false)}
            style={{ pointerEvents: 'auto', backgroundColor: 'transparent' }}
          />
        </>
      )}

      {/* Link Dropdown */}
      {showLinkDropdown && (
        <div
          ref={linkDropdownRef}
          className={`fixed bg-white rounded-lg shadow-xl border border-gray-300 py-1 max-h-60 overflow-y-auto min-w-[200px] ${isFullscreen ? 'z-[100001]' : 'z-[10001]'}`}
          style={{
            left: `${linkDropdownPos.x}px`,
            top: `${linkDropdownPos.y}px`,
          }}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onMouseDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
        >
          {/* Show search text at top only if no files start with the search text */}
          {linkSearchText.trim().length > 0 && availableFiles.length === 0 && (
            <div
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-200 ${
                linkDropdownIndex === -1 ? 'bg-blue-50' : ''
              }`}
              onClick={() => {
                createAndInsertLink(linkSearchText.trim())
              }}
              onMouseEnter={() => setLinkDropdownIndex(-1)}
              style={{ color: '#3b82f6' }}
            >
              <span className="font-medium">Create: </span>
              {linkSearchText}
            </div>
          )}
          {availableFiles.map((file, index) => {
            const isCanvas = canvases.includes(file)
            return (
              <div
                key={file}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 flex items-center gap-2 ${
                  index === linkDropdownIndex ? 'bg-gray-100' : ''
                }`}
                onClick={() => {
                  insertLinkFileName(file)
                }}
              onMouseEnter={() => setLinkDropdownIndex(index)}
              >
                {isCanvas && (
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
                <span>{file}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Context Menu */}
      {showContextMenu && (
        <>
          <div
            ref={contextMenuRef}
            className={`fixed bg-white rounded-lg shadow-xl border border-gray-300 py-1 min-w-[180px] ${isFullscreen ? 'z-[100000]' : 'z-[10000]'}`}
            style={{
              left: `${contextMenuPos.x}px`,
              top: `${contextMenuPos.y}px`,
            }}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
          >
            <button
              onClick={handleContextMenuPaste}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Paste
            </button>
          </div>
          <div
            className={`fixed inset-0 ${isFullscreen ? 'z-[99999]' : 'z-[9999]'}`}
            onClick={() => setShowContextMenu(false)}
          />
        </>
      )}

      {/* Menu Dropdown */}
      {showMenu && (
        <>
          <div
            className={`fixed bg-white rounded-lg shadow-xl border border-gray-300 py-1 min-w-[180px] ${isFullscreen ? 'z-[100000]' : 'z-[10000]'}`}
            style={{
              left: `${finalScreenX + finalEditorWidth - 200}px`,
              top: `${finalScreenY + 50}px`,
            }}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
          >
            {filePath && (
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  setShowMenu(false)
                  if (onDelete && window.confirm(`Are you sure you want to delete this note? This action cannot be undone.`)) {
                    onDelete(note)
                    onClose()
                  }
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete file
              </button>
            )}
          </div>
          <div
            className={`fixed inset-0 ${isFullscreen ? 'z-[99999]' : 'z-[9999]'}`}
            onClick={() => setShowMenu(false)}
          />
        </>
      )}
    </div>
  )
})

HoverEditor.displayName = 'HoverEditor'

export default HoverEditor

