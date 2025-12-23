import { Editor } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'

/**
 * 设置双击画布创建 single-block 的处理器
 * 
 * 通过覆盖 SelectTool 的 Idle 状态的 handleDoubleClickOnCanvas 方法，
 * 实现在双击画布空白处时自动创建 single-block 形状的功能。
 * 
 * @param editor - Tldraw 编辑器实例
 */
export const setupDoubleClickHandler = (editor: Editor) => {
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
            try {
                // 获取双击位置的页面坐标
                const { x, y } = editor.screenToPage({
                    x: info.point.x,
                    y: info.point.y,
                })
                
                // 创建新的 single-block 形状
                editor.createShape({
                    type: 'single-block',
                    x: x,
                    y: y,
                    props: {
                        w: 300,
                        h: 50,
                        color: 'black',
                        blockId: '',
                        isNewlyCreated: true,
                    },
                })
                
                // showMessage('已创建新的 single-block', 1500, 'info')
            } catch (err) {
                console.error('创建 single-block 失败:', err)
                showMessage('创建 single-block 失败', 2000, 'error')
            }
        }
        
        // 替换原有的双击处理方法，绑定到 selectIdleState 上下文
        selectIdleState.handleDoubleClickOnCanvas = 
            customDoubleClickOnCanvasHandler.bind(selectIdleState)
            
        console.debug('双击画布创建 single-block 功能已启用')
    } catch (err) {
        console.error('设置双击处理器失败:', err)
    }
}
