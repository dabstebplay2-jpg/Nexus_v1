import type { CanvasNode } from '../../types/editor'
import { download } from '../document/projectIO'

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'svg'

export async function exportNode(node: CanvasNode, format: ExportFormat, scale = 1): Promise<void> {
  const svg = nodeToSvg(node)
  const safeName = node.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Объект'
  if (format === 'svg') {
    download(new Blob([svg], { type: 'image/svg+xml' }), `${safeName}.svg`)
    return
  }
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(node.width * scale))
    canvas.height = Math.max(1, Math.round(node.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Браузер не поддерживает экспорт изображений')
    if (format === 'jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height) }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Не удалось создать изображение')), `image/${format}`, .92))
    download(blob, `${safeName}.${format === 'jpeg' ? 'jpg' : format}`)
  } finally { URL.revokeObjectURL(url) }
}

function nodeToSvg(node: CanvasNode): string {
  const width = Math.max(1, node.width), height = Math.max(1, node.height)
  const shadow = node.shadowEnabled ? `<filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${node.shadowX ?? 0}" dy="${node.shadowY ?? 4}" stdDeviation="${(node.shadowBlur ?? 12) / 2}" flood-color="${escapeXml(node.shadowColor ?? '#000000')}"/></filter>` : ''
  const common = `opacity="${node.opacity}" ${node.shadowEnabled ? 'filter="url(#s)"' : ''}`
  let content = ''
  if (node.type === 'ellipse') content = `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${Math.max(0, width / 2 - node.strokeWidth / 2)}" ry="${Math.max(0, height / 2 - node.strokeWidth / 2)}" fill="${escapeXml(node.fill)}" fill-opacity="${node.fillOpacity}" stroke="${escapeXml(node.stroke)}" stroke-opacity="${node.strokeOpacity}" stroke-width="${node.strokeWidth}" ${common}/>`
  else if (node.type === 'path') { const d = (node.path ?? []).map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '); content = `<path d="${d}" fill="none" stroke="${escapeXml(node.stroke)}" stroke-opacity="${node.strokeOpacity}" stroke-width="${node.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${common}/>` }
  else if (node.type === 'image' && node.imageSrc) content = `<image href="${escapeXml(node.imageSrc)}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" ${common}/>`
  else {
    content = `<rect x="${node.strokeWidth / 2}" y="${node.strokeWidth / 2}" width="${Math.max(0, width - node.strokeWidth)}" height="${Math.max(0, height - node.strokeWidth)}" rx="${node.radius}" fill="${escapeXml(node.fill)}" fill-opacity="${node.fillOpacity}" stroke="${escapeXml(node.stroke)}" stroke-opacity="${node.strokeOpacity}" stroke-width="${node.strokeWidth}" ${common}/>`
    if ((node.type === 'text' || node.type === 'sticky') && node.text) content += `<foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="padding:${node.type === 'text' ? 3 : 12}px;font: ${node.fontWeight ?? 500} ${node.fontSize ?? 18}px sans-serif;color:${node.type === 'sticky' ? '#17150b' : node.fill};white-space:pre-wrap">${escapeXml(node.text)}</div></foreignObject>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${shadow}</defs>${content}</svg>`
}

function loadImage(src: string): Promise<HTMLImageElement> { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Не удалось подготовить объект к экспорту')); image.src = src }) }
function escapeXml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char) }
