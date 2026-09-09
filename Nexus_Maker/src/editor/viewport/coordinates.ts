import type { Point, ViewportState } from '../../types/editor'

export interface CanvasBounds { left: number; top: number }

/** Единый API преобразования координат редактора. */
export function clientToCanvas(client: Point, bounds: CanvasBounds): Point {
  return { x: client.x - bounds.left, y: client.y - bounds.top }
}

export function canvasToClient(canvas: Point, bounds: CanvasBounds): Point {
  return { x: canvas.x + bounds.left, y: canvas.y + bounds.top }
}

export function screenToWorld(screen: Point, viewport: ViewportState): Point {
  return { x: (screen.x - viewport.x) / viewport.zoom, y: (screen.y - viewport.y) / viewport.zoom }
}

export function worldToScreen(world: Point, viewport: ViewportState): Point {
  return { x: world.x * viewport.zoom + viewport.x, y: world.y * viewport.zoom + viewport.y }
}

export function clientToWorld(client: Point, bounds: CanvasBounds, viewport: ViewportState): Point {
  return screenToWorld(clientToCanvas(client, bounds), viewport)
}

export function worldToClient(world: Point, bounds: CanvasBounds, viewport: ViewportState): Point {
  return canvasToClient(worldToScreen(world, viewport), bounds)
}

export function zoomAtScreenPoint(viewport: ViewportState, screen: Point, nextZoom: number): ViewportState {
  const anchor = screenToWorld(screen, viewport)
  return { zoom: nextZoom, x: screen.x - anchor.x * nextZoom, y: screen.y - anchor.y * nextZoom }
}
