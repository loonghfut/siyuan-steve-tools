/**
 * 自定义样式面板组件
 */
import React from 'react'
import {
    DefaultStylePanel,
    DefaultStylePanelContent,
    track,
    useEditor,
    useValue,
    useRelevantStyles,
} from '@tldraw/tldraw'
import { settingdata } from '@/index'
import { ConnectionModeManager } from '../../../utils/connectionMode'

// 各形状的样式区块组件
import { CardStyleSection } from '../../../CardShape/CardStyleSection'
import { SingleBlockStyleSection } from '../../../SingleBlockShape/SingleBlockStyleSection'
import { SlideStyleSection } from '../../../SlideShape/SlideStyleSection'
import { JsShapeStyleSection } from '../../../JsShape/JsShapeStyleSection'
import { MindMapStyleSection } from '../../../MindMapShape/MindMapStyleSection'
import { BezierConnectorStyleSection } from '../../../BezierConnectorShape/BezierConnectorStyleSection'
import { BranchStyleSection } from '../../../BranchShape/BranchStyleSection'

// 类型导入
import type { ICardShape } from '../../../CardShape/card-shape-types'
import type { ISingleBlockShape } from '../../../SingleBlockShape/single-block-shape-types'
import type { IJsShape } from '../../../JsShape/js-shape-types'
import type { IMindMapShape } from '../../../MindMapShape/mind-map-shape-types'
import type { IBezierConnectorShape } from '../../../BezierConnectorShape/bezier-connector-types'
import type { IBranchShape } from '../../../BranchShape/branch-shape-types'
import type { SlideShape } from '../../../SlideShape/SlideShapeUtil'

import { stylePanelStyles } from './styles'

// 连接模式管理器实例
let connectionManager: ConnectionModeManager | null = null

export const CustomStylePanel = track(() => {
    const editor = useEditor()
    const selectedShapes = useValue('selected shapes', () => editor.getSelectedShapes(), [editor])
    const styles = useRelevantStyles()
    const [connectionMode, setConnectionMode] = React.useState(false)
    const [connectionConnectorKind] = React.useState<'arrow' | 'bezier'>(() => {
        return (String(settingdata['tldraw-connector-kind'] || 'bezier') === 'arrow') ? 'arrow' : 'bezier'
    })

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

    // 各形状选择状态
    const isSingleSlideSelected = selectedShapes.length === 1 && selectedShapes[0].type === 'slide'
    const slideShape = isSingleSlideSelected ? (selectedShapes[0] as SlideShape) : null

    const selectedCardShapes = React.useMemo(
        () => selectedShapes.filter((shape): shape is ICardShape => shape.type === 'card'),
        [selectedShapes]
    )
    const hasCardSelection = selectedCardShapes.length > 0

    const selectedSingleBlockShapes = React.useMemo(
        () => selectedShapes.filter((s): s is ISingleBlockShape => s.type === 'single-block'),
        [selectedShapes]
    )
    const selectedJsShapes = React.useMemo(
        () => selectedShapes.filter((shape): shape is IJsShape => shape.type === 'js-shape'),
        [selectedShapes]
    )

    const selectedMindMapShapes = React.useMemo(
        () => selectedShapes.filter((shape): shape is IMindMapShape => shape.type === 'mind-map'),
        [selectedShapes]
    )
    const hasMindMapSelection = selectedMindMapShapes.length > 0

    const selectedConnectorShapes = React.useMemo(
        () => selectedShapes.filter((shape): shape is IBezierConnectorShape => shape.type === 'bezier-connector'),
        [selectedShapes]
    )

    const selectedBranchShapes = React.useMemo(
        () => selectedShapes.filter((shape): shape is IBranchShape => shape.type === 'branch'),
        [selectedShapes]
    )

    // 获取 rootId
    const container = editor.getContainer()
    const editorElement = container?.closest('.tldraw__editor')
    const rootId = editorElement?.getAttribute('data-tldraw-id')
    const title = editorElement?.getAttribute('data-tldraw-title')
    const blockId = rootId

    return (
        <DefaultStylePanel>
            <style>{stylePanelStyles}</style>

            {/* 如果选中了思维导图（mind-map），我们不加载 DefaultStylePanelContent */}
            {!hasMindMapSelection && <DefaultStylePanelContent styles={styles} />}

            {/* 连接器样式区块 */}
            <BezierConnectorStyleSection
                editor={editor}
                selectedConnectorShapes={selectedConnectorShapes}
                selectedShapes={selectedShapes}
            />

            {/* Slide 样式区块 */}
            <SlideStyleSection
                editor={editor}
                slideShape={slideShape}
                isSingleSlideSelected={isSingleSlideSelected}
                rootId={rootId}
                blockId={blockId}
                title={title}
            />

            {/* Card 样式区块 */}
            <CardStyleSection
                editor={editor}
                selectedCardShapes={selectedCardShapes}
            />

            {/* SingleBlock 样式区块（包含连接模式按钮） */}
            <SingleBlockStyleSection
                editor={editor}
                selectedSingleBlockShapes={selectedSingleBlockShapes}
                connectionManager={connectionManager}
                connectionMode={connectionMode}
                connectionConnectorKind={connectionConnectorKind}
                hasCardSelection={hasCardSelection}
            />

            {/* Branch 样式区块 */}
            <BranchStyleSection
                editor={editor}
                selectedBranchShapes={selectedBranchShapes}
            />

            {/* JsShape 样式区块 */}
            <JsShapeStyleSection
                editor={editor}
                selectedJsShapes={selectedJsShapes}
            />

            {/* MindMap 样式区块 */}
            <MindMapStyleSection
                editor={editor}
                selectedMindMapShapes={selectedMindMapShapes}
            />
        </DefaultStylePanel>
    )
})
