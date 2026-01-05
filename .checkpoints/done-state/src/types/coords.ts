/**
 * Centralized coordinate conversion module.
 * 
 * Coordinate System Convention:
 * - World coordinates (worldX, worldY): Fixed coordinate space, never changes.
 *   Units are pixels in world space. WORLD_ORIGIN is at the center of the mega-surface.
 * - Screen coordinates (clientX, clientY): Viewport pixel coordinates from pointer events.
 * - Camera: { panX, panY, zoom }
 *   - panX, panY: Screen pixel offsets (how many screen pixels the world origin is offset)
 *   - zoom: Scale factor (1.0 = 100%, 2.0 = 200%, etc.)
 * 
 * Transform applied: translate(panX, panY) scale(zoom) with transformOrigin: 0 0
 * This means: screenPos = (worldPos * zoom) + pan
 * Therefore: worldPos = (screenPos - pan) / zoom
 */

export type Camera = { panX: number; panY: number; zoom: number };

// World space configuration
export const WORLD_SIZE = 200000; // 200k x 200k world pixels
export const WORLD_ORIGIN = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 }; // Center of mega-surface

/**
 * Convert screen/client coordinates to world coordinates.
 * 
 * @param clientX - Screen X coordinate from pointer event
 * @param clientY - Screen Y coordinate from pointer event
 * @param viewportRect - Bounding rect of the viewport element (the container that holds the transformed surface)
 * @param camera - Current camera state
 * @returns World coordinates { x, y }
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  viewportRect: DOMRect,
  camera: Camera
): { x: number; y: number } {
  // Convert client coordinates to viewport-relative coordinates
  const viewportX = clientX - viewportRect.left;
  const viewportY = clientY - viewportRect.top;
  
  // Remove pan offset and divide by zoom to get world coordinates
  // Formula: world = (screen - pan) / zoom
  const worldX = (viewportX - camera.panX) / camera.zoom;
  const worldY = (viewportY - camera.panY) / camera.zoom;
  
  return { x: worldX, y: worldY };
}

/**
 * Convert world coordinates to screen coordinates.
 * 
 * @param worldX - World X coordinate
 * @param worldY - World Y coordinate
 * @param viewportRect - Bounding rect of the viewport element
 * @param camera - Current camera state
 * @returns Screen coordinates { x, y } relative to viewport
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  viewportRect: DOMRect,
  camera: Camera
): { x: number; y: number } {
  // Apply transform: screen = (world * zoom) + pan
  const screenX = (worldX * camera.zoom) + camera.panX;
  const screenY = (worldY * camera.zoom) + camera.panY;
  
  // Convert to absolute screen coordinates
  const clientX = screenX + viewportRect.left;
  const clientY = screenY + viewportRect.top;
  
  return { x: clientX, y: clientY };
}

/**
 * Adjust camera pan to keep a world point pinned under a screen point after zoom change.
 * Used when zooming toward cursor to prevent "jump".
 * 
 * @param pointerScreenX - Screen X where pointer is
 * @param pointerScreenY - Screen Y where pointer is
 * @param viewportRect - Viewport bounding rect
 * @param oldCamera - Camera before zoom change
 * @param newZoom - New zoom level
 * @returns New panX, panY that keeps the world point under pointer stable
 */
export function adjustPanForZoom(
  pointerScreenX: number,
  pointerScreenY: number,
  viewportRect: DOMRect,
  oldCamera: Camera,
  newZoom: number
): { panX: number; panY: number } {
  // Get the world point currently under the pointer
  const worldPoint = screenToWorld(pointerScreenX, pointerScreenY, viewportRect, oldCamera);
  
  // Calculate what the screen position of this world point would be with new zoom
  const newScreenX = (worldPoint.x * newZoom) + oldCamera.panX;
  const newScreenY = (worldPoint.y * newZoom) + oldCamera.panY;
  
  // Calculate viewport-relative positions
  const viewportX = pointerScreenX - viewportRect.left;
  const viewportY = pointerScreenY - viewportRect.top;
  
  // Adjust pan so the world point stays under the pointer
  // The difference between where we want it (viewportX/Y) and where it would be (newScreenX/Y)
  const newPanX = oldCamera.panX + (viewportX - newScreenX);
  const newPanY = oldCamera.panY + (viewportY - newScreenY);
  
  return { panX: newPanX, panY: newPanY };
}
