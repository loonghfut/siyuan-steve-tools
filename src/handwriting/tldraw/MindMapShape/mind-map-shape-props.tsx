import { DefaultColorStyle, RecordProps, T } from '@tldraw/tldraw'
import { IMindMapShape, MindMapNode } from './mind-map-shape-types'

// 思维导图节点验证器
// const mindMapNodeValidator: T.Validator<MindMapNode> = T.object({
//     id: T.string,
//     text: T.string,
//     children: T.arrayOf(T.any), // 递归类型，使用 any
//     collapsed: T.optional(T.boolean),
//     color: T.optional(T.string),
// })

// 思维导图形状属性验证
export const mindMapShapeProps: RecordProps<IMindMapShape> = {
    w: T.number,
    h: T.number,
    color: DefaultColorStyle,
    rootNode: T.any, // 复杂嵌套对象使用 any
    horizontalGap: T.number,
    verticalGap: T.number,
    nodeWidth: T.number,
    nodeHeight: T.number,
    fontSize: T.number,
    lineWidth: T.number,
    direction: T.string,
    theme: T.string,
    selectedNodeId: T.optional(T.string),
    version: T.optional(T.number),
}
