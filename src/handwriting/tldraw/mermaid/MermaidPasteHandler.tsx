import React from 'react'
import { useEditor } from '@tldraw/tldraw'
import { handleExternalMermaidText } from './mermaid-import'

export function MermaidPasteHandler() {
	const editor = useEditor()

	React.useEffect(() => {
		return editor.registerExternalContentHandler('text', async (content) => {
			await handleExternalMermaidText(editor, content)
		})
	}, [editor])

	return null
}
