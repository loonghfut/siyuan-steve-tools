import { atom, Atom, Editor, TLShapeId, VecModel } from '@tldraw/tldraw'

export interface PendingConnectedSingleBlockState {
	anchorId: TLShapeId | null
	previewPoint: VecModel | null
}

const pendingStateAtoms = new WeakMap<Editor, Atom<PendingConnectedSingleBlockState>>()

function getPendingStateAtom(editor: Editor): Atom<PendingConnectedSingleBlockState> {
	let stateAtom = pendingStateAtoms.get(editor)
	if (!stateAtom) {
		stateAtom = atom<PendingConnectedSingleBlockState>('pending connected single block', {
			anchorId: null,
			previewPoint: null,
		})
		pendingStateAtoms.set(editor, stateAtom)
	}
	return stateAtom
}

export function getPendingConnectedSingleBlockState(editor: Editor) {
	return getPendingStateAtom(editor).get()
}

export function setPendingConnectedSingleBlockState(editor: Editor, next: Partial<PendingConnectedSingleBlockState>) {
	const atom = getPendingStateAtom(editor)
	atom.set({
		...atom.get(),
		...next,
	})
}

export function resetPendingConnectedSingleBlockState(editor: Editor) {
	getPendingStateAtom(editor).set({
		anchorId: null,
		previewPoint: null,
	})
}
