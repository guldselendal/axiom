import { useState, useRef, useEffect } from 'react'
import { findImages, getImageUrl } from '../utils/imageParser'
import { findLinks } from '../utils/linkParser'
import { getVaultPath } from '../utils/fileSystem'

interface Note {
  id: string
  x: number
  y: number
  width: number
  height: number
  content: string
  title?: string
  color?: string
  filePath?: string
}

interface NoteCardProps {
  note: Note
  zoom: number
  pan: { x: number; y: number }
  canvasTop: number
  onUpdate: (note: Note) => void
  onEdit: (note: Note, position: { x: number; y: number }) => void
  onDelete?: (note: Note) => void
  onRemove?: (note: Note) => void
  onLinkClick?: (fileName: string) => void
}

const NoteCard = ({ note, zoom, pan, canvasTop, onUpdate, onEdit, onDelete, onRemove, onLinkClick }: NoteCardProps) => {
  const [, setIsDragging] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const [mouseDownPos, setMouseDownPos] = useState({ x: 0, y: 0 })
  const [mouseDownTime, setMouseDownTime] = useState(0)
  const [isMouseDown, setIsMouseDown] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)

  const colorOptions = [
    { name: 'White', value: '#ffffff', bg: 'bg-white' },
    { name: 'Yellow', value: '#fef3c7', bg: 'bg-yellow-100' },
    { name: 'Orange', value: '#fed7aa', bg: 'bg-orange-100' },
    { name: 'Pink', value: '#fce7f3', bg: 'bg-pink-100' },
    { name: 'Purple', value: '#e9d5ff', bg: 'bg-purple-100' },
    { name: 'Blue', value: '#dbeafe', bg: 'bg-blue-100' },
    { name: 'Cyan', value: '#cffafe', bg: 'bg-cyan-100' },
    { name: 'Green', value: '#d1fae5', bg: 'bg-green-100' },
  ]

  // Close color picker and menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        colorPickerRef.current &&
        !colorPickerRef.current.contains(event.target as Node) &&
        !cardRef.current?.contains(event.target as Node)
      ) {
        setShowColorPicker(false)
      }
      
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !menuButtonRef.current?.contains(event.target as Node)
      ) {
        setShowMenu(false)
      }
    }

    if (showColorPicker || showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showColorPicker, showMenu])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isDraggingRef.current = false
    }
  }, [])

  // Global mouse move handler for smooth dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        // Calculate position accounting for canvas pan and zoom
        // Transform screen coordinates to canvas coordinates
        const canvasX = (e.clientX - pan.x) / zoom
        const canvasY = (e.clientY - canvasTop - pan.y) / zoom
        
        // Apply the drag offset to get the new note position
        const newX = canvasX - dragStartRef.current.x
        const newY = canvasY - dragStartRef.current.y
        
        // Update immediately for responsive dragging
        onUpdate({
          ...note,
          x: newX,
          y: newY,
        })
      }
    }

    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        setIsDragging(false)
        setIsMouseDown(false)
        isDraggingRef.current = false
      }
    }

    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: false })
    window.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [zoom, pan, canvasTop, note, onUpdate])

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only handle left mouse button
    if (e.button !== 0) return
    
    // Stop event propagation to prevent canvas panning
    e.stopPropagation()
    
    // Track mouse down position and time
    const mouseX = e.clientX
    const mouseY = e.clientY
    setMouseDownPos({ x: mouseX, y: mouseY })
    setMouseDownTime(Date.now())
    setIsMouseDown(true)
    
    // Calculate drag start offset: where in the card the mouse was clicked
    // Convert screen position to canvas coordinate space
    const canvasX = (mouseX - pan.x) / zoom
    const canvasY = (mouseY - canvasTop - pan.y) / zoom
    
    // Store the offset from the note's position
    dragStartRef.current = {
      x: canvasX - note.x,
      y: canvasY - note.y,
    }
    
    e.preventDefault()
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    // Only handle movement if mouse button is down
    if (!isMouseDown) return
    
    if (!isDraggingRef.current) {
      // Check if mouse has moved (start dragging immediately on any movement)
      const deltaX = Math.abs(e.clientX - mouseDownPos.x)
      const deltaY = Math.abs(e.clientY - mouseDownPos.y)
      const moved = deltaX > 2 || deltaY > 2
      
      if (moved && !showColorPicker) {
        // Start dragging immediately when mouse moves
        isDraggingRef.current = true
        setIsDragging(true)
        e.stopPropagation()
      }
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    // Only handle left mouse button
    if (e.button !== 0) return
    
    if (isDraggingRef.current) {
      e.stopPropagation()
      isDraggingRef.current = false
      setIsDragging(false)
      setIsMouseDown(false)
    } else if (isMouseDown) {
      // Single click detected - show color picker if not moved significantly
      const deltaX = Math.abs(e.clientX - mouseDownPos.x)
      const deltaY = Math.abs(e.clientY - mouseDownPos.y)
      const clickDuration = Date.now() - mouseDownTime
      const isClick = deltaX < 3 && deltaY < 3 && clickDuration < 300
      
      if (isClick) {
        e.stopPropagation()
        setShowColorPicker(true)
      }
    }
    
    // Reset mouse down state
    setIsMouseDown(false)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowColorPicker(false)
    setShowMenu(false)
    
    // Calculate screen position for the hover editor
    // Convert canvas coordinates to screen coordinates
    const screenX = (note.x * zoom) + pan.x
    const screenY = (note.y * zoom) + pan.y + canvasTop
    
    onEdit(note, { x: screenX, y: screenY })
  }

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setShowColorPicker(false)
    
    // Calculate screen position of the menu button
    // The button is positioned at top-1 right-1 relative to the card
    // We need to convert card position (canvas coordinates) to screen coordinates
    const cardScreenX = (note.x * zoom) + pan.x
    const cardScreenY = (note.y * zoom) + pan.y + canvasTop
    
    // Button is at top-1 right-1 (4px from top, 4px from right)
    // Card padding is p-2.5 (10px), button size is ~24px
    const buttonScreenX = cardScreenX + note.width - 4 - 24 // right edge minus padding minus button width
    const buttonScreenY = cardScreenY + 4 // top edge plus padding
    
    setMenuPosition({ x: buttonScreenX, y: buttonScreenY })
    setShowMenu(!showMenu)
  }

  const handleDelete = () => {
    if (onDelete) {
      onDelete(note)
    }
    setShowMenu(false)
  }

  const handleRemove = () => {
    if (onRemove) {
      onRemove(note)
    }
    setShowMenu(false)
  }

  const handleColorSelect = (color: string) => {
    onUpdate({ ...note, color })
    setShowColorPicker(false)
  }

  // Use title field if available, otherwise use first line of content - use trim() for consistency
  const lines = note.content.split('\n')
  const title = (note.title || (lines[0] || '').trim() || '').trim()
  // Always skip the first line from body (it's either the title or was used as title)
  const body = lines.slice(1).join('\n').trim()

  const cardBgColor = note.color || '#ffffff'
  
  // Parse images in body
  const [renderedBody, setRenderedBody] = useState(body)
  const [vaultPath, setVaultPath] = useState<string | null>(null)
  
  useEffect(() => {
    // Get vault path
    getVaultPath().then(result => {
      setVaultPath(result.vaultPath)
    })
  }, [])
  
  useEffect(() => {
    const renderImages = async () => {
      const images = findImages(body)
      if (images.length === 0) {
        setRenderedBody(body)
        return
      }
      
      let result = ''
      let lastIndex = 0
      
      for (const image of images) {
        // Add text before image
        result += body.slice(lastIndex, image.startIndex)
        
        // Get image URL
        const imageUrl = await getImageUrl(image.path, vaultPath || undefined)
        
        // Create img tag placeholder (we'll render it as HTML)
        const altText = image.alt || image.path.split('/').pop()?.split('\\').pop() || 'Image'
        result += `[IMAGE:${imageUrl}:${altText}]`
        
        lastIndex = image.endIndex
      }
      
      // Add remaining text
      result += body.slice(lastIndex)
      setRenderedBody(result)
    }
    
    renderImages()
  }, [body, vaultPath])
  
  // Split rendered body into text, images, and links
  const renderBodyContent = () => {
    // Find links and images in the original body
    const links = findLinks(body)
    const images = findImages(body)
    
    // Combine and sort by position
    const allElements = [
      ...images.map(img => ({ ...img, type: 'image' as const })),
      ...links.map(link => ({ ...link, type: 'link' as const }))
    ].sort((a, b) => a.startIndex - b.startIndex)
    
    if (allElements.length === 0) {
      return <span>{renderedBody}</span>
    }
    
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    
    allElements.forEach((element, index) => {
      // Add text before element
      if (element.startIndex > lastIndex) {
        const textBefore = body.slice(lastIndex, element.startIndex)
        if (textBefore) {
          parts.push(<span key={`text-${index}-before`}>{textBefore}</span>)
        }
      }
      
      if (element.type === 'image') {
        // Find corresponding image in renderedBody
        const imageMatch = renderedBody.match(/\[IMAGE:(.+):([^\]]+)\]/)
        if (imageMatch) {
          const [, url, alt] = imageMatch
          if (url) {
            parts.push(
              <img
                key={`img-${index}`}
                src={url}
                alt={alt || 'Image'}
                className="max-w-full h-auto rounded mt-1 mb-1"
                style={{ maxHeight: '120px', objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            )
          }
        }
      } else if (element.type === 'link') {
        // Add link button
        parts.push(
          <button
            key={`link-${index}`}
            onClick={(e) => {
              e.stopPropagation()
              if (onLinkClick) {
                onLinkClick(element.fileName)
              }
            }}
            className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
          >
            [[{element.fileName}]]
          </button>
        )
      }
      
      lastIndex = element.endIndex
    })
    
    // Add remaining text
    if (lastIndex < body.length) {
      const textAfter = body.slice(lastIndex)
      if (textAfter) {
        parts.push(<span key={`text-end`}>{textAfter}</span>)
      }
    }
    
    return <>{parts}</>
  }

  return (
    <>
      <div
        ref={cardRef}
        data-note-card
        className="absolute rounded-[6px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.12)] transition-all cursor-move note-appear overflow-hidden"
        style={{
          left: `${note.x}px`,
          top: `${note.y}px`,
          width: `${note.width}px`,
          height: `${note.height}px`,
          backgroundColor: cardBgColor,
          border: '1px solid rgba(0, 0, 0, 0.12)',
          zIndex: 1,
          position: 'relative',
        }}
        data-debug-card={JSON.stringify({
          id: note.id,
          noteX: note.x,
          noteY: note.y,
          width: note.width,
          height: note.height,
          centerX: note.x + note.width / 2,
          centerY: note.y + note.height / 2,
          pan: { x: pan.x, y: pan.y },
          zoom: zoom,
          expectedScreenX: (note.x * zoom) + pan.x,
          expectedScreenY: (note.y * zoom) + pan.y,
          expectedScreenCenterX: ((note.x + note.width / 2) * zoom) + pan.x,
          expectedScreenCenterY: ((note.y + note.height / 2) * zoom) + pan.y,
        })}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          // Prevent default context menu on right-click
          e.preventDefault()
          e.stopPropagation()
        }}
      >
      <div className="p-2.5 h-full flex flex-col relative overflow-hidden">
        {/* Three-dot menu button */}
        <button
          ref={menuButtonRef}
          onClick={handleMenuClick}
          className="absolute top-1 right-1 p-1 rounded hover:bg-gray-100 transition-opacity z-10"
          onMouseDown={(e) => e.stopPropagation()}
          title="More options"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
        
        <div className="flex flex-col gap-1.5 min-h-0 flex-1 overflow-hidden">
          {title && (
            <div className="text-sm font-medium text-gray-900 leading-snug flex-shrink-0">
              {title}
            </div>
          )}
          {body && (
            <div className="text-xs text-gray-600 leading-[1.5] whitespace-pre-wrap break-words overflow-hidden">
              {renderBodyContent()}
            </div>
          )}
          {!note.content && (
            <div className="text-xs text-gray-400 italic leading-relaxed">
              Double-click to edit
            </div>
          )}
        </div>
      </div>
      </div>
      
      {/* Color Picker */}
      {showColorPicker && (
        <div
          ref={colorPickerRef}
          className="absolute bg-white rounded-lg shadow-xl border border-gray-300 p-2.5 z-[100]"
          style={{
            left: `${note.x + note.width + 10}px`,
            top: `${note.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-4 gap-2">
            {colorOptions.map((color) => (
              <button
                key={color.value}
                onClick={() => handleColorSelect(color.value)}
                className={`w-7 h-7 rounded-md border-2 transition-all hover:scale-110 ${
                  (note.color || '#ffffff') === color.value
                    ? 'border-gray-500 ring-2 ring-gray-400 ring-offset-1'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        </div>
      )}

      {/* Menu Dropdown */}
      {showMenu && (
        <div
          ref={menuRef}
          className="fixed bg-white rounded-lg shadow-xl border border-gray-300 py-1 z-[1000] min-w-[180px]"
          style={{
            left: `${menuPosition.x}px`,
            top: `${menuPosition.y + 24}px`, // Position below the button (button height ~24px)
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
          {onRemove && (
            <button
              onClick={handleRemove}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Remove from desk
            </button>
          )}
          {onDelete && note.filePath && (
            <button
              onClick={handleDelete}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete permanently
            </button>
          )}
        </div>
      )}
    </>
  )
}

export default NoteCard

