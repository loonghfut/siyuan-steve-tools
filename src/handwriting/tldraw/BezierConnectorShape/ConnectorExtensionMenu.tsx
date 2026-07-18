import React from 'react'
import { Editor, useEditor, useValue } from '@tldraw/tldraw'
import { createAndBindShape } from './createAndBindShape'
import type { NewShapeType } from './createAndBindShape'
import {
	closeConnectorExtensionMenu,
	getConnectorExtensionMenu,
} from './connector-extension-menu-state'
import type { ConnectorExtensionMenuState } from './connector-extension-menu-state'

function cancelConnectorExtension(editor: Editor, menu: ConnectorExtensionMenuState) {
	closeConnectorExtensionMenu(editor)
	editor.bailToMark(menu.creatingMarkId)
}

export function ConnectorExtensionMenu() {
	const editor = useEditor()
	const menu = useValue(
		'connector extension menu',
		() => getConnectorExtensionMenu(editor),
		[editor]
	)
	const menuRef = React.useRef<HTMLDivElement>(null)

	const position = useValue(
		'connector extension menu position',
		() => {
			if (!menu) return null
			const screenBounds = editor.getViewportScreenBounds()
			const screenPoint = editor.pageToScreen(menu.pagePoint)
			return {
				x: screenPoint.x - screenBounds.x,
				y: screenPoint.y - screenBounds.y,
			}
		},
		[editor, menu]
	)

	const cancel = React.useCallback(() => {
		if (menu) cancelConnectorExtension(editor, menu)
	}, [editor, menu])

	React.useEffect(() => {
		if (!menu) return

		const onPointerDown = (event: PointerEvent) => {
			if (menuRef.current?.contains(event.target as Node)) return
			event.preventDefault()
			event.stopPropagation()
			cancel()
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			event.preventDefault()
			cancel()
		}

		const container = editor.getContainer()
		container.addEventListener('pointerdown', onPointerDown, true)
		window.addEventListener('keydown', onKeyDown)
		return () => {
			container.removeEventListener('pointerdown', onPointerDown, true)
			window.removeEventListener('keydown', onKeyDown)
		}
	}, [cancel, editor, menu])

	if (!menu || !position) return null

	const create = (type: NewShapeType) => {
		const newShapeId = createAndBindShape(editor, menu.connectorId, menu.terminal, type)
		if (newShapeId) {
			closeConnectorExtensionMenu(editor)
			return
		}
		cancel()
	}

	const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
		event.preventDefault()
		event.stopPropagation()
	}

	return (
		<div
			ref={menuRef}
			className="bezier-connector-extension-menu"
			style={{ transform: `translate(${position.x}px, ${position.y + 12}px)` }}
			onPointerDown={(event) => {
				event.preventDefault()
				event.stopPropagation()
			}}
		>
			<button type="button" onPointerDown={handlePointerDown} onClick={() => create('card')}>
				卡片
			</button>
			<button type="button" onPointerDown={handlePointerDown} onClick={() => create('single-block')}>
				块
			</button>
			<button type="button" className="bezier-connector-extension-menu__cancel" onPointerDown={handlePointerDown} onClick={cancel}>
				取消
			</button>
		</div>
	)
}
