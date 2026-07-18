import { atom, Atom, Editor, TLShapeId, VecLike } from '@tldraw/tldraw'
import { PortTerminal } from './bezier-connector-types'

export interface ConnectorExtensionMenuState {
	connectorId: TLShapeId
	terminal: PortTerminal
	pagePoint: VecLike
	creatingMarkId: string
}

const menuAtoms = new WeakMap<Editor, Atom<ConnectorExtensionMenuState | null>>()

function getMenuAtom(editor: Editor): Atom<ConnectorExtensionMenuState | null> {
	let menuAtom = menuAtoms.get(editor)
	if (!menuAtom) {
		menuAtom = atom<ConnectorExtensionMenuState | null>('connector extension menu', null)
		menuAtoms.set(editor, menuAtom)
	}
	return menuAtom
}

export function getConnectorExtensionMenu(editor: Editor): ConnectorExtensionMenuState | null {
	return getMenuAtom(editor).get()
}

export function openConnectorExtensionMenu(editor: Editor, state: ConnectorExtensionMenuState): void {
	getMenuAtom(editor).set(state)
}

export function closeConnectorExtensionMenu(editor: Editor): void {
	const menuAtom = getMenuAtom(editor)
	if (menuAtom.get()) menuAtom.set(null)
}
