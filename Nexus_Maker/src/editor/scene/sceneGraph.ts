import type { CanvasNode, Point } from '../../types/editor'
import type { Rect } from '../../lib/geometry'

export interface Matrix2D { a:number; b:number; c:number; d:number; e:number; f:number }
export const IDENTITY: Matrix2D = { a:1,b:0,c:0,d:1,e:0,f:0 }

export function multiply(left:Matrix2D,right:Matrix2D):Matrix2D { return { a:left.a*right.a+left.c*right.b,b:left.b*right.a+left.d*right.b,c:left.a*right.c+left.c*right.d,d:left.b*right.c+left.d*right.d,e:left.a*right.e+left.c*right.f+left.e,f:left.b*right.e+left.d*right.f+left.f } }
export function translate(x:number,y:number):Matrix2D { return { a:1,b:0,c:0,d:1,e:x,f:y } }
export function rotate(degrees:number):Matrix2D { const angle=degrees*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);return{a:cos,b:sin,c:-sin,d:cos,e:0,f:0} }
export function invert(matrix:Matrix2D):Matrix2D { const determinant=matrix.a*matrix.d-matrix.b*matrix.c;if(Math.abs(determinant)<1e-10)return IDENTITY;return{a:matrix.d/determinant,b:-matrix.b/determinant,c:-matrix.c/determinant,d:matrix.a/determinant,e:(matrix.c*matrix.f-matrix.d*matrix.e)/determinant,f:(matrix.b*matrix.e-matrix.a*matrix.f)/determinant} }
export function transformPoint(matrix:Matrix2D,point:Point):Point { return {x:matrix.a*point.x+matrix.c*point.y+matrix.e,y:matrix.b*point.x+matrix.d*point.y+matrix.f} }
export function transformVector(matrix:Matrix2D,vector:Point):Point { return {x:matrix.a*vector.x+matrix.c*vector.y,y:matrix.b*vector.x+matrix.d*vector.y} }

export function localMatrix(node:CanvasNode):Matrix2D { const center={x:node.width/2,y:node.height/2};return multiply(translate(node.x+center.x,node.y+center.y),multiply(rotate(node.rotation),translate(-center.x,-center.y))) }

export function ancestorIds(id:string,objects:Record<string,CanvasNode>):string[] { const result:string[]=[];const visited=new Set<string>([id]);let current=objects[id];while(current?.parentId&&objects[current.parentId]&&!visited.has(current.parentId)){visited.add(current.parentId);result.push(current.parentId);current=objects[current.parentId]}return result }
export function isDescendant(id:string,parentId:string,objects:Record<string,CanvasNode>):boolean { return ancestorIds(id,objects).includes(parentId) }

export function worldMatrix(id:string,objects:Record<string,CanvasNode>):Matrix2D { const node=objects[id];if(!node)return IDENTITY;const chain=[...ancestorIds(id,objects).reverse(),id];return chain.reduce((matrix,nodeId)=>multiply(matrix,localMatrix(objects[nodeId])),IDENTITY) }
export function parentWorldMatrix(parentId:string|null|undefined,objects:Record<string,CanvasNode>):Matrix2D { return parentId?worldMatrix(parentId,objects):IDENTITY }
export function worldRotation(id:string,objects:Record<string,CanvasNode>):number { const node=objects[id];if(!node)return 0;return [...ancestorIds(id,objects),id].reduce((sum,nodeId)=>sum+(objects[nodeId]?.rotation??0),0) }
export function worldCenter(id:string,objects:Record<string,CanvasNode>):Point { const node=objects[id];return node?transformPoint(worldMatrix(id,objects),{x:node.width/2,y:node.height/2}):{x:0,y:0} }

export function worldBounds(id:string,objects:Record<string,CanvasNode>):Rect { const node=objects[id];if(!node)return{x:0,y:0,width:0,height:0};const matrix=worldMatrix(id,objects),corners=[{x:0,y:0},{x:node.width,y:0},{x:node.width,y:node.height},{x:0,y:node.height}].map(point=>transformPoint(matrix,point)),xs=corners.map(point=>point.x),ys=corners.map(point=>point.y),minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);return{x:minX,y:minY,width:maxX-minX,height:maxY-minY} }

export function worldPointToParent(point:Point,parentId:string|null|undefined,objects:Record<string,CanvasNode>):Point { return transformPoint(invert(parentWorldMatrix(parentId,objects)),point) }
export function worldVectorToParent(vector:Point,parentId:string|null|undefined,objects:Record<string,CanvasNode>):Point { return transformVector(invert(parentWorldMatrix(parentId,objects)),vector) }

/** Сохраняет визуальный центр и мировой поворот при смене родителя. */
export function reparentPatch(id:string,parentId:string|null,objects:Record<string,CanvasNode>):Pick<CanvasNode,'parentId'|'x'|'y'|'rotation'>|null { const node=objects[id];if(!node||parentId===id||parentId&&(!objects[parentId]||objects[parentId].type!=='frame'||isDescendant(parentId,id,objects)))return null;const center=worldCenter(id,objects),localCenter=worldPointToParent(center,parentId,objects),rotation=worldRotation(id,objects)-(parentId?worldRotation(parentId,objects):0);return{parentId,x:localCenter.x-node.width/2,y:localCenter.y-node.height/2,rotation} }

/** Переводит старый документ с абсолютными координатами в локальную модель v2. */
export function migrateAbsoluteScene(objects:Record<string,CanvasNode>):Record<string,CanvasNode> { const source=structuredClone(objects),next=structuredClone(objects);for(const node of Object.values(source)){if(!node.parentId||!source[node.parentId])continue;const parent=source[node.parentId];next[node.id]={...next[node.id],x:node.x-parent.x,y:node.y-parent.y,rotation:node.rotation-parent.rotation}}return next }
