interface ToolbarProps {
  zoom: number
  onZoomChange: (zoom: number) => void
}

const Toolbar = ({ zoom, onZoomChange }: ToolbarProps) => {
  const zoomPercent = Math.round(zoom * 100)

  return (
    <div className="h-14 bg-transparent flex items-center justify-end px-4 z-10">
      {/* Zoom controls */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/80 backdrop-blur-sm rounded-lg border border-gray-200/50 shadow-sm">
        <span className="text-sm text-gray-700 min-w-[3rem] text-right font-medium">{zoomPercent}%</span>
        <button
          onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))}
          className="p-1.5 text-gray-700 hover:bg-gray-100/80 rounded transition-colors"
          title="Zoom out"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}
          className="p-1.5 text-gray-700 hover:bg-gray-100/80 rounded transition-colors"
          title="Zoom in"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default Toolbar

