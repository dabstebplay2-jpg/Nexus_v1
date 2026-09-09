import { useEditorStore } from '../../store/editorStore'
import type { CanvasNode, NodeType } from '../../types/editor'

/** Публичный API документа: UI, локальные агенты и будущий CLI используют один слой команд. */
export const editor = {
  getSelection: () => useEditorStore.getState().selectedIds.map((id) => useEditorStore.getState().objects[id]).filter(Boolean),
  getObjects: () => Object.values(useEditorStore.getState().objects),
  select: (ids: string[]) => useEditorStore.getState().setSelection(ids),
  create: (input: { type: NodeType; x: number; y: number; patch?: Partial<CanvasNode> }) => useEditorStore.getState().addNode(input.type, input.x, input.y, input.patch),
  update: (id: string, patch: Partial<CanvasNode>) => useEditorStore.getState().updateNode(id, patch),
  delete: (ids: string[]) => { const state = useEditorStore.getState(); state.setSelection(ids); state.deleteSelected() },
  align: (axis: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom') => useEditorStore.getState().alignSelected(axis),
  distribute: (axis: 'x' | 'y') => useEditorStore.getState().distributeSelected(axis),
  createAutoLayout: (direction: 'horizontal' | 'vertical' = 'horizontal') => useEditorStore.getState().createAutoLayout(direction),
  addKeyframe: (id: string, time?: number) => useEditorStore.getState().addKeyframe(id, time),
}
