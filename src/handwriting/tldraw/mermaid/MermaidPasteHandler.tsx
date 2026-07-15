import React from 'react'
import { useEditor } from '@tldraw/tldraw'
import { handleExternalMermaidText } from './mermaid-import'

export function MermaidPasteHandler() {
	const editor = useEditor()

	React.useEffect(() => {
		editor.registerExternalContentHandler('text', async (content) => {
			await handleExternalMermaidText(editor, content)
		})

		return () => {
			editor.registerExternalContentHandler('text', null)
		}
	}, [editor])

	return null
}
