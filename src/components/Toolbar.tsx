interface ToolbarProps {
  zoom: number
  onZoomChange: (zoom: number) => void
  activeTool: string
  onToolChange: (tool: string) => void
}

const Toolbar = ({ zoom, onZoomChange, activeTool, onToolChange }: ToolbarProps) => {
  const zoomPercent = Math.round(zoom * 100)

  const tools = [
    { id: 'hand', icon: 'M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11' },
    { id: 'text', icon: 'M4 6h16M4 12h16M4 18h7' },
    { id: 'arrow', icon: 'M13 7l5 5m0 0l-5 5m5-5H6' },
    { id: 'stack', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { id: 'grid', icon: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM12 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM12 13a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z' },
  ]

  return (
    <div className="h-14 bg-white border-t border-gray-200 flex items-center justify-between px-4 z-10">
      {/* Left side - Tools */}
      <div className="flex items-center gap-1">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            className={`relative p-2.5 rounded-lg transition-colors ${
              activeTool === tool.id
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tool.icon} />
            </svg>
            {activeTool === tool.id && tool.id === 'hand' && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary-500 rounded-full"></div>
            )}
          </button>
        ))}
        
        {/* Zoom in */}
        <div className="w-px h-6 bg-gray-200 mx-2"></div>
        <button className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
          </svg>
        </button>
        
        {/* Folder/Box icon */}
        <button className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </button>
      </div>

      {/* Right side - Navigation and Zoom */}
      <div className="flex items-center gap-2">
        {/* Undo */}
        <button className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
        
        {/* Redo */}
        <button className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </button>

        {/* Zoom level */}
        <div className="flex items-center gap-2 px-3">
          <span className="text-sm text-gray-600 min-w-[3rem] text-right">{zoomPercent}%</span>
          <button
            onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))}
            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}
            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Status dot */}
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
      </div>
    </div>
  )
}

export default Toolbar

