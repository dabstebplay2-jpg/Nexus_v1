import { useEffect, useMemo, useRef, useState } from 'react'
import { SearchIcon } from './icons'
import { useEditorStore } from '../store/editorStore'
import type { EditorMode, SidebarTab, Tool } from '../types/editor'

interface Command { name:string; hint:string; disabled?:boolean; run:()=>void }

export function CommandPalette() {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),input=useRef<HTMLInputElement>(null)
  const selected=useEditorStore(state=>state.selectedIds.length)
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setOpen(value=>!value)}if(event.key==='Escape')setOpen(false)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[])
  useEffect(()=>{if(open)setTimeout(()=>input.current?.focus(),0);else setQuery('')},[open])
  const commands=useMemo<Command[]>(()=>{const state=useEditorStore.getState(),mode=(name:string,value:EditorMode):Command=>({name,hint:'Режим',run:()=>state.setMode(value)}),tool=(name:string,value:Tool,key:string):Command=>({name,hint:key,run:()=>state.setTool(value)}),panel=(name:string,value:SidebarTab):Command=>({name,hint:'Панель',run:()=>state.setSidebarTab(value)});return[
    tool('Инструмент: Выбор','select','V'),tool('Создать фрейм','frame','F'),tool('Создать прямоугольник','rectangle','R'),tool('Создать эллипс','ellipse','O'),tool('Создать текст','text','T'),tool('Создать заметку','sticky','N'),
    mode('Открыть режим дизайна','design'),mode('Открыть режим прототипа','prototype'),mode('Открыть режим рисования','draw'),mode('Открыть режим анимации','motion'),mode('Открыть режим разработки','dev'),panel('Показать переменные','variables'),panel('Показать слои','file'),panel('Открыть локальные агенты','agents'),
    {name:'Дублировать выделение',hint:'Ctrl+D',disabled:!selected,run:state.duplicateSelected},{name:'Удалить выделение',hint:'Del',disabled:!selected,run:state.deleteSelected},{name:'Создать автомакет',hint:'Команда',disabled:!selected,run:()=>state.createAutoLayout('horizontal')},{name:'Открыть просмотр',hint:'Команда',run:()=>state.setPreviewOpen(true)}
  ]},[selected])
  const filtered=commands.filter(command=>command.name.toLowerCase().includes(query.toLowerCase()))
  if(!open)return null
  const execute=(command:Command)=>{if(command.disabled)return;command.run();setOpen(false)}
  return <div className="command-overlay" onPointerDown={()=>setOpen(false)}><div className="command-palette" role="dialog" aria-modal="true" aria-label="Палитра действий" onPointerDown={event=>event.stopPropagation()}><label><SearchIcon/><input ref={input} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Найти команду, инструмент или режим…" onKeyDown={event=>{if(event.key==='Enter'&&filtered[0])execute(filtered[0])}}/></label><div className="command-list">{filtered.map(command=><button key={command.name} disabled={command.disabled} onClick={()=>execute(command)}><span>{command.name}</span><kbd>{command.hint}</kbd></button>)}{!filtered.length&&<p>Ничего не найдено</p>}</div></div></div>
}
