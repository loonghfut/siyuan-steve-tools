import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'
import { Editor, createShapeId } from '@tldraw/tldraw'

const versions = createShapePropsMigrationIds(
	// this must match the shape type in the shape definition
	'card',
	{
		AddSomeProperty: 1,
	}
)

// Migrations for the custom card shape (optional but very helpful)
export const cardShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: versions.AddSomeProperty,
			up(props) {
				// it is safe to mutate the props object here
				props.someProperty = 'some value'
			},
			down(props) {
				delete props.someProperty
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
    height?: number,
    columns?: number
  } = {}
) {
  const {
    startX = 100,
    startY = 100,
    gap = 50,
    width = 300,
    height = 300,
    columns = 3
  } = options

  // 为每个 blockId 创建一个卡片
  const shapes = blockIds.map((blockId, index) => {
    const col = index % columns
    const row = Math.floor(index / columns)
    
    return {
      id: createShapeId(`card-${index}`),
      type: 'card',
      x: startX + col * (width + gap),
      y: startY + row * (height + gap),
      props: {
        w: width,
        h: height,
        color: 'black',
        showMask: true,
        blockId: blockId,
      },
    }
  })
  
  // 批量创建卡片
  editor.createShapes(shapes)

  // 可选：居中显示所有卡片
  editor.zoomToFit()
}