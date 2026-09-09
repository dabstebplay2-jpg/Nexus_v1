import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from './editorStore'
import { worldCenter } from '../editor/scene/sceneGraph'

beforeEach(() => {
  useEditorStore.setState({ objects:{}, order:[], selectedIds:[], past:[], future:[], clipboard:[], variables:[], styles:[] })
})

describe('editorStore integration', () => {
  it('propagates master component changes to an instance', () => {
    const store=useEditorStore.getState(),frameId=store.addNode('frame',0,0),childId=useEditorStore.getState().addNode('rectangle',20,20)
    useEditorStore.getState().setParent(childId,frameId)
    useEditorStore.getState().selectOnly(frameId)
    useEditorStore.getState().createComponentFromSelection()
    useEditorStore.getState().createInstance(frameId,600,0)
    useEditorStore.getState().updateNode(childId,{fill:'#ff0066'})
    const instanceChild=Object.values(useEditorStore.getState().objects).find(node=>node.componentSourceId===childId&&node.id!==childId)
    expect(instanceChild?.fill).toBe('#ff0066')
  })

  it('updates all nodes bound to a variable', () => {
    const nodeId=useEditorStore.getState().addNode('rectangle',0,0)
    useEditorStore.getState().addVariable('Бренд','color','#112233')
    const variableId=useEditorStore.getState().variables[0].id
    useEditorStore.getState().bindVariable(nodeId,'fill',variableId)
    useEditorStore.getState().updateVariable(variableId,{value:'#abcdef'})
    expect(useEditorStore.getState().objects[nodeId].fill).toBe('#abcdef')
    expect(useEditorStore.getState().objects[nodeId].variableBindings?.fill).toBe(variableId)
  })

  it('groups and ungroups without moving children in world space', () => {
    const first=useEditorStore.getState().addNode('rectangle',30,40),second=useEditorStore.getState().addNode('ellipse',340,120)
    const before=[worldCenter(first,useEditorStore.getState().objects),worldCenter(second,useEditorStore.getState().objects)]
    useEditorStore.getState().setSelection([first,second])
    useEditorStore.getState().groupSelected()
    const groupId=useEditorStore.getState().selectedIds[0]
    expect(useEditorStore.getState().objects[groupId].type).toBe('group')
    expect(useEditorStore.getState().objects[first].parentId).toBe(groupId)
    useEditorStore.getState().ungroupSelected()
    const objects=useEditorStore.getState().objects
    expect(worldCenter(first,objects)).toEqual(before[0])
    expect(worldCenter(second,objects)).toEqual(before[1])
  })
})
