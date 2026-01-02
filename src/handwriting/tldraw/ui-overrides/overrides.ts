/**
 * TLdraw UI Overrides
 * 工具注册和动作覆写
 */
import type { TLUiOverrides } from '@tldraw/tldraw'
import { selectAdjacentShape } from '../utils/selectAdjacentShape'

export const uiOverrides: TLUiOverrides = {
    tools(editor, tools) {
        // Create a tool item in the ui's context.
        tools.card = {
            id: 'card',
            icon: 'color',
            label: 'Card',
            kbd: 'c',
            onSelect: () => {
                editor.setCurrentTool('card')
            },
        }
        tools['single-block'] = {
            id: 'single-block',
            icon: 'iconParagraph',
            label: 'Single Block',
            kbd: 'b',
            onSelect: () => {
                editor.setCurrentTool('single-block')
            },
        }
        tools.slide = {
            id: 'slide',
            icon: 'group',
            label: 'Slide',
            kbd: 's',
            onSelect: () => editor.setCurrentTool('slide'),
        }
        tools['js-shape'] = {
            id: 'js-shape',
            icon: 'code',
            label: 'JS Shape',
            kbd: 'j',
            onSelect: () => editor.setCurrentTool('js-shape'),
        }
        tools['mind-map'] = {
            id: 'mind-map',
            icon: 'mindmap',
            label: 'Mind Map',
            kbd: 'm',
            onSelect: () => editor.setCurrentTool('mind-map'),
        }
        return tools
    },
    actions(editor, actions) {
        const nextActions: typeof actions = { ...actions }
        const nudgeActionIds = ['nudge-left', 'nudge-right', 'nudge-up', 'nudge-down'] as const

        nudgeActionIds.forEach((id) => {
            const action = nextActions[id]
            if (action) {
                nextActions[id] = { ...action, kbd: '' }
            }
        })

        if (nextActions['zoom-in']) {
            nextActions['zoom-in'] = { ...nextActions['zoom-in'], kbd: '' }
        }

        if (nextActions['zoom-out']) {
            nextActions['zoom-out'] = { ...nextActions['zoom-out'], kbd: '' }
        }

        const focusSelection = () => {
            if (editor.getSelectedShapeIds().length > 0) {
                editor.zoomToSelection({ animation: { duration: 200 } })
            }
        }

        ;[
            { id: 'select-shape-left', label: '选择左侧图形', kbd: 'left', direction: 'left' as const },
            { id: 'select-shape-right', label: '选择右侧图形', kbd: 'right', direction: 'right' as const },
            { id: 'select-shape-up', label: '选择上方图形', kbd: 'up', direction: 'up' as const },
            { id: 'select-shape-down', label: '选择下方图形', kbd: 'down', direction: 'down' as const },
        ].forEach(({ id, label, kbd, direction }) => {
            nextActions[id] = {
                id,
                label,
                kbd,
                onSelect() {
                    selectAdjacentShape(editor, direction)
                    // Keep the newly selected shape centered for quick navigation
                    focusSelection()
                },
            }
        })

        nextActions['edit-selected-shape'] = {
            id: 'edit-selected-shape',
            label: '编辑选中图形',
            kbd: 'enter',
            onSelect() {
                if (editor.getEditingShapeId()) {
                    return
                }
                const shapes = editor.getSelectedShapes()
                if (shapes.length !== 1) {
                    return
                }
                editor.setEditingShape(shapes[0].id)
            },
        }
        return nextActions
    },
}
