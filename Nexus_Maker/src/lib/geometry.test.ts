import { describe, expect, it } from 'vitest'
import { calculateCreationRect, contains, distanceBetweenRects, normalizeRect, rectUnion, resizeRect } from './geometry'

describe('геометрия выделения и трансформаций', () => {
  it('нормализует рамку выделения в любом направлении', () => {
    expect(normalizeRect({ x: 90, y: 70 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 80, height: 50 })
  })
  it('строит общую рамку нескольких объектов', () => {
    expect(rectUnion([{ x: 10, y: 20, width: 30, height: 40 }, { x: -5, y: 50, width: 10, height: 5 }])).toEqual({ x: -5, y: 20, width: 45, height: 40 })
  })
  it('рисует квадрат из центра при Shift+Alt', () => {
    expect(calculateCreationRect({ x: 100, y: 100 }, { x: 140, y: 120 }, true, true)).toEqual({ x: 60, y: 60, width: 80, height: 80 })
  })
  it('изменяет размер западной гранью и соблюдает минимум', () => {
    expect(resizeRect({ x: 10, y: 20, width: 100, height: 80 }, 'w', { x: 150, y: 0 }, 8)).toEqual({ x: 102, y: 20, width: 8, height: 80 })
  })
  it('считает расстояние между разнесёнными прямоугольниками', () => {
    expect(distanceBetweenRects({ x: 0, y: 0, width: 20, height: 20 }, { x: 35, y: 5, width: 10, height: 10 })).toEqual({ x: 15, y: 0 })
    expect(contains({ x: 0, y: 0, width: 100, height: 100 }, { x: 10, y: 10, width: 20, height: 20 })).toBe(true)
  })
})
