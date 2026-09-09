import type { CanvasNode, NodeType, Point } from '../../types/editor'

export async function importImageFile(file: File, position: Point, addNode: (type: NodeType, x: number, y: number, patch?: Partial<CanvasNode>) => string): Promise<void> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error('Поддерживаются PNG, JPG, WebP и SVG')
  const source = await readDataUrl(file)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = () => reject(new Error('Не удалось прочитать изображение')); value.src = source })
  const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight))
  addNode('image', position.x, position.y, { imageSrc: source, width: Math.max(1, image.naturalWidth * scale), height: Math.max(1, image.naturalHeight * scale), radius: 8 })
}

function readDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) }) }
