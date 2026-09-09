import { describe, expect, it } from 'vitest'
import { clientToCanvas, clientToWorld, screenToWorld, worldToClient, worldToScreen, zoomAtScreenPoint } from './coordinates'

describe('система координат', () => {
  const bounds = { left: 300, top: 40 }
  const world = { x: 125, y: -80 }

  for (const zoom of [.25, .5, 1, 2, 4]) {
    it(`сохраняет точку при прямом и обратном преобразовании, масштаб ${zoom * 100}%`, () => {
      const viewport = { x: -37, y: 219, zoom }
      expect(screenToWorld(worldToScreen(world, viewport), viewport)).toEqual(world)
      expect(clientToWorld(worldToClient(world, bounds, viewport), bounds, viewport)).toEqual(world)
    })
  }

  it('учитывает положение DOM-области холста', () => {
    expect(clientToCanvas({ x: 348, y: 91 }, bounds)).toEqual({ x: 48, y: 51 })
  })

  it('масштабирует относительно курсора без смещения опорной точки', () => {
    const viewport = { x: 50, y: 75, zoom: .5 }
    const cursor = { x: 420, y: 250 }
    const anchor = screenToWorld(cursor, viewport)
    const next = zoomAtScreenPoint(viewport, cursor, 4)
    expect(worldToScreen(anchor, next)).toEqual(cursor)
  })
})
