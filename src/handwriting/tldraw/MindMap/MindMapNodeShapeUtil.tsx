import {
    BaseBoxShapeUtil,
    HTMLContainer,
    Rectangle2d,
    ShapeUtil,
    T,
    TLBaseShape,
    getDefaultColorTheme,
    RecordProps,
    TLResizeHandle,
    resizeBox,
    Editor,
} from '@tldraw/tldraw'
import { ReactElement } from 'react'

// [1] 定义 Shape 类型接口，继承 TLBaseShape
// 添加你需要的特定属性，例如文本内容、颜色等
export type IMindMapNodeShape = TLBaseShape<
    'mindmap-node',
    {
        w: number
        h: number
        color: string
        text: string
    }
>

// [2] 定义 Props 验证模式 (可选，但推荐)
// 使用 T.object 定义形状的属性及其类型
export const mindMapNodeShapeProps: RecordProps<IMindMapNodeShape> = {
    w: T.number,
    h: T.number,
    color: T.string,
    text: T.string,
}

// [3] 创建 ShapeUtil 类
export class MindMapNodeShapeUtil extends BaseBoxShapeUtil<IMindMapNodeShape> {
    // 定义形状类型名称
    static override type = 'mindmap-node' as const
    // 关联 Props 验证模式
    static override props = mindMapNodeShapeProps

    // 设置默认属性值
    override getDefaultProps(): IMindMapNodeShape['props'] {
        return {
            w: 120, // 默认宽度
            h: 40,  // 默认高度
            color: 'black', // 默认颜色
            text: '节点', // 默认文本
        }
    }

    // [4] 定义形状的几何图形
    // 用于碰撞检测、边界框计算等
    getGeometry(shape: IMindMapNodeShape): Rectangle2d {
        return new Rectangle2d({
            width: shape.props.w,
            height: shape.props.h,
            isFilled: true, // 节点通常是填充的
        })
    }

    // [5] 定义形状的 React 组件渲染
    // 这是形状在画布上实际显示的样子
    component(shape: IMindMapNodeShape): ReactElement {
        const theme = getDefaultColorTheme({ isDarkMode: this.editor.user.getIsDarkMode() })
        const { w, h, text, color } = shape.props

        return (
            <HTMLContainer
                id={shape.id}
                style={{
                    border: `1px solid ${theme[color].solid}`,
                    backgroundColor: theme[color].semi,
                    color: theme[color].solid,
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    padding: '5px',
                    boxSizing: 'border-box',
                    overflow: 'hidden', // 防止文本溢出
                    whiteSpace: 'nowrap', // 文本不换行
                    textOverflow: 'ellipsis', // 文本溢出时显示省略号
                }}
            >
                {text}
            </HTMLContainer>
        )
    }

    // [6] 定义形状的指示器 (选中或悬停时显示)
    // 通常是一个简单的 SVG 矩形
    indicator(shape: IMindMapNodeShape): ReactElement {
        return <rect width={shape.props.w} height={shape.props.h} rx="4" ry="4" />
    }

    // [7] 定义缩放处理逻辑 (可选)
    // 默认使用 resizeBox 即可满足基本需求
    // override onResize = (shape: IMindMapNodeShape, info: Parameters<ShapeUtil['onResize']>[1]) => {
    //     return resizeBox(shape, info)
    // }

    // [8] 定义双击行为 (可选)
    // 例如，双击时进入文本编辑状态
    override onDoubleClick = (shape: IMindMapNodeShape) => {
        // 可以在这里实现编辑逻辑，例如弹出一个输入框
        // 或者如果你的节点需要更复杂的编辑，可以像 CardShapeUtil 那样设置 editingId
        const newText = prompt('输入节点文本:', shape.props.text)
        if (newText !== null) {
            this.editor.updateShape<IMindMapNodeShape>({
                id: shape.id,
                type: 'mindmap-node',
                props: { text: newText },
            })
        }
    }

    // 你可以在这里添加更多方法来处理特定交互，例如：
    // - onDrag: 处理拖动逻辑
    // - onConnect: 处理连接线逻辑
    // - getHandles: 定义自定义操作手柄 (例如用于创建子节点的手柄)
}