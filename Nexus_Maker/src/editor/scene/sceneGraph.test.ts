import { describe,expect,it } from 'vitest'
import type { CanvasNode } from '../../types/editor'
import { migrateAbsoluteScene, reparentPatch, transformPoint, worldBounds, worldCenter, worldMatrix, worldPointToParent, worldRotation } from './sceneGraph'

const node=(id:string,x:number,y:number,width=100,height=80,parentId:string|null=null,rotation=0):CanvasNode=>({id,type:'frame',name:id,x,y,width,height,rotation,opacity:1,fill:'#fff',fillOpacity:1,stroke:'#000',strokeOpacity:1,strokeWidth:0,radius:0,visible:true,locked:false,parentId})

describe('scene graph',()=>{
  it('накапливает локальные координаты вложенных узлов',()=>{const objects={root:node('root',100,50),child:node('child',20,30,40,20,'root')};expect(worldCenter('child',objects)).toEqual({x:140,y:90});expect(worldBounds('child',objects)).toEqual({x:120,y:80,width:40,height:20})})
  it('наследует поворот родителя',()=>{const objects={root:node('root',100,100,100,100,null,90),child:node('child',10,10,20,10,'root',15)};expect(worldRotation('child',objects)).toBe(105);const center=worldCenter('child',objects);expect(center.x).toBeCloseTo(185);expect(center.y).toBeCloseTo(120)})
  it('преобразует мировую точку в систему родителя',()=>{const objects={root:node('root',100,100,100,100,null,90)};const world=transformPoint(worldMatrix('root',objects),{x:25,y:35});const local=worldPointToParent(world,'root',objects);expect(local.x).toBeCloseTo(25);expect(local.y).toBeCloseTo(35)})
  it('сохраняет мировой центр и поворот при переподчинении',()=>{const objects={a:node('a',100,50,200,160,null,20),b:node('b',400,250,200,160,null,-10),child:node('child',30,40,60,30,'a',15)};const before=worldCenter('child',objects),angle=worldRotation('child',objects),patch=reparentPatch('child','b',objects)!;const next={...objects,child:{...objects.child,...patch}};expect(worldCenter('child',next).x).toBeCloseTo(before.x);expect(worldCenter('child',next).y).toBeCloseTo(before.y);expect(worldRotation('child',next)).toBeCloseTo(angle)})
  it('мигрирует абсолютные координаты старого документа',()=>{const old={root:node('root',100,50),child:node('child',135,90,20,20,'root',30)};const migrated=migrateAbsoluteScene(old);expect(migrated.child.x).toBe(35);expect(migrated.child.y).toBe(40);expect(migrated.child.rotation).toBe(30);expect(worldCenter('child',migrated)).toEqual({x:145,y:100})})
})
