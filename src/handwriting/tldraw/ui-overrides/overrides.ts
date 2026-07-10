/**
 * TLdraw UI Overrides
 * 工具注册和动作覆写
 */
import { copyAs, exportAs, type TLShapeId, type TLUiOverrides } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import { selectAdjacentShape } from '../utils/selectAdjacentShape'
import { clearSvgExportSnapshotCache } from '../utils/export-dom-snapshot'
import { getTldrawImageExportOptions } from '../utils/export-image-options'
import { createExportProgressOverlay, waitForPaint } from '../utils/export-progress'
import { prepareSvgExportSnapshots } from '../utils/export-snapshot-preparer'

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
        tools.branch = {
            id: 'branch',
            icon: 'branch',
            label: 'Branch',
            kbd: 't',
            onSelect: () => editor.setCurrentTool('branch'),
        }
        return tools
    },
    actions(editor, actions) {
        const nextActions: typeof actions = { ...actions }
        const nudgeActionIds = ['nudge-left', 'nudge-right', 'nudge-up', 'nudge-down'] as const
        type ExportFormat = 'png' | 'svg'
        type ExportMode = 'export' | 'copy'

        const getSelectedOrCurrentPageIds = (): TLShapeId[] => {
            const selectedIds = editor.getSelectedShapeIds()
            return selectedIds.length > 0 ? selectedIds : Array.from(editor.getCurrentPageShapeIds())
        }

        const runPreparedImageExport = async (mode: ExportMode, format: ExportFormat, ids: TLShapeId[]) => {
            if (ids.length === 0) return

            const actionLabel = mode === 'copy' ? '复制图片' : '导出图片'
            const overlay = createExportProgressOverlay(actionLabel)

            try {
                await prepareSvgExportSnapshots(editor, ids, {
                    onProgress(progress) {
                        overlay.update(progress.message, progress.current, progress.total)
                    },
                })

                overlay.update(mode === 'copy' ? '正在写入剪贴板' : '正在生成图片', 1, 1)
                await waitForPaint()
                const imageOptions = format === 'png' ? getTldrawImageExportOptions() : {}

                if (mode === 'copy') {
                    await copyAs(editor, ids, { format, ...imageOptions })
                } else {
                    await exportAs(editor, ids, { format, ...imageOptions })
                }
            } catch (error) {
                console.error('Image export failed', error)
                showMessage('图片导出失败，请查看控制台日志')
            } finally {
                clearSvgExportSnapshotCache()
                overlay.close()
            }
        }

        const wrapExportAction = (
            id: 'export-as-png' | 'export-as-svg' | 'export-all-as-png' | 'export-all-as-svg' | 'copy-as-png' | 'copy-as-svg',
            mode: ExportMode,
            format: ExportFormat,
            all = false
        ) => {
            const action = nextActions[id]
            if (!action) return
            nextActions[id] = {
                ...action,
                async onSelect() {
                    const ids = all ? Array.from(editor.getCurrentPageShapeIds()) : getSelectedOrCurrentPageIds()
                    await runPreparedImageExport(mode, format, ids)
                },
            }
        }

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

        wrapExportAction('export-as-png', 'export', 'png')
        wrapExportAction('export-as-svg', 'export', 'svg')
        wrapExportAction('export-all-as-png', 'export', 'png', true)
        wrapExportAction('export-all-as-svg', 'export', 'svg', true)
        wrapExportAction('copy-as-png', 'copy', 'png')
        wrapExportAction('copy-as-svg', 'copy', 'svg')

        return nextActions
    },
}
