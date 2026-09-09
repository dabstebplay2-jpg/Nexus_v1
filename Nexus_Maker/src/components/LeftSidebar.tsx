import { useRef } from 'react'
import { BoxIcon, FileIcon, SearchIcon, SparkIcon, VariableIcon, WrenchIcon } from './icons'
import { useEditorStore } from '../store/editorStore'
import type { SidebarTab, VariableType } from '../types/editor'
import { LayersPanel } from './LayersPanel'
import { importImageFile } from '../editor/import/importImage'

const tabs: Array<{ id: SidebarTab; label: string; icon: typeof FileIcon }> = [
  { id: 'file', label: 'Файл', icon: FileIcon },
  { id: 'agents', label: 'Агенты', icon: SparkIcon },
  { id: 'assets', label: 'Ассеты', icon: BoxIcon },
  { id: 'tools', label: 'Инструменты', icon: WrenchIcon },
  { id: 'variables', label: 'Переменные', icon: VariableIcon },
]

export function LeftSidebar() {
  const active = useEditorStore((state) => state.sidebarTab)
  const setActive = useEditorStore((state) => state.setSidebarTab)
  return <div className="left-dock"><nav className="side-rail" aria-label="Разделы рабочего пространства"><div className="rail-logo" title="Nexus Maker">N</div>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={`rail-button ${active === id ? 'active' : ''}`} onClick={() => setActive(id)} title={label} aria-label={label}><Icon/><span>{label}</span></button>)}</nav><aside className="left-panel">{active === 'file' && <FilePanel/>}{active === 'agents' && <AgentsPanel/>}{active === 'assets' && <AssetsPanel/>}{active === 'tools' && <ToolsPanel/>}{active === 'variables' && <VariablesPanel/>}</aside></div>
}

function PanelTitle({title,subtitle}:{title:string;subtitle:string}) { return <div className="left-panel-title"><div><strong>{title}</strong><small>{subtitle}</small></div></div> }
function FilePanel() { return <><PanelTitle title="Nexus Maker" subtitle="Локальный проект"/><section className="pages-block"><div className="section-caption"><span>Страницы</span></div><button className="page-row active" title="Текущая страница">Главная</button></section><LayersPanel/></> }

function AgentsPanel() {
  const selected = useEditorStore((state) => state.selectedIds), objects = useEditorStore((state) => state.objects)
  const align = useEditorStore((state) => state.alignSelected), rename = useEditorStore((state) => state.renameSelectedIntelligently), cleanup = useEditorStore((state) => state.cleanupEmptyLayers), autoLayout = useEditorStore((state) => state.createAutoLayout)
  const summary = selected.length ? `Выбрано: ${selected.length}. ${selected.map((id) => objects[id]?.name).filter(Boolean).slice(0, 3).join(', ')}` : 'Выделите объекты на холсте.'
  return <><PanelTitle title="Локальные агенты" subtitle="Команды работают без облака"/><div className="agent-panel"><div className="agent-analysis"><SparkIcon/><div><strong>Анализ выделения</strong><span>{summary}</span></div></div><div className="agent-actions"><button disabled={selected.length<2} onClick={()=>align('left')}>Выровнять слева</button><button disabled={selected.length<2} onClick={()=>align('centerX')}>Выровнять по центру</button><button disabled={!selected.length} onClick={rename}>Переименовать слои</button><button disabled={!selected.length} onClick={()=>autoLayout('horizontal')}>Создать автомакет</button><button onClick={cleanup}>Очистить пустые слои</button></div><p className="panel-note">Команды изменяют модель документа и входят в общую историю отмены. Облачный AI здесь не имитируется.</p></div></>
}

function AssetsPanel() {
  const input = useRef<HTMLInputElement>(null), addNode = useEditorStore((state) => state.addNode), objects=useEditorStore(state=>state.objects),order=useEditorStore(state=>state.order),createInstance=useEditorStore(state=>state.createInstance),styles=useEditorStore(state=>state.styles),deleteStyle=useEditorStore(state=>state.deleteStyle)
  const components=order.map(id=>objects[id]).filter(node=>node?.componentRole==='component')
  return <><PanelTitle title="Ассеты" subtitle="Компоненты, стили и изображения"/><div className="search-box"><SearchIcon/><input aria-label="Поиск ассетов" placeholder="Поиск ассетов"/></div>{components.length>0&&<section className="asset-components"><div className="section-caption"><span>Компоненты</span><small>{components.length}</small></div>{components.map(component=><button className="component-asset" key={component.id} onClick={()=>createInstance(component.id)}><span>◆</span><div><strong>{component.name}</strong><small>{Math.round(component.width)} × {Math.round(component.height)}</small></div><b>+</b></button>)}</section>}{styles.length>0&&<section className="asset-components"><div className="section-caption"><span>Стили</span><small>{styles.length}</small></div>{styles.map(style=><div className="style-asset" key={style.id}><span style={{background:style.type==='paint'?String(style.properties.fill):undefined}}>{style.type==='text'?'T':style.type==='effect'?'✦':''}</span><div><strong>{style.name}</strong><small>{style.type==='paint'?'Цвет':style.type==='text'?'Текст':'Эффекты'}</small></div><button title="Удалить стиль" onClick={()=>deleteStyle(style.id)}>×</button></div>)}</section>}<div className="asset-empty"><BoxIcon/><strong>Импорт изображения</strong><span>PNG, JPG, WebP или SVG появится в центре холста.</span><button className="wide-action primary" onClick={()=>input.current?.click()}>Выбрать файл</button><input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={async e=>{const file=e.target.files?.[0];if(file)try{await importImageFile(file,{x:0,y:0},addNode)}catch(error){window.alert(error instanceof Error?error.message:'Ошибка импорта')}e.target.value=''}}/></div></>
}

function ToolsPanel() {
  const selected = useEditorStore((state) => state.selectedIds.length), align = useEditorStore((state) => state.alignSelected), distribute = useEditorStore((state) => state.distributeSelected)
  return <><PanelTitle title="Инструменты" subtitle="Доступные команды"/><div className="tool-list"><button className="tool-card" disabled={selected<2} onClick={()=>align('centerX')}><WrenchIcon/><div><strong>Центрировать по горизонтали</strong><span>Нужно выбрать минимум два объекта</span></div></button><button className="tool-card" disabled={selected<3} onClick={()=>distribute('x')}><WrenchIcon/><div><strong>Распределить по горизонтали</strong><span>Равные интервалы между объектами</span></div></button><button className="tool-card" disabled={selected<3} onClick={()=>distribute('y')}><WrenchIcon/><div><strong>Распределить по вертикали</strong><span>Равные интервалы между объектами</span></div></button></div></>
}

function VariablesPanel() {
  const variables = useEditorStore((state) => state.variables), add = useEditorStore((state) => state.addVariable), update = useEditorStore((state) => state.updateVariable), remove = useEditorStore((state) => state.deleteVariable)
  const create = (type:VariableType) => { const name=window.prompt('Название переменной'); if(!name?.trim())return; const raw=window.prompt('Значение',type==='color'?'#0d99ff':type==='number'?'16':'Текст'); if(raw===null)return; add(name.trim(),type,type==='number'?Number(raw)||0:raw) }
  return <><PanelTitle title="Переменные" subtitle="Локальные токены проекта"/><div className="variable-create-row"><button onClick={()=>create('color')}>+ Цвет</button><button onClick={()=>create('number')}>+ Число</button><button onClick={()=>create('string')}>+ Текст</button></div><div className="variables-list">{variables.map(variable=><div className="variable-row" key={variable.id}><VariableIcon/><input aria-label="Название переменной" value={variable.name} onChange={e=>update(variable.id,{name:e.target.value})}/>{variable.type==='color'?<input aria-label="Цвет" type="color" value={String(variable.value)} onChange={e=>update(variable.id,{value:e.target.value})}/>:<input aria-label="Значение переменной" type={variable.type==='number'?'number':'text'} value={variable.value} onChange={e=>update(variable.id,{value:variable.type==='number'?Number(e.target.value):e.target.value})}/>}<button className="variable-delete" onClick={()=>remove(variable.id)} title="Удалить переменную">×</button></div>)}{!variables.length&&<div className="variables-empty"><VariableIcon/><strong>Переменных пока нет</strong><span>Создайте цвет, число или строку. Они сохраняются вместе с проектом.</span></div>}</div></>
}
