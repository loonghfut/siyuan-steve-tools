import { StateNode, TLEventHandlers, TLPointerEventInfo, TLCursorType } from '@tldraw/tldraw'
import { IMindMapNodeShape } from './MindMapNodeShapeUtil' // 确保路径正确

// 思维导图节点工具的状态机
export class MindMapNodeTool extends StateNode {
    static override id = 'mindmap-node' // 工具的唯一ID，与 ShapeUtil 的 type 对应
    static override initial = 'idle' // 初始状态
    static override children = () => [IdleState, PointingState] // 定义子状态

    // 设置工具激活时的光标样式
    override shapeType = 'mindmap-node' // 关联的形状类型

}

// 空闲状态：等待用户操作
class IdleState extends StateNode {
    static override id = 'idle'

    // 当用户按下指针（鼠标左键或触摸）时触发
    override onPointerDown: TLEventHandlers['onPointerDown'] = (info) => {
        // 切换到 pointing 状态，准备创建形状
        this.parent.transition('pointing', info)
    }
}

// 指针按下状态：用户已点击，可能开始拖动
class PointingState extends StateNode {
    static override id = 'pointing'
    private info?: TLPointerEventInfo // 存储初始点击信息

    // 进入此状态时记录初始信息
    override onEnter = (info: TLPointerEventInfo) => {
        this.info = info
    }

    // 指针移动时触发
    override onPointerMove: TLEventHandlers['onPointerMove'] = (info) => {
        // 如果移动距离超过阈值，则开始创建形状
        if (this.editor.inputs.isDragging) {
            // 使用 editor.createShape 创建新节点
            this.editor.createShape<IMindMapNodeShape>({
                type: 'mindmap-node', // 指定形状类型
                x: this.editor.inputs.originPagePoint.x, // 起始 X 坐标
                y: this.editor.inputs.originPagePoint.y, // 起始 Y 坐标
                props: {
                    w: 1, // 初始宽度设为很小
                    h: 1, // 初始高度设为很小
                    // 可以设置其他默认属性，但通常在 ShapeUtil 的 getDefaultProps 中处理
                },
            })
            // 切换到父级的 idle 状态，并传递 'dragging' 事件，
            // tldraw 的 BaseBoxShapeTool 会处理后续的拖拽缩放逻辑
            this.parent.transition('idle', { ...info, target: 'shape', onInteractionEnd: this.parent.id })
            // 触发拖动开始事件，让 tldraw 内部处理拖拽创建
        }
    }

    // 指针抬起时触发（没有拖动，只是点击）
    override onPointerUp: TLEventHandlers['onPointerUp'] = (info) => {
        // 在点击位置创建一个默认大小的节点
        this.editor.createShape<IMindMapNodeShape>({
            type: 'mindmap-node',
            x: this.editor.inputs.currentPagePoint.x - 60, // 减去宽度的一半使其居中
            y: this.editor.inputs.currentPagePoint.y - 20, // 减去高度的一半使其居中
            // 默认大小会由 ShapeUtil 的 getDefaultProps 提供
        })
        // 返回 idle 状态
        this.parent.transition('idle', info)
    }

    // 取消操作时（例如按 Esc）
    override onCancel: TLEventHandlers['onCancel'] = (info) => {
        // 返回 idle 状态
        this.parent.transition('idle', info)
    }
}