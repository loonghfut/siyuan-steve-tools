import { Dialog, Protyle, showMessage, TProtyleAction } from 'siyuan'
import type { Editor, TLShapeId } from '@tldraw/tldraw'
import type { ICardShape } from './card-shape-types'

/**
 * Opens a full-sized Siyuan editor for an existing card block.
 *
 * Card previews intentionally use a lightweight static DOM in many cases, so
 * mounting the editor in a dialog keeps editing responsive without changing
 * the canvas card's render mode. Closing the dialog refreshes the preview.
 */
export function openCardContentEditorDialog(editor: Editor, shapeId: TLShapeId): boolean {
	const selectedShape = editor.getShape(shapeId)
	if (!selectedShape || selectedShape.type !== 'card') return false

	const card = selectedShape as ICardShape
	if (!card.props.blockId) return false

	let protyle: Protyle | null = null
	let cleanedUp = false

	const cleanup = () => {
		if (cleanedUp) return
		cleanedUp = true

		try {
			protyle?.destroy()
		} catch {
			// The dialog may close while Protyle is still initializing.
		}

		const latestShape = editor.getShape(shapeId)
		if (!latestShape || latestShape.type !== 'card') return

		editor.updateShape({
			id: latestShape.id,
			type: latestShape.type,
			props: {
				...latestShape.props,
				refreshNonce: Date.now(),
			},
		})
	}

	const dialog = new Dialog({
		title: '编辑卡片内容',
		content: '<div class="b3-dialog__content" style="height: 100%; padding: 0;"><div data-card-content-editor style="height: 100%;"></div></div>',
		width: '860px',
		height: '70vh',
		destroyCallback: cleanup,
	})

	const host = dialog.element.querySelector<HTMLElement>('[data-card-content-editor]')
	if (!host) {
		showMessage('无法打开卡片编辑器', 3000, 'error')
		dialog.destroy()
		return false
	}

	try {
		protyle = new Protyle(window.siyuan.ws.app, host, {
			blockId: card.props.blockId,
			rootId: card.props.blockId,
			mode: 'wysiwyg',
			action: ['cb-get-all', 'cb-get-focus'] as TProtyleAction[],
			render: {
				breadcrumb: false,
				gutter: true,
				title: Boolean(card.props.isMain),
				breadcrumbDocName: Boolean(card.props.isMain),
			},
			click: {
				/** 点击末尾是否阻止插入新块 */
				preventInsetEmptyBlock: true,
			}
		})
	} catch (error) {
		console.error('打开卡片编辑器失败', error)
		showMessage('打开卡片编辑器失败', 3000, 'error')
		dialog.destroy()
		return false
	}

	return true
}
