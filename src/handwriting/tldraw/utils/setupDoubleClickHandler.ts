import { Editor } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import { getCardShapeDefaultProps } from '../CardShape/card-shape-props'
import { getSingleBlockShapeDefaultProps } from '../SingleBlockShape/single-block-shape-props'

export type DoubleClickCreationType = 'text' | 'single-block' | 'card'

/**
 * 设置双击画布创建 single-block / card 的处理器。
 * 文本创建使用 tldraw 原生的 createTextOnCanvasDoubleClick 选项。
 * 
 * 通过覆盖 SelectTool 的 Idle 状态的 handleDoubleClickOnCanvas 方法，
 * 实现在双击画布空白处时自动创建 single-block 或 card 形状的功能。
 * 
 * @param editor - Tldraw 编辑器实例
 */
export const setupDoubleClickHandler = (editor: Editor, creationType: Exclude<DoubleClickCreationType, 'text'>) => {
    try {
        // 定义 IdleStateNode 类型，包含 handleDoubleClickOnCanvas 方法
        type IdleStateNode = any & {
            handleDoubleClickOnCanvas(info: any): void
        }
        
        // 获取 SelectTool 的 Idle 状态节点
        const selectIdleState = editor.getStateDescendant<IdleStateNode>('select.idle')
        
        if (!selectIdleState) {
            console.warn('未找到 SelectTool 的 Idle 状态，双击创建功能未启用')
            return
        }
        
        // 自定义双击画布处理函数
        const customDoubleClickOnCanvasHandler = async (info: any) => {
            const shapeLabel = creationType === 'card' ? '卡片' : '单块'
            try {
                // 获取双击位置的页面坐标
                const { x, y } = editor.screenToPage({
                    x: info.point.x,
                    y: info.point.y,
                })

                if (creationType === 'card') {
                    editor.createShape({
                        type: 'card',
                        x,
                        y,
                        props: getCardShapeDefaultProps(),
                    })
                } else {
                    editor.createShape({
                        type: 'single-block',
                        x,
                        y,
                        props: getSingleBlockShapeDefaultProps(),
                    })
                }
            } catch (err) {
                console.error(`创建 ${creationType} 失败:`, err)
                showMessage(`创建${shapeLabel}失败`, 2000, 'error')
            }
        }
        
        // 替换原有的双击处理方法，绑定到 selectIdleState 上下文
        selectIdleState.handleDoubleClickOnCanvas = 
            customDoubleClickOnCanvasHandler.bind(selectIdleState)
            
        console.debug(`双击画布创建 ${creationType} 功能已启用`)
    } catch (err) {
        console.error('设置双击处理器失败:', err)
    }
}
