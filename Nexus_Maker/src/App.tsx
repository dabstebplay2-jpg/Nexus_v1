import { useEffect } from 'react'
import { CanvasViewport } from './components/CanvasViewport'
import { InspectorPanel } from './components/InspectorPanel'
import { LeftSidebar } from './components/LeftSidebar'
import { MotionTimeline } from './components/MotionTimeline'
import { StatusBar } from './components/StatusBar'
import { Toolbar } from './components/Toolbar'
import { TopBar } from './components/TopBar'
import { useEditorStore } from './store/editorStore'
import type { Tool } from './types/editor'
import { CommandPalette } from './components/CommandPalette'
import { PreviewModal } from './components/PreviewModal'

export default function App(){const theme=useEditorStore(s=>s.theme);useEffect(()=>{document.documentElement.dataset.theme=theme},[theme])
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(isTyping(e.target))return;const s=useEditorStore.getState(),key=e.key.toLowerCase();if(e.ctrlKey||e.metaKey){if(key==='z'){e.preventDefault();e.shiftKey?s.redo():s.undo();return}if(key==='y'){e.preventDefault();s.redo();return}if(key==='a'){e.preventDefault();s.setSelection(s.order.filter(id=>s.objects[id]?.visible&&!s.objects[id]?.locked));return}if(key==='g'&&s.mode!=='dev'){e.preventDefault();e.shiftKey?s.ungroupSelected():s.groupSelected();return}if(key==='d'&&s.mode!=='dev'){e.preventDefault();s.duplicateSelected();return}if(key==='c'){e.preventDefault();s.copySelected();return}if(key==='v'&&s.mode!=='dev'){e.preventDefault();s.paste();return}}
   const toolMap:Record<string,Tool>=s.mode==='draw'?{v:'select',p:e.shiftKey?'pencil':'pen',b:'brush'}:{v:'select',f:'frame',r:'rectangle',o:'ellipse',t:'text',n:'sticky'};if(toolMap[key]&&s.mode!=='dev')s.setTool(toolMap[key]);if(s.mode!=='dev'&&e.key===']')s.selectedIds.forEach(id=>s.moveLayer(id,1));if(s.mode!=='dev'&&e.key==='[')s.selectedIds.forEach(id=>s.moveLayer(id,-1));if(s.mode!=='dev'&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();s.deleteSelected()}if(e.key==='Escape'){if(s.previewOpen)s.setPreviewOpen(false);else{s.clearSelection();s.setTool('select')}}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[])
 return <div className="app-shell"><div className="workspace-shell"><LeftSidebar/><CanvasViewport/><InspectorPanel/></div><TopBar/><Toolbar/><MotionTimeline/><StatusBar/><CommandPalette/><PreviewModal/></div>}
function isTyping(target:EventTarget|null){const el=target as HTMLElement|null;return!!el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable)}
