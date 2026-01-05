import React, { useEffect, useState } from 'react'
import { ExcalidrawElement, ExcalidrawAppState, BinaryFiles } from '@excalidraw/excalidraw/types/types'
import { ExcalidrawData } from '../types/notes'

interface ExcalidrawPreviewProps {
  excalidrawData: ExcalidrawData
  width: number
  height: number
  shouldUpdate?: boolean
}

const ExcalidrawPreview: React.FC<ExcalidrawPreviewProps> = ({ excalidrawData, width, height, shouldUpdate = true }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Create a hash of the excalidrawData to detect changes
  // This helps React detect when the data actually changes
  // Use a more comprehensive hash that includes element count and updated timestamps
  const dataHash = excalidrawData?.elements 
    ? `${excalidrawData.elements.length}-${excalidrawData.elements.reduce((sum, el) => sum + (el.updated || 0), 0)}`
    : 'empty'

  useEffect(() => {
    // Don't regenerate if shouldUpdate is false (e.g., editor is open)
    if (!shouldUpdate) {
      console.log('ExcalidrawPreview: Skipping update because shouldUpdate is false')
      return
    }
    
    // Don't reset preview immediately - keep old one visible while generating new one
    setIsLoading(true)
    
    let cancelled = false
    
    const generatePreview = async () => {
      console.log('ExcalidrawPreview: Generating preview, elements count:', excalidrawData?.elements?.length, 'dataHash:', dataHash)
      if (!excalidrawData?.elements || excalidrawData.elements.length === 0) {
        // Only clear preview if there are actually no elements
        if (!cancelled) {
          setPreviewUrl(null)
          setIsLoading(false)
        }
        return
      }

      try {
        // Add timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
          if (!cancelled) {
            console.warn('ExcalidrawPreview: Preview generation timeout')
            setIsLoading(false)
          }
        }, 10000) // 10 second timeout

        // Dynamically import exportToCanvas
        const { exportToCanvas } = await import('@excalidraw/excalidraw')
        
        if (cancelled) {
          clearTimeout(timeoutId)
          return
        }
        
        // Prepare appState with viewport settings
        const appState: ExcalidrawAppState = {
          ...(excalidrawData.appState || {}),
          viewBackgroundColor: excalidrawData.appState?.viewBackgroundColor || '#ffffff',
        }

        // Prepare files
        const files: BinaryFiles = {}
        if (excalidrawData.files) {
          Object.entries(excalidrawData.files).forEach(([id, fileData]) => {
            files[id] = {
              id: fileData.id,
              dataURL: fileData.dataURL,
              mimeType: fileData.mimeType,
              created: fileData.created,
            }
          })
        }

        // Export to canvas
        const canvas = await exportToCanvas({
          elements: excalidrawData.elements as readonly ExcalidrawElement[],
          appState,
          files,
          getDimensions: (originalWidth, originalHeight) => {
            // Scale to fit the preview size while maintaining aspect ratio
            const scale = Math.min(width / originalWidth, height / originalHeight, 1)
            return {
              width: originalWidth * scale,
              height: originalHeight * scale,
              scale,
            }
          },
        })

        if (cancelled) {
          clearTimeout(timeoutId)
          return
        }

        clearTimeout(timeoutId)

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/png')
        // Only update preview URL after successful generation
        setPreviewUrl(dataUrl)
        setIsLoading(false)
        console.log('ExcalidrawPreview: Preview generated successfully')
      } catch (error) {
        console.error('Error generating Excalidraw preview:', error)
        // Don't clear existing preview on error - keep showing the old one
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    generatePreview()
    
    return () => {
      cancelled = true
    }
  }, [excalidrawData, width, height, dataHash, shouldUpdate])

  // Show loading overlay only if we don't have a preview yet
  // If we have a preview, keep showing it while loading the new one
  if (isLoading && !previewUrl) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        color: '#999',
      }}>
        Loading...
      </div>
    )
  }

  if (!previewUrl) {
    // Only show "No preview" if there are actually no elements
    if (!excalidrawData?.elements || excalidrawData.elements.length === 0) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          color: '#999',
        }}>
          No preview
        </div>
      )
    }
    // If we have elements but no preview URL, show loading
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        color: '#999',
      }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <img
        src={previewUrl}
        alt="Excalidraw preview"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          fontSize: '12px',
          color: '#999',
        }}>
          Updating...
        </div>
      )}
    </div>
  )
}

export default ExcalidrawPreview

