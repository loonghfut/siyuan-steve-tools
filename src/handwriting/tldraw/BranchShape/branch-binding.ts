import {
	BindingUtil,
	Editor,
	T,
	TLBaseBinding,
	TLBinding,
	TLBindingId,
	TLContent,
	TLExternalContent,
	TLShapeId,
} from '@tldraw/tldraw'
import { IBranchShape } from './branch-shape-types'

export const BRANCH_BINDING_TYPE = 'branch-child' as const
export const BRANCH_CLIPBOARD_META_KEY = 'sttoolsBranchClipboard'

export type BranchBindingRole = 'root' | 'child'
export type BranchBindingSide = 'left' | 'right'

export type BranchBindingProps = {
	role: BranchBindingRole
	side?: BranchBindingSide
	index?: number
}

export type BranchBinding = TLBaseBinding<typeof BRANCH_BINDING_TYPE, BranchBindingProps>

export type BranchRelation = {
	toId: string
	role: BranchBindingRole
	side?: BranchBindingSide
	index: number
}

const CONNECTABLE_BRANCH_TYPES = new Set(['card', 'single-block', 'branch'])

export class BranchBindingUtil extends BindingUtil<BranchBinding> {
	static override type = BRANCH_BINDING_TYPE
	static override props = {
		role: T.literalEnum('root', 'child'),
		side: T.optional(T.literalEnum('left', 'right')),
		index: T.optional(T.number),
	}

	override getDefaultProps(): BranchBindingProps {
		return {
			role: 'child',
			side: 'right',
			index: 0,
		}
	}
}

export function isBranchBinding(binding: TLBinding | undefined): binding is BranchBinding {
	return binding?.type === BRANCH_BINDING_TYPE
}

export function getBranchBindings(editor: Editor, branch: IBranchShape): BranchBinding[] {
	return editor.getBindingsFromShape<BranchBinding>(branch.id, BRANCH_BINDING_TYPE)
		.filter(isBranchBinding)
}

export function getBranchRelationsFromBindings(editor: Editor, branch: IBranchShape): BranchRelation[] {
	return getBranchBindings(editor, branch)
		.map((binding): BranchRelation | null => {
			const target = editor.getShape(binding.toId)
			if (!target || !CONNECTABLE_BRANCH_TYPES.has(target.type)) return null

			return {
				toId: binding.toId as string,
				role: binding.props.role,
				side: binding.props.role === 'child' ? (binding.props.side || 'right') : undefined,
				index: binding.props.index ?? 0,
			}
		})
		.filter((relation): relation is BranchRelation => relation !== null)
}

export function getLegacyRelations(branch: IBranchShape): BranchRelation[] {
	const relations: BranchRelation[] = []
	if (branch.props.rootShapeId) {
		relations.push({
			toId: branch.props.rootShapeId,
			role: 'root',
			index: 0,
		})
	}

	for (const [index, toId] of (branch.props.leftChildIds || []).entries()) {
		relations.push({ toId, role: 'child', side: 'left', index })
	}

	const rightChildIds = branch.props.rightChildIds || branch.props.childIds || []
	for (const [index, toId] of rightChildIds.entries()) {
		relations.push({ toId, role: 'child', side: 'right', index })
	}

	return relations
}

export function getLegacyPropsFromRelations(
	editor: Editor,
	branch: IBranchShape,
	relations: BranchRelation[]
): IBranchShape['props'] {
	const leftChildIds = relations
		.filter((relation) => relation.role === 'child' && relation.side === 'left')
		.sort((a, b) => a.index - b.index)
		.map((relation) => relation.toId)
	const rightChildIds = relations
		.filter((relation) => relation.role === 'child' && relation.side !== 'left')
		.sort((a, b) => a.index - b.index)
		.map((relation) => relation.toId)
	const rootShapeId = relations.find((relation) => relation.role === 'root')?.toId

	return {
		...branch.props,
		childIds: rightChildIds,
		leftChildIds,
		rightChildIds,
		rootShapeId: rootShapeId && editor.getShape(rootShapeId as TLShapeId) ? rootShapeId : undefined,
	}
}

/**
 * Branch rendering and layout still read the legacy props while the project
 * migrates to bindings. Rebuild that cache only from bindings; never reuse
 * clipboard-era shape IDs from a pasted branch record.
 */
export function syncLegacyBranchPropsFromBindings(editor: Editor, branch: IBranchShape) {
	const nextProps = getLegacyPropsFromRelations(editor, branch, getBranchRelationsFromBindings(editor, branch))
	const nextBranch = { ...branch, props: nextProps } as IBranchShape
	if (branchRelationsEqual(branch, nextBranch)) return branch

	editor.updateShape<IBranchShape>({
		id: branch.id,
		type: 'branch',
		props: nextProps,
	})
	return editor.getShape<IBranchShape>(branch.id) || nextBranch
}

/**
 * Rebuild the compatibility props from bindings, then remove any duplicate
 * binding records. This matters for imported library items: their legacy
 * fields may create bindings before the item's serialized bindings are
 * restored in a subsequent operation.
 */
export function reconcileBranchRelationsFromBindings(editor: Editor, branch: IBranchShape) {
	const hydrated = syncLegacyBranchPropsFromBindings(editor, branch)
	syncBranchBindingsFromLegacyProps(editor, hydrated)
	const canonical = editor.getShape<IBranchShape>(branch.id) || hydrated
	return syncLegacyBranchPropsFromBindings(editor, canonical)
}

function relationKey(relation: BranchRelation) {
	return `${relation.role}:${relation.side || ''}:${relation.toId}`
}

function sameRelationProps(a: BranchBindingProps, b: BranchBindingProps) {
	return a.role === b.role && (a.side || undefined) === (b.side || undefined) && (a.index ?? 0) === (b.index ?? 0)
}

function canCreateBranchBinding(editor: Editor, branch: IBranchShape, targetId: string) {
	const target = editor.getShape(targetId as TLShapeId)
	if (!target || !CONNECTABLE_BRANCH_TYPES.has(target.type)) return false

	return editor.canBindShapes({
		fromShape: branch,
		toShape: target,
		binding: BRANCH_BINDING_TYPE,
	})
}

/**
 * Mirrors the legacy branch props into tldraw bindings. This is intentionally
 * idempotent so existing branch creation and layout code can continue to use
 * the old fields during the migration period.
 */
export function syncBranchBindingsFromLegacyProps(editor: Editor, branch: IBranchShape) {
	const desired = getLegacyRelations(branch)
		.filter((relation) => canCreateBranchBinding(editor, branch, relation.toId))
	const desiredByKey = new Map(desired.map((relation) => [relationKey(relation), relation]))
	const existing = getBranchBindings(editor, branch)
	const existingByKey = new Map<string, BranchBinding[]>()

	for (const binding of existing) {
		const key = relationKey({
			toId: binding.toId as string,
			role: binding.props.role,
			side: binding.props.role === 'child' ? (binding.props.side || 'right') : undefined,
			index: binding.props.index ?? 0,
		})
		const bindings = existingByKey.get(key)
		if (bindings) bindings.push(binding)
		else existingByKey.set(key, [binding])
	}

	const bindingsToDelete: TLBindingId[] = []
	for (const [key, bindings] of existingByKey) {
		const relation = desiredByKey.get(key)
		if (!relation) {
			bindingsToDelete.push(...bindings.map((binding) => binding.id))
			continue
		}

		const [primary, ...duplicates] = bindings
		bindingsToDelete.push(...duplicates.map((binding) => binding.id))
		if (!sameRelationProps(primary.props, relation)) {
			editor.updateBinding({
				...primary,
				props: {
					role: relation.role,
					side: relation.side,
					index: relation.index,
				},
			})
		}
		desiredByKey.delete(key)
	}

	if (bindingsToDelete.length > 0) editor.deleteBindings(bindingsToDelete)

	for (const relation of desiredByKey.values()) {
		editor.createBinding({
			type: BRANCH_BINDING_TYPE,
			fromId: branch.id,
			toId: relation.toId as TLShapeId,
			props: {
				role: relation.role,
				side: relation.side,
				index: relation.index,
			},
		})
	}
}

export function branchRelationsEqual(a: IBranchShape, b: IBranchShape) {
	const sameIds = (left: string[] | undefined, right: string[] | undefined) =>
		(left || []).length === (right || []).length && (left || []).every((id, index) => id === (right || [])[index])
	if (
		!sameIds(a.props.childIds, b.props.childIds) ||
		!sameIds(a.props.leftChildIds, b.props.leftChildIds) ||
		!sameIds(a.props.rightChildIds, b.props.rightChildIds) ||
		a.props.rootShapeId !== b.props.rootShapeId
	) {
		return false
	}

	const aRelations = getLegacyRelations(a)
	const bRelations = getLegacyRelations(b)
	if (aRelations.length !== bRelations.length) return false

	return aRelations.every((relation, index) => {
		const other = bRelations[index]
		return (
			relation.toId === other.toId &&
			relation.role === other.role &&
			relation.side === other.side &&
			relation.index === other.index
		)
	})
}

function getBranchAttachmentIdsForClipboard(editor: Editor, branch: IBranchShape) {
	const bindingRelations = getBranchRelationsFromBindings(editor, branch)
	const relations = bindingRelations.length > 0 ? bindingRelations : getLegacyRelations(branch)
	return relations.map((relation) => relation.toId)
}

/**
 * `getContentFromCurrentPage` follows tldraw parentage, while branch children
 * are a logical graph. Expand the graph first, then ask tldraw to serialize it
 * so that it includes the bindings and can remap their IDs natively on paste.
 */
export function getBranchClipboardContent(editor: Editor, content: TLContent) {
	if (!content.shapes.some((shape) => shape.type === 'branch')) return content

	const shapeIds = new Set(content.shapes.map((shape) => shape.id as string))
	const queue = Array.from(shapeIds)

	for (let index = 0; index < queue.length; index++) {
		const shape = editor.getShape(queue[index] as TLShapeId)
		if (!shape || shape.type !== 'branch') continue

		for (const attachedId of getBranchAttachmentIdsForClipboard(editor, shape as IBranchShape)) {
			if (shapeIds.has(attachedId) || !editor.getShape(attachedId as TLShapeId)) continue
			shapeIds.add(attachedId)
			queue.push(attachedId)
		}
	}

	const expanded = editor.getContentFromCurrentPage(Array.from(shapeIds) as TLShapeId[])
	if (!expanded) return content

	return {
		...expanded,
		shapes: expanded.shapes.map((shape) => {
			if (shape.type !== 'branch') return shape
			return {
				...shape,
				meta: {
					...shape.meta,
					[BRANCH_CLIPBOARD_META_KEY]: true,
				},
			}
		}),
	}
}

/**
 * Stale legacy IDs must never reach the store during paste. The binding records
 * in this content are remapped by tldraw and then used to rebuild these fields
 * when the operation completes.
 */
export function prepareBranchClipboardContentForPaste(content: TLExternalContent<unknown>): TLExternalContent<unknown> {
	if (content.type !== 'tldraw' || !content.content.shapes.some((shape) => shape.type === 'branch')) return content

	return {
		...content,
		content: {
			...content.content,
			shapes: content.content.shapes.map((shape) => {
				if (shape.type !== 'branch') return shape
				const branch = shape as IBranchShape
				const { rootShapeId: _rootShapeId, ...propsWithoutRoot } = branch.props
				return {
					...branch,
					props: {
						...propsWithoutRoot,
						childIds: [],
						leftChildIds: [],
						rightChildIds: [],
					},
					meta: {
						...branch.meta,
						[BRANCH_CLIPBOARD_META_KEY]: true,
					},
				}
			}),
		},
	}
}

export function hasBranchClipboardMarker(shape: { meta?: Record<string, unknown> }) {
	return shape.meta?.[BRANCH_CLIPBOARD_META_KEY] === true
}

export function clearBranchClipboardMarker(editor: Editor, shape: IBranchShape) {
	if (!hasBranchClipboardMarker(shape)) return
	const meta = { ...(shape.meta || {}) }
	delete meta[BRANCH_CLIPBOARD_META_KEY]
	editor.updateShape({ id: shape.id, type: shape.type, meta })
}
