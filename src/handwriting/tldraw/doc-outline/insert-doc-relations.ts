import { Editor, TLShapeId, createShapeId } from '@tldraw/tldraw'
import { api } from '@frostime/siyuan-plugin-kits'
import { showMessage } from 'siyuan'
import type { ICardShape } from '../CardShape/card-shape-types'
import type { IBranchShape } from '../BranchShape/branch-shape-types'
import { getAllBranchAttachedShapeIds, layoutBranchChildren, markExplicitCreatedBranchRelations, relayoutBranchesContainingShapes } from '../BranchShape'
import type { BranchLineStyle } from '../BranchShape/branch-shape-types'
import { buildTldrawLink } from '../utils/link-builder'

type InsertRelationKind = 'child-doc' | 'outline-block'

type InsertRelationItem = {
	blockId: string
	children?: InsertRelationItem[]
}

type InsertDocRelationsOptions = {
	editor: Editor
	mainCard: ICardShape
	items: InsertRelationItem[]
	kind: InsertRelationKind
}

type InsertDocRelationsResult = {
	branchId: TLShapeId | null
	createdShapeIds: TLShapeId[]
	skippedCount: number
}

const CHILD_DOC_CARD_PROPS = {
	w: 500,
	h: 700,
	color: 'black' as const,
	showMask: true,
	isMain: true,
	isCollapsed: true,
}

const OUTLINE_CARD_PROPS = {
	w: 300,
	h: 300,
	color: 'black' as const,
	showMask: true,
	isMain: false,
	isCollapsed: true,
}

const BRANCH_DEFAULT_PROPS: IBranchShape['props'] = {
	w: 80,
	h: 40,
	color: 'black',
	childIds: [],
	leftChildIds: [],
	rightChildIds: [],
	rootX: 40,
	direction: 'right',
	horizontalGap: 96,
	verticalGap: 28,
	lineWidth: 3,
	lineStyle: 'curve-solid' as BranchLineStyle,
	snapDistance: 160,
	showBackground: false,
	version: 5,
}

function getExistingBlockIds(editor: Editor) {
	const ids = new Set<string>()
	for (const shape of editor.getCurrentPageShapes()) {
		if (shape.type !== 'card' && shape.type !== 'single-block') continue
		const blockId = (shape as any).props?.blockId
		if (typeof blockId === 'string' && blockId) ids.add(blockId)
	}
	return ids
}

function flattenRelationItems(items: InsertRelationItem[]): InsertRelationItem[] {
	const result: InsertRelationItem[] = []
	const visit = (item: InsertRelationItem) => {
		result.push(item)
		item.children?.forEach(visit)
	}
	items.forEach(visit)
	return result
}

function dedupeRelationTree(items: InsertRelationItem[], seen = new Set<string>()): InsertRelationItem[] {
	const result: InsertRelationItem[] = []
	for (const item of items) {
		if (!item.blockId || seen.has(item.blockId)) continue
		seen.add(item.blockId)
		result.push({
			blockId: item.blockId,
			children: item.children ? dedupeRelationTree(item.children, seen) : undefined,
		})
	}
	return result
}

function pruneExistingRelationTree(items: InsertRelationItem[], existingBlockIds: Set<string>): InsertRelationItem[] {
	return items
		.filter((item) => !existingBlockIds.has(item.blockId))
		.map((item) => ({
			blockId: item.blockId,
			children: item.children ? pruneExistingRelationTree(item.children, existingBlockIds) : undefined,
		}))
}

function uniqueIds(ids: string[]) {
	return Array.from(new Set(ids))
}

function createBranchShape(id: TLShapeId, rootX: number, rootY: number, props: Partial<IBranchShape['props']> = {}) {
	const rightChildIds = uniqueIds([...(props.rightChildIds || props.childIds || [])])
	const leftChildIds = uniqueIds([...(props.leftChildIds || [])])
	const nextProps: IBranchShape['props'] = {
		...BRANCH_DEFAULT_PROPS,
		...props,
		childIds: rightChildIds,
		leftChildIds,
		rightChildIds,
	}

	return {
		id,
		type: 'branch' as const,
		x: rootX - (nextProps.rootX || nextProps.w / 2),
		y: rootY - nextProps.h / 2,
		props: nextProps,
	}
}

function getBranchesContainingChild(editor: Editor, childId: string) {
	return editor
		.getCurrentPageShapes()
		.filter((shape): shape is IBranchShape => shape.type === 'branch' && getAllBranchAttachedShapeIds(shape as IBranchShape).includes(childId))
}

function replaceChildId(ids: string[] | undefined, oldChildId: string, newChildId: string) {
	if (!ids) return []
	return Array.from(new Set(ids.map((id) => (id === oldChildId ? newChildId : id))))
}

function replaceChildInBranch(editor: Editor, branch: IBranchShape, oldChildId: string, newChildId: string) {
	const wasRootChild = branch.props.rootShapeId === oldChildId
	const leftChildIds = wasRootChild
		? (branch.props.leftChildIds || []).filter((id) => id !== oldChildId && id !== newChildId)
		: replaceChildId(branch.props.leftChildIds, oldChildId, newChildId)
	const rightChildIds = wasRootChild
		? uniqueIds([...(branch.props.rightChildIds || branch.props.childIds || []).filter((id) => id !== oldChildId && id !== newChildId), newChildId])
		: replaceChildId(branch.props.rightChildIds || branch.props.childIds, oldChildId, newChildId)

	editor.updateShape<IBranchShape>({
		id: branch.id,
		type: 'branch',
		props: {
			...branch.props,
			childIds: rightChildIds,
			leftChildIds,
			rightChildIds,
			rootShapeId: wasRootChild ? undefined : branch.props.rootShapeId,
		},
	})
}

function getTldrawMeta(editor: Editor) {
	const container = editor.getContainer()
	const editorElement = container?.closest('.tldraw__editor')
	const rootId = editorElement?.getAttribute('data-tldraw-id') || ''
	const title = editorElement?.getAttribute('data-tldraw-title') || ''
	return { rootId, title }
}

async function syncOutlineBlockAttrs(editor: Editor, blockIds: string[]) {
	if (blockIds.length === 0) return

	const { rootId, title } = getTldrawMeta(editor)
	if (!rootId) {
		console.warn('skip syncing outline block attrs: missing tldraw rootId')
		return
	}

	await Promise.all(
		blockIds.map(async (blockId) => {
			const link = buildTldrawLink(rootId, blockId, title)
			await api.setBlockAttrs(blockId, {
				'custom-tldraw-link': link,
				'custom-st-tldraw': '1',
			})
		})
	)
}

export async function insertDocRelations(options: InsertDocRelationsOptions): Promise<InsertDocRelationsResult> {
	const { editor, mainCard, items, kind } = options
	const existingBlockIds = getExistingBlockIds(editor)
	const dedupedItems = dedupeRelationTree(items)
	const allDedupedItems = flattenRelationItems(dedupedItems)
	const creatableTree =
		kind === 'outline-block' ? pruneExistingRelationTree(dedupedItems, existingBlockIds) : dedupedItems.filter((item) => !existingBlockIds.has(item.blockId))
	const allCreatableItems = flattenRelationItems(creatableTree)
	const skippedCount = allDedupedItems.length - allCreatableItems.length

	if (allCreatableItems.length === 0) {
		return { branchId: null, createdShapeIds: [], skippedCount }
	}

	const mainBounds = editor.getShapePageBounds(mainCard.id)
	const rootX = mainBounds ? mainBounds.center.x : mainCard.x + (mainCard.props.w || 0) / 2
	const rootY = mainBounds ? mainBounds.center.y : mainCard.y + (mainCard.props.h || 0) / 2

	const createdShapes: Array<any> = []
	const createdShapeIds: TLShapeId[] = []
	const branchLayoutIds: TLShapeId[] = []
	const sourceBranches = getBranchesContainingChild(editor, mainCard.id as string)

	const createCardShape = (item: InsertRelationItem, index: number) => {
		const id = createShapeId()
		const props = kind === 'child-doc' ? CHILD_DOC_CARD_PROPS : OUTLINE_CARD_PROPS
		const shape = {
			id,
			type: 'card' as const,
			x: rootX + 180,
			y: rootY + index * 24,
			props: {
				...props,
				blockId: item.blockId,
			},
		}
		createdShapes.push(shape)
		createdShapeIds.push(id)
		return shape
	}

	const branchId = createShapeId()
	const branchShape = createBranchShape(branchId, rootX, rootY, {
		rootShapeId: mainCard.id as string,
		leftChildIds: [],
		rightChildIds: [],
	})
	createdShapes.push(branchShape)

	if (kind === 'outline-block') {
		let outlineIndex = 0
		const buildOutlineNode = (item: InsertRelationItem): string => {
			const cardShape = createCardShape(item, outlineIndex++)
			const childItems = item.children || []
			if (childItems.length === 0) {
				return cardShape.id as string
			}

			const childIds = childItems.map(buildOutlineNode)
			const childBranchId = createShapeId()
			const childBranch = createBranchShape(childBranchId, cardShape.x + cardShape.props.w / 2, cardShape.y + cardShape.props.h / 2, {
				leftChildIds: [cardShape.id as string],
				rightChildIds: childIds,
			})
			createdShapes.push(childBranch)
			branchLayoutIds.push(childBranchId)
			return childBranchId as string
		}

		const rootChildren = creatableTree.map(buildOutlineNode)
		branchShape.props.childIds = [...rootChildren]
		branchShape.props.rightChildIds = [...rootChildren]
	} else {
		const cardShapes = creatableTree.map((item, index) => createCardShape(item, index))
		const rightChildIds = cardShapes.map((shape) => shape.id as string)
		branchShape.props.childIds = [...rightChildIds]
		branchShape.props.rightChildIds = [...rightChildIds]
	}

	markExplicitCreatedBranchRelations(editor, [branchId, ...branchLayoutIds])

	editor.run(() => {
		editor.createShapes(createdShapes)

	for (const sourceBranch of sourceBranches) {
		replaceChildInBranch(editor, sourceBranch, mainCard.id as string, branchId as string)
	}

	for (const layoutId of branchLayoutIds) {
		const latestChildBranch = editor.getShape<IBranchShape>(layoutId)
		if (latestChildBranch?.type === 'branch') {
			layoutBranchChildren(editor, latestChildBranch)
		}
	}

	const latestBranch = editor.getShape<IBranchShape>(branchId)
	if (latestBranch?.type === 'branch') {
		layoutBranchChildren(editor, latestBranch)
	} else {
		showMessage('branch 创建后未能完成布局', 3000, 'error')
	}

	for (const sourceBranch of sourceBranches) {
		const latestSourceBranch = editor.getShape<IBranchShape>(sourceBranch.id)
		if (latestSourceBranch?.type === 'branch') {
			layoutBranchChildren(editor, latestSourceBranch)
		}
	}
	if (sourceBranches.length > 0) {
		relayoutBranchesContainingShapes(editor, sourceBranches.map((branch) => branch.id))
	}
	})

	if (kind === 'outline-block') {
		const outlineBlockIds = allCreatableItems.map((item) => item.blockId).filter(Boolean)
		try {
			await syncOutlineBlockAttrs(editor, outlineBlockIds)
		} catch (error) {
			console.error('sync outline block attrs failed', error)
		}
	}

	return {
		branchId,
		createdShapeIds,
		skippedCount,
	}
}
