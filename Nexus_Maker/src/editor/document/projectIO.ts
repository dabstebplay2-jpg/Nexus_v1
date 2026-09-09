import { useEditorStore } from '../../store/editorStore'
import type { CanvasNode, EditorStyle, EditorVariable } from '../../types/editor'
import { migrateAbsoluteScene } from '../scene/sceneGraph'

interface NexusDocument {
  format: 'nexus-maker'
  version: 1 | 2 | 3
  savedAt: string
  objects: Record<string, CanvasNode>
  order: string[]
  variables: EditorVariable[]
  styles: EditorStyle[]
}

export function saveProject(): void {
  const { objects, order, variables, styles } = useEditorStore.getState()
  const document: NexusDocument = { format: 'nexus-maker', version: 3, savedAt: new Date().toISOString(), objects, order, variables, styles }
  download(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }), 'Проект Nexus.nexus')
}

export async function loadProject(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text()) as Partial<NexusDocument>
  if (parsed.format !== 'nexus-maker' || ![1,2,3].includes(parsed.version??0) || !parsed.objects || !Array.isArray(parsed.order)) throw new Error('Файл не является проектом Nexus Maker')
  useEditorStore.getState().replaceDocument({ objects: parsed.version===1?migrateAbsoluteScene(parsed.objects):parsed.objects, order: parsed.order, selectedIds: [], variables: parsed.variables ?? [], styles: parsed.styles??[] })
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
