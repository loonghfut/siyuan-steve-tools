import { Editor, TLShapeId } from '@tldraw/tldraw'

const creationMarks = new WeakMap<Editor, Map<TLShapeId, string>>()

function getCreationMarks(editor: Editor): Map<TLShapeId, string> {
	let marks = creationMarks.get(editor)
	if (!marks) {
		marks = new Map<TLShapeId, string>()
		creationMarks.set(editor, marks)
	}
	return marks
}

export function setConnectorCreationMark(editor: Editor, connectorId: TLShapeId, markId: string): void {
	getCreationMarks(editor).set(connectorId, markId)
}

export function takeConnectorCreationMark(editor: Editor, connectorId: TLShapeId): string | null {
	const marks = getCreationMarks(editor)
	const markId = marks.get(connectorId) ?? null
	marks.delete(connectorId)
	return markId
}

export function clearConnectorCreationMark(editor: Editor, connectorId: TLShapeId): void {
	getCreationMarks(editor).delete(connectorId)
}
