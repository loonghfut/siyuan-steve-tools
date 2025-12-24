import {
    DefaultKeyboardShortcutsDialog,
    DefaultKeyboardShortcutsDialogContent,
    DefaultToolbar,
    DefaultToolbarContent,
    TLComponents,
    TLUiOverrides,
    TldrawUiMenuItem,
    TldrawUiButton,
    useIsToolSelected,
    useTools,
    useEditor,
    useValue,
    DefaultStylePanel,
    DefaultMainMenu,
    DefaultMainMenuContent,
    track, // 导入 track
    useRelevantStyles,
    DefaultStylePanelContent,
    StylePanelDropdownPicker,
    DefaultQuickActions,
    DefaultQuickActionsContent,
    TldrawUiMenuSubmenu, // 导入 useRelevantStyles
    TLShapeId,
    DefaultContextMenu,
    DefaultContextMenuContent,
    TldrawUiMenuGroup,
    TLUiContextMenuProps,
} from '@tldraw/tldraw'
// createAndBindShape moved to `BezierConnectorShape/createAndBindShape.ts`
import { selectAdjacentShape } from './utils/selectAdjacentShape'
import { ConnectionModeManager } from './utils/connectionMode'
import { arrangeConnectedSingleBlocks } from './utils/arrangeSingleBlocks'
// helper functions for making connected single-blocks
import { armAddConnectedSingleBlock, isArmed as isAddPending } from './utils/pendingConnectedSingleBlock'
import { getBlockKramdown } from '@/api/api'
import { parseMarkdownToMindMap } from './MindMapShape/mind-map-markdown'

// Extend the TLEventMap interface to include custom events
declare module '@tldraw/tldraw' {
    interface TLEventMap {
        'sttools:importData': () => void
        'sttools:backupData': () => void
        'sttools:exportData': () => void
        'sttools:rollbackData': () => void
        'sttools:pruneAssets': () => void
        'sttools:editJsShape': (shapeId?: TLShapeId) => void
        'sttools:rerunJsShape': (shapeId?: TLShapeId) => void
        'sttools:toggleShapeLibrary': () => void
        'sttools:addToShapeLibrary': () => void
    }
}
import React from 'react';
import { CardRenderMode, ICardShape } from './CardShape/card-shape-types'
import { settingdata } from '@/index'
import { buildTldrawLink } from './utils/link-builder';
import { captureSlideScreenshot } from './SlideShape/captureSlideScreenshot';
import { SlidesPanel } from './SlideShape/SlidesPanel';
import { ISingleBlockShape } from './SingleBlockShape/single-block-shape-types';
import { SlideShape } from './SlideShape/SlideShapeUtil';
import { IJsShape } from './JsShape/js-shape-types';
import { openTab, showMessage, confirm as syConfirm, Dialog } from 'siyuan';
import { upload, appendBlock, updateBlock, getBlockByID } from '@/api/api'
import { getCursorBlockId } from '@/api/api2'
import { IMindMapShape } from './MindMapShape/mind-map-shape-types'
import { ThemeName } from './MindMapShape/mind-map-constants'
import { addShapesToLibrary, resetShapeLibraryPanelPosition } from './shapelibrary/shape-library-manager'
import { ShapeLibraryPanel } from './shapelibrary/ShapeLibraryPanel'
import { IBezierConnectorShape, getConnectorTerminals } from './BezierConnectorShape'
import { createAndBindShape } from './BezierConnectorShape'
import { convertConnectorsToArrow, convertConnectorsToBezier } from './utils/connector-convert'
// There's a guide at the bottom of this file!

type CardLikeShape = ICardShape | ISingleBlockShape;

const isCardLikeShape = (shape: any): shape is CardLikeShape =>
    shape?.type === 'card' || shape?.type === 'single-block';

type OverlayShape = CardLikeShape | IJsShape;

const isOverlayShape = (shape: any): shape is OverlayShape =>
    isCardLikeShape(shape) || shape?.type === 'js-shape';


export const uiOverrides: TLUiOverrides = {
    tools(editor, tools) {
        // Create a tool item in the ui's context.
        // console.debug('tools', tools)
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
        // 删除文本工具
        // delete tools.text
        return tools
    },
    actions(editor, actions) {
        const nextActions: typeof actions = { ...actions };
        const nudgeActionIds = ['nudge-left', 'nudge-right', 'nudge-up', 'nudge-down'] as const;

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

// 连接模式管理器实例
let connectionManager: ConnectionModeManager | null = null

// 思维导图绑定思源块 UI 组件
const MindMapBindingUI: React.FC<{
    selectedMindMapShapes: IMindMapShape[]
    editor: any
}> = ({ selectedMindMapShapes, editor }) => {
    const singleSelected = selectedMindMapShapes.length === 1
    const currentShape = singleSelected ? selectedMindMapShapes[0] : null
    const isLinked = currentShape?.props?.blockId ? true : false
    const linkedBlockId = currentShape?.props?.blockId || ''

    const [inputBlockId, setInputBlockId] = React.useState('')
    const [isBinding, setIsBinding] = React.useState(false)

    const handleBindBlock = async () => {
        if (!singleSelected || !currentShape) {
            showMessage('请选中单个思维导图', 3000, 'error')
            return
        }
        const blockIdToUse = inputBlockId.trim()
        if (!blockIdToUse) {
            showMessage('请输入块ID', 3000, 'error')
            return
        }
        setIsBinding(true)
        try {
            const res = await getBlockKramdown(blockIdToUse)
            const kramdown = res?.kramdown || ''
            if (!kramdown.trim()) {
                showMessage('块内容为空或块ID无效', 3000, 'error')
                return
            }
            const newRootNode = parseMarkdownToMindMap(kramdown)
            editor.updateShape({
                id: currentShape.id,
                type: 'mind-map',
                props: {
                    ...currentShape.props,
                    blockId: blockIdToUse,
                    rootNode: newRootNode,
                    refreshNonce: Date.now(),
                },
            })
            setInputBlockId('')
            showMessage('已绑定思源块')
        } catch (err) {
            console.error('绑定思源块失败', err)
            showMessage('绑定失败，请检查块ID是否正确', 3000, 'error')
        } finally {
            setIsBinding(false)
        }
    }

    const handleUnbindBlock = () => {
        if (!singleSelected || !currentShape) return
        editor.updateShape({
            id: currentShape.id,
            type: 'mind-map',
            props: {
                ...currentShape.props,
                blockId: undefined,
            },
        })
        showMessage('已解除绑定')
    }

    const handleRefresh = () => {
        if (!singleSelected || !currentShape) return
        editor.updateShape({
            id: currentShape.id,
            type: 'mind-map',
            props: {
                ...currentShape.props,
                refreshNonce: Date.now(),
            },
        })
        showMessage('已刷新思维导图')
    }

    const handleJumpToBlock = () => {
        if (!linkedBlockId) return
        openTab({
            app: window.siyuan.ws.app,
            doc: {
                id: linkedBlockId,
                action: ['cb-get-hl', 'cb-get-all'],
                zoomIn: false,
            },
            keepCursor: false,
        })
    }

    if (!singleSelected) {
        return (
            <div style={{ fontSize: 12, color: 'var(--b3-theme-on-surface-light)', padding: '4px 0' }}>
                选中单个思维导图以绑定思源块
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {isLinked ? (
                <>
                    <div style={{ fontSize: 11, color: 'var(--b3-theme-on-surface-light)', wordBreak: 'break-all' }}>
                        已绑定: {linkedBlockId.slice(0, 8)}...
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <TldrawUiButton
                            type="normal"
                            style={{ flex: 1 }}
                            onClick={handleRefresh}
                            title="从思源块重新获取内容"
                        >
                            刷新
                        </TldrawUiButton>
                        <TldrawUiButton
                            type="normal"
                            style={{ flex: 1 }}
                            onClick={handleJumpToBlock}
                            title="跳转到绑定的思源块"
                        >
                            跳转
                        </TldrawUiButton>
                    </div>
                    <TldrawUiButton
                        type="normal"
                        onClick={handleUnbindBlock}
                        title="解除绑定后可手动编辑思维导图"
                    >
                        解除绑定
                    </TldrawUiButton>
                </>
            ) : (
                <>
                    <input
                        type="text"
                        placeholder="输入思源块ID"
                        value={inputBlockId}
                        onChange={(e) => setInputBlockId(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleBindBlock()
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '6px 8px',
                            fontSize: '13px',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            backgroundColor: 'var(--color-background)',
                            color: 'var(--color-text)',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                    />
                    <TldrawUiButton
                        type="normal"
                        onClick={handleBindBlock}
                        disabled={isBinding || !inputBlockId.trim()}
                        title="输入思源块ID后点击绑定，将从该块获取 Markdown 内容渲染思维导图"
                    >
                        {isBinding ? '绑定中...' : '绑定思源块'}
                    </TldrawUiButton>
                </>
            )}
        </div>
    )
}

const CustomStylePanel = track(() => {
    const editor = useEditor()
    const selectedShapes = useValue('selected shapes', () => editor.getSelectedShapes(), [editor])
    const styles = useRelevantStyles()
    const [isCapturingScreenshot, setIsCapturingScreenshot] = React.useState(false)
    const [connectionMode, setConnectionMode] = React.useState(false)
    const [connectionConnectorKind] = React.useState<'arrow' | 'bezier'>(() => {
        return (String(settingdata['tldraw-connector-kind'] || 'bezier') === 'arrow') ? 'arrow' : 'bezier'
    })

    const isSingleSlideSelected = selectedShapes.length === 1 && selectedShapes[0].type === 'slide';
    const slideShape = isSingleSlideSelected ? (selectedShapes[0] as SlideShape) : null;
    const selectedCardShapes = React.useMemo(
        () => selectedShapes.filter((shape): shape is ICardShape => shape.type === 'card'),
        [selectedShapes]
    );
    const hasCardSelection = selectedCardShapes.length > 0;
    const cardRenderModeValue = React.useMemo<CardRenderMode | 'mixed'>(() => {
        if (!hasCardSelection) {
            return 'inherit';
        }
        const modes = selectedCardShapes.map((shape) => shape.props.renderMode ?? 'inherit');
        const [firstMode] = modes;
        return modes.every((mode) => mode === firstMode) ? firstMode : 'mixed';
    }, [hasCardSelection, selectedCardShapes]);

    // --- Single Block: connectOnEnter 开关 ---
    const selectedSingleBlockShapes = React.useMemo(
        () => selectedShapes.filter((s): s is ISingleBlockShape => s.type === 'single-block'),
        [selectedShapes]
    )
    const hasSingleBlockSelection = selectedSingleBlockShapes.length > 0
    const connectOnEnterState = React.useMemo<boolean | 'mixed'>(() => {
        if (!hasSingleBlockSelection) return false
        const values = selectedSingleBlockShapes.map(s => s.props.connectOnEnter !== false) // 未定义视为 true
        const first = values[0]
        return values.every(v => v === first) ? first : 'mixed'
    }, [hasSingleBlockSelection, selectedSingleBlockShapes])

    // --- Single Block: allowBinding 开关 ---
    const allowBindingState = React.useMemo<boolean | 'mixed'>(() => {
        if (!hasSingleBlockSelection) return false
        const values = selectedSingleBlockShapes.map(s => s.props.allowBinding !== false) // 未定义视为 true
        const first = values[0]
        return values.every(v => v === first) ? first : 'mixed'
    }, [hasSingleBlockSelection, selectedSingleBlockShapes])

    // --- Single Block: transparentBackground 开关 ---
    const transparentBackgroundState = React.useMemo<boolean | 'mixed'>(() => {
        if (!hasSingleBlockSelection) return false
        const values = selectedSingleBlockShapes.map(s => !!s.props.transparentBackground)
        const first = values[0]
        return values.every(v => v === first) ? first : 'mixed'
    }, [hasSingleBlockSelection, selectedSingleBlockShapes])

    const selectedJsShapes = React.useMemo(
        () => selectedShapes.filter((shape): shape is IJsShape => shape.type === 'js-shape'),
        [selectedShapes]
    )
    const hasJsSelection = selectedJsShapes.length > 0
    const jsInteractiveState = React.useMemo<boolean | 'mixed'>(() => {
        if (!hasJsSelection) return false
        const values = selectedJsShapes.map(shape => shape.props.interactive === true)
        const first = values[0]
        return values.every(v => v === first) ? first : 'mixed'
    }, [hasJsSelection, selectedJsShapes])

    // --- Mind Map: 主题选择 ---
    const selectedMindMapShapes = React.useMemo(
        () => selectedShapes.filter((shape): shape is IMindMapShape => shape.type === 'mind-map'),
        [selectedShapes]
    )
    const hasMindMapSelection = selectedMindMapShapes.length > 0
    const mindMapThemeValue = React.useMemo<ThemeName | 'mixed'>(() => {
        if (!hasMindMapSelection) return 'default'
        const themes = selectedMindMapShapes.map(shape => (shape.props.theme || 'default') as ThemeName)
        const first = themes[0]
        return themes.every(t => t === first) ? first : 'mixed'
    }, [hasMindMapSelection, selectedMindMapShapes])

    const mindMapFontSizeValue = React.useMemo<number | 'mixed'>(() => {
        if (!hasMindMapSelection) return 14
        const fontSizes = selectedMindMapShapes.map(shape => shape.props.fontSize || 14)
        const first = fontSizes[0]
        return fontSizes.every(fs => fs === first) ? first : 'mixed'
    }, [hasMindMapSelection, selectedMindMapShapes])

    // --- Bezier Connector: 颜色 & 线宽 ---
    const selectedConnectorShapes = React.useMemo(
        () => selectedShapes.filter((shape): shape is IBezierConnectorShape => shape.type === 'bezier-connector'),
        [selectedShapes]
    )
    const hasConnectorSelection = selectedConnectorShapes.length > 0

    const connectorStrokeState = React.useMemo<number | 'mixed'>(() => {
        if (!hasConnectorSelection) return 2
        const widths = selectedConnectorShapes.map((s) => s.props.strokeWidth ?? 2)
        const first = widths[0]
        return widths.every((w) => w === first) ? first : 'mixed'
    }, [hasConnectorSelection, selectedConnectorShapes])

    const connectorStrokeStyleState = React.useMemo<'solid' | 'dashed' | 'mixed'>(() => {
        if (!hasConnectorSelection) return 'solid'
        const styles = selectedConnectorShapes.map((s) => s.props.strokeStyle ?? 'solid')
        const first = styles[0]
        return styles.every((s) => s === first) ? first : 'mixed'
    }, [hasConnectorSelection, selectedConnectorShapes])


    const handleConnectorWidthChange = React.useCallback(
        (nextWidth: number) => {
            if (!hasConnectorSelection || Number.isNaN(nextWidth) || nextWidth <= 0) return
            editor.run(() => {
                editor.updateShapes(
                    selectedConnectorShapes.map((shape) => ({
                        id: shape.id,
                        type: 'bezier-connector',
                        props: { ...shape.props, strokeWidth: nextWidth },
                    }))
                )
            })
        },
        [editor, hasConnectorSelection, selectedConnectorShapes]
    )

    const handleConnectorStyleChange = React.useCallback(
        (nextStyle: 'solid' | 'dashed') => {
            if (!hasConnectorSelection) return
            editor.run(() => {
                editor.updateShapes(
                    selectedConnectorShapes.map((shape) => ({
                        id: shape.id,
                        type: 'bezier-connector',
                        props: { ...shape.props, strokeStyle: nextStyle },
                    }))
                )
            })
        },
        [editor, hasConnectorSelection, selectedConnectorShapes]
    )

    // --- 获取 rootId ---

    const container = editor.getContainer();
    const editorElement = container?.closest('.tldraw__editor');
    const rootId = editorElement?.getAttribute('data-tldraw-id');
    const title = editorElement?.getAttribute('data-tldraw-title');
    const blockId = rootId;


    const handleNameChange = React.useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (slideShape) {
                // 使用事务来确保撤销/重做能正确处理连续输入
                editor.run(() => {
                    editor.updateShape({
                        id: slideShape.id,
                        type: 'slide',
                        props: { name: e.target.value },
                    });
                })
            }
        },
        [editor, slideShape]
    );

    const handleNameBlur = React.useCallback(
        (e: React.FocusEvent<HTMLInputElement>) => {
            if (slideShape && slideShape.props.name !== e.target.value.trim()) {
                editor.updateShape({
                    id: slideShape.id,
                    type: 'slide',
                    props: { name: e.target.value.trim() },
                });
            }
        },
        [editor, slideShape]
    );

    // 处理键盘事件，例如 Enter 确认，Escape 取消
    const handleKeyDown = React.useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                e.currentTarget.blur(); // 触发 blur 保存最终值（如果需要 trim）
            } else if (e.key === 'Escape') {
                // 如果需要恢复到修改前的值，需要额外状态管理，
                // 当前实现是 Escape 后直接 blur，会保存当前输入框的值
                e.currentTarget.blur();
            }
        },
        []
    );
    // --- 处理截图更新 ---
    const handleCaptureScreenshot = React.useCallback(async () => {
        if (!slideShape || isCapturingScreenshot) return

        setIsCapturingScreenshot(true)
        try {
            let targetBlockId: string | null = (slideShape.props.blockId ?? '').trim()
            if (!targetBlockId) {
                targetBlockId = null
            }

            const cursorId = getCursorBlockId()

            // 若 slide 中保存了 blockId，则在思源中验证其是否仍然有效
            if (targetBlockId) {
                try {
                    const blk = await getBlockByID(targetBlockId)
                    if (!blk || !blk.id) {
                        console.warn('保存的 blockId 在思源中未找到: ', targetBlockId)
                        showMessage('幻灯片保存的块在思源中未找到，后续将作为新块插入', 3000, 'info')
                        targetBlockId = null
                    }
                } catch (err) {
                    console.warn('检查保存的 blockId 时出错', err)
                    // 将其视为无效，允许在有光标时新建
                    targetBlockId = null
                }
            }

            if (!targetBlockId && !cursorId) {
                showMessage('未检测到已有截图块且未获取到光标位置，已取消操作', 3000, 'error')
                return
            }

            const result = await captureSlideScreenshot(editor, slideShape.id, {
                format: 'png',
                updateShape: true,
                background: true,
            })
            if (result) {
                try {
                    const now = new Date()
                    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
                    const rawName = slideShape?.props?.name || 'slide'
                    const safeName = String(rawName).replace(/[^\w\u4e00-\u9fa5-]+/g, '_')
                    const ext = result.format === 'svg' ? 'svg' : 'png'
                    const fileName = `slide_${safeName}_${ts}.${ext}`
                    const blobType = result.blob.type || 'image/png'
                    const file = new File([result.blob], fileName, { type: blobType })
                    const uploadDir = 'assets/st_slides'

                    const upRes = await upload(uploadDir, [file])
                    const succMap = (upRes as any)?.succMap || {}
                    const kernelPath: string | undefined = succMap[fileName]
                    if (!kernelPath) {
                        throw new Error('upload screenshot failed: no succMap path')
                    }
                    const assetPath = kernelPath.replace(/^data\//, '')

                    const alt = rawName || 'slide'
                    const md = `[_](${buildTldrawLink(rootId, blockId, title, slideShape.id)})![${alt}](${assetPath})\n{: custom-st-slide-id="${slideShape.id}"}`

                    let fallbackFromUpdateFailure = false

                    if (targetBlockId) {
                        try {
                            await updateBlock('markdown', md, targetBlockId)
                            editor.updateShape({
                                id: slideShape.id,
                                type: 'slide',
                                props: { blockId: targetBlockId },
                            })
                            showMessage('已更新之前插入的幻灯片截图')
                            return
                        } catch (updateErr) {
                            console.error('更新现有幻灯片截图块失败', updateErr)
                            if (!cursorId) {
                                showMessage('更新截图块失败，且未检测到光标位置可新建截图', 4000, 'error')
                                return
                            }
                            fallbackFromUpdateFailure = true
                            targetBlockId = null
                        }
                    }

                    if (!targetBlockId) {
                        if (!cursorId) {
                            showMessage('未检测到光标位置，已取消插入新的截图', 3000, 'error')
                            return
                        }

                        const appendRes = await appendBlock('markdown', md, cursorId)
                        const newBlockId = appendRes?.[0]?.doOperations?.[0]?.id as string | undefined
                        if (typeof newBlockId === 'string' && newBlockId) {
                            editor.updateShape({
                                id: slideShape.id,
                                type: 'slide',
                                props: { blockId: newBlockId },
                            })
                        } else {
                            console.warn('无法获取新建幻灯片截图块的 ID', appendRes)
                        }
                        showMessage(
                            fallbackFromUpdateFailure
                                ? '原块更新失败，已在光标位置插入新的幻灯片截图'
                                : '已将幻灯片截图插入到当前光标位置'
                        )
                    }
                } catch (insErr) {
                    console.error('insert slide screenshot to Siyuan failed', insErr)
                    showMessage('已更新截图，但插入到思源失败', 4000, 'error')
                }
            } else {
                showMessage('生成幻灯片截图失败', -1, 'error')
            }
        } catch (error) {
            console.error('capture slide screenshot failed', error)
            showMessage('生成幻灯片截图失败', -1, 'error')
        } finally {
            setIsCapturingScreenshot(false)
        }
    }, [editor, slideShape, isCapturingScreenshot])

    const handleOpenSlideBlock = React.useCallback(async () => {
        if (!slideShape) {
            return
        }

        const blockId = slideShape.props.blockId
        if (!blockId) {
            showMessage('幻灯片暂未绑定思源块', 3000, 'error')
            return
        }

        try {
            await openTab({
                app: window.siyuan.ws.app,
                doc: {
                    id: blockId,
                    action: ['cb-get-hl', 'cb-get-all'],
                    zoomIn: false,
                },
                // position: 'right',
                keepCursor: false,
            })
        } catch (err) {
            console.error('打开幻灯片关联的思源块失败', err)
            showMessage('打开关联的思源块失败', 4000, 'error')
        }
    }, [slideShape])

    const handleCopyLink = React.useCallback(async () => {
        if (slideShape && rootId !== '') { // 检查 rootId 是否已设置
            const shapeId = slideShape.id;
            // 使用幻灯片名称，如果为空则使用 rootId 作为后备标题
            let url: string;
            if (settingdata['copyLinkTitle']) {
                url = `[slide:${slideShape.props.name}](${buildTldrawLink(rootId, blockId, title, shapeId)})`;
            } else {
                url = buildTldrawLink(rootId, blockId, title, shapeId);
            }
            try {
                await navigator.clipboard.writeText(url);
                showMessage('幻灯片链接已复制到剪贴板!'); // 简单反馈
                console.debug('Link copied:', url);
            } catch (err) {
                console.error('无法复制链接: ', err);
                showMessage('复制链接失败。', -1, "error");
            }
        } else if (rootId === '') {
            showMessage('无法生成链接：缺少 rootId。', -1, "error");
            console.error('Cannot copy link: rootId is not set.');
        }
    }, [editor, slideShape, rootId]); // 添加依赖项

    // 初始化连接模式管理器
    React.useEffect(() => {
        if (!connectionManager) {
            connectionManager = new ConnectionModeManager((isActive) => {
                setConnectionMode(isActive)
            })
        }
        return () => {
            connectionManager?.cleanup()
        }
    }, [])

    // 启用连接模式: 通过 '直线'/'曲线' 按钮直接触发，handleEnableConnectionMode 已内联到这些按钮


    return (
        <DefaultStylePanel>
            <style>{` 
                .connector-width-input {
                    color: var(--color-text);
                    background: var(--b3-theme-surface);
                    border: 1px solid var(--color-border);
                    border-radius: 8px;
                    box-shadow: inset 0 1px 2px rgba(0,0,0,0.04);
                    height: 32px;
                    width: 77px;
                    text-align: right;
                    padding: 0 8px;
                    box-sizing: border-box;
                }
                .connector-width-input::placeholder {
                    color: var(--color-text-muted);
                    opacity: 1;
                }
                /* 移除 number input 的上下微调按钮 */
                .connector-width-input::-webkit-outer-spin-button,
                .connector-width-input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                /* Firefox */
                .connector-width-input {
                    -moz-appearance: textfield;
                }
                @media (prefers-color-scheme: light) {
                    .connector-width-input::placeholder {
                        color: rgba(0,0,0,0.45);
                    }
                }
                /* Color input: remove native swatch background/padding */
                .connector-color-input {
                    background: transparent;
                    padding: 0;
                    height: 20px;
                    width: 48px;
                    border-radius: 4px;
                    border: 1px solid var(--color-border);
                    box-sizing: border-box;
                }
                .connector-color-input::-webkit-color-swatch-wrapper {
                    padding: 0;
                }
                .connector-color-input::-webkit-color-swatch {
                    border: none;
                    background: transparent;
                    border-radius: 4px;
                }
                /* Firefox */
                .connector-color-input::-moz-color-swatch {
                    border: none;
                    background: transparent;
                    border-radius: 4px;
                }
                /* Toggle button row */
                .tlui-toggle-button-row {
                    display: flex;
                    gap: 0px;
                }
                .tlui-toggle-button {
                    flex: 1 1 0;
                    min-width: 0;
                    font-weight: 400;
                    color: var(--color-text);
                }
                .tlui-toggle-button--active {
                    font-weight: 700;
                    color: var(--b3-theme-on-surface, var(--color-text));
                    background: var(--tl-color-muted-2);
                }
                .tlui-toggle-button--mixed {
                    opacity: 0.8;
                }
                .tlui-toggle-icon {
                    font-size: 16px;
                    line-height: 1;
                    display: inline-block;
                    transform: translateY(-1px);
                }
            `}</style>
            {/* 如果选中了思维导图（mind-map），我们不加载 DefaultStylePanelContent */}
            {!hasMindMapSelection && <DefaultStylePanelContent styles={styles} />}

            {/* 连接线类型互换（arrow <-> bezier-connector），支持批量并保留文字 */}
            {(() => {
                const convertible = selectedShapes.filter((s: any) => s?.type === 'arrow' || s?.type === 'bezier-connector') as any[]
                if (!convertible.length) return null

                const hasAnyArrow = convertible.some((s) => s.type === 'arrow')
                const hasAnyBezier = convertible.some((s) => s.type === 'bezier-connector')
                if (!hasAnyArrow && !hasAnyBezier) return null

                const ids = convertible.map((s) => s.id)
                const keepSelectedIds = selectedShapes
                    .filter((s: any) => s?.type !== 'arrow' && s?.type !== 'bezier-connector')
                    .map((s: any) => s.id)

                const handleToBezier = () => {
                    try {
                        editor.run(() => {
                            const nextIds = convertConnectorsToBezier(editor, ids)
                            if (keepSelectedIds.length) {
                                editor.setSelectedShapes([...keepSelectedIds, ...nextIds])
                            }
                        })
                    } catch (err) {
                        console.error('convert connectors to bezier failed', err)
                        showMessage('批量转换为曲线失败', 3000, 'error')
                    }
                }

                const handleToArrow = () => {
                    try {
                        editor.run(() => {
                            const nextIds = convertConnectorsToArrow(editor, ids)
                            if (keepSelectedIds.length) {
                                editor.setSelectedShapes([...keepSelectedIds, ...nextIds])
                            }
                        })
                    } catch (err) {
                        console.error('convert connectors to arrow failed', err)
                        showMessage('批量转换为直线失败', 3000, 'error')
                    }
                }

                return (
                    <div className="tlui-style-panel__section">
                        <div style={{ display: 'flex', gap: 0 }}>
                            {hasAnyArrow && (
                                <TldrawUiButton
                                    type="normal"
                                    style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                                    title="将选中箭头批量转换为曲线连接器（保留文字，尽量保留绑定）"
                                    onClick={handleToBezier}
                                >
                                    全部转为曲线
                                </TldrawUiButton>
                            )}
                            {hasAnyBezier && (
                                <TldrawUiButton
                                    type="normal"
                                    style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                                    title="将选中曲线连接器批量转换为箭头（保留文字，尽量保留绑定）"
                                    onClick={handleToArrow}
                                >
                                    全部转为直线
                                </TldrawUiButton>
                            )}
                        </div>
                    </div>
                )
            })()}

            {hasConnectorSelection && (
                <div className="tlui-style-panel__section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        <span style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>线宽</span>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <input
                                className="connector-width-input"
                                type="number"
                                min={0.5}
                                max={12}
                                step={0.5}
                                value={connectorStrokeState === 'mixed' ? '' : connectorStrokeState}
                                placeholder={connectorStrokeState === 'mixed' ? '混合' : undefined}
                                onChange={(e) => handleConnectorWidthChange(parseFloat(e.target.value))}
                                style={{
                                    color: 'var(--color-text)'
                                }}
                            />
                            <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>px</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 8 }}>
                        <span style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>线型</span>
                        <div className="tlui-toggle-button-row" style={{ marginLeft: 8 }}>
                            {(['solid', 'dashed'] as const).map((style) => {
                                const isMixed = connectorStrokeStyleState === 'mixed'
                                const isActive = connectorStrokeStyleState === style
                                return (
                                    <TldrawUiButton
                                        key={style}
                                        type="normal"
                                        className={`tlui-toggle-button ${isActive ? 'tlui-toggle-button--active' : isMixed ? 'tlui-toggle-button--mixed' : ''}`}
                                        onClick={() => handleConnectorStyleChange(style)}
                                    >
                                        {style === 'solid' ? '实线' : '虚线'}
                                    </TldrawUiButton>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* 快速添加连接目标（Card / Single Block）通过将新形状放在曲线端点方向上并建立绑定 */}
            {hasConnectorSelection && selectedConnectorShapes.length === 1 && (() => {
                const connector = selectedConnectorShapes[0]
                const terminals = getConnectorTerminals(editor, connector)
                // delegated to createAndBindShape

                const createAndBindShapeLocal = (terminal: 'start' | 'end', type: 'card' | 'single-block') => {
                    try {
                        editor.run(() => {
                            createAndBindShape(editor, connector.id, terminal, type)
                        })
                    } catch (err) {
                        console.error('创建并绑定目标失败 (delegated)', err)
                    }
                }

                const startConnected = !!terminals.startShapeId
                const endConnected = !!terminals.endShapeId
                // Only show buttons when exactly one end is connected
                if (!(startConnected !== endConnected)) {
                    return null
                }
                const unconnectedTerminal = startConnected ? 'end' : 'start'
                return (
                    <div className="tlui-style-panel__section">
                        <div style={{ display: 'flex' }}>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                                title="创建并绑定卡片"
                                onClick={() => createAndBindShapeLocal(unconnectedTerminal, 'card')}
                            >
                                卡片
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                                title="创建并绑定单块"
                                onClick={() => createAndBindShapeLocal(unconnectedTerminal, 'single-block')}
                            >
                                单块
                            </TldrawUiButton>
                        </div>
                    </div>
                )
            })()}

            {/* 当连接器两端均已连接时，在样式面板提供跳转按钮 */}
            {hasConnectorSelection && selectedConnectorShapes.length === 1 && (() => {
                const connector = selectedConnectorShapes[0]
                const terminals = getConnectorTerminals(editor, connector)
                const startConnected = !!terminals.startShapeId
                const endConnected = !!terminals.endShapeId
                if (!(startConnected && endConnected)) return null

                const jumpToShape = (shapeId?: TLShapeId) => {
                    if (!shapeId) return
                    const target = editor.getShape(shapeId)
                    if (!target) return
                    const bounds = editor.getShapePageBounds(target)
                    if (!bounds) return
                    editor.centerOnPoint(bounds.center, { animation: { duration: 300 } })
                    // editor.select(shapeId)
                }

                return (
                    <div className="tlui-style-panel__section">
                        <div style={{ display: 'flex' }}>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                                title="跳转到起点"
                                onClick={() => jumpToShape(terminals.startShapeId)}
                            >
                                起点
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                                title="跳转到终点"
                                onClick={() => jumpToShape(terminals.endShapeId)}
                            >
                                终点
                            </TldrawUiButton>
                        </div>
                    </div>
                )
            })()}

            {isSingleSlideSelected && slideShape && (
                <div className="tlui-style-panel__section"> {/* 移除 styles={styles}，因为父级已经处理 */}
                    <input
                        className="tlui-input slide-name-input"
                        type="text"
                        value={slideShape.props.name}
                        onChange={handleNameChange}
                        onBlur={handleNameBlur}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                    />
                    <TldrawUiButton
                        type="normal"
                        onClick={handleCopyLink}
                        style={{ marginTop: '-8px', width: '100%' }}
                        disabled={rootId === ''}
                    >
                        复制链接
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="normal"
                        onClick={handleOpenSlideBlock}
                        style={{ marginTop: '-8px', width: '100%' }}
                        disabled={!slideShape.props.blockId}
                    >
                        跳转到笔记
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="normal"
                        onClick={handleCaptureScreenshot}
                        style={{ marginTop: '-8px', width: '100%' }}
                        disabled={isCapturingScreenshot}
                    >
                        {isCapturingScreenshot ? '生成中…' : '更新截图'}
                    </TldrawUiButton>
                </div>
            )}
            {hasCardSelection && (
                <div className="tlui-style-panel__section">
                    <StylePanelDropdownPicker
                        label={"渲染方式"}
                        type="menu"
                        id="card-render-mode"
                        uiType="card-render-mode"
                        stylePanelType="card-render-mode"
                        // style is not used by our custom onValueChange, but the component requires it in signature
                        style={{ id: 'card-render-mode' } as any}
                        items={[
                            { value: 'inherit', icon: 'mixed' },
                            { value: 'static-dom', icon: 'pack' },
                            { value: 'live-protyle', icon: 'warning-triangle' },
                        ]}
                        value={
                            cardRenderModeValue === 'mixed'
                                ? { type: 'mixed' as const }
                                : { type: 'shared' as const, value: cardRenderModeValue }
                        }
                        onValueChange={(_style, nextMode: any) => {
                            if (!selectedCardShapes.length) return;
                            const nextModeStr = nextMode as CardRenderMode;
                            editor.run(() => {
                                editor.updateShapes(
                                    selectedCardShapes.map((shape) => ({
                                        id: shape.id,
                                        type: 'card',
                                        props: { ...shape.props, renderMode: nextModeStr },
                                    }))
                                );
                            });
                        }}
                    />
                </div>
            )}
            {(hasSingleBlockSelection || hasCardSelection) && (
                <div className="tlui-style-panel__section">
                    <div style={{ display: 'flex' }}>
                        <TldrawUiButton
                            type={connectionConnectorKind === 'arrow' ? 'primary' : 'normal'}
                            disabled={connectionMode}
                            style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                            title="启用直线连接模式：选择目标形状以创建直线（Esc 取消）"
                            onClick={() => {
                                if (connectionManager) {
                                    connectionManager.enableConnectionMode(editor, 'arrow')
                                }
                            }}
                        >
                            直线
                        </TldrawUiButton>
                        <TldrawUiButton
                            type={connectionConnectorKind === 'bezier' ? 'primary' : 'normal'}
                            disabled={connectionMode}
                            style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                            title="启用曲线连接模式：选择目标形状以创建曲线（Esc 取消）"
                            onClick={() => {
                                if (connectionManager) {
                                    connectionManager.enableConnectionMode(editor, 'bezier')
                                }
                            }}
                        >
                            曲线
                        </TldrawUiButton>
                    </div>
                    {/* 使用上方按钮直接启用连接模式，因此移除单独的“连接到其他形状”按钮 */}
                </div>
            )}
            {hasSingleBlockSelection && (
                <>
                    <div className="tlui-style-panel__section">
                        
                    </div>
                    <div className="tlui-style-panel__section">
                        <div className="tlui-toggle-button-row">
                                <TldrawUiButton
                                    type="normal"
                                    className={`tlui-toggle-button ${connectOnEnterState === true ? 'tlui-toggle-button--active' : connectOnEnterState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
                                    onClick={() => {
                                        const next = connectOnEnterState === 'mixed' ? true : !connectOnEnterState
                                        editor.run(() => {
                                            editor.updateShapes(
                                                selectedSingleBlockShapes.map(s => ({
                                                    id: s.id,
                                                    type: 'single-block',
                                                    props: { ...s.props, connectOnEnter: next }
                                                }))
                                            )
                                        })
                                    }}
                                    title="开启后按 Enter 新建的块会自动用箭头连接"
                                    aria-label="回车连接"
                                    style={{
                                        fontWeight: connectOnEnterState === true ? 700 : undefined,
                                        background: connectOnEnterState === true ? 'var(--tl-color-muted-2)' : undefined,
                                        color: connectOnEnterState === true ? 'var(--b3-theme-on-surface, var(--color-text))' : undefined,
                                        opacity: connectOnEnterState === 'mixed' ? 0.85 : undefined,
                                    }}
                                >
                                    <span className="tlui-toggle-icon">↵</span>
                                </TldrawUiButton>
                        
                            <TldrawUiButton
                                type="normal"
                                className={`tlui-toggle-button ${transparentBackgroundState === true ? 'tlui-toggle-button--active' : transparentBackgroundState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
                                onClick={() => {
                                    const next = transparentBackgroundState === 'mixed' ? true : !transparentBackgroundState
                                    editor.run(() => {
                                        editor.updateShapes(
                                            selectedSingleBlockShapes.map(s => ({
                                                id: s.id,
                                                type: 'single-block',
                                                props: { ...s.props, transparentBackground: next },
                                            }))
                                        )
                                    })
                                }}
                                title="启用透明背景（隐藏背景与边框）"
                                aria-label="透明背景"
                                style={{
                                    fontWeight: transparentBackgroundState === true ? 700 : undefined,
                                    background: transparentBackgroundState === true ? 'var(--tl-color-muted-2)' : undefined,
                                    color: transparentBackgroundState === true ? 'var(--b3-theme-on-surface, var(--color-text))' : undefined,
                                    opacity: transparentBackgroundState === 'mixed' ? 0.85 : undefined,
                                }}
                            >
                                <span className="tlui-toggle-icon">◻️</span>
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                className={`tlui-toggle-button ${allowBindingState === true ? 'tlui-toggle-button--active' : allowBindingState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
                                onClick={() => {
                                    const next = allowBindingState === 'mixed' ? true : !allowBindingState
                                    editor.run(() => {
                                        editor.updateShapes(
                                            selectedSingleBlockShapes.map(s => ({
                                                id: s.id,
                                                type: 'single-block',
                                                props: { ...s.props, allowBinding: next }
                                            }))
                                        )
                                    })
                                }}
                                title="开启后允许与其他形状建立绑定（拖动到目标后会自动绑定）"
                                aria-label="绑定"
                                style={{
                                    fontWeight: allowBindingState === true ? 700 : undefined,
                                    background: allowBindingState === true ? 'var(--tl-color-muted-2)' : undefined,
                                    color: allowBindingState === true ? 'var(--b3-theme-on-surface, var(--color-text))' : undefined,
                                    opacity: allowBindingState === 'mixed' ? 0.85 : undefined,
                                }}
                            >
                                <span className="tlui-toggle-icon">🔗</span>
                            </TldrawUiButton>
                        </div>
                    </div>
                    <div className="tlui-style-panel__section">
                        <div style={{ display: 'flex', gap: '0px' }}>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: '1 1 0', minWidth: '0' }}
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'up')}
                                title="将相连块排列到上方"
                            >
                                ↑
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: '1 1 0', minWidth: '0' }}
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'down')}
                                title="将相连块排列到下方"
                            >
                                ↓
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: '1 1 0', minWidth: '0' }}
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'left')}
                                title="将相连块排列到左侧"
                            >
                                ←
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: '1 1 0', minWidth: '0' }}
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'right')}
                                title="将相连块排列到右侧"
                            >
                                →
                            </TldrawUiButton>
                        </div>
                    </div>
                </>
            )}
            {hasJsSelection && (
                <div className="tlui-style-panel__section" >
                    <TldrawUiButton
                        type="normal"
                        title="开启后，渲染出的 DOM 可直接响应点击/拖拽等交互"
                        onClick={() => {
                            const next = jsInteractiveState === 'mixed' ? true : !jsInteractiveState
                            editor.run(() => {
                                editor.updateShapes(
                                    selectedJsShapes.map(shape => ({
                                        id: shape.id,
                                        type: 'js-shape',
                                        props: { ...shape.props, interactive: next },
                                    }))
                                )
                            })
                        }}
                    >
                        {jsInteractiveState === 'mixed' ? '⚬ 允许交互' : jsInteractiveState ? '✓ 允许交互' : '允许交互'}
                    </TldrawUiButton>
                </div>
            )}
            {hasMindMapSelection && (
                <div className="tlui-style-panel__section">
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}>

                        <div style={{
                            display: 'flex',
                            gap: '4px',
                            flexWrap: 'wrap'
                        }}>
                            {[16, 18, 20, 24, 28, 32].map(size => (
                                <TldrawUiButton
                                    key={size}
                                    type={mindMapFontSizeValue === size ? 'primary' : 'normal'}
                                    style={{
                                        flex: '1 1 auto',
                                        minWidth: '32px',
                                        fontSize: '12px'
                                    }}
                                    onClick={() => {
                                        if (!selectedMindMapShapes.length) return;
                                        // 以14为基准，nodeWidth/nodeHeight/lineWidth按比例缩放
                                        const baseFontSize = 14;
                                        const baseNodeWidth = 120;
                                        const baseNodeHeight = 40;
                                        const baseLineWidth = 2;
                                        const scale = size / baseFontSize;
                                        const nodeWidth = Math.round(baseNodeWidth * scale);
                                        const nodeHeight = Math.round(baseNodeHeight * scale);
                                        const lineWidth = +(baseLineWidth * scale).toFixed(2);
                                        editor.run(() => {
                                            editor.updateShapes(
                                                selectedMindMapShapes.map((shape) => ({
                                                    id: shape.id,
                                                    type: 'mind-map',
                                                    props: {
                                                        ...shape.props,
                                                        fontSize: size,
                                                        nodeWidth,
                                                        nodeHeight,
                                                        lineWidth,
                                                    },
                                                }))
                                            );
                                        });
                                    }}
                                >
                                    {size}
                                </TldrawUiButton>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {hasMindMapSelection && (
                <div className="tlui-style-panel__section">
                    <StylePanelDropdownPicker
                        label={"思维导图主题"}
                        type="menu"
                        id="mind-map-theme"
                        uiType="mind-map-theme"
                        stylePanelType="mind-map-theme"
                        style={{ id: 'mind-map-theme' } as any}
                        items={[
                            { value: 'default', icon: 'color' },
                            { value: 'noBorder', icon: 'broken' },
                            { value: 'underline', icon: 'minus' },
                        ]}
                        value={
                            mindMapThemeValue === 'mixed'
                                ? { type: 'mixed' as const }
                                : { type: 'shared' as const, value: mindMapThemeValue }
                        }
                        onValueChange={(_style, nextTheme: any) => {
                            if (!selectedMindMapShapes.length) return;
                            const nextThemeStr = nextTheme as ThemeName;
                            editor.run(() => {
                                editor.updateShapes(
                                    selectedMindMapShapes.map((shape) => ({
                                        id: shape.id,
                                        type: 'mind-map',
                                        props: { ...shape.props, theme: nextThemeStr },
                                    }))
                                );
                            });
                        }}
                    />
                </div>
            )}
            {hasMindMapSelection && (
                <div className="tlui-style-panel__section">
                    <div style={{ display: 'flex', gap: '0px' }}>
                        <TldrawUiButton
                            type={(() => {
                                const v = selectedMindMapShapes.length ? selectedMindMapShapes[0].props.direction : 'right';
                                return v === 'up' ? 'primary' : 'normal';
                            })()}
                            style={{ flex: '1 1 0', minWidth: '0' }}
                            onClick={() => {
                                if (!selectedMindMapShapes.length) return;
                                editor.run(() => {
                                    editor.updateShapes(
                                        selectedMindMapShapes.map((shape) => ({
                                            id: shape.id,
                                            type: 'mind-map',
                                            props: { ...shape.props, direction: 'up' },
                                        }))
                                    );
                                });
                            }}
                            title="将导图排列到上方"
                        >
                            ↑
                        </TldrawUiButton>
                        <TldrawUiButton
                            type={(() => {
                                const v = selectedMindMapShapes.length ? selectedMindMapShapes[0].props.direction : 'right';
                                return v === 'down' ? 'primary' : 'normal';
                            })()}
                            style={{ flex: '1 1 0', minWidth: '0' }}
                            onClick={() => {
                                if (!selectedMindMapShapes.length) return;
                                editor.run(() => {
                                    editor.updateShapes(
                                        selectedMindMapShapes.map((shape) => ({
                                            id: shape.id,
                                            type: 'mind-map',
                                            props: { ...shape.props, direction: 'down' },
                                        }))
                                    );
                                });
                            }}
                            title="将导图排列到下方"
                        >
                            ↓
                        </TldrawUiButton>
                        <TldrawUiButton
                            type={(() => {
                                const v = selectedMindMapShapes.length ? selectedMindMapShapes[0].props.direction : 'right';
                                return v === 'left' ? 'primary' : 'normal';
                            })()}
                            style={{ flex: '1 1 0', minWidth: '0' }}
                            onClick={() => {
                                if (!selectedMindMapShapes.length) return;
                                editor.run(() => {
                                    editor.updateShapes(
                                        selectedMindMapShapes.map((shape) => ({
                                            id: shape.id,
                                            type: 'mind-map',
                                            props: { ...shape.props, direction: 'left' },
                                        }))
                                    );
                                });
                            }}
                            title="将导图排列到左侧"
                        >
                            ←
                        </TldrawUiButton>
                        <TldrawUiButton
                            type={(() => {
                                const v = selectedMindMapShapes.length ? selectedMindMapShapes[0].props.direction : 'right';
                                return v === 'right' ? 'primary' : 'normal';
                            })()}
                            style={{ flex: '1 1 0', minWidth: '0' }}
                            onClick={() => {
                                if (!selectedMindMapShapes.length) return;
                                editor.run(() => {
                                    editor.updateShapes(
                                        selectedMindMapShapes.map((shape) => ({
                                            id: shape.id,
                                            type: 'mind-map',
                                            props: { ...shape.props, direction: 'right' },
                                        }))
                                    );
                                });
                            }}
                            title="将导图排列到右侧"
                        >
                            →
                        </TldrawUiButton>
                    </div>
                </div>
            )}
            {hasMindMapSelection && (
                <div className="tlui-style-panel__section">
                    {/* 思维导图绑定思源块设置 */}
                    <MindMapBindingUI
                        selectedMindMapShapes={selectedMindMapShapes}
                        editor={editor}
                    />
                </div>
            )}
        </DefaultStylePanel>
    );
});

// 全局素材库面板状态管理
let shapeLibraryOpenState = false;
const shapeLibraryListeners: Set<(isOpen: boolean) => void> = new Set();

export function toggleShapeLibrary() {
    shapeLibraryOpenState = !shapeLibraryOpenState;
    shapeLibraryListeners.forEach(listener => listener(shapeLibraryOpenState));
}

export function useShapeLibraryOpen() {
    const [isOpen, setIsOpen] = React.useState(shapeLibraryOpenState);

    React.useEffect(() => {
        shapeLibraryListeners.add(setIsOpen);
        return () => {
            shapeLibraryListeners.delete(setIsOpen);
        };
    }, []);

    return isOpen;
}

function CustomQuickActions() {
    const editor = useEditor()
    const container = editor.getContainer();
    const editorElement = container?.closest('.tldraw__editor');
    const rootId = editorElement?.getAttribute('data-tldraw-id');
    const title = editorElement?.getAttribute('data-tldraw-title');
    const [restoreOnEdit, setRestoreOnEdit] = React.useState<boolean>(() => {
        // 默认关闭，只有明确为 true 时才开启
        return settingdata['restore-camera-on-edit'] === true
    })

    const toggleRestoreOnEdit = React.useCallback(() => {
        const next = !restoreOnEdit
        setRestoreOnEdit(next)
        try {
            settingdata['restore-camera-on-edit'] = next
        } catch (err) {
            console.warn('设置保存失败', err)
        }
        showMessage(next ? '编辑时聚焦并恢复视角：已启用' : '编辑时聚焦并恢复视角：已禁用')
    }, [restoreOnEdit])
    return (
        <DefaultQuickActions>
            <DefaultQuickActionsContent />
            <div>
                <TldrawUiMenuItem id="heading" icon="external-link" label="打开文档" onSelect={() => {
                    openTab({
                        app: window.siyuan.ws.app,
                        doc: {
                            id: rootId,
                        },
                        // position: "right",
                    });
                }} />
            </div>
            <div>
                <TldrawUiMenuItem id="external-link" icon="heading" label="复制白板链接" onSelect={() => {
                    let url: string;
                    if (settingdata['copyLinkTitle']) {
                        url = `[画板:${title}](${buildTldrawLink(rootId, undefined, title)})`;
                    } else {
                        url = buildTldrawLink(rootId, undefined, title);
                    }
                    navigator.clipboard.writeText(url).then(() => {
                        showMessage('链接已复制到剪贴板!');
                    }).catch(err => {
                        console.error('无法复制链接: ', err);
                    });
                }} />
            </div>
            <div>
                <TldrawUiMenuItem
                    id="refresh-all-cards"
                    icon="arrow-cycle"
                    label="刷新所有卡片"
                    onSelect={() => {
                        const shapes = editor.getCurrentPageShapes().filter(isCardLikeShape) as CardLikeShape[]
                        if (shapes.length === 0) {
                            showMessage('当前画布无卡片')
                            return
                        }
                        const nonce = Date.now()
                        editor.run(() => {
                            for (const s of shapes) {
                                editor.updateShape({
                                    id: s.id,
                                    type: 'card',
                                    props: { ...s.props, refreshNonce: nonce },
                                })
                            }
                        })
                        showMessage(`已刷新 ${shapes.length} 张卡片`)
                    }}
                />
            </div>
            <div>
                <div
                    onMouseDown={(e: any) => {
                        if (e?.detail === 2) {
                            try { e.stopPropagation(); e.preventDefault(); } catch (err) { }
                            resetShapeLibraryPanelPosition();
                        }
                    }}
                >
                    <TldrawUiMenuItem
                        id="shape-library"
                        icon="bookmark"
                        label="素材库"
                        onSelect={() => { toggleShapeLibrary() }}
                    />
                </div>

            </div>
            <div
                // 将样式放到外层容器，因为 TldrawUiMenuItem 不接受 style 属性
                style={
                    restoreOnEdit
                        ? {
                              borderRadius: 6,
                              backgroundColor: 'var(--tl-color-hint)',
                              display: 'inline-block',
                          }
                        : undefined
                }
                data-selected={restoreOnEdit ? 'true' : 'false'}
            >
                <TldrawUiMenuItem
                    id="toggle-restore-camera"
                    icon="group"
                    label={restoreOnEdit ? '编辑时聚焦（已启用）' : '编辑时聚焦（已禁用）'}
                    isSelected={restoreOnEdit}
                    onSelect={() => { toggleRestoreOnEdit() }}
                />
            </div>
        </DefaultQuickActions>
    )
}

// 自定义右键菜单
function CustomContextMenu(props: TLUiContextMenuProps) {
    const editor = useEditor()

    const handleAddToLibrary = React.useCallback(async () => {
        const selectedShapes = editor.getSelectedShapes()
        if (selectedShapes.length === 0) {
            showMessage('请先选中要添加的形状', 3000, 'error')
            return
        }

        // 使用思源对话框代替 window.prompt
        const defaultName = `素材 ${new Date().toLocaleString('zh-CN')}`

        const dialog = new Dialog({
            title: '添加到素材库',
            content: `<div class="b3-dialog__content">
                <div class="b3-label">
                    <span>素材名称</span>
                    <input class="b3-text-field fn__block" id="shape-library-name-input" value="${defaultName}" />
                </div>
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel">取消</button>
                <button class="b3-button b3-button--text" id="shape-library-confirm-btn">确定</button>
            </div>`,
            width: '400px',
        })

        const inputEl = dialog.element.querySelector('#shape-library-name-input') as HTMLInputElement
        const confirmBtn = dialog.element.querySelector('#shape-library-confirm-btn') as HTMLButtonElement
        const cancelBtn = dialog.element.querySelector('.b3-button--cancel') as HTMLButtonElement

        // 聚焦并选中输入框内容
        setTimeout(() => {
            inputEl?.focus()
            inputEl?.select()
        }, 100)

        // 处理确认
        const handleConfirm = async () => {
            const name = inputEl?.value?.trim() || defaultName
            dialog.destroy()
            await addShapesToLibrary(editor, name)
            editor.emit('sttools:addToShapeLibrary')
        }

        confirmBtn?.addEventListener('click', handleConfirm)
        cancelBtn?.addEventListener('click', () => dialog.destroy())

        // 回车确认
        inputEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleConfirm()
            } else if (e.key === 'Escape') {
                dialog.destroy()
            }
        })
    }, [editor])

    return (
        <DefaultContextMenu {...props}>
            <TldrawUiMenuGroup id="shape-library">
                <TldrawUiMenuItem
                    id="add-to-library"
                    label="加入素材库"
                    icon="bookmark"
                    readonlyOk={false}
                    onSelect={handleAddToLibrary}
                />
            </TldrawUiMenuGroup>
            <DefaultContextMenuContent />
        </DefaultContextMenu>
    )
}

// function CustomBackground() {
//     return (
//         <rect
//             x={0}
//             y={0}
//             width="100%"
//             height="100%"
//             fill="var(--b3-theme-background)"  // 这里设置背景色
//         />
//     )
// }

export const components: TLComponents = {
    HelperButtons: SlidesPanel,
    QuickActions: CustomQuickActions,
    StylePanel: CustomStylePanel,
    ContextMenu: CustomContextMenu,
    // Background: CustomBackground,
    // Minimap: null,
    Toolbar: (props) => {
        const tools = useTools()
        const isCardSelected = useIsToolSelected(tools['card'])
        const isSingleBlockSelected = useIsToolSelected(tools['single-block'])
        const isSlideSelected = useIsToolSelected(tools['slide'])
        const isJsShapeSelected = useIsToolSelected(tools['js-shape'])
        const isMindMapSelected = useIsToolSelected(tools['mind-map'])
        const toolbarOrientation = (settingdata?.['tldraw-toolbar-orientation'] as 'vertical' | 'horizontal') || 'vertical'

        return (
            <DefaultToolbar {...props} orientation={toolbarOrientation}>
                <TldrawUiMenuItem {...tools['card']} isSelected={isCardSelected} />
                <TldrawUiMenuItem {...tools['single-block']} isSelected={isSingleBlockSelected} />
                <TldrawUiMenuItem {...tools['slide']} isSelected={isSlideSelected} />
                <DefaultToolbarContent />
                <TldrawUiMenuItem {...tools['js-shape']} isSelected={isJsShapeSelected} />
                <TldrawUiMenuItem {...tools['mind-map']} isSelected={isMindMapSelected} />
            </DefaultToolbar>
        )
    },
    KeyboardShortcutsDialog: (props) => {
        const tools = useTools()
        return (
            <DefaultKeyboardShortcutsDialog {...props}>
                <TldrawUiMenuItem {...tools['card']} />
                <TldrawUiMenuItem {...tools['single-block']} />
                <TldrawUiMenuItem {...tools['slide']} />
                <TldrawUiMenuItem {...tools['js-shape']} />
                <TldrawUiMenuItem {...tools['mind-map']} />
                <DefaultKeyboardShortcutsDialogContent />
            </DefaultKeyboardShortcutsDialog>
        )
    },
    MainMenu: () => {
        const editor = useEditor()
        return (
            <DefaultMainMenu>
                <DefaultMainMenuContent />
                <TldrawUiMenuSubmenu id="sttools" label="更多" >
                    <TldrawUiMenuItem
                        id="backupData"
                        label="备份数据"
                        readonlyOk
                        onSelect={() => {
                            editor.emit('sttools:backupData');
                        }}
                    />
                    <TldrawUiMenuItem
                        id="rollbackData"
                        label="回滚数据"
                        readonlyOk
                        onSelect={() => {
                            editor.emit('sttools:rollbackData');
                        }}
                    />
                    <TldrawUiMenuItem
                        id="importData"
                        label="导入备份数据"
                        readonlyOk
                        onSelect={() => {
                            editor.emit('sttools:importData');
                        }}
                    />
                    <TldrawUiMenuItem
                        id="exportData"
                        label="导出数据"
                        readonlyOk
                        onSelect={() => {
                            editor.emit('sttools:exportData');
                        }}
                    />
                    <TldrawUiMenuItem
                        id="pruneAssets"
                        label="清理未使用资源"
                        readonlyOk
                        onSelect={() => {
                            try {
                                // Prefer Siyuan plugin's confirm, fall back to window.confirm if unavailable
                                const title = '清理未使用资源';
                                const text = '确定要清理未被任何形状引用的 asset 吗？此操作会删除这些 asset 的 store 记录（不可撤销）。';
                                if (typeof syConfirm === 'function') {
                                    syConfirm(title, text, () => {
                                        editor.emit('sttools:pruneAssets');
                                        showMessage('开始清理未使用资源');
                                    }, () => { /* cancel callback, do nothing */ });
                                } else {
                                    const confirmed = window.confirm(text);
                                    if (!confirmed) return;
                                    editor.emit('sttools:pruneAssets');
                                    showMessage('开始清理未使用资源');
                                }
                            } catch (err) {
                                console.error('emit pruneAssets failed', err);
                                showMessage('请求清理未使用资源失败', 4000, 'error');
                            }
                        }}
                    />
                </TldrawUiMenuSubmenu>
            </DefaultMainMenu>
        )
    },

    InFrontOfTheCanvas: () => {
        const editor = useEditor()
        const isLibraryOpen = useShapeLibraryOpen()

        // 获取选中元素信息
        const selectionInfo = useValue(
            'selection bounds',
            () => {
                const selectedShapes = editor.getSelectedShapes()
                if (selectedShapes.length !== 1) {
                    return null
                }

                const selectedShape = selectedShapes[0]
                if (!isOverlayShape(selectedShape)) {
                    return null
                }

                const screenBounds = editor.getViewportScreenBounds()
                const rotatedScreenBounds = editor.getSelectionRotatedScreenBounds()
                if (!rotatedScreenBounds) return null

                return {
                    id: selectedShape.id,
                    x: rotatedScreenBounds.x - screenBounds.x,
                    y: rotatedScreenBounds.y - screenBounds.y,
                    width: rotatedScreenBounds.width,
                    height: rotatedScreenBounds.height,
                    rotation: editor.getSelectionRotation() || 0
                }
            },
            [editor]
        )

        const selectedShape = selectionInfo ? editor.getShape(selectionInfo.id) : null
        const isValidSelection = selectedShape && isOverlayShape(selectedShape)

        const isSingleBlockSelection = isValidSelection && selectedShape.type === 'single-block'
        const isCardOrBlock = isValidSelection && isCardLikeShape(selectedShape)
        const isJsShapeSelection = isValidSelection && selectedShape.type === 'js-shape'
        const selectedJsShape = isJsShapeSelection ? (selectedShape as IJsShape) : null

        const pointerDownPoint = React.useRef<{ x: number; y: number } | null>(null)
        const pointerMovedWhileDown = React.useRef(false)
        React.useEffect(() => {
            const container = editor.getContainer()
            if (!container) return

            const isInteractiveTarget = (target: EventTarget | null) => {
                if (!(target instanceof Element)) return false
                return Boolean(target.closest('button, [role="button"], input, textarea, select, [contenteditable="true"]'))
            }

            const handlePointerDown = (event: PointerEvent) => {
                if (event.button !== 0 || isInteractiveTarget(event.target) || event.defaultPrevented) {
                    pointerDownPoint.current = null
                    return
                }
                pointerDownPoint.current = { x: event.clientX, y: event.clientY }
                pointerMovedWhileDown.current = false
            }

            const handlePointerMove = (event: PointerEvent) => {
                const start = pointerDownPoint.current
                if (!start) return
                const dx = event.clientX - start.x
                const dy = event.clientY - start.y
                if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                    pointerMovedWhileDown.current = true
                }
            }

            const handlePointerUp = (event: PointerEvent) => {
                const start = pointerDownPoint.current
                pointerDownPoint.current = null
                if (event.button !== 0 || !start || pointerMovedWhileDown.current || event.defaultPrevented) {
                    pointerMovedWhileDown.current = false
                    return
                }
                if (editor.getCurrentToolId() !== 'hand') return
                if (isInteractiveTarget(event.target)) return

                const pagePoint = editor.screenToPage({ x: event.clientX, y: event.clientY })
                const targetShape = editor.getShapeAtPoint(pagePoint, {
                    hitInside: true,
                    filter: (shape) => isCardLikeShape(shape) && Boolean((shape as CardLikeShape).props.blockId),
                })
                if (!targetShape || !isCardLikeShape(targetShape)) return
                const blockId = (targetShape as CardLikeShape).props.blockId
                if (!blockId) {
                    console.error('未找到块ID')
                    return
                }
                void openTab({
                    app: window.siyuan.ws.app,
                    doc: {
                        id: blockId,
                        action: ['cb-get-hl', 'cb-get-all'],
                        zoomIn: false,
                    },
                    position: 'right',
                    keepCursor: false,
                }).catch((err) => {
                    console.error('跳转到笔记失败', err)
                    showMessage('跳转到笔记失败', 3000, 'error')
                })
            }

            container.addEventListener('pointerdown', handlePointerDown, { passive: true })
            container.addEventListener('pointermove', handlePointerMove, { passive: true })
            container.addEventListener('pointerup', handlePointerUp, { passive: true })
            container.addEventListener('pointercancel', handlePointerUp, { passive: true })

            return () => {
                container.removeEventListener('pointerdown', handlePointerDown)
                container.removeEventListener('pointermove', handlePointerMove)
                container.removeEventListener('pointerup', handlePointerUp)
                container.removeEventListener('pointercancel', handlePointerUp)
            }
        }, [editor])

        const buttonStyle = {
            width: '32px',
            height: '32px',
            margin: '0 4px',
            borderRadius: '4px',
            background: 'var(--b3-theme-background)',
            border: '1px solid var(--b3-border-color)',
            color: 'var(--b3-theme-on-background)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)'
        }

        return (
            <>
                {/* 素材库面板 */}
                <ShapeLibraryPanel
                    isOpen={isLibraryOpen}
                    onClose={() => toggleShapeLibrary()}
                />

                {/* 选中元素的操作按钮 */}
                {selectionInfo && isValidSelection && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            transform: `translate(${selectionInfo.x + selectionInfo.width / 2 - 115}px, ${selectionInfo.y - 40 + Math.sin(selectionInfo.rotation) * Math.abs(selectionInfo.width)}px)`,
                            display: 'flex',
                            pointerEvents: 'all',
                            zIndex: 1
                        }}
                    >
                        {isCardOrBlock && (
                            <>
                                <button
                                    style={buttonStyle}
                                    onClick={() => {
                                        editor.setEditingShape(selectionInfo.id)
                                    }}
                                    title="编辑内容"
                                >
                                    ✏️
                                </button>
                                <button
                                    style={buttonStyle}
                                    onClick={() => {
                                        const shape = editor.getShape(selectionInfo.id)
                                        if (!isCardLikeShape(shape)) return

                                        const shapeLabel = shape.type === 'card' ? '卡片' : '块'
                                        editor.updateShape({
                                            id: selectionInfo.id,
                                            type: shape.type,
                                            props: {
                                                ...shape.props,
                                                refreshNonce: Date.now(),
                                            },
                                        })
                                        showMessage(`${shapeLabel}已刷新`)
                                    }}
                                    title="刷新卡片"
                                >
                                    🔄
                                </button>
                                <button
                                    style={{
                                        ...buttonStyle,
                                        display: selectedShape.type === 'card' ? undefined : 'none',
                                    }}
                                    onClick={() => {
                                        const shape = editor.getShape(selectionInfo.id)
                                        if (!shape || shape.type !== 'card') return

                                        const card = shape as ICardShape
                                        const collapsed = !!card.props?.isCollapsed
                                        editor.updateShape({
                                            id: card.id,
                                            type: 'card',
                                            props: {
                                                ...card.props,
                                                isCollapsed: !collapsed,
                                            },
                                        })
                                    }}
                                    title={
                                        ((editor.getShape(selectionInfo.id) as ICardShape | undefined)?.props?.isCollapsed)
                                            ? '展开卡片'
                                            : '折叠卡片'
                                    }
                                >
                                    {((editor.getShape(selectionInfo.id) as ICardShape | undefined)?.props?.isCollapsed) ? '▶' : '▼'}
                                </button>
                                <button
                                    style={buttonStyle}
                                    onClick={() => {
                                        const shape = editor.getShape(selectionInfo.id)
                                        if (!isCardLikeShape(shape)) return

                                        const currentSize = shape.props.fontSize || 16
                                        const newSize = currentSize + 2
                                        editor.updateShape({
                                            id: selectionInfo.id,
                                            type: shape.type,
                                            props: {
                                                ...shape.props,
                                                fontSize: newSize,
                                            },
                                        })
                                    }}
                                    title="放大字体"
                                >
                                    A+
                                </button>
                                <button
                                    style={buttonStyle}
                                    onClick={() => {
                                        const shape = editor.getShape(selectionInfo.id)
                                        if (!isCardLikeShape(shape)) return

                                        const currentSize = shape.props.fontSize || 16
                                        const newSize = currentSize - 2
                                        editor.updateShape({
                                            id: selectionInfo.id,
                                            type: shape.type,
                                            props: {
                                                ...shape.props,
                                                fontSize: newSize,
                                            },
                                        })
                                    }}
                                    title="减小字体"
                                >
                                    A-
                                </button>
                                {isSingleBlockSelection && (
                                    <button
                                        style={{
                                            ...buttonStyle,
                                            background: isAddPending(editor, selectionInfo.id)
                                                ? 'var(--b3-accent-background)' : buttonStyle.background,
                                            boxShadow: isAddPending(editor, selectionInfo.id)
                                                ? '0 0 0 3px rgba(0, 128, 255, 0.12)' : buttonStyle.boxShadow,
                                        }}
                                        onClick={() => armAddConnectedSingleBlock(editor, selectionInfo.id)}
                                        title="点击后将在你下一次点击的位置创建关联单块（按住 Ctrl 点击可连续放置；Esc 取消）"
                                    >
                                        ❇️
                                    </button>
                                )}
                                <button
                                    style={buttonStyle}
                                    onClick={async () => {
                                        const shape = editor.getShape(selectionInfo.id)
                                        if (!isCardLikeShape(shape) || !shape.props.blockId) {
                                            console.error('未找到块ID')
                                            return
                                        }
                                        const blockId = shape.props.blockId
                                        await openTab({
                                            app: window.siyuan.ws.app,
                                            doc: {
                                                id: blockId,
                                                action: ['cb-get-hl', 'cb-get-all'],
                                            },
                                            position: 'right',
                                            keepCursor: false,
                                        })
                                    }}
                                    title="跳转到笔记"
                                >
                                    🔗
                                </button>
                            </>
                        )}
                        {isJsShapeSelection && (
                            <>
                                <button
                                    style={buttonStyle}
                                    onClick={() => editor.emit('sttools:editJsShape', selectionInfo.id)}
                                    title="打开脚本编辑器"
                                >
                                    {'</>'}
                                </button>
                                <button
                                    style={buttonStyle}
                                    onClick={() => {
                                        editor.emit('sttools:rerunJsShape', selectionInfo.id)
                                        showMessage('脚本已重新执行')
                                    }}
                                    title="手动重新执行脚本"
                                >
                                    ⚡
                                </button>
                                <button
                                    style={{
                                        ...buttonStyle,
                                        background: selectedJsShape?.props.interactive === true
                                            ? 'rgba(59,130,246,0.15)'
                                            : buttonStyle.background,
                                    }}
                                    onClick={() => {
                                        const shape = editor.getShape(selectionInfo.id)
                                        if (!shape || shape.type !== 'js-shape') return
                                        const jsShape = shape as IJsShape
                                        editor.updateShape({
                                            id: jsShape.id,
                                            type: 'js-shape',
                                            props: {
                                                ...jsShape.props,
                                                interactive: !(jsShape.props.interactive === true),
                                            },
                                        })
                                    }}
                                    title={(selectedJsShape?.props.interactive === true)
                                        ? '禁用 DOM 交互 (恢复画布拖拽)'
                                        : '允许 DOM 交互'}
                                >
                                    🖱️
                                </button>
                            </>
                        )}
                    </div>
                )}
            </>
        )
    },

}







/* 

This file contains overrides for the Tldraw UI. These overrides are used to add your custom tools to
the toolbar and the keyboard shortcuts menu.

First we have to add our new tool to the tools object in the tools override. This is where we define
all the basic information about our new tool - its icon, label, keyboard shortcut, what happens when
we select it, etc.

Then, we replace the UI components for the toolbar and keyboard shortcut dialog with our own, that
add our new tool to the existing default content. Ideally, we'd interleave our new tool into the
ideal place among the default tools, but for now we're just adding it at the start to keep things
simple.
*/