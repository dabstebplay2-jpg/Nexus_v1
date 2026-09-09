import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { CanvasNode } from '../types/editor'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type RadiusHandle = 'nw' | 'ne' | 'se' | 'sw'

interface Props {
  node: CanvasNode
  selected: boolean
  multiSelected: boolean
  onPointerDown: (node: CanvasNode, event: ReactPointerEvent<HTMLDivElement>) => void
  onResizeStart: (node: CanvasNode, handle: ResizeHandle, event: ReactPointerEvent<HTMLDivElement>) => void
  onRadiusStart: (node: CanvasNode, handle: RadiusHandle, event: ReactPointerEvent<HTMLDivElement>) => void
  onRotateStart: (node: CanvasNode, event: ReactPointerEvent<HTMLDivElement>) => void
  onTextCommit: (node: CanvasNode, text: string) => void
  onPathPointStart: (node: CanvasNode, index: number, event: ReactPointerEvent<SVGCircleElement>) => void
  children?: ReactNode
}
const handles: ResizeHandle[] = ['nw','n','ne','e','se','s','sw','w']
const radiusHandles: RadiusHandle[] = ['nw','ne','se','sw']

export function CanvasObject({ node, selected, multiSelected, onPointerDown, onResizeStart, onRadiusStart, onRotateStart, onTextCommit, onPathPointStart, children }: Props) {
  if (!node.visible) return null
  const baseStyle: CSSProperties = {
    left: node.x, top: node.y, width: node.width, height: node.height,
    transform: `rotate(${node.rotation}deg)`, opacity: node.opacity,
    borderRadius: node.type === 'ellipse' ? '50%' : node.radius,
    boxShadow: node.shadowEnabled ? `${node.shadowX ?? 0}px ${node.shadowY ?? 4}px ${node.shadowBlur ?? 12}px ${node.shadowColor ?? '#00000055'}` : undefined,
  }
  const fill = node.fill === 'transparent' ? 'transparent' : colorWithOpacity(node.fill, node.fillOpacity)
  const stroke = node.stroke === 'transparent' ? 'transparent' : colorWithOpacity(node.stroke, node.strokeOpacity)

  return <div className={`canvas-object node-${node.type} ${selected?'selected':''} ${node.locked?'locked':''}`} style={baseStyle} onPointerDown={(e)=>onPointerDown(node,e)} data-node-id={node.id}>
    {node.type === 'path' ? <PathNode node={node} stroke={stroke} fill={fill} selected={selected&&!multiSelected&&!node.locked} onPointStart={onPathPointStart}/> : <div className="node-surface" style={{ background: node.type==='text'||node.type==='image'||node.type==='group'?'transparent':fill, border: node.strokeWidth>0?`${node.strokeWidth}px solid ${stroke}`:'none', borderRadius: node.type==='ellipse'?'50%':node.radius }}>
      {node.type==='image' && node.imageSrc && <img className="node-image" src={node.imageSrc} draggable={false} alt=""/>}
      {(node.type==='text'||node.type==='sticky') && <div className={`node-text align-${node.textVerticalAlign??'top'}`} style={{fontFamily:node.fontFamily,fontSize:node.fontSize,fontWeight:node.fontWeight,lineHeight:node.lineHeight,letterSpacing:node.letterSpacing,textAlign:node.textAlign,textDecoration:node.textDecoration,textTransform:node.textTransform}} contentEditable={selected&&!multiSelected&&!node.locked} suppressContentEditableWarning spellCheck onPointerDown={event=>{if((event.currentTarget as HTMLElement).isContentEditable)event.stopPropagation()}} onBlur={event=>onTextCommit(node,event.currentTarget.textContent??'')} onKeyDown={event=>{if(event.key==='Escape')(event.currentTarget as HTMLElement).blur()}}>{node.text}</div>}
    </div>}
    {children}
    {selected && !multiSelected && !node.locked && handles.map((h)=><div key={h} className={`resize-handle handle-${h}`} onPointerDown={(e)=>{e.stopPropagation();onResizeStart(node,h,e)}}/>)}
    {selected && !multiSelected && !node.locked && <div className="rotation-stem"><div className="rotation-handle" title="Повернуть" onPointerDown={(e)=>{e.stopPropagation();onRotateStart(node,e)}}/></div>}
    {selected && !multiSelected && !node.locked && (node.type==='rectangle'||node.type==='frame'||node.type==='sticky') && radiusHandles.map((h)=><div key={`r-${h}`} className={`radius-handle radius-${h}`} style={radiusHandleStyle(node,h)} onPointerDown={(e)=>{e.stopPropagation();onRadiusStart(node,h,e)}}/>)}
    {selected && <span className="selection-label">{node.name}</span>}
    {node.locked && <span className="locked-chip">ЗАБЛОКИРОВАНО</span>}
  </div>
}

function PathNode({node,stroke,fill,selected,onPointStart}:{node:CanvasNode;stroke:string;fill:string;selected:boolean;onPointStart:(node:CanvasNode,index:number,event:ReactPointerEvent<SVGCircleElement>)=>void}) {
  const pts=node.path??[]
  if(pts.length<2) return null
  const d=`${pts.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')}${node.pathClosed?' Z':''}`
  return <svg className="path-svg" viewBox={`0 0 ${Math.max(1,node.width)} ${Math.max(1,node.height)}`} preserveAspectRatio="none"><path d={d} fill={node.pathClosed?fill:'none'} stroke={stroke} strokeWidth={node.strokeWidth} strokeLinecap={node.strokeCap??'round'} strokeLinejoin={node.strokeJoin??'round'} vectorEffect="non-scaling-stroke"/>{selected&&pts.map((point,index)=><circle key={index} className="vector-anchor" cx={point.x} cy={point.y} r={4} vectorEffect="non-scaling-stroke" onPointerDown={event=>{event.stopPropagation();onPointStart(node,index,event)}}/>)}</svg>
}
function radiusHandleStyle(node:CanvasNode,h:RadiusHandle):CSSProperties{
  const inset=Math.max(10,Math.min(node.radius || 14,Math.min(node.width,node.height)/2-6))
  if(h==='nw')return{left:inset,top:inset}
  if(h==='ne')return{right:inset,top:inset}
  if(h==='se')return{right:inset,bottom:inset}
  return{left:inset,bottom:inset}
}
function colorWithOpacity(hex:string,opacity=1){
  if(!hex.startsWith('#')||opacity>=.999)return hex
  const h=hex.slice(1); if(h.length!==6)return hex
  const a=Math.round(Math.max(0,Math.min(1,opacity))*255).toString(16).padStart(2,'0'); return `#${h}${a}`
}
