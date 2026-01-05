import React, { useEffect, useState } from 'react'
import { ExcalidrawElement, ExcalidrawAppState, BinaryFiles } from '@excalidraw/excalidraw/types/types'
import { ExcalidrawData } from '../types/notes'

interface ExcalidrawPreviewProps {
  excalidrawData: ExcalidrawData
  width: number
  height: number
}

const ExcalidrawPreview: React.FC<ExcalidrawPreviewProps> = ({ excalidrawData, width, height }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const generatePreview = async () => {
      if (!excalidrawData?.elements || excalidrawData.elements.length === 0) {
        setPreviewUrl(null)
        setIsLoading(false)
        return
      }

      try {
        // Dynamically import exportToCanvas
        const { exportToCanvas } = await import('@excalidraw/excalidraw')
        
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

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/png')
        setPreviewUrl(dataUrl)
        setIsLoading(false)
      } catch (error) {
        console.error('Error generating Excalidraw preview:', error)
        setIsLoading(false)
      }
    }

    generatePreview()
  }, [excalidrawData, width, height])

  if (isLoading) {
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

  return (
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
  )
}

export default ExcalidrawPreview

