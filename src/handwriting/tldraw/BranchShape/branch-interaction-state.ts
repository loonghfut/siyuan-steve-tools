import { useSyncExternalStore } from 'react'

export type BranchInteractionHint =
	| {
			mode: 'attach'
			draggingShapeId: string
			branchId: string
			side?: 'left' | 'right'
			slot?: 'root' | 'side'
			targetShapeId?: string
	  }
	| {
			mode: 'detach'
			draggingShapeId: string
			branchId: string
	  }
	| {
			mode: 'move-branch'
			branchId: string
	  }

let currentHint: BranchInteractionHint | null = null
const listeners = new Set<() => void>()
const branchListeners = new Map<string, Set<() => void>>()

function emit() {
	for (const listener of listeners) listener()
}

function emitBranch(branchId: string | undefined) {
	if (!branchId) return
	const listenersForBranch = branchListeners.get(branchId)
	if (!listenersForBranch) return
	for (const listener of listenersForBranch) listener()
}

function subscribeToBranch(branchId: string, listener: () => void) {
	let listenersForBranch = branchListeners.get(branchId)
	if (!listenersForBranch) {
		listenersForBranch = new Set()
		branchListeners.set(branchId, listenersForBranch)
	}

	listenersForBranch.add(listener)
	return () => {
		listenersForBranch.delete(listener)
		if (listenersForBranch.size === 0) branchListeners.delete(branchId)
	}
}

export function setBranchInteractionHint(nextHint: BranchInteractionHint | null) {
	const prev = currentHint
	const isSame =
		prev?.mode === nextHint?.mode &&
		prev?.branchId === nextHint?.branchId &&
		(prev as any)?.draggingShapeId === (nextHint as any)?.draggingShapeId &&
		(prev as any)?.side === (nextHint as any)?.side &&
		(prev as any)?.slot === (nextHint as any)?.slot &&
		(prev as any)?.targetShapeId === (nextHint as any)?.targetShapeId

	if (isSame) return
	currentHint = nextHint
	emit()
	emitBranch(prev?.branchId)
	if (nextHint?.branchId !== prev?.branchId) emitBranch(nextHint?.branchId)
}

export function clearBranchInteractionHint(shapeId?: string) {
	if (!shapeId || currentHint?.branchId === shapeId || (currentHint as any)?.draggingShapeId === shapeId) {
		setBranchInteractionHint(null)
	}
}

export function getBranchInteractionHint() {
	return currentHint
}

export function useBranchInteractionHint() {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		getBranchInteractionHint,
		getBranchInteractionHint
	)
}

export function getBranchInteractionHintForBranch(branchId: string) {
	return currentHint?.branchId === branchId ? currentHint : null
}

export function useBranchInteractionHintForBranch(branchId: string) {
	return useSyncExternalStore(
		(listener) => subscribeToBranch(branchId, listener),
		() => getBranchInteractionHintForBranch(branchId),
		() => getBranchInteractionHintForBranch(branchId)
	)
}
