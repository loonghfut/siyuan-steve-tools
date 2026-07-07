import React from 'react'
import { track, useEditor } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import { importMermaidDiagram, looksLikeMermaid } from './mermaid-import'

const SAMPLE_MERMAID = `flowchart TD
  Start[开始] --> Parse[解析文档]
  Parse --> Decide{是否已有卡片?}
  Decide -->|是| Refresh[刷新卡片]
  Decide -->|否| Create[创建卡片]
  Refresh --> Layout[自动布局]
  Create --> Layout
  Layout --> Done[完成]
`

interface MermaidImportPanelProps {
	isOpen: boolean
	onClose: () => void
}

export const MermaidImportPanel = track(({ isOpen, onClose }: MermaidImportPanelProps) => {
	const editor = useEditor()
	const [value, setValue] = React.useState(SAMPLE_MERMAID)
	const [importing, setImporting] = React.useState(false)
	const [pos, setPos] = React.useState<{ right: number; top: number }>({ right: 20, top: 72 })
	const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
	const draggingRef = React.useRef(false)
	const dragStartRef = React.useRef({ startX: 0, startY: 0, origRight: 20, origTop: 72 })

	const stopPropagation = React.useCallback((event: React.SyntheticEvent) => {
		event.stopPropagation()
	}, [])

	const handleImport = React.useCallback(async () => {
		const mermaid = value.trim()
		if (!mermaid) {
			showMessage('请输入 Mermaid 内容', 2500, 'info')
			return
		}
		if (!looksLikeMermaid(mermaid)) {
			showMessage('当前内容看起来不像 Mermaid 图表定义', 3000, 'info')
			return
		}

		setImporting(true)
		try {
			await importMermaidDiagram(editor, mermaid)
			showMessage('Mermaid 图表已导入到白板', 2500, 'info')
			onClose()
		} catch (error) {
			console.error('import mermaid diagram failed', error)
			showMessage('Mermaid 导入失败', 3000, 'error')
		} finally {
			setImporting(false)
		}
	}, [editor, onClose, value])

	const onMouseMove = React.useCallback((event: MouseEvent) => {
		if (!draggingRef.current) return
		const dx = event.clientX - dragStartRef.current.startX
		const dy = event.clientY - dragStartRef.current.startY
		setPos({
			right: Math.max(12, dragStartRef.current.origRight - dx),
			top: Math.max(12, dragStartRef.current.origTop + dy),
		})
	}, [])

	const stopDragging = React.useCallback(() => {
		draggingRef.current = false
		window.removeEventListener('mousemove', onMouseMove, true)
		window.removeEventListener('mouseup', stopDragging, true)
	}, [onMouseMove])

	const handleHeaderMouseDown = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
		event.stopPropagation()
		if (event.button !== 0) return
		draggingRef.current = true
		dragStartRef.current = {
			startX: event.clientX,
			startY: event.clientY,
			origRight: pos.right,
			origTop: pos.top,
		}
		window.addEventListener('mousemove', onMouseMove, true)
		window.addEventListener('mouseup', stopDragging, true)
	}, [onMouseMove, pos.right, pos.top, stopDragging])

	React.useEffect(() => {
		if (!isOpen) return
		const timer = window.setTimeout(() => {
			textareaRef.current?.focus()
			textareaRef.current?.select()
		}, 0)
		return () => window.clearTimeout(timer)
	}, [isOpen])

	React.useEffect(() => {
		if (!isOpen) return

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' || event.key === 'Esc') {
				event.stopPropagation()
				onClose()
			}
		}

		const handlePaste = (event: ClipboardEvent) => {
			const text = event.clipboardData?.getData('text/plain')
			if (!text) return
			const textarea = textareaRef.current
			if (!textarea) return
			if (event.target === textarea) return

			event.preventDefault()
			event.stopPropagation()
			textarea.focus()

			const start = textarea.selectionStart ?? textarea.value.length
			const end = textarea.selectionEnd ?? textarea.value.length
			const nextValue = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`
			setValue(nextValue)

			window.requestAnimationFrame(() => {
				const cursor = start + text.length
				textarea.setSelectionRange(cursor, cursor)
			})
		}

		window.addEventListener('keydown', handleKeyDown, true)
		window.addEventListener('paste', handlePaste, true)
		return () => {
			window.removeEventListener('keydown', handleKeyDown, true)
			window.removeEventListener('paste', handlePaste, true)
		}
	}, [isOpen, onClose])

	if (!isOpen) return null

	return (
		<div
			onPointerDownCapture={stopPropagation}
			onMouseDownCapture={stopPropagation}
			onWheelCapture={stopPropagation}
			onTouchStartCapture={stopPropagation}
			onTouchMoveCapture={stopPropagation}
			style={{
				position: 'fixed',
				top: pos.top,
				right: pos.right,
				width: 420,
				maxWidth: 'calc(100vw - 32px)',
				height: 360,
				display: 'flex',
				flexDirection: 'column',
				background: 'var(--b3-theme-surface)',
				border: '1px solid var(--b3-border-color)',
				borderRadius: 12,
				boxShadow: '0 18px 50px rgba(0, 0, 0, 0.16)',
				zIndex: 1100,
				overflow: 'hidden',
				pointerEvents: 'auto',
				overscrollBehavior: 'contain',
			}}
		>
			<div
				onMouseDown={handleHeaderMouseDown}
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '12px 14px',
					borderBottom: '1px solid var(--b3-border-color)',
					cursor: 'move',
					userSelect: 'none',
				}}
			>
				<div>
					<div style={{ fontWeight: 600 }}>Mermaid 导入</div>
					<div style={{ fontSize: 12, opacity: 0.72 }}>支持 flowchart、mindmap、sequenceDiagram 等格式，也支持直接粘贴。</div>
				</div>
				<button
					type="button"
					onClick={onClose}
					style={{
						border: 'none',
						background: 'transparent',
						cursor: 'pointer',
						color: 'var(--b3-theme-on-surface)',
						fontSize: 18,
						lineHeight: 1,
					}}
				>
					×
				</button>
			</div>
			<textarea
				ref={textareaRef}
				value={value}
				onChange={(e) => setValue(e.currentTarget.value)}
				spellCheck={false}
				placeholder="在这里粘贴 Mermaid 文本…"
				style={{
					flex: 1,
					resize: 'none',
					border: 'none',
					outline: 'none',
					padding: 14,
					fontFamily: '"Cascadia Code", "JetBrains Mono", monospace',
					fontSize: 13,
					lineHeight: 1.5,
					background: 'transparent',
					color: 'var(--b3-theme-on-surface)',
				}}
			/>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					gap: 8,
					padding: 12,
					borderTop: '1px solid var(--b3-border-color)',
				}}
			>
				<button
					type="button"
					onClick={() => setValue(SAMPLE_MERMAID)}
					style={{
						padding: '8px 12px',
						borderRadius: 8,
						border: '1px solid var(--b3-border-color)',
						background: 'transparent',
						cursor: 'pointer',
					}}
				>
					填入示例
				</button>
				<div style={{ display: 'flex', gap: 8 }}>
					<button
						type="button"
						onClick={onClose}
						style={{
							padding: '8px 12px',
							borderRadius: 8,
							border: '1px solid var(--b3-border-color)',
							background: 'transparent',
							cursor: 'pointer',
						}}
					>
						取消
					</button>
					<button
						type="button"
						disabled={importing}
						onClick={() => { void handleImport() }}
						style={{
							padding: '8px 14px',
							borderRadius: 8,
							border: 'none',
							background: 'var(--b3-theme-primary)',
							color: 'var(--b3-theme-on-primary)',
							cursor: importing ? 'default' : 'pointer',
							opacity: importing ? 0.7 : 1,
						}}
					>
						{importing ? '导入中…' : '导入到白板'}
					</button>
				</div>
			</div>
		</div>
	)
})
