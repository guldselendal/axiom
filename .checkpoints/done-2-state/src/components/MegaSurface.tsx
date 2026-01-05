import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Camera, screenToWorld, worldToScreen, adjustPanForZoom, WORLD_SIZE } from '../utils/coords';
import { createNoteFile, saveNoteToFile, loadNoteFromFile, deleteNoteFile, renameNoteFile } from '../utils/fileSystem';
import { loadPan, savePan } from '../utils/storage';
import { findLinks } from '../utils/linkParser';
import HoverEditor from './HoverEditor';
import ExcalidrawNoteEditor from './ExcalidrawNoteEditor';
import ExcalidrawPreview from './ExcalidrawPreview';
import { Note, MarkdownNote, ExcalidrawNote, isMarkdownNote, isExcalidrawNote, getNoteTypeFromFilePath, ExcalidrawData } from '../types/notes';

/**
 * MegaSurface - Infinite canvas with stable world coordinates
 * 
 * Coordinate System:
 * - Notes use worldX, worldY (world coordinates) that never change
 * - Camera (panX, panY, zoom) is separate state
 * - All coordinate conversions go through coords.ts
 */

// Re-export for backward compatibility
export type { Note }

interface MegaSurfaceProps {
  canvasId?: string;
  notes?: Note[];
  onNotesChange?: (notes: Note[]) => void;
  onFileCreated?: (filePath: string) => void;
  onFileRename?: (oldFilePath: string, newFilePath: string, newTitle: string) => void;
  onFileDelete?: (filePath: string) => void;
  onCreateNoteOnCanvas?: (filePath: string, noteType: 'markdown' | 'excalidraw') => void; // Callback to create note on canvas and open editor
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  onCanvasChange?: (canvasId: string) => void; // Callback to switch to a different canvas
  canvases?: string[]; // List of all available canvases
}

export default function MegaSurface({ canvasId = 'My Desk', notes: externalNotes, onNotesChange, onFileCreated, onFileRename, onFileDelete, onCreateNoteOnCanvas, zoom: externalZoom, onZoomChange, onCanvasChange, canvases = [] }: MegaSurfaceProps) {
  // Debug: Log canvases prop changes
  useEffect(() => {
    console.log('MegaSurface: canvases prop updated:', canvases);
  }, [canvases]);

  // Camera state - separate from world coordinates
  const [camera, setCamera] = useState<Camera>({ 
    panX: 0, 
    panY: 0, 
    zoom: externalZoom ?? 1.0 
  });
  const [isPanLoaded, setIsPanLoaded] = useState(false);
  
  // Sync external zoom prop with internal camera zoom
  useEffect(() => {
    if (externalZoom !== undefined && externalZoom !== camera.zoom && viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const viewportCenterX = rect.width / 2;
      const viewportCenterY = rect.height / 2;
      setCamera(prev => {
        const newPan = adjustPanForZoom(viewportCenterX, viewportCenterY, rect, prev, externalZoom);
        return {
          ...prev,
          zoom: externalZoom,
          panX: newPan.panX,
          panY: newPan.panY,
        };
      });
    }
  }, [externalZoom]);
  
  // Notify parent when zoom changes internally (from wheel)
  const prevZoomRef = useRef(camera.zoom);
  useEffect(() => {
    if (onZoomChange && camera.zoom !== prevZoomRef.current && camera.zoom !== externalZoom) {
      prevZoomRef.current = camera.zoom;
      onZoomChange(camera.zoom);
    }
  }, [camera.zoom, onZoomChange, externalZoom]);

  // Notes state - use external if provided, otherwise internal
  const [internalNotes, setInternalNotes] = useState<Note[]>([]);
  const notes = externalNotes ?? internalNotes;
  const setNotes = onNotesChange ?? setInternalNotes;
  
  // Editing state
  const [editingNotes, setEditingNotes] = useState<Array<{ note: Note; position: { x: number; y: number }; filePath?: string }>>([]);
  const [pendingNoteCreation, setPendingNoteCreation] = useState<{ filePath: string; noteType: 'markdown' | 'excalidraw' } | null>(null);

  // Color picker state
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null); // note ID or null
  const colorPickerRef = useRef<HTMLDivElement>(null);
  
  // Context menu state
  const [contextMenuNote, setContextMenuNote] = useState<Note | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);
  
  // Canvas context menu state (for right-click on empty canvas)
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number } | null>(null);
  const canvasContextMenuRef = useRef<HTMLDivElement>(null);
  
  // Canvas selection popup state
  const [showCanvasSelection, setShowCanvasSelection] = useState(false);
  const [canvasSelectionPos, setCanvasSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const canvasSelectionRef = useRef<HTMLDivElement>(null);
  
  // Color options (same as NoteCard)
  const colorOptions = [
    { name: 'White', value: '#ffffff', bg: 'bg-white' },
    { name: 'Yellow', value: '#fef3c7', bg: 'bg-yellow-100' },
    { name: 'Orange', value: '#fed7aa', bg: 'bg-orange-100' },
    { name: 'Pink', value: '#fce7f3', bg: 'bg-pink-100' },
    { name: 'Purple', value: '#e9d5ff', bg: 'bg-purple-100' },
    { name: 'Blue', value: '#dbeafe', bg: 'bg-blue-100' },
    { name: 'Cyan', value: '#cffafe', bg: 'bg-cyan-100' },
    { name: 'Green', value: '#d1fae5', bg: 'bg-green-100' },
  ];

  // Refs
  const viewportRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ screenX: 0, screenY: 0, panX: 0, panY: 0 });
  const isDraggingNoteRef = useRef(false);
  const isResizingNoteRef = useRef(false);
  const resizeNoteRef = useRef<{
    noteId: string;
    startWidth: number;
    startHeight: number;
    startWorldX: number;
    startWorldY: number;
    pointerWorld: { x: number; y: number };
    handle: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's';
    aspectRatio: number; // Store initial aspect ratio
  } | null>(null);
  const dragNoteRef = useRef<{ 
    noteId: string; 
    startWorldX: number; 
    startWorldY: number; 
    pointerWorld: { x: number; y: number } 
  } | null>(null);
  const noteMouseDownRef = useRef<{ noteId: string; screenX: number; screenY: number; time: number } | null>(null);

  // Get viewport rect for coordinate conversions
  const getViewportRect = useCallback((): DOMRect => {
    return viewportRef.current?.getBoundingClientRect() || new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  }, []);

  // Load pan position when canvas changes
  useEffect(() => {
    const loadPanPosition = async () => {
      setIsPanLoaded(false);
      // Clear editing state when canvas changes
      setEditingNotes([]);
      setShowColorPicker(null);
      
      const savedPan = await loadPan(canvasId);
      if (savedPan) {
        setCamera(prev => ({
          ...prev,
          panX: savedPan.x,
          panY: savedPan.y,
        }));
      } else {
        // Canvas has no saved pan - start from center (0, 0)
        setCamera(prev => ({
          ...prev,
          panX: 0,
          panY: 0,
        }));
      }
      setIsPanLoaded(true);
    };
    loadPanPosition();
  }, [canvasId]);

  // Save pan position whenever it changes
  useEffect(() => {
    if (isPanLoaded) {
      savePan({ x: camera.panX, y: camera.panY }, canvasId);
    }
  }, [camera.panX, camera.panY, isPanLoaded, canvasId]);

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Don't close if clicking on a note, hover editor, or the color picker itself
      if (target.closest('[data-note]')) {
        return;
      }
      if (target.closest('[style*="z-index: 9999"], [style*="z-index: 99999"], [style*="z-index:9999"], [style*="z-index:99999"]')) {
        return;
      }
      if (colorPickerRef.current && colorPickerRef.current.contains(target)) {
        return;
      }
      
      // Close color picker if clicking outside
      if (colorPickerRef.current && !colorPickerRef.current.contains(target)) {
        setShowColorPicker(null);
      }
    };

    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showColorPicker]);

  // Close context menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Don't close if clicking on a note, hover editor, or the menus themselves
      if (target.closest('[data-note]')) {
        return;
      }
      if (target.closest('[style*="z-index: 9999"], [style*="z-index: 99999"], [style*="z-index:9999"], [style*="z-index:99999"]')) {
        return;
      }
      if (colorPickerRef.current && colorPickerRef.current.contains(target)) {
        return;
      }
      
      // Close context menus if clicking outside
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(target)
      ) {
        setContextMenuNote(null);
      }
      if (
        canvasContextMenuRef.current &&
        !canvasContextMenuRef.current.contains(target)
      ) {
        setCanvasContextMenu(null);
      }
      if (
        canvasSelectionRef.current &&
        !canvasSelectionRef.current.contains(target)
      ) {
        setShowCanvasSelection(false);
      }
    };

    if (contextMenuNote || canvasContextMenu || showCanvasSelection) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [contextMenuNote, canvasContextMenu, showCanvasSelection]);

  // Panning: drag background (middle mouse, space+left mouse, or left mouse on background)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Don't interfere with drag and drop operations
    // Check if this is part of a drag operation by checking if pointerType is mouse and button is 0
    // But only prevent if we're actually going to pan (not during a drag from external source)
    
    // Check if clicking on a note (let note handle it)
    const target = e.target as HTMLElement;
    if (target.closest('[data-note]')) {
      return;
    }

    // Check if clicking on hover editor or any fixed-position overlay
    // Hover editors have z-index 9999 or 99999, and are fixed positioned
    // Also check for Excalidraw editor using data attribute
    if (target.closest('[style*="z-index: 9999"], [style*="z-index: 99999"], [style*="z-index:9999"], [style*="z-index:99999"], [data-excalidraw-editor="true"]')) {
      return;
    }

    // Close all popups when clicking on empty canvas
    if (showColorPicker && colorPickerRef.current && !colorPickerRef.current.contains(target)) {
      setShowColorPicker(null);
    }
    if (contextMenuNote) {
      setContextMenuNote(null);
    }
    if (canvasContextMenu) {
      setCanvasContextMenu(null);
    }
    if (showCanvasSelection) {
      setShowCanvasSelection(false);
    }

    // Pan with:
    // - Middle mouse button
    // - Left mouse + shift/space
    // - Left mouse on background (for trackpad/mousepad support)
    const canPan = 
      e.button === 1 || // Middle mouse
      (e.button === 0 && e.shiftKey) || // Left mouse + shift
      (e.button === 0 && !target.closest('[data-note]')); // Left mouse on background

    if (canPan) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = {
        screenX: e.clientX,
        screenY: e.clientY,
        panX: camera.panX,
        panY: camera.panY,
      };
      target.setPointerCapture(e.pointerId);
    }
  }, [camera, showColorPicker]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanningRef.current) {
      // Update pan based on mouse movement
      const deltaX = e.clientX - panStartRef.current.screenX;
      const deltaY = e.clientY - panStartRef.current.screenY;
      setCamera({
        ...camera,
        panX: panStartRef.current.panX + deltaX,
        panY: panStartRef.current.panY + deltaY,
      });
    } else if (isResizingNoteRef.current && resizeNoteRef.current) {
      // Resizing a note - maintain aspect ratio
      const note = notes.find(n => n.id === resizeNoteRef.current!.noteId);
      if (note) {
        const rect = getViewportRect();
        const currentPointerWorld = screenToWorld(e.clientX, e.clientY, rect, camera);
        
        const deltaWorldX = currentPointerWorld.x - resizeNoteRef.current.pointerWorld.x;
        const deltaWorldY = currentPointerWorld.y - resizeNoteRef.current.pointerWorld.y;
        
        const handle = resizeNoteRef.current.handle;
        const minSize = 100; // Minimum size
        const aspectRatio = resizeNoteRef.current.aspectRatio;
        
        let newWidth = resizeNoteRef.current.startWidth;
        let newHeight = resizeNoteRef.current.startHeight;
        let newWorldX = resizeNoteRef.current.startWorldX;
        let newWorldY = resizeNoteRef.current.startWorldY;
        
        // Calculate new size maintaining aspect ratio
        // Use the larger delta to determine scale, maintaining aspect ratio
        const absDeltaX = Math.abs(deltaWorldX);
        const absDeltaY = Math.abs(deltaWorldY);
        
        if (handle === 'se') { // Southeast (bottom-right)
          // Use the larger movement to determine scale
          const scale = absDeltaX >= absDeltaY ? deltaWorldX : deltaWorldY * aspectRatio;
          newWidth = Math.max(minSize, resizeNoteRef.current.startWidth + scale);
          newHeight = newWidth / aspectRatio;
        } else if (handle === 'sw') { // Southwest (bottom-left)
          const scale = absDeltaX >= absDeltaY ? -deltaWorldX : deltaWorldY * aspectRatio;
          newWidth = Math.max(minSize, resizeNoteRef.current.startWidth + scale);
          newHeight = newWidth / aspectRatio;
          newWorldX = resizeNoteRef.current.startWorldX + (resizeNoteRef.current.startWidth - newWidth);
        } else if (handle === 'ne') { // Northeast (top-right)
          const scale = absDeltaX >= absDeltaY ? deltaWorldX : -deltaWorldY * aspectRatio;
          newWidth = Math.max(minSize, resizeNoteRef.current.startWidth + scale);
          newHeight = newWidth / aspectRatio;
          newWorldY = resizeNoteRef.current.startWorldY + (resizeNoteRef.current.startHeight - newHeight);
        } else if (handle === 'nw') { // Northwest (top-left)
          const scale = absDeltaX >= absDeltaY ? -deltaWorldX : -deltaWorldY * aspectRatio;
          newWidth = Math.max(minSize, resizeNoteRef.current.startWidth + scale);
          newHeight = newWidth / aspectRatio;
          newWorldX = resizeNoteRef.current.startWorldX + (resizeNoteRef.current.startWidth - newWidth);
          newWorldY = resizeNoteRef.current.startWorldY + (resizeNoteRef.current.startHeight - newHeight);
        }
        
        setNotes(prevNotes => prevNotes.map(n => 
          n.id === resizeNoteRef.current!.noteId 
            ? { ...n, width: newWidth, height: newHeight, worldX: newWorldX, worldY: newWorldY }
            : n
        ));
      }
    } else if (isDraggingNoteRef.current && dragNoteRef.current) {
      // Dragging a note - use world coordinates
      const rect = getViewportRect();
      const currentPointerWorld = screenToWorld(e.clientX, e.clientY, rect, camera);
      const note = notes.find(n => n.id === dragNoteRef.current!.noteId);
      
      if (note) {
        // If moved significantly, cancel color picker click
        if (noteMouseDownRef.current && noteMouseDownRef.current.noteId === note.id) {
          const deltaX = Math.abs(e.clientX - noteMouseDownRef.current.screenX);
          const deltaY = Math.abs(e.clientY - noteMouseDownRef.current.screenY);
          if (deltaX > 3 || deltaY > 3) {
            noteMouseDownRef.current = null;
          }
        }
        
        // Calculate delta in world space
        const deltaWorldX = currentPointerWorld.x - dragNoteRef.current.pointerWorld.x;
        const deltaWorldY = currentPointerWorld.y - dragNoteRef.current.pointerWorld.y;
        
        // Update note position in world coordinates
        const newWorldX = dragNoteRef.current.startWorldX + deltaWorldX;
        const newWorldY = dragNoteRef.current.startWorldY + deltaWorldY;
        
        setNotes(notes.map(n => 
          n.id === note.id 
            ? { ...n, worldX: newWorldX, worldY: newWorldY }
            : n
        ));
      }
    }
  }, [camera, notes, setNotes, getViewportRect]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanningRef.current) {
    isPanningRef.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
    if (isDraggingNoteRef.current) {
      isDraggingNoteRef.current = false;
      dragNoteRef.current = null;
    }
    if (isResizingNoteRef.current) {
      isResizingNoteRef.current = false;
      resizeNoteRef.current = null;
    }
  }, []);

  // Zooming: mouse wheel zoom toward the cursor
  // Use native event listener to avoid passive event listener issue
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Only zoom with Ctrl/Cmd
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }
      
    e.preventDefault();
    const rect = getViewportRect();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(3.0, camera.zoom * delta));
      
      // Adjust pan to keep world point under cursor stable
    const newPan = adjustPanForZoom(e.clientX, e.clientY, rect, camera, newZoom);
      
      setCamera({
        panX: newPan.panX,
        panY: newPan.panY,
        zoom: newZoom,
      });
    };

    const viewport = viewportRef.current;
    if (viewport) {
      // Add event listener with { passive: false } to allow preventDefault
      viewport.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        viewport.removeEventListener('wheel', handleWheel);
      };
    }
  }, [camera, getViewportRect]);

  // Helper to get next available note number
  const getNextAvailableNoteNumber = useCallback(() => {
    const noteNumbers = new Set<number>();
    notes.forEach(note => {
      if (note.filePath) {
        const match = note.filePath.match(/Note (\d+)\.md$/);
        if (match) {
          noteNumbers.add(parseInt(match[1], 10));
        }
      }
    });
    
    let nextNumber = 1;
    while (noteNumbers.has(nextNumber)) {
      nextNumber++;
    }
    return nextNumber;
  }, [notes]);

  // Create note at position (extracted to reusable function)
  const createNoteAtPosition = useCallback(async (screenX: number, screenY: number) => {
    // Convert screen coordinates to world coordinates
    const rect = getViewportRect();
    const worldPos = screenToWorld(screenX, screenY, rect, camera);
    
    // Create file for the note
    const noteNumber = getNextAvailableNoteNumber();
    const fileName = `Note ${noteNumber}`;
    const createResult = await createNoteFile(fileName);
    
    if (createResult.success && createResult.filePath) {
      const newNote: MarkdownNote = {
        id: `note-${Date.now()}-${Math.random()}`,
        type: 'markdown',
        worldX: worldPos.x - 100, // Center the note on the cursor
        worldY: worldPos.y - 75,
        width: 200,
        height: 150,
        content: '',
        title: fileName,
        color: '#ffffff',
        filePath: createResult.filePath,
      };
      
      setNotes([...notes, newNote]);
      
      // Notify parent that file was created
      if (onFileCreated) {
        onFileCreated(createResult.filePath);
      }
    }
  }, [camera, notes, setNotes, getViewportRect, getNextAvailableNoteNumber, onFileCreated]);

  // Create note from file and open editor (called from sidebar) - does NOT add to canvas
  const createNoteFromFile = useCallback(async (filePath: string, noteType: 'markdown' | 'excalidraw') => {
    // Get viewport center for editor position
    const rect = getViewportRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Get current notes
    const currentNotes = externalNotes ?? internalNotes;
    
    // Check if note already exists on canvas
    const existingNote = currentNotes.find((n: Note) => n.filePath === filePath);
    if (existingNote) {
      // Note already exists on canvas, just open it
      const screenPos = worldToScreen(existingNote.worldX, existingNote.worldY, rect, camera);
      setEditingNotes(prev => {
        // Check if already editing
        if (prev.some(e => e.note.id === existingNote.id)) {
          return prev;
        }
        return [...prev, {
          note: existingNote,
          position: { x: screenPos.x + existingNote.width / 2, y: screenPos.y + existingNote.height / 2 },
          filePath: existingNote.filePath,
        }];
      });
      return;
    }
    
    // Load file content
    try {
      console.log('createNoteFromFile: Loading file:', filePath, 'noteType:', noteType);
      
      // Ensure filePath has the correct extension
      let actualFilePath = filePath;
      if (noteType === 'excalidraw') {
        // For excalidraw, ensure we have the correct extension
        if (filePath.endsWith('.md')) {
          // Replace .md with .excalidraw
          actualFilePath = filePath.replace(/\.md$/, '.excalidraw');
          console.log('createNoteFromFile: Adjusted filePath from', filePath, 'to', actualFilePath);
        } else if (!filePath.endsWith('.excalidraw')) {
          // Add .excalidraw if no extension
          actualFilePath = `${filePath}.excalidraw`;
          console.log('createNoteFromFile: Added .excalidraw extension:', actualFilePath);
        }
      }
      
      // Try to load the file
      let result = await loadNoteFromFile(actualFilePath);
      
      // If file doesn't exist and we're trying to load an excalidraw file,
      // check if there's a .md file with the same name and create the .excalidraw file
      if (!result.success && noteType === 'excalidraw' && actualFilePath.endsWith('.excalidraw')) {
        console.log('createNoteFromFile: Excalidraw file not found, creating it with default structure');
        // Create the file with default Excalidraw structure
        const defaultExcalidrawData = {
          type: 'excalidraw',
          version: 2,
          source: 'https://excalidraw.com',
          elements: [],
          appState: {
            gridSize: null,
            viewBackgroundColor: '#ffffff',
          },
          files: {},
        };
        const jsonContent = JSON.stringify(defaultExcalidrawData, null, 2);
        const saveResult = await saveNoteToFile(actualFilePath, jsonContent);
        if (saveResult.success) {
          // Now try loading again
          result = await loadNoteFromFile(actualFilePath);
          console.log('createNoteFromFile: Created and loaded new Excalidraw file:', result.success);
        } else {
          console.error('createNoteFromFile: Failed to create Excalidraw file:', saveResult.error);
        }
      }
      console.log('createNoteFromFile: Load result:', result);
      
      if (result.success && result.content !== undefined) {
        let tempNote: Note;
        
        if (noteType === 'excalidraw') {
          try {
            console.log('createNoteFromFile: Parsing Excalidraw data, content length:', result.content.length);
            console.log('createNoteFromFile: Content preview:', result.content.substring(0, 200));
            
            // Validate that content looks like JSON
            const trimmedContent = result.content.trim();
            if (!trimmedContent.startsWith('{') && !trimmedContent.startsWith('[')) {
              console.error('createNoteFromFile: Content does not appear to be JSON. Content:', trimmedContent);
              // Try to create a valid Excalidraw structure from scratch
              const excalidrawData: ExcalidrawData = {
                type: 'excalidraw',
                version: 2,
                source: 'https://excalidraw.com',
                elements: [],
                appState: {
                  gridSize: null,
                  viewBackgroundColor: '#ffffff',
                },
                files: {},
              };
              
              // Save the correct structure to the file
              const jsonContent = JSON.stringify(excalidrawData, null, 2);
              await saveNoteToFile(actualFilePath, jsonContent);
              
              const fileName = actualFilePath.split('/').pop() || actualFilePath;
              const title = fileName.endsWith('.excalidraw') ? fileName.slice(0, -11) : fileName;
              
              tempNote = {
                id: `temp-${actualFilePath}-${Date.now()}`,
                type: 'excalidraw',
                worldX: 0,
                worldY: 0,
                width: 200,
                height: 150,
                excalidrawData,
                title,
                color: '#ffffff',
                filePath: actualFilePath,
              } as ExcalidrawNote;
              
              console.log('createNoteFromFile: Created Excalidraw note with default structure:', tempNote.id);
            } else {
              const excalidrawData = JSON.parse(result.content) as ExcalidrawData;
              console.log('createNoteFromFile: Parsed Excalidraw data:', excalidrawData);
              
              // Ensure excalidrawData has required structure
              if (!excalidrawData.elements) {
                excalidrawData.elements = [];
              }
              if (!excalidrawData.appState) {
                excalidrawData.appState = { viewBackgroundColor: '#ffffff' };
              }
              if (!excalidrawData.files) {
                excalidrawData.files = {};
              }
              
              const fileName = actualFilePath.split('/').pop() || actualFilePath;
              const title = fileName.endsWith('.excalidraw') ? fileName.slice(0, -11) : fileName;
              
              tempNote = {
                id: `temp-${actualFilePath}-${Date.now()}`,
                type: 'excalidraw',
                worldX: 0, // Not on canvas, so position doesn't matter
                worldY: 0,
                width: 200,
                height: 150,
                excalidrawData,
                title,
                color: '#ffffff',
                filePath: actualFilePath,
              } as ExcalidrawNote;
              
              console.log('createNoteFromFile: Created Excalidraw note:', tempNote.id, tempNote.title, 'has excalidrawData:', !!tempNote.excalidrawData);
            }
          } catch (parseError) {
            console.error('Error parsing Excalidraw file:', parseError, 'Content:', result.content);
            return;
          }
        } else {
          // Markdown note
          const content = result.content || '';
          const lines = content.split('\n');
          const title = (lines[0] || '').trim() || (filePath.endsWith('.md') ? filePath.split('/').pop()?.slice(0, -3) : filePath.split('/').pop());
          
          tempNote = {
            id: `temp-${filePath}-${Date.now()}`,
            type: 'markdown',
            worldX: 0, // Not on canvas, so position doesn't matter
            worldY: 0,
            width: 200,
            height: 150,
            content: content,
            title: title,
            color: '#ffffff',
            filePath: filePath,
          } as MarkdownNote;
        }
        
        // Open editor WITHOUT adding to canvas
        // Position editor at center of viewport
        console.log('createNoteFromFile: Opening editor for note:', tempNote.id, 'type:', tempNote.type);
        const finalFilePath = noteType === 'excalidraw' ? actualFilePath : filePath;
        setEditingNotes(prev => {
          // Check if already editing this file
          if (prev.some(e => e.filePath === finalFilePath)) {
            console.log('createNoteFromFile: Already editing this file, skipping');
            return prev;
          }
          const newEditingNote = {
            note: tempNote,
            position: { x: centerX - 210, y: centerY - 250 }, // Center the editor (editor is ~420px wide, ~500px tall)
            filePath: finalFilePath,
          };
          console.log('createNoteFromFile: Adding to editingNotes:', newEditingNote);
          return [...prev, newEditingNote];
        });
      } else {
        console.error('createNoteFromFile: Failed to load file or content is undefined:', result);
      }
    } catch (error) {
      console.error('Error loading file:', error);
    }
  }, [camera, getViewportRect, externalNotes, internalNotes]);

  // Handle pending note creation (triggered from sidebar)
  useEffect(() => {
    if (pendingNoteCreation) {
      createNoteFromFile(pendingNoteCreation.filePath, pendingNoteCreation.noteType);
      setPendingNoteCreation(null);
    }
  }, [pendingNoteCreation, createNoteFromFile]);

  // Expose function to parent via callback prop
  useEffect(() => {
    if (onCreateNoteOnCanvas) {
      // Store the setter function in a way the parent can call it
      // We'll use a closure to capture setPendingNoteCreation
      (window as any).__createNoteOnCanvas = (filePath: string, noteType: 'markdown' | 'excalidraw') => {
        setPendingNoteCreation({ filePath, noteType });
      };
      return () => {
        delete (window as any).__createNoteOnCanvas;
      };
    }
  }, [onCreateNoteOnCanvas]);

  // Create note: double click creates a note at the clicked world coordinate
  const handleDoubleClick = useCallback(async (e: React.MouseEvent) => {
    // Don't create note if double-clicking on existing note
    const target = e.target as HTMLElement;
    if (target.closest('[data-note]')) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    await createNoteAtPosition(e.clientX, e.clientY);
  }, [createNoteAtPosition]);

  // Handle canvas context menu (right-click on empty canvas)
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Don't show canvas context menu if clicking on a note or other UI element
    if (target.closest('[data-note]')) {
      return;
    }
    if (target.closest('[style*="z-index: 9999"], [style*="z-index: 99999"], [style*="z-index:9999"], [style*="z-index:99999"]')) {
      return;
    }
    if (colorPickerRef.current && colorPickerRef.current.contains(target)) {
      return;
    }
    if (contextMenuRef.current && contextMenuRef.current.contains(target)) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    setCanvasContextMenu({ x: e.clientX, y: e.clientY });
    setContextMenuNote(null); // Close note context menu if open
    setShowColorPicker(null); // Close color picker if open
  }, []);

  // Create canvas card at position (reusable function)
  const createCanvasCardAtPosition = useCallback((canvasIdToAdd: string, worldX: number, worldY: number) => {
    // Get current notes (use externalNotes if available, otherwise internal)
    const currentNotes = externalNotes ?? internalNotes;
    
    // Check if canvas card already exists
    const existingCanvasCard = currentNotes.find((n: Note) => n.canvasId === canvasIdToAdd);
    if (existingCanvasCard) {
      // Just update position
      const updatedNotes = currentNotes.map((n: Note) => 
        n.id === existingCanvasCard.id 
          ? { ...n, worldX: worldX - 100, worldY: worldY - 60 }
          : n
      );
      setNotes(updatedNotes);
      return;
    }
    
    // Create a new canvas card (height is the shorter side)
    const canvasCard: MarkdownNote = {
      id: `canvas-${canvasIdToAdd}-${Date.now()}`,
      type: 'markdown',
      worldX: worldX - 100,
      worldY: worldY - 60,
      width: 200,
      height: 120, // Height is the shorter side
      content: `Canvas: ${canvasIdToAdd}`,
      title: canvasIdToAdd,
      color: '#e0e7ff', // Light blue color for canvas cards
      canvasId: canvasIdToAdd,
    };
    
    setNotes([...currentNotes, canvasCard]);
  }, [externalNotes, internalNotes, setNotes, getViewportRect, camera]);

  // Handle canvas card click to switch canvas (only on click, not drag)
  const handleCanvasCardClick = useCallback((note: Note) => {
    if (note.canvasId && onCanvasChange) {
      onCanvasChange(note.canvasId);
    }
  }, [onCanvasChange]);

  // Handle mouse down on note (for click detection)
  const handleNoteMouseDown = useCallback((e: React.MouseEvent, note: Note) => {
    // Only handle left mouse button
    if (e.button !== 0) return;
    
    e.stopPropagation();
    
    // Track mouse down for click detection
    noteMouseDownRef.current = {
      noteId: note.id,
      screenX: e.clientX,
      screenY: e.clientY,
      time: Date.now(),
    };
  }, []);

  // Handle mouse move on note (to detect drag vs click)
  const handleNoteMouseMove = useCallback((e: React.MouseEvent) => {
    if (noteMouseDownRef.current && !isDraggingNoteRef.current) {
      const deltaX = Math.abs(e.clientX - noteMouseDownRef.current.screenX);
      const deltaY = Math.abs(e.clientY - noteMouseDownRef.current.screenY);
      
      // If moved significantly, cancel click detection
      if (deltaX > 3 || deltaY > 3) {
        noteMouseDownRef.current = null;
      }
    }
  }, []);

  // Handle mouse up on note (for color picker click or canvas card click)
  const handleNoteMouseUp = useCallback((e: React.MouseEvent, note: Note) => {
    // Only handle left mouse button
    if (e.button !== 0) return;
    
    e.stopPropagation();
    
    // Check if this was a click (not a drag)
    if (noteMouseDownRef.current && noteMouseDownRef.current.noteId === note.id) {
      const deltaX = Math.abs(e.clientX - noteMouseDownRef.current.screenX);
      const deltaY = Math.abs(e.clientY - noteMouseDownRef.current.screenY);
      const clickDuration = Date.now() - noteMouseDownRef.current.time;
      const isClick = deltaX < 3 && deltaY < 3 && clickDuration < 300;
      
      if (isClick && !isDraggingNoteRef.current) {
        // For canvas cards, switch to that canvas
        if (note.canvasId) {
          handleCanvasCardClick(note);
        } else {
          // For regular notes, show color picker
          setShowColorPicker(note.id);
        }
      }
    }
    
    noteMouseDownRef.current = null;
  }, [handleCanvasCardClick]);

  const handleResizeHandlePointerDown = useCallback((e: React.PointerEvent, note: Note, handle: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's') => {
    e.stopPropagation();
    e.preventDefault();
    
    // Only allow resizing for Excalidraw notes
    if (!isExcalidrawNote(note)) {
      return;
    }
    
    const rect = getViewportRect();
    const pointerWorld = screenToWorld(e.clientX, e.clientY, rect, camera);
    
    // Calculate initial aspect ratio
    const aspectRatio = note.width / note.height;
    
    isResizingNoteRef.current = true;
    resizeNoteRef.current = {
      noteId: note.id,
      startWidth: note.width,
      startHeight: note.height,
      startWorldX: note.worldX,
      startWorldY: note.worldY,
      pointerWorld,
      handle,
      aspectRatio,
    };
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [camera, getViewportRect]);

  // Drag note: dragging updates the note's worldX/worldY using world deltas
  const handleNotePointerDown = useCallback((e: React.PointerEvent, note: Note) => {
    // Don't start dragging if we're clicking on a resize handle
    const target = e.target as HTMLElement;
    if (target.closest('[data-resize-handle]')) {
      return;
    }
    
    e.stopPropagation();
    
    // Capture initial world position and pointer world coordinate
    const rect = getViewportRect();
    const pointerWorld = screenToWorld(e.clientX, e.clientY, rect, camera);
    
    isDraggingNoteRef.current = true;
    dragNoteRef.current = {
      noteId: note.id,
      startWorldX: note.worldX,
      startWorldY: note.worldY,
      pointerWorld,
    };
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [camera, getViewportRect, screenToWorld]);

  // Handle color selection
  const handleColorSelect = useCallback((noteId: string, color: string) => {
    setNotes(notes.map(n => 
      n.id === noteId 
        ? { ...n, color }
        : n
    ));
    setShowColorPicker(null);
  }, [notes, setNotes]);

  // Handle note double-click to open editor
  const handleNoteDoubleClick = useCallback((e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Check if already editing
    if (editingNotes.some(e => e.note.id === note.id)) {
      return;
    }
    
    const rect = getViewportRect();
    const screenPos = worldToScreen(note.worldX, note.worldY, rect, camera);
    
    setEditingNotes([...editingNotes, {
      note,
      position: { x: screenPos.x + note.width / 2, y: screenPos.y + note.height / 2 },
      filePath: note.filePath,
    }]);
  }, [camera, editingNotes, getViewportRect]);

  // Handle note context menu (right-click)
  const handleNoteContextMenu = useCallback((e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Calculate menu position, ensuring it stays within viewport
    const menuWidth = 180; // min-w-[180px]
    const menuHeight = 100; // Approximate height for 2 buttons
    const padding = 10; // Padding from viewport edge
    
    let x = e.clientX;
    let y = e.clientY;
    
    // Adjust horizontal position if menu would go off-screen to the right
    if (x + menuWidth + padding > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }
    // Adjust horizontal position if menu would go off-screen to the left
    if (x < padding) {
      x = padding;
    }
    
    // Adjust vertical position if menu would go off-screen to the bottom
    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }
    // Adjust vertical position if menu would go off-screen to the top
    if (y < padding) {
      y = padding;
    }
    
    setContextMenuNote(note);
    setContextMenuPos({ x, y });
    setShowColorPicker(null);
  }, []);

  // Handle remove from canvas
  const handleRemoveFromCanvas = useCallback((note: Note) => {
    // Get current notes (use externalNotes if available, otherwise internal)
    const currentNotes = externalNotes ?? internalNotes;
    
    // Try to find the note by ID first, then by filePath as fallback
    const noteToRemove = currentNotes.find(n => n.id === note.id) || 
                         (note.filePath ? currentNotes.find(n => n.filePath === note.filePath) : null);
    
    if (!noteToRemove) {
      console.warn('Note not found on canvas:', note.id, note.filePath);
      setContextMenuNote(null);
      return;
    }
    
    const filtered = currentNotes.filter(n => n.id !== noteToRemove.id);
    console.log('Removing note from canvas:', noteToRemove.id, noteToRemove.filePath, 'Current notes:', currentNotes.length, 'After filter:', filtered.length);
    setNotes(filtered);
    setContextMenuNote(null);
  }, [externalNotes, internalNotes, setNotes]);

  // Handle delete permanently
  const handleDeletePermanently = useCallback(async (note: Note) => {
    if (note.filePath) {
      await deleteNoteFile(note.filePath);
      // Notify parent about file deletion
      if (onFileDelete) {
        onFileDelete(note.filePath);
      }
    }
    // Get current notes (use externalNotes if available, otherwise internal)
    const currentNotes = externalNotes ?? internalNotes;
    const filtered = currentNotes.filter(n => n.id !== note.id);
    console.log('Deleting note permanently:', note.id, 'Current notes:', currentNotes.length, 'After filter:', filtered.length);
    setNotes(filtered);
    setContextMenuNote(null);
  }, [externalNotes, internalNotes, setNotes, onFileDelete]);

  // Handle drag and drop from sidebar
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    console.log('Drag over:', { types: Array.from(e.dataTransfer.types) });
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Drop event fired!', { types: Array.from(e.dataTransfer.types) });
    
    const filePath = e.dataTransfer.getData('text/plain');
    const canvasIdDropped = e.dataTransfer.getData('application/canvas-id');
    
    console.log('Drop event:', { filePath, canvasIdDropped, dataTransferTypes: Array.from(e.dataTransfer.types) });
    
    // Check if it's a canvas drop (either from custom MIME type or text/plain with canvas: prefix)
    let canvasId: string | null = null;
    if (canvasIdDropped) {
      canvasId = canvasIdDropped;
    } else if (filePath && filePath.startsWith('canvas:')) {
      canvasId = filePath.substring(7); // Remove 'canvas:' prefix
    }
    
    const rect = getViewportRect();
    const worldPos = screenToWorld(e.clientX, e.clientY, rect, camera);
    
    // Handle canvas drop
    if (canvasId) {
      createCanvasCardAtPosition(canvasId, worldPos.x, worldPos.y);
      return;
    }
    
    // Handle file drop (existing logic)
    // Skip if it was a canvas drop (filePath would be 'canvas:...')
    if (!filePath || filePath.startsWith('canvas:')) {
      return;
    }
    
    // Get current notes
    const currentNotes = externalNotes ?? internalNotes;
    
    // Check if note already exists
    const existingNote = currentNotes.find((n: Note) => n.filePath === filePath);
    if (existingNote) {
      // Just update position
      const updatedNotes = currentNotes.map((n: Note) => 
        n.id === existingNote.id 
          ? { ...n, worldX: worldPos.x - 100, worldY: worldPos.y - 75 }
          : n
      );
      setNotes(updatedNotes);
      return;
    }
    
    // Load file content
    try {
      const result = await loadNoteFromFile(filePath);
      if (result.success && result.content !== undefined) {
        const noteType = getNoteTypeFromFilePath(filePath);
        
        if (noteType === 'excalidraw') {
          // Parse Excalidraw JSON
          try {
            const excalidrawData = JSON.parse(result.content) as ExcalidrawData;
            
            // Validate and ensure structure is correct
            if (!excalidrawData.elements) {
              excalidrawData.elements = [];
            }
            if (!excalidrawData.appState) {
              excalidrawData.appState = { viewBackgroundColor: '#ffffff' };
            }
            if (!excalidrawData.files) {
              excalidrawData.files = {};
            }
            
            const fileName = filePath.split('/').pop() || filePath;
            const title = fileName.endsWith('.excalidraw') ? fileName.slice(0, -11) : fileName;
            
            console.log('handleDrop: Creating Excalidraw note, elements count:', excalidrawData.elements?.length);
            
            const newNote: ExcalidrawNote = {
              id: `file-${filePath}-${Date.now()}`,
              type: 'excalidraw',
              worldX: worldPos.x - 100,
              worldY: worldPos.y - 75,
              width: 200,
              height: 150,
              excalidrawData,
              title,
              color: '#ffffff',
              filePath: filePath,
              updatedAt: Date.now(), // Set updatedAt to ensure preview regenerates
            };
            
            setNotes([...currentNotes, newNote]);
          } catch (parseError) {
            console.error('Error parsing Excalidraw file:', parseError);
            console.error('File content:', result.content?.substring(0, 200));
          }
        } else {
          // Markdown note
          const content = result.content || '';
          const lines = content.split('\n');
          const title = (lines[0] || '').trim() || (filePath.endsWith('.md') ? filePath.split('/').pop()?.slice(0, -3) : filePath.split('/').pop());
          
          const newNote: MarkdownNote = {
            id: `file-${filePath}-${Date.now()}`,
            type: 'markdown',
            worldX: worldPos.x - 100,
            worldY: worldPos.y - 75,
            width: 200,
            height: 150,
            content: content,
            title: title,
            color: '#ffffff',
            filePath: filePath,
          };
          
          setNotes([...currentNotes, newNote]);
        }
      }
    } catch (error) {
      console.error('Error loading file on drop:', error);
    }
  }, [camera, setNotes, getViewportRect, externalNotes, internalNotes]);

  // Calculate links between notes
  const noteLinks = useMemo(() => {
    const links: Array<{ from: Note; to: Note }> = [];
    
    notes.forEach(fromNote => {
      // Only markdown notes can have links
      if (!isMarkdownNote(fromNote) || !fromNote.content) return;
      
      const linkMatches = findLinks(fromNote.content);
      
      linkMatches.forEach(link => {
        // Normalize the linked file name (remove .md or .excalidraw extension)
        const linkedFileName = link.fileName.trim();
        const normalizedLinkedFileName = linkedFileName.endsWith('.excalidraw')
          ? linkedFileName.slice(0, -11) // Remove '.excalidraw'
          : linkedFileName.endsWith('.md')
          ? linkedFileName.slice(0, -3) // Remove '.md'
          : linkedFileName;
        
        // First, check if it's a canvas link (case-insensitive matching)
        let targetNote = notes.find(toNote => {
          if (toNote.canvasId) {
            // Case-insensitive comparison for canvas names
            return toNote.canvasId.toLowerCase() === normalizedLinkedFileName.toLowerCase();
          }
          return false;
        });
        
        // If not a canvas, find the target note by matching filePath (case-insensitive)
        if (!targetNote) {
          targetNote = notes.find(toNote => {
            if (!toNote.filePath) return false;
            
            // Normalize the target note's file path (remove .md or .excalidraw extension)
            const targetFileName = toNote.filePath.split('/').pop() || toNote.filePath;
            const normalizedTargetFileName = targetFileName.endsWith('.excalidraw')
              ? targetFileName.slice(0, -11) // Remove '.excalidraw'
              : targetFileName.endsWith('.md')
              ? targetFileName.slice(0, -3) // Remove '.md'
              : targetFileName;
            
            // Case-insensitive comparison for file names
            return normalizedTargetFileName.toLowerCase() === normalizedLinkedFileName.toLowerCase();
          });
        }
        
        if (targetNote && targetNote.id !== fromNote.id) {
          // Check if this link already exists (avoid duplicates)
          const exists = links.some(l => l.from.id === fromNote.id && l.to.id === targetNote.id);
          if (!exists) {
            links.push({ from: fromNote, to: targetNote });
            console.log('MegaSurface: Added link from', fromNote.id, 'to', targetNote.id);
          }
        } else {
          console.log('MegaSurface: No target note found for link:', link.fileName, 'from note:', fromNote.id);
        }
      });
    });
    
    console.log('MegaSurface: Total links found:', links.length);
    return links;
  }, [notes]);

  return (
    <div
      ref={viewportRef}
      className="absolute inset-0 overflow-hidden bg-gray-100"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnter={(e) => {
        // Allow drag enter to enable drop
        e.preventDefault();
        e.stopPropagation();
        console.log('Drag enter on canvas', { types: Array.from(e.dataTransfer.types) });
      }}
      onDragLeave={() => {
        console.log('Drag leave canvas');
      }}
      onContextMenu={handleCanvasContextMenu}
      style={{ cursor: isPanningRef.current ? 'grabbing' : 'grab' }}
    >
      {/* Mega-surface with camera transform */}
      <div
        style={{
          position: 'absolute',
          width: `${WORLD_SIZE}px`,
          height: `${WORLD_SIZE}px`,
          left: 0,
          top: 0,
          transform: `translate(${camera.panX}px, ${camera.panY}px) scale(${camera.zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {/* Render arrows between linked notes - behind notes */}
        <svg
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${WORLD_SIZE}px`,
            height: `${WORLD_SIZE}px`,
            pointerEvents: 'none',
            zIndex: 0, // Behind notes (zIndex: 2)
            overflow: 'visible',
          }}
        >
          {/* Arrow marker definition */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3, 0 6"
                fill="#6366f1"
                opacity="0.8"
              />
            </marker>
          </defs>
          {noteLinks.map((link, index) => {
            // Validate that notes have valid coordinates
            if (typeof link.from.worldX !== 'number' || typeof link.from.worldY !== 'number' ||
                typeof link.to.worldX !== 'number' || typeof link.to.worldY !== 'number' ||
                isNaN(link.from.worldX) || isNaN(link.from.worldY) ||
                isNaN(link.to.worldX) || isNaN(link.to.worldY)) {
              console.warn('MegaSurface: Invalid coordinates for link', {
                from: { worldX: link.from.worldX, worldY: link.from.worldY },
                to: { worldX: link.to.worldX, worldY: link.to.worldY }
              });
              return null;
            }
            
            // Calculate note centers in world coordinates
            const fromCenterX = link.from.worldX + link.from.width / 2;
            const fromCenterY = link.from.worldY + link.from.height / 2;
            const toCenterX = link.to.worldX + link.to.width / 2;
            const toCenterY = link.to.worldY + link.to.height / 2;
            
            // Calculate arrow direction
            const dx = toCenterX - fromCenterX;
            const dy = toCenterY - fromCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Skip if distance is too small (notes are overlapping or too close)
            if (distance < 10 || !isFinite(distance)) {
              return null;
            }
            
            // Simple center-to-center arrow
            // Calculate offset from center to edge based on note dimensions
            const fromOffsetX = (link.from.width / 2) * (dx / distance);
            const fromOffsetY = (link.from.height / 2) * (dy / distance);
            const toOffsetX = (link.to.width / 2) * (dx / distance);
            const toOffsetY = (link.to.height / 2) * (dy / distance);
            
            // Start from edge of source note, end at edge of target note
            const arrowStartX = fromCenterX + fromOffsetX;
            const arrowStartY = fromCenterY + fromOffsetY;
            const arrowEndX = toCenterX - toOffsetX;
            const arrowEndY = toCenterY - toOffsetY;
            
            // Validate final coordinates
            if (!isFinite(arrowStartX) || !isFinite(arrowStartY) || 
                !isFinite(arrowEndX) || !isFinite(arrowEndY)) {
              return null;
            }
            
            return (
              <line
                key={`link-line-${link.from.id}-${link.to.id}-${index}`}
                x1={arrowStartX}
                y1={arrowStartY}
                x2={arrowEndX}
                y2={arrowEndY}
                stroke="#9ca3af"
                strokeWidth="1"
                strokeOpacity="0.6"
              />
            );
          }).filter(Boolean)}
        </svg>
        
        {/* Render notes as absolutely positioned children of Surface */}
        {notes.map(note => (
          <div
            key={note.id}
            data-note={note.id}
            style={{
              position: 'absolute',
              left: `${note.worldX}px`,
              top: `${note.worldY}px`,
              width: `${note.width}px`,
              height: `${note.height}px`,
              backgroundColor: note.color || '#ffffff',
              border: note.canvasId ? '2px solid #6366f1' : '1px solid rgba(0,0,0,0.12)',
              borderRadius: '6px',
              padding: '12px',
              cursor: 'move', // All notes (including canvas cards) can be dragged
              boxShadow: note.canvasId ? '0 2px 6px rgba(99, 102, 241, 0.2)' : '0 1px 3px rgba(0,0,0,0.08)',
              userSelect: 'none',
              pointerEvents: 'auto',
              zIndex: 2,
            }}
            onPointerDown={(e) => {
              // Allow canvas cards to be dragged like regular notes
              handleNotePointerDown(e, note);
            }}
            onMouseDown={(e) => {
              // Track mouse down for click detection (works for both regular notes and canvas cards)
              handleNoteMouseDown(e, note);
            }}
            onMouseMove={handleNoteMouseMove}
            onMouseUp={(e) => handleNoteMouseUp(e, note)}
            onDoubleClick={(e) => {
              if (!note.canvasId) {
                handleNoteDoubleClick(e, note);
              }
            }}
            onContextMenu={(e) => {
              // Allow context menu for both regular notes and canvas cards
              handleNoteContextMenu(e, note);
            }}
          >
            {note.canvasId ? (
              <div style={{ 
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
              }}>
                <svg style={{ width: '32px', height: '32px', color: '#6366f1', marginBottom: '8px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <div style={{ 
                  fontSize: '14px', 
                  fontWeight: '500', 
                  color: '#4f46e5',
                  textAlign: 'center',
                }}>
                  {note.title || note.canvasId}
                </div>
                <div style={{ 
                  fontSize: '11px', 
                  color: '#6366f1',
                  textAlign: 'center',
                  marginTop: '4px',
                }}>
                  Click to open
                </div>
              </div>
            ) : isExcalidrawNote(note) ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
              }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '500',
                  marginBottom: '6px',
                  color: '#6d28d9',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {note.title || 'Drawing'}
                </div>
                {note.excalidrawData && note.excalidrawData.elements && note.excalidrawData.elements.length > 0 ? (
                  <div style={{
                    flex: 1,
                    overflow: 'hidden',
                    borderRadius: '4px',
                    backgroundColor: note.excalidrawData.appState?.viewBackgroundColor || '#ffffff',
                  }}>
                    {(() => {
                      const previewKey = `preview-${note.id}-${note.updatedAt || 0}-${note.excalidrawData?.elements?.length || 0}-${note.excalidrawData?.elements?.reduce((acc, e) => acc + (e.updated || 0), 0) || 0}`;
                      console.log('🟢 MegaSurface: Rendering ExcalidrawPreview for note:', note.id, 'elements:', note.excalidrawData?.elements?.length, 'updatedAt:', note.updatedAt, 'key:', previewKey);
                      return (
                        <ExcalidrawPreview
                          key={previewKey}
                          excalidrawData={note.excalidrawData}
                          width={note.width - 24} // Account for padding
                          height={note.height - 40} // Account for padding and title
                          // Always update preview - it will handle its own optimization
                          shouldUpdate={true}
                        />
                      );
                    })()}
                  </div>
                ) : (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#8b5cf6',
                  }}>
                    <svg style={{ width: '24px', height: '24px', marginBottom: '4px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <div style={{
                      fontSize: '10px',
                      color: '#8b5cf6',
                      textAlign: 'center',
                    }}>
                      Empty drawing
                    </div>
                  </div>
                )}
                {/* Resize handles - only for Excalidraw notes - invisible but functional */}
                <div
                  data-resize-handle="se"
                  onPointerDown={(e) => handleResizeHandlePointerDown(e, note, 'se')}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: '12px',
                    height: '12px',
                    cursor: 'nwse-resize',
                    backgroundColor: 'transparent',
                    zIndex: 10,
                    pointerEvents: 'auto',
                  }}
                />
                <div
                  data-resize-handle="sw"
                  onPointerDown={(e) => handleResizeHandlePointerDown(e, note, 'sw')}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '12px',
                    height: '12px',
                    cursor: 'nesw-resize',
                    backgroundColor: 'transparent',
                    zIndex: 10,
                    pointerEvents: 'auto',
                  }}
                />
                <div
                  data-resize-handle="ne"
                  onPointerDown={(e) => handleResizeHandlePointerDown(e, note, 'ne')}
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '12px',
                    height: '12px',
                    cursor: 'nesw-resize',
                    backgroundColor: 'transparent',
                    zIndex: 10,
                    pointerEvents: 'auto',
                  }}
                />
                <div
                  data-resize-handle="nw"
                  onPointerDown={(e) => handleResizeHandlePointerDown(e, note, 'nw')}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '12px',
                    height: '12px',
                    cursor: 'nwse-resize',
                    backgroundColor: 'transparent',
                    zIndex: 10,
                    pointerEvents: 'auto',
                  }}
                />
              </div>
            ) : (
              <>
                <div style={{ 
                  fontSize: '14px', 
                  fontWeight: '500', 
                  marginBottom: '8px',
                  color: '#111',
                }}>
                  {note.title || (isMarkdownNote(note) ? (note.content.split('\n')[0] || 'Untitled').trim() : 'Untitled') || 'Untitled'}
                </div>
                {isMarkdownNote(note) && note.content && (
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#666',
                    marginTop: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {note.content.split('\n').slice(1).join(' ').trim() || note.content.split('\n')[0]}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Color Picker - rendered in screen space */}
      {showColorPicker && (() => {
        const note = notes.find(n => n.id === showColorPicker);
        if (!note) return null;
        
        const rect = getViewportRect();
        // Position color picker to the right of the note
        const noteScreenPos = worldToScreen(note.worldX + note.width, note.worldY, rect, camera);
        
        return (
          <div
            ref={colorPickerRef}
            className="fixed bg-white rounded-lg shadow-xl border border-gray-300 p-2.5 z-[100]"
            style={{
              left: `${noteScreenPos.x + 10}px`,
              top: `${noteScreenPos.y}px`,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-4 gap-2">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleColorSelect(showColorPicker, color.value)}
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
  );
      })()}

      {/* Context Menu for Notes */}
      {/* Canvas Context Menu */}
      {canvasContextMenu && (
        <div
          ref={canvasContextMenuRef}
          className="fixed bg-white rounded-lg shadow-xl border border-gray-300 py-1 z-[1000] min-w-[180px]"
          style={{
            left: `${canvasContextMenu.x}px`,
            top: `${canvasContextMenu.y}px`,
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <button
            onClick={async () => {
              if (canvasContextMenu) {
                await createNoteAtPosition(canvasContextMenu.x, canvasContextMenu.y);
                setCanvasContextMenu(null);
              }
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New note
          </button>
          <button
            onClick={() => {
              if (canvasContextMenu) {
                setCanvasSelectionPos({ x: canvasContextMenu.x, y: canvasContextMenu.y });
                setShowCanvasSelection(true);
                setCanvasContextMenu(null);
              }
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Add Canvas
          </button>
        </div>
      )}

      {/* Canvas Selection Popup */}
      {showCanvasSelection && canvasSelectionPos && (
        <div
          ref={canvasSelectionRef}
          className="fixed bg-white rounded-lg shadow-xl border border-gray-300 py-2 z-[1001] min-w-[200px] max-w-[300px] max-h-[400px] overflow-y-auto"
          style={{
            left: `${canvasSelectionPos.x}px`,
            top: `${canvasSelectionPos.y + 40}px`, // Position below the context menu
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
            Select Canvas
          </div>
          {canvases.length > 0 ? (
            canvases.map((canvas) => (
              <button
                key={canvas}
                onClick={() => {
                  if (canvasSelectionPos) {
                    const rect = getViewportRect();
                    const worldPos = screenToWorld(canvasSelectionPos.x, canvasSelectionPos.y, rect, camera);
                    createCanvasCardAtPosition(canvas, worldPos.x, worldPos.y);
                    setShowCanvasSelection(false);
                    setCanvasSelectionPos(null);
                  }
                }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors flex items-center gap-2 ${
                  canvas === canvasId ? 'text-gray-400 bg-gray-50' : 'text-gray-700'
                }`}
                disabled={canvas === canvasId}
                title={canvas === canvasId ? 'Current canvas' : undefined}
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>{canvas}</span>
                {canvas === canvasId && (
                  <span className="ml-auto text-xs text-gray-400">(current)</span>
                )}
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              No canvases available
            </div>
          )}
        </div>
      )}

      {/* Note Context Menu */}
      {contextMenuNote && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white rounded-lg shadow-xl border border-gray-300 py-1 z-[1000] min-w-[180px]"
          style={{
            left: `${contextMenuPos.x}px`,
            top: `${contextMenuPos.y}px`,
            pointerEvents: 'auto', // Ensure menu is clickable
          }}
          onClick={(e) => {
            e.stopPropagation();
            // Allow clicks on buttons inside to work
            if ((e.target as HTMLElement).tagName === 'BUTTON') {
              return; // Let button handle its own click
            }
            e.preventDefault();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            // Allow clicks on buttons inside to work
            if ((e.target as HTMLElement).tagName === 'BUTTON') {
              return; // Let button handle its own click
            }
            e.preventDefault();
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveFromCanvas(contextMenuNote);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Remove from canvas
          </button>
          {contextMenuNote.filePath && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Are you sure you want to delete "${contextMenuNote.title || contextMenuNote.filePath}" permanently? This action cannot be undone.`)) {
                  handleDeletePermanently(contextMenuNote);
                }
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
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

      {/* Note Editors */}
      {editingNotes.map((editingNote) => {
        // Render appropriate editor based on note type
        console.log('Rendering editor for note:', editingNote.note.id, 'type:', editingNote.note.type, 'isExcalidrawNote:', isExcalidrawNote(editingNote.note));
        if (isExcalidrawNote(editingNote.note)) {
          return (
            <ExcalidrawNoteEditor
              key={editingNote.note.id}
              note={editingNote.note}
              filePath={editingNote.filePath}
              position={editingNote.position}
              onPositionChange={(newPosition) => {
                setEditingNotes(prev => prev.map(e => 
                  e.note.id === editingNote.note.id 
                    ? { ...e, position: newPosition }
                    : e
                ))
              }}
              onSave={async (excalidrawData, newFilePath) => {
                console.log('🔴 MegaSurface: onSave called!', {
                  elements: excalidrawData?.elements?.length,
                  newFilePath,
                  editingNoteId: editingNote.note.id,
                  stackTrace: new Error().stack
                })
                
                if (!isExcalidrawNote(editingNote.note)) {
                  console.error('Expected Excalidraw note but got:', editingNote.note)
                  return
                }
                
                // If newFilePath is provided, this is a rename operation
                if (newFilePath && newFilePath !== editingNote.filePath) {
                  const oldFilePath = editingNote.filePath || '';
                  // Extract title from new filename (without .excalidraw extension)
                  const newFileName = newFilePath.split('/').pop() || newFilePath;
                  const newTitle = newFileName.endsWith('.excalidraw') 
                    ? newFileName.slice(0, -11) 
                    : newFileName;
                  
                  // Save to the new file path
                  const jsonContent = JSON.stringify(excalidrawData, null, 2);
                  const saveResult = await saveNoteToFile(newFilePath, jsonContent);
                  if (!saveResult.success) {
                    console.error('Failed to save Excalidraw file:', saveResult.error)
                    return
                  }
                  
                  // Update the editing note's filePath so onClose uses the correct path
                  setEditingNotes(prev => prev.map(e => 
                    e.note.id === editingNote.note.id 
                      ? { ...e, filePath: newFilePath }
                      : e
                  ));
                  
                  // Update the note on canvas with new filePath and title
                  setNotes(currentNotes => {
                    return currentNotes.map(n => {
                      if (n.id === editingNote.note.id) {
                        return {
                          ...n,
                          filePath: newFilePath,
                          title: newTitle,
                          excalidrawData,
                          updatedAt: Date.now(),
                        };
                      }
                      return n;
                    });
                  });
                  
                  // Notify app about the rename
                  if (onFileRename && oldFilePath) {
                    onFileRename(oldFilePath, newFilePath, newTitle);
                  }
                  
                  console.log('MegaSurface: onSave - File renamed and saved, new title:', newTitle)
                  return
                }
                
                // Regular save (not a rename)
                // Note: The file has already been saved by ExcalidrawNoteEditor's immediateSave
                // We need to update both the note on canvas (if it exists) and the editingNote state
                const filePath = newFilePath || editingNote.filePath;
                
                if (filePath) {
                  // Validate that we have elements before updating
                  // This prevents updating the note with empty data which would break the preview
                  if (!excalidrawData.elements || excalidrawData.elements.length === 0) {
                    console.warn('🔴 MegaSurface: onSave called with 0 elements! Skipping update to prevent breaking preview. This is likely from flushPendingSave or unmount.')
                    return
                  }
                  
                  console.log('🟢 MegaSurface: onSave - Updating note (regular save), elements count:', excalidrawData.elements?.length);
                  
                  // Always update the editingNote state so the editor has the latest data
                  // This is important even when note is not on canvas (opened from sidebar)
                  setEditingNotes(prev => prev.map(e => {
                    if (e.note.id === editingNote.note.id && isExcalidrawNote(e.note)) {
                      const updatedNote: ExcalidrawNote = {
                        ...e.note,
                        excalidrawData: {
                          ...excalidrawData,
                          elements: excalidrawData.elements.map(el => ({ ...el })), // Deep clone each element
                          appState: { ...excalidrawData.appState },
                          files: excalidrawData.files ? { ...excalidrawData.files } : {},
                        },
                        updatedAt: Date.now(),
                      };
                      console.log('🟢 MegaSurface: onSave - Updated editingNote, elements:', updatedNote.excalidrawData.elements.length);
                      return {
                        ...e,
                        note: updatedNote,
                        filePath: filePath, // Update filePath in case it changed
                      };
                    }
                    return e;
                  }));
                  
                  // Also update the note on canvas if it exists (for preview updates)
                  setNotes(currentNotes => {
                    const noteExistsOnCanvas = currentNotes.some(n => n.id === editingNote.note.id);
                    if (noteExistsOnCanvas) {
                      console.log('MegaSurface: onSave - Updating note on canvas');
                      return currentNotes.map(n => {
                        if (n.id === editingNote.note.id && isExcalidrawNote(n)) {
                          // Create a new object with deep copy of excalidrawData to ensure React detects the change
                          // Use a unique timestamp to force preview regeneration
                          const newUpdatedAt = Date.now();
                          const updatedNote: ExcalidrawNote = {
                            ...n,
                            excalidrawData: {
                              ...excalidrawData,
                              elements: excalidrawData.elements.map(el => ({ ...el })), // Deep clone each element
                              appState: { ...excalidrawData.appState },
                              files: excalidrawData.files ? { ...excalidrawData.files } : {},
                            },
                            updatedAt: newUpdatedAt,
                          };
                          console.log('MegaSurface: onSave - Updated note on canvas with new updatedAt:', newUpdatedAt);
                          return updatedNote;
                        }
                        return n;
                      });
                    } else {
                      console.log('MegaSurface: onSave - Note not on canvas, but updated editingNote state');
                    }
                    return currentNotes;
                  });
                }
              }}
              onClose={async () => {
                // The flushPendingSave in ExcalidrawNoteEditor will handle getting latest state and saving
                // Wait longer to ensure the save is complete, especially for newly created files
                await new Promise(resolve => setTimeout(resolve, 600))
                
                // Get the current note from state (it might have been updated with new filePath during rename)
                const currentNote = notes.find(n => n.id === editingNote.note.id);
                const filePathToLoad = currentNote?.filePath || editingNote.filePath;
                
                // Load the latest data from file to ensure we have the most recent state
                if (filePathToLoad) {
                  try {
                    // Retry loading if file might not be ready yet (for newly created files)
                    let loadResult = await loadNoteFromFile(filePathToLoad)
                    let retries = 0
                    while (!loadResult.success && retries < 3) {
                      await new Promise(resolve => setTimeout(resolve, 200))
                      loadResult = await loadNoteFromFile(filePathToLoad)
                      retries++
                    }
                    
                    if (loadResult.success && loadResult.content) {
                      try {
                        const excalidrawData = JSON.parse(loadResult.content) as ExcalidrawData
                        // Validate structure
                        if (excalidrawData.elements && Array.isArray(excalidrawData.elements)) {
                          // Use current note to preserve any updates (like filePath, title from rename)
                          const updatedNote: ExcalidrawNote = {
                            ...(currentNote || editingNote.note),
                            excalidrawData,
                            updatedAt: Date.now(),
                          }
                          
                          // Update note on canvas
                          setNotes(currentNotes => {
                            const noteExistsOnCanvas = currentNotes.some(n => n.id === editingNote.note.id);
                            if (noteExistsOnCanvas) {
                              console.log('MegaSurface: onClose - Updated note on canvas from file, elements count:', excalidrawData.elements?.length)
                              return currentNotes.map(n => 
                                n.id === editingNote.note.id ? updatedNote : n
                              );
                            }
                            return currentNotes;
                          });
                        }
                      } catch (parseError) {
                        console.error('Error parsing Excalidraw file on close:', parseError)
                      }
                    }
                  } catch (error) {
                    console.error('Error loading file on close:', error)
                  }
                }
                
                // Remove from editing notes
                setEditingNotes(prev => prev.filter(e => e.note.id !== editingNote.note.id));
              }}
              onDelete={async (note) => {
                if (editingNote.filePath) {
                  await deleteNoteFile(editingNote.filePath);
                  if (onFileDelete) {
                    onFileDelete(editingNote.filePath);
                  }
                }
                setNotes(notes.filter(n => n.id !== note.id));
                setEditingNotes(editingNotes.filter(e => e.note.id !== editingNote.note.id));
              }}
            />
          );
        }
        
        // Markdown note - use HoverEditor
        // Only render HoverEditor for Markdown notes
        if (!isMarkdownNote(editingNote.note)) {
          console.error('HoverEditor: Expected Markdown note but got:', editingNote.note)
          return null
        }
        
        // Convert Note to HoverEditor's expected format
        const editorNote = {
          id: editingNote.note.id,
          x: editingNote.note.worldX,
          y: editingNote.note.worldY,
          width: editingNote.note.width,
          height: editingNote.note.height,
          content: editingNote.note.content || '',
          title: editingNote.note.title,
          color: editingNote.note.color,
          filePath: editingNote.note.filePath,
        };
        
        return (
          <HoverEditor
            key={editingNote.note.id}
            note={editorNote}
            position={editingNote.position}
            filePath={editingNote.filePath}
            allNotes={notes.filter(isMarkdownNote).map(n => ({ id: n.id, content: n.content, filePath: n.filePath, title: n.title }))}
            canvases={canvases}
            onCanvasChange={onCanvasChange}
            onPositionChange={(newPosition) => {
              // Update the position in editingNotes state
              setEditingNotes(prev => prev.map(e => 
                e.note.id === editingNote.note.id 
                  ? { ...e, position: newPosition }
                  : e
              ))
            }}
            onLinkClick={async (fileName) => {
              // Check if the link is a canvas name
              const trimmedFileName = fileName.trim();
              if (canvases.includes(trimmedFileName) && onCanvasChange) {
                // Switch to the linked canvas
                onCanvasChange(trimmedFileName);
                return;
              }
              
              // Find or create note for the linked file
              const normalizedFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
              
              // First, try to find if the note already exists on canvas
              let linkedNote = notes.find(note => {
                if (!note.filePath) return false;
                const noteFileName = note.filePath.split('/').pop() || note.filePath;
                const normalizedNoteFileName = noteFileName.endsWith('.md') ? noteFileName : `${noteFileName}.md`;
                return normalizedNoteFileName === normalizedFileName;
              });
              
              // If note doesn't exist on canvas, try to load it from file
              if (!linkedNote) {
                try {
                  const loadResult = await loadNoteFromFile(normalizedFileName);
                  if (loadResult.success && loadResult.content !== undefined) {
                    const content = loadResult.content || '';
                    const lines = content.split('\n');
                    const title = (lines[0] || '').trim() || (normalizedFileName.endsWith('.md') ? normalizedFileName.slice(0, -3) : normalizedFileName);
                    
                    // Create a new note at a position near the current editing note
                    const rect = getViewportRect();
                    const currentNoteScreenPos = worldToScreen(editingNote.note.worldX, editingNote.note.worldY, rect, camera);
                    
                    // Position new note to the right of the current editor
                    const newNoteScreenX = currentNoteScreenPos.x + 450; // Offset to the right
                    const newNoteScreenY = currentNoteScreenPos.y;
                    
                    const newNoteWorldPos = screenToWorld(newNoteScreenX, newNoteScreenY, rect, camera);
                    
                    // Determine note type from file extension
                    if (normalizedFileName.endsWith('.excalidraw')) {
                      try {
                        const excalidrawData = JSON.parse(content) as ExcalidrawData;
                        linkedNote = {
                          id: `file-${normalizedFileName}-${Date.now()}`,
                          type: 'excalidraw',
                          worldX: newNoteWorldPos.x - 100,
                          worldY: newNoteWorldPos.y - 75,
                          width: 200,
                          height: 150,
                          excalidrawData,
                          title: title,
                          color: '#ffffff',
                          filePath: normalizedFileName,
                        } as ExcalidrawNote;
                      } catch (parseError) {
                        console.error('Error parsing Excalidraw file:', parseError);
                        return;
                      }
                    } else {
                      linkedNote = {
                        id: `file-${normalizedFileName}-${Date.now()}`,
                        type: 'markdown',
                        worldX: newNoteWorldPos.x - 100,
                        worldY: newNoteWorldPos.y - 75,
                        width: 200,
                        height: 150,
                        content: content,
                        title: title,
                        color: '#ffffff',
                        filePath: normalizedFileName,
                      } as MarkdownNote;
                    }
                    
                    // Add the note to canvas
                    setNotes([...notes, linkedNote]);
                  } else {
                    // File doesn't exist, create it
                    const createResult = await createNoteFile(normalizedFileName.endsWith('.md') ? normalizedFileName.slice(0, -3) : normalizedFileName);
                    if (createResult.success && createResult.filePath) {
                      const rect = getViewportRect();
                      const currentNoteScreenPos = worldToScreen(editingNote.note.worldX, editingNote.note.worldY, rect, camera);
                      const newNoteScreenX = currentNoteScreenPos.x + 450;
                      const newNoteScreenY = currentNoteScreenPos.y;
                      const newNoteWorldPos = screenToWorld(newNoteScreenX, newNoteScreenY, rect, camera);
                      
                      // Create markdown note (links are always markdown)
                      linkedNote = {
                        id: `file-${createResult.filePath}-${Date.now()}`,
                        type: 'markdown',
                        worldX: newNoteWorldPos.x - 100,
                        worldY: newNoteWorldPos.y - 75,
                        width: 200,
                        height: 150,
                        content: normalizedFileName.endsWith('.md') ? normalizedFileName.slice(0, -3) : normalizedFileName,
                        title: normalizedFileName.endsWith('.md') ? normalizedFileName.slice(0, -3) : normalizedFileName,
                        color: '#ffffff',
                        filePath: createResult.filePath,
                      } as MarkdownNote;
                      
                      setNotes([...notes, linkedNote]);
                      
                      if (onFileCreated) {
                        onFileCreated(createResult.filePath);
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error loading linked file:', error);
                  return;
                }
              }
              
              // Open the linked note's editor
              if (linkedNote) {
                // Check if already editing
                if (editingNotes.some(e => e.note.id === linkedNote!.id)) {
                  return;
                }
                
                const rect = getViewportRect();
                const screenPos = worldToScreen(linkedNote.worldX, linkedNote.worldY, rect, camera);
                
                setEditingNotes([...editingNotes, {
                  note: linkedNote,
                  position: { x: screenPos.x + linkedNote.width / 2, y: screenPos.y + linkedNote.height / 2 },
                  filePath: linkedNote.filePath,
                }]);
              }
            }}
            onSave={async (content, newFileName) => {
              const updatedNote = {
                ...editingNote.note,
                content: content,
                title: (content.split('\n')[0] || '').trim(),
              };
              
              if (!editingNote.filePath) {
                console.error('MegaSurface: Cannot save note without filePath');
                return;
              }
              
              let finalFilePath: string = editingNote.filePath;
              const originalFilePath = editingNote.filePath;
              
              // If newFileName is provided and different from current, rename the file
              if (newFileName && editingNote.filePath) {
                // Normalize the original file path - extract just filename for comparison
                // filePath is stored as just filename (e.g., "Note 1.md")
                const originalFileName = editingNote.filePath.split('/').pop() || editingNote.filePath;
                const originalNameWithoutExt = originalFileName.endsWith('.md') 
                  ? originalFileName.slice(0, -3) 
                  : originalFileName;
                
                // Trim and compare - newFileName comes from HoverEditor as the new title
                const trimmedNewFileName = newFileName.trim();
                const trimmedOriginalName = originalNameWithoutExt.trim();
                
                console.log('MegaSurface: onSave called - newFileName:', trimmedNewFileName, 'originalName:', trimmedOriginalName, 'filePath:', editingNote.filePath);
                
                // Only rename if the name actually changed
                if (trimmedNewFileName !== trimmedOriginalName && trimmedNewFileName.length > 0) {
                  console.log('MegaSurface: Names differ, attempting rename...');
                  console.log('MegaSurface: Calling renameNoteFile with oldFilePath:', editingNote.filePath, 'newFileName:', trimmedNewFileName);
                  
                  // filePath is just the filename (e.g., "Note 1.md"), which renameNoteFile can handle
                  // It will join it with dataDir if it's not an absolute path
                  const renameResult = await renameNoteFile(editingNote.filePath, trimmedNewFileName);
                  
                  console.log('MegaSurface: renameNoteFile result:', renameResult);
                  
                  if (renameResult.success && renameResult.newFilePath) {
                    console.log('✅ MegaSurface: File renamed successfully!');
                    console.log('   Old path:', editingNote.filePath);
                    console.log('   New path:', renameResult.newFilePath);
                    
                    // Normalize new file path - keep it as returned (should be just filename)
                    let newFilePath = renameResult.newFilePath;
                    // Remove any path components, keep just the filename
                    if (newFilePath.includes('/')) {
                      newFilePath = newFilePath.split('/').pop() || newFilePath;
                    }
                    if (newFilePath.startsWith('/')) {
                      newFilePath = newFilePath.slice(1);
                    }
                    
                    finalFilePath = newFilePath;
                    updatedNote.filePath = newFilePath;
                    
                    console.log('MegaSurface: Updated finalFilePath to:', finalFilePath);
                    
                    // Notify sidebar about the rename
                    if (onFileRename) {
                      const newTitle = (content.split('\n')[0] || '').trim() || trimmedNewFileName;
                      console.log('MegaSurface: Calling onFileRename callback');
                      onFileRename(originalFilePath, newFilePath, newTitle);
                    }
                  } else {
                    // Rename failed, show error but still save content
                    console.error('❌ MegaSurface: Failed to rename file!');
                    console.error('   Error:', renameResult.error);
                    console.error('   Old path:', editingNote.filePath);
                    console.error('   New name:', trimmedNewFileName);
                    // Still save content to original file
                  }
                } else {
                  console.log('MegaSurface: File name unchanged, skipping rename.');
                  console.log('   Original:', trimmedOriginalName);
                  console.log('   New:', trimmedNewFileName);
                }
              } else {
                console.log('MegaSurface: No rename - newFileName:', newFileName, 'filePath:', editingNote.filePath);
              }
              
              // Save content to file (use finalFilePath which is either original or newly renamed)
              if (finalFilePath && finalFilePath.trim()) {
                console.log('MegaSurface: Saving content to file:', finalFilePath);
                const saveResult = await saveNoteToFile(finalFilePath, content);
                if (!saveResult.success) {
                  console.error('MegaSurface: Failed to save content:', saveResult.error);
                } else {
                  console.log('MegaSurface: Content saved successfully to:', finalFilePath);
                }
              }
              
              // Update note in canvas only if it exists there
              const noteExistsOnCanvas = notes.some(n => n.id === editingNote.note.id);
              if (noteExistsOnCanvas) {
                setNotes(notes.map(n => 
                  n.id === editingNote.note.id ? updatedNote : n
                ));
              }
              
              // Don't close editor if we just renamed (let user continue editing)
              // Only close if this was an explicit save/close action
              // For now, always close after save
              setEditingNotes(editingNotes.filter(e => e.note.id !== editingNote.note.id));
            }}
            onClose={() => {
              setEditingNotes(editingNotes.filter(e => e.note.id !== editingNote.note.id));
            }}
            onDelete={async (_note) => {
              if (editingNote.filePath) {
                await deleteNoteFile(editingNote.filePath);
              }
              
              setNotes(notes.filter(n => n.id !== editingNote.note.id));
              setEditingNotes(editingNotes.filter(e => e.note.id !== editingNote.note.id));
            }}
            onFileCreated={onFileCreated}
          />
        );
      })}
    </div>
  );
}
