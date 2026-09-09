import type { CanvasNode } from '../types/editor'

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }

export function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
export function contains(outer: Rect, inner: Rect, pad = 0): boolean {
  return inner.x >= outer.x + pad && inner.y >= outer.y + pad && inner.x + inner.width <= outer.x + outer.width - pad && inner.y + inner.height <= outer.y + outer.height - pad
}
export function nodeRect(node: CanvasNode): Rect { return { x: node.x, y: node.y, width: node.width, height: node.height } }
export function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)) }
export function rectUnion(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 }
  const minX = Math.min(...rects.map((r) => r.x)); const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.width)); const maxY = Math.max(...rects.map((r) => r.y + r.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
export function verticalOverlap(a: Rect, b: Rect): boolean { return Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) }
export function horizontalOverlap(a: Rect, b: Rect): boolean { return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) }

export function calculateCreationRect(start: Point, current: Point, keepRatio = false, fromCenter = false): Rect {
  let dx = current.x - start.x
  let dy = current.y - start.y
  if (keepRatio) {
    const size = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * size
    dy = Math.sign(dy || 1) * size
  }
  if (fromCenter) return { x: start.x - Math.abs(dx), y: start.y - Math.abs(dy), width: Math.abs(dx) * 2, height: Math.abs(dy) * 2 }
  return normalizeRect(start, { x: start.x + dx, y: start.y + dy })
}

export function resizeRect(rect: Rect, handle: string, delta: Point, min = 8): Rect {
  let { x, y, width, height } = rect
  if (handle.includes('e')) width = Math.max(min, rect.width + delta.x)
  if (handle.includes('s')) height = Math.max(min, rect.height + delta.y)
  if (handle.includes('w')) { width = Math.max(min, rect.width - delta.x); x = rect.x + rect.width - width }
  if (handle.includes('n')) { height = Math.max(min, rect.height - delta.y); y = rect.y + rect.height - height }
  return { x, y, width, height }
}

export function distanceBetweenRects(a: Rect, b: Rect): Point {
  const x = a.x + a.width < b.x ? b.x - a.x - a.width : b.x + b.width < a.x ? a.x - b.x - b.width : 0
  const y = a.y + a.height < b.y ? b.y - a.y - a.height : b.y + b.height < a.y ? a.y - b.y - b.height : 0
  return { x, y }
}
