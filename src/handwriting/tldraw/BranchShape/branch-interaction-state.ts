import { useSyncExternalStore } from 'react'

export type BranchInteractionHint =
	| {
			mode: 'attach'
			draggingShapeId: string
			branchId: string
			side: 'left' | 'right'
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

function emit() {
	for (const listener of listeners) listener()
}

export function setBranchInteractionHint(nextHint: BranchInteractionHint | null) {
	const prev = currentHint
	const isSame =
		prev?.mode === nextHint?.mode &&
		prev?.branchId === nextHint?.branchId &&
		(prev as any)?.draggingShapeId === (nextHint as any)?.draggingShapeId &&
		(prev as any)?.side === (nextHint as any)?.side &&
		(prev as any)?.targetShapeId === (nextHint as any)?.targetShapeId

	if (isSame) return
	currentHint = nextHint
	emit()
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
