import {
	BindingUtil,
	createBindingId,
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
	const relations: BranchRelation[] = []
	const seen = new Set<string>()
	let hasRoot = false

	for (const binding of getBranchBindings(editor, branch).sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
		const relation = getValidBranchRelation(editor, branch, binding)
		if (!relation || (relation.role === 'root' && hasRoot)) continue

		const key = relationKey(relation)
		if (seen.has(key)) continue
		seen.add(key)
		if (relation.role === 'root') hasRoot = true
		relations.push(relation)
	}

	return relations
}

function getValidBranchRelation(editor: Editor, branch: IBranchShape, binding: BranchBinding): BranchRelation | null {
	const target = editor.getShape(binding.toId)
	if (!target || binding.toId === branch.id) return null

	if (binding.props.role === 'root') {
		if (target.type !== 'card' && target.type !== 'single-block') return null
		return { toId: binding.toId as string, role: 'root', index: 0 }
	}

	if (!CONNECTABLE_BRANCH_TYPES.has(target.type)) return null
	if (target.type === 'branch' && hasBranchChildPath(editor, target.id as string, branch.id as string)) return null
	return {
		toId: binding.toId as string,
		role: 'child',
		side: binding.props.side || 'right',
		index: binding.props.index ?? 0,
	}
}

function hasBranchChildPath(editor: Editor, fromId: string, targetId: string, visited = new Set<string>()): boolean {
	if (fromId === targetId) return true
	if (visited.has(fromId)) return false
	visited.add(fromId)

	const from = editor.getShape(fromId as TLShapeId)
	if (from?.type !== 'branch') return false
	return editor
		.getBindingsFromShape<BranchBinding>(from.id, BRANCH_BINDING_TYPE)
		.filter(isBranchBinding)
		.some((binding) => {
			if (binding.props.role !== 'child') return false
			const child = editor.getShape(binding.toId)
			if (!child || child.type !== 'branch') return false
			return hasBranchChildPath(editor, child.id as string, targetId, visited)
		})
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

function canCreateBranchBinding(editor: Editor, branch: IBranchShape, relation: BranchRelation) {
	const target = editor.getShape(relation.toId as TLShapeId)
	if (!target || target.id === branch.id) return false
	if (relation.role === 'root' && target.type !== 'card' && target.type !== 'single-block') return false
	if (relation.role === 'child' && !CONNECTABLE_BRANCH_TYPES.has(target.type)) return false
	if (relation.role === 'child' && target.type === 'branch' && hasBranchChildPath(editor, target.id as string, branch.id as string)) {
		return false
	}

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
		.filter((relation) => canCreateBranchBinding(editor, branch, relation))
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
	return Array.from(
		new Set([
			...getBranchRelationsFromBindings(editor, branch),
			...getLegacyRelations(branch),
		].map((relation) => relation.toId))
	)
}

function getClipboardRelationKey(fromId: string, relation: BranchRelation) {
	return `${fromId}:${relationKey(relation)}`
}

function getClipboardRelationEndpointKey(fromId: string, relation: BranchRelation) {
	return `${fromId}:${relation.role}:${relation.toId}`
}

/**
 * A document may be opened from a pre-binding version or contain only a
 * partially migrated branch. Preserve existing bindings and synthesize only
 * the missing legacy relations in clipboard content, where tldraw can remap
 * every endpoint ID atomically during paste.
 */
function addMissingLegacyBranchBindings(content: TLContent): TLContent {
	const shapesById = new Map(content.shapes.map((shape) => [shape.id as string, shape]))
	const relationKeys = new Set<string>()
	const relationEndpointKeys = new Set<string>()
	for (const binding of content.bindings) {
		if (binding.type !== BRANCH_BINDING_TYPE) continue
		const relation = {
				toId: binding.toId as string,
				role: binding.props.role,
				side: binding.props.role === 'child' ? (binding.props.side || 'right') : undefined,
				index: binding.props.index ?? 0,
			} satisfies BranchRelation
		relationKeys.add(getClipboardRelationKey(binding.fromId as string, relation))
		relationEndpointKeys.add(getClipboardRelationEndpointKey(binding.fromId as string, relation))
	}

	const bindingsToAdd: TLBinding[] = []
	for (const shape of content.shapes) {
		if (shape.type !== 'branch') continue
		const branch = shape as IBranchShape
		for (const relation of getLegacyRelations(branch)) {
			const target = shapesById.get(relation.toId)
			if (!target || target.id === branch.id) continue
			if (relation.role === 'root' && target.type !== 'card' && target.type !== 'single-block') continue
			if (relation.role === 'child' && !CONNECTABLE_BRANCH_TYPES.has(target.type)) continue

			const key = getClipboardRelationKey(branch.id as string, relation)
			const endpointKey = getClipboardRelationEndpointKey(branch.id as string, relation)
			if (relationKeys.has(key) || relationEndpointKeys.has(endpointKey)) continue
			relationKeys.add(key)
			relationEndpointKeys.add(endpointKey)
			bindingsToAdd.push({
				id: createBindingId(),
				typeName: 'binding',
				type: BRANCH_BINDING_TYPE,
				fromId: branch.id,
				toId: relation.toId as TLShapeId,
				props: { role: relation.role, side: relation.side, index: relation.index },
				meta: {},
			})
		}
	}

	return bindingsToAdd.length === 0 ? content : { ...content, bindings: [...content.bindings, ...bindingsToAdd] }
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

	return addMissingLegacyBranchBindings({
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
	})
}

/**
 * Stale legacy IDs must never reach the store during paste. The binding records
 * in this content are remapped by tldraw and then used to rebuild these fields
 * when the operation completes.
 */
export function prepareBranchClipboardContentForPaste(content: TLExternalContent<unknown>): TLExternalContent<unknown> {
	if (content.type !== 'tldraw' || !content.content.shapes.some((shape) => shape.type === 'branch')) return content
	const branchContent = addMissingLegacyBranchBindings(content.content)

	return {
		...content,
		content: {
			...branchContent,
			shapes: branchContent.shapes.map((shape) => {
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
