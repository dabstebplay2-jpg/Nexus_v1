import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, EyeOffIcon, FrameIcon, GripIcon, LayersIcon, LockIcon, RectIcon, StickyIcon, TextIcon, UnlockIcon } from './icons'
import { useEditorStore } from '../store/editorStore'
import type { CanvasNode } from '../types/editor'

const nodeIcon = (node: CanvasNode) => {
  if (node.type === 'frame') return <FrameIcon />
  if (node.type === 'text') return <TextIcon />
  if (node.type === 'sticky') return <StickyIcon />
  return <RectIcon />
}

type LayerEntry = { id: string; depth: number }

function makeLayerEntries(order: string[], objects: Record<string, CanvasNode>): LayerEntry[] {
  const roots = order.filter((id) => !objects[id]?.parentId)
  const childrenByParent = new Map<string, string[]>()
  for (const id of order) {
    const parentId = objects[id]?.parentId
    if (!parentId) continue
    const list = childrenByParent.get(parentId) ?? []
    list.push(id)
    childrenByParent.set(parentId, list)
  }
  const result: LayerEntry[] = []
  const visit = (id: string, depth: number) => {
    result.push({ id, depth })
    const children = childrenByParent.get(id) ?? []
    ;[...children].reverse().forEach((childId) => visit(childId, depth + 1))
  }
  ;[...roots].reverse().forEach((id) => visit(id, 0))
  return result
}

export function LayersPanel() {
  const order = useEditorStore((s) => s.order)
  const objects = useEditorStore((s) => s.objects)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const selectOnly = useEditorStore((s) => s.selectOnly)
  const toggleSelection = useEditorStore((s) => s.toggleSelection)
  const toggleVisible = useEditorStore((s) => s.toggleVisible)
  const toggleLocked = useEditorStore((s) => s.toggleLocked)
  const renameNode = useEditorStore((s) => s.renameNode)
  const moveLayer = useEditorStore((s) => s.moveLayer)
  const reorderLayer = useEditorStore((s) => s.reorderLayer)
  const setParent = useEditorStore((s) => s.setParent)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: 'above' | 'below' | 'inside' } | null>(null)
  const entries = useMemo(() => makeLayerEntries(order, objects), [order, objects])

  return (
    <div className="layers-section">
      <div className="subpanel-heading"><span><LayersIcon /> Слои</span><small>{order.length}</small></div>
      <div className="layers-list">
        {entries.map(({ id, depth }) => {
          const node = objects[id]
          if (!node) return null
          const selected = selectedIds.includes(id)
          return (
            <div
              className={`layer-row ${selected ? 'selected' : ''} ${dropTarget?.id === id ? `drop-${dropTarget.pos}` : ''}`}
              style={{ '--depth': depth } as CSSProperties}
              key={id}
              draggable
              onDragStart={(e) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) }}
              onDragEnd={() => { setDragId(null); setDropTarget(null) }}
              onDragOver={(e) => {
                if (!dragId || dragId === id) return
                e.preventDefault()
                const rect = e.currentTarget.getBoundingClientRect()
                const ratio = (e.clientY - rect.top) / rect.height
                const pos: 'above' | 'below' | 'inside' = node.type === 'frame' && ratio > .28 && ratio < .72 ? 'inside' : ratio < .5 ? 'above' : 'below'
                setDropTarget({ id, pos })
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId && dragId !== id && dropTarget) {
                  if (dropTarget.pos === 'inside' && node.type === 'frame') setParent(dragId, id)
                  else { const position = dropTarget.pos === 'above' ? 'above' : 'below'; setParent(dragId, node.parentId ?? null); reorderLayer(dragId, id, position) }
                }
                setDragId(null); setDropTarget(null)
              }}
              onClick={(e) => e.shiftKey ? toggleSelection(id) : selectOnly(id)}
              onDoubleClick={() => {
                const next = window.prompt('Название слоя', node.name)
                if (next?.trim()) renameNode(id, next.trim())
              }}
            >
              <span className="drag-grip" title="Перетащи слой выше или ниже"><GripIcon /></span>
              <span className="layer-type-icon">{nodeIcon(node)}</span>
              <span className="layer-name">{node.name}</span>
              <div className="layer-actions">
                <button onClick={(e) => { e.stopPropagation(); moveLayer(id, 1) }} title="Поднять слой"><ArrowUpIcon /></button>
                <button onClick={(e) => { e.stopPropagation(); moveLayer(id, -1) }} title="Опустить слой"><ArrowDownIcon /></button>
                <button onClick={(e) => { e.stopPropagation(); toggleVisible(id) }} title={node.visible ? 'Скрыть' : 'Показать'}>{node.visible ? <EyeIcon /> : <EyeOffIcon />}</button>
                <button onClick={(e) => { e.stopPropagation(); toggleLocked(id) }} title={node.locked ? 'Разблокировать' : 'Заблокировать'}>{node.locked ? <LockIcon /> : <UnlockIcon />}</button>
              </div>
            </div>
          )
        })}
        {!order.length && <div className="empty-panel-state"><span>Слоёв пока нет</span><small>Нарисуйте фрейм, фигуру или текст на холсте.</small></div>}
      </div>
    </div>
  )
}
