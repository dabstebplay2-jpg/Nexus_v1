import { describe,expect,it } from 'vitest'
import type { CanvasNode } from '../../types/editor'
import { applyAutoLayout, applyConstraintsOnResize } from './layoutEngine'

const node=(id:string,patch:Partial<CanvasNode>={}):CanvasNode=>({id,type:'rectangle',name:id,x:0,y:0,width:100,height:40,rotation:0,opacity:1,fill:'#fff',fillOpacity:1,stroke:'#000',strokeOpacity:1,strokeWidth:0,radius:0,visible:true,locked:false,parentId:null,...patch})
describe('layout engine',()=>{
 it('раскладывает детей горизонтально с padding и gap',()=>{const frame=node('f',{type:'frame',width:400,height:120,layout:{direction:'horizontal',gap:16,padding:24}}),a=node('a',{parentId:'f'}),b=node('b',{parentId:'f'}),next=applyAutoLayout({f:frame,a,b},['f','a','b'],'f');expect(next.a.x).toBe(24);expect(next.b.x).toBe(140);expect(next.a.y).toBe(24)})
 it('распределяет свободное место между элементами',()=>{const frame=node('f',{type:'frame',width:300,height:100,layout:{direction:'horizontal',gap:0,padding:0,distribution:'between'}}),a=node('a'),b=node('b');a.parentId='f';b.parentId='f';const next=applyAutoLayout({f:frame,a,b},['f','a','b'],'f');expect(next.a.x).toBe(0);expect(next.b.x).toBe(200)})
 it('поддерживает процентную ширину',()=>{const frame=node('f',{type:'frame',width:400,height:100,layout:{direction:'vertical',gap:0,padding:20}}),a=node('a',{parentId:'f',widthMode:'percent',widthPercent:50}),next=applyAutoLayout({f:frame,a},['f','a'],'f');expect(next.a.width).toBe(180)})
 it('строит сетку',()=>{const frame=node('f',{type:'frame',width:340,height:300,layout:{direction:'grid',gap:10,padding:10,columns:2}}),a=node('a',{parentId:'f',widthMode:'fill'}),b=node('b',{parentId:'f',widthMode:'fill'}),c=node('c',{parentId:'f',widthMode:'fill'}),next=applyAutoLayout({f:frame,a,b,c},['f','a','b','c'],'f');expect(next.a.width).toBe(155);expect(next.b.x).toBe(175);expect(next.c.y).toBe(60)})
 it('применяет constraints при resize родителя',()=>{const frame=node('f',{type:'frame',width:200,height:100}),child=node('c',{parentId:'f',x:150,y:60,width:30,height:20,constraints:{horizontal:'right',vertical:'bottom'}}),next=applyConstraintsOnResize({f:frame,c:child},frame,{...frame,width:260,height:140});expect(next.c.x).toBe(210);expect(next.c.y).toBe(100)})
})
