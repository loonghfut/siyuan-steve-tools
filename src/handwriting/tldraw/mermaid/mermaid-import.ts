import { createMermaidDiagram } from '@tldraw/mermaid'
import { defaultHandleExternalTextContent, Editor } from '@tldraw/tldraw'

const MERMAID_KEYWORD =
	/^\s*(flowchart|graph|sequenceDiagram|stateDiagram|classDiagram|erDiagram|gantt|pie|gitGraph|mindmap|journey|timeline)\b/i

export function looksLikeMermaid(text: string) {
	return MERMAID_KEYWORD.test(text)
}

export async function importMermaidDiagram(editor: Editor, mermaidText: string) {
	await createMermaidDiagram(editor, mermaidText, {
		async onUnsupportedDiagram(svgString) {
			await editor.putExternalContent({ type: 'svg-text', text: svgString })
		},
	})
}

export async function handleExternalMermaidText(editor: Editor, content: { text: string }) {
	if (!looksLikeMermaid(content.text)) {
		await defaultHandleExternalTextContent(editor, content)
		return
	}

	try {
		await importMermaidDiagram(editor, content.text)
	} catch {
		await defaultHandleExternalTextContent(editor, content)
	}
}
