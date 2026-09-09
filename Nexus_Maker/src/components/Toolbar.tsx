import { BrushIcon, CodeIcon, DesignModeIcon, DrawModeIcon, EllipseIcon, FrameIcon, MotionIcon, MouseIcon, PenIcon, PencilIcon, RectIcon, StickyIcon, TextIcon } from './icons'
import { useEditorStore } from '../store/editorStore'
import type { EditorMode, Tool } from '../types/editor'

const designTools:Array<{id:Tool;label:string;key:string;icon:typeof MouseIcon}>=[
 {id:'select',label:'Выбор',key:'V',icon:MouseIcon},{id:'frame',label:'Фрейм',key:'F',icon:FrameIcon},{id:'rectangle',label:'Прямоугольник',key:'R',icon:RectIcon},{id:'ellipse',label:'Эллипс',key:'O',icon:EllipseIcon},{id:'text',label:'Текст',key:'T',icon:TextIcon},{id:'sticky',label:'Заметка',key:'N',icon:StickyIcon},
]
const drawTools:Array<{id:Tool;label:string;key:string;icon:typeof MouseIcon}>=[
 {id:'select',label:'Выбор',key:'V',icon:MouseIcon},{id:'pen',label:'Перо',key:'P',icon:PenIcon},{id:'pencil',label:'Карандаш',key:'Shift+P',icon:PencilIcon},{id:'brush',label:'Кисть',key:'B',icon:BrushIcon},
]
const modes:Array<{id:EditorMode;label:string;icon:typeof MouseIcon}>=[{id:'design',label:'Дизайн',icon:DesignModeIcon},{id:'prototype',label:'Прототип',icon:FrameIcon},{id:'draw',label:'Рисование',icon:DrawModeIcon},{id:'motion',label:'Анимация',icon:MotionIcon},{id:'dev',label:'Разработка',icon:CodeIcon}]
export function Toolbar(){const tool=useEditorStore(s=>s.tool),setTool=useEditorStore(s=>s.setTool),mode=useEditorStore(s=>s.mode),setMode=useEditorStore(s=>s.setMode);const tools=mode==='draw'?drawTools:mode==='dev'?designTools.slice(0,1):designTools
 return <div className={`floating-toolbar ${mode==='motion'?'motion-toolbar':''}`} role="toolbar" aria-label="Инструменты редактора"><div className="tool-cluster">{tools.map(({id,label,key,icon:Icon})=><button key={id} className={`tool-button ${tool===id?'active':''}`} onClick={()=>setTool(id)} title={`${label} (${key})`} aria-label={`${label}, клавиша ${key}`}><Icon/><span className="tooltip-label">{label}<kbd>{key}</kbd></span></button>)}</div><div className="mode-divider"/><div className="mode-cluster">{modes.map(({id,label,icon:Icon})=><button key={id} className={`mode-button ${mode===id?'active':''}`} onClick={()=>setMode(id)} title={label} aria-label={`Режим «${label}»`}><Icon/><span className="tooltip-label">{label}</span></button>)}</div></div>
}
