import { Editor, getIndicesBetween, IndexKey, TLParentId, TLShapeId } from '@tldraw/tldraw'

/**
 * 保持贝塞尔连接器在其他形状的底层
 * 这确保连接线不会遮挡节点形状
 */
export function keepConnectorsAtBottom(editor: Editor) {
	let pendingChangedParentIds = new Set<TLParentId>()

	// 监听形状创建
	editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (source === 'remote') return
		pendingChangedParentIds.add(shape.parentId)
	})

	// 监听形状变化
	editor.sideEffects.registerAfterChangeHandler('shape', (oldShape, newShape, source) => {
		if (source === 'remote') return
		if (oldShape.parentId === newShape.parentId && oldShape.index === newShape.index) return
		pendingChangedParentIds.add(newShape.parentId)
	})

	// 在操作完成时重新排序
	editor.sideEffects.registerOperationCompleteHandler(() => {
		if (pendingChangedParentIds.size === 0) return

		const changedParentIds = pendingChangedParentIds
		pendingChangedParentIds = new Set()
		const updates: Array<{ id: TLShapeId; type: string; index: IndexKey }> = []

		for (const parentId of changedParentIds) {
			const childIds = editor.getSortedChildIdsForParent(parentId)

			let i = childIds.length - 1
			let highestConnectorIndex: IndexKey | undefined = undefined
			let nextIndexAboveHighestConnectorIndex: IndexKey | undefined = undefined

			// 从后向前遍历，找到最高的连接器索引
			for (; i >= 0; i--) {
				const child = editor.getShape(childIds[i])
				if (!child) continue

				if (child.type === 'bezier-connector') {
					highestConnectorIndex = child.index
					break
				} else {
					nextIndexAboveHighestConnectorIndex = child.index
				}
			}

			// 收集需要移动的非连接器形状
			const shapesToMove: Array<{ id: TLShapeId; type: string; index: IndexKey }> = []
			for (; i >= 0; i--) {
				const child = editor.getShape(childIds[i])
				if (!child) continue
				if (child.type !== 'bezier-connector') {
					shapesToMove.push({ id: child.id, type: child.type, index: child.index })
				}
			}

			shapesToMove.reverse()

			// 为需要移动的形状生成新的索引
			const newIndexes = getIndicesBetween(
				highestConnectorIndex,
				nextIndexAboveHighestConnectorIndex,
				shapesToMove.length
			)

			for (let j = 0; j < shapesToMove.length; j++) {
				updates.push({
					id: shapesToMove[j].id,
					type: shapesToMove[j].type,
					index: newIndexes[j],
				})
			}
		}

		if (updates.length > 0) {
			editor.updateShapes(updates)
		}
	})
}
