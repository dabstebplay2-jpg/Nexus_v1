import { useEditorStore } from '../store/editorStore'

export function StatusBar() {
  const selected = useEditorStore((s) => s.selectedIds.length)
  const count = useEditorStore((s) => s.order.length)
  return (
    <div className="statusbar">
      <span>{count} объектов</span>
      <i />
      <span>{selected ? `Выбрано: ${selected}` : 'Готово'}</span>
      <div className="statusbar-spacer" />
      <span>Ctrl+K — действия</span>
      <span className="beta-pill">v0.2 альфа</span>
    </div>
  )
}
