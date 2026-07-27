import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'
import { Editor, TLShapePartial, createShapeId } from '@tldraw/tldraw'
import type { ICardShape } from './card-shape-types'

const versions = createShapePropsMigrationIds(
  // this must match the shape type in the shape definition
  'card',
  {
    Addv: 1,
    AddrefreshNonce:2,
    AddCollapsedTextStyle: 3,
    AddLightweightPreviewText: 4,
  }
)

// Migrations for the custom card shape (optional but very helpful)
export const cardShapeMigrations = createShapePropsMigrationSequence({
  sequence: [
    {
      id: versions.Addv,
      up(props) {
        // it is safe to mutate the props object here
        props.version = 1
      },
      down(props) {
        delete props.version
      },
    },
    {
      id: versions.AddrefreshNonce,
      up(props) {
        // it is safe to mutate the props object here
        props.refreshNonce = Date.now()
      },
      down(props) {
        delete props.refreshNonce
      },
    },
    {
      id: versions.AddCollapsedTextStyle,
      up(_props) {
        // 新属性使用默认值，无需显式设置
      },
      down(props) {
        delete props.collapsedTextSize
        delete props.collapsedTextAlign
      },
    },
    {
      id: versions.AddLightweightPreviewText,
      up(props) {
        props.previewText = props.previewText ?? ''
      },
      down(props) {
        delete props.previewText
      },
    },
  ],
})


/**
 * 使用 blockIds 数组初始化 tldraw 卡片
 * @param editor tldraw 编辑器实例
 * @param blockIds 思源笔记块 ID 数组
 * @param options 选项配置
 */
export function initCardsWithBlockIds(
  editor: Editor,
  blockIds: string[],
  options: {
    startX?: number,
    startY?: number,
    gap?: number,
    width?: number,
  } = {}
) {
  const {
    startX = 100,
    startY = 100,
  } = options

  // 为每个 blockId 创建一个卡片
  const shapes: TLShapePartial<ICardShape>[] = blockIds.map((blockId) => {
    return {
      id: createShapeId(`card-${blockId}`),
      type: 'card',
      x: startX ,
      y: startY ,
      props: {
        w: 800,
        h: 1200,
        color: 'black',
        showMask: true,
        blockId: blockId,
        isMain: true,
      },
    }
  })

  // 批量创建卡片
  editor.createShapes(shapes)

  // 可选：居中显示所有卡片
  editor.zoomToFit()
}
