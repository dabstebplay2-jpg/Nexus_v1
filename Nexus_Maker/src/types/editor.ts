export type EditorMode = 'design' | 'prototype' | 'draw' | 'motion' | 'dev'
export type Tool = 'select' | 'frame' | 'rectangle' | 'ellipse' | 'text' | 'sticky' | 'pen' | 'pencil' | 'brush'
export type NodeType = 'frame' | 'group' | 'rectangle' | 'ellipse' | 'text' | 'sticky' | 'path' | 'image'
export type SidebarTab = 'file' | 'agents' | 'assets' | 'tools' | 'variables'

export interface Point { x: number; y: number }
export interface ViewportState { x: number; y: number; zoom: number }
export type VariableType = 'color' | 'number' | 'string'
export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type TextVerticalAlign = 'top' | 'middle' | 'bottom'
export interface EditorVariable {
  id: string
  name: string
  type: VariableType
  value: string | number
}
export type EditorStyleType = 'paint' | 'text' | 'effect'
export interface EditorStyle {
  id: string
  name: string
  type: EditorStyleType
  properties: Partial<CanvasNode>
}
export type SizeMode = 'fixed' | 'hug' | 'fill' | 'percent'
export type LayoutDirection = 'horizontal' | 'vertical' | 'grid'
export type LayoutDistribution = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
export type LayoutAlignment = 'start' | 'center' | 'end' | 'stretch'
export interface AutoLayout {
  direction: LayoutDirection
  gap: number
  padding: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  distribution?: LayoutDistribution
  align?: LayoutAlignment
  columns?: number
}
export interface NodeConstraints {
  horizontal: 'left' | 'right' | 'center' | 'stretch' | 'scale'
  vertical: 'top' | 'bottom' | 'center' | 'stretch' | 'scale'
}
export interface MotionKeyframe {
  id: string
  time: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
}
export interface PrototypeInteraction {
  trigger: 'click' | 'hover' | 'after-delay'
  action: 'navigate' | 'open-overlay' | 'back' | 'url'
  destinationId?: string
  url?: string
  transition: 'instant' | 'dissolve' | 'slide-left' | 'slide-right'
  duration: number
  delay?: number
}
export interface CanvasNode {
  id: string
  type: NodeType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  fill: string
  fillOpacity: number
  stroke: string
  strokeOpacity: number
  strokeWidth: number
  radius: number
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  letterSpacing?: number
  textAlign?: TextAlign
  textVerticalAlign?: TextVerticalAlign
  textDecoration?: 'none' | 'underline' | 'line-through'
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  visible: boolean
  locked: boolean
  parentId?: string | null
  path?: Point[]
  pathStyle?: 'pen' | 'pencil' | 'brush'
  pathClosed?: boolean
  strokeCap?: 'butt' | 'round' | 'square'
  strokeJoin?: 'miter' | 'round' | 'bevel'
  imageSrc?: string
  componentRole?: 'component' | 'instance'
  mainComponentId?: string
  componentSourceId?: string
  componentOverrides?: string[]
  variableBindings?: Record<string, string>
  paintStyleId?: string
  textStyleId?: string
  effectStyleId?: string
  layout?: AutoLayout
  widthMode?: SizeMode
  heightMode?: SizeMode
  widthPercent?: number
  heightPercent?: number
  layoutPosition?: 'auto' | 'absolute'
  constraints?: NodeConstraints
  shadowEnabled?: boolean
  shadowX?: number
  shadowY?: number
  shadowBlur?: number
  shadowColor?: string
  keyframes?: MotionKeyframe[]
  prototype?: PrototypeInteraction
}
export interface EditorSnapshot {
  objects: Record<string, CanvasNode>
  order: string[]
  selectedIds: string[]
  variables: EditorVariable[]
  styles: EditorStyle[]
}
