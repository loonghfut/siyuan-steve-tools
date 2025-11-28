import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
	HTMLContainer,
	Rectangle2d,
	ShapeUtil,
	SvgExportContext,
	TLResizeInfo,
	getDefaultColorTheme,
	resizeBox,
} from '@tldraw/tldraw'
import { showMessage, Dialog } from 'siyuan'
import { createRoot } from 'react-dom/client'
import { IJsShape } from './js-shape-types'
import { jsShapeProps } from './js-shape-props'
import { jsShapeMigrations } from './js-shape-migrations'
import { CodeEditor, CodeEditorRef } from './CodeEditor'
import { createEditorDialogContent, DEFAULT_SCRIPT, PLACEHOLDER_HTML, ScriptRunnerEnv } from './static'

export class JsShapeUtil extends ShapeUtil<IJsShape> {
	static override type = 'js-shape' as const
	static override props = jsShapeProps
	static override migrations = jsShapeMigrations

	override canResize() {
		return true
	}

	override canEdit() {
		return true
	}

	override canScroll() {
		return true
	}

	override hideRotateHandle() {
		return false
	}

	override isAspectRatioLocked() {
		return false
	}

	getDefaultProps(): IJsShape['props'] {
		return {
			w: 320,
			h: 220,
			color: 'black',
			script: DEFAULT_SCRIPT,
			// Deprecated: autoRun is not triggered by default; run scripts manually via dialog or rerun.
			autoRun: false,
			interactive: true,
		}
	}

	getGeometry(shape: IJsShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	component(shape: IJsShape) {
		const theme = getDefaultColorTheme({ isDarkMode: this.editor.user.getIsDarkMode() })
		const [runtimeError, setRuntimeError] = useState<string | null>(null)
		const runtimeRef = useRef<HTMLDivElement>(null)
		const cleanupRef = useRef<(() => void) | null>(null)
		const scriptRef = useRef(shape.props.script)
		const shapeRef = useRef(shape)
		const dialogRef = useRef<Dialog | null>(null)
		const interactiveEnabled = shape.props.interactive === true

		useEffect(() => {
			shapeRef.current = shape
		}, [shape])

		useEffect(() => {
			scriptRef.current = shape.props.script
			// 脚本变化时立即运行
			runScript(shape.props.script ?? '')
		}, [shape.props.script])

		// 简化：不再提供 requestRun / 本地状态

		useEffect(() => {
			return () => {
				cleanupRef.current?.()
				cleanupRef.current = null
			}
		}, [])

		// 移除本地状态管理

		const runScript = useCallback((source: string) => {
			const currentShape = shapeRef.current
			const host = runtimeRef.current
			if (!currentShape || !host) return

			host.replaceChildren()

			const trimmed = source?.trim()
			if (!trimmed) {
				host.innerHTML = PLACEHOLDER_HTML
				setRuntimeError(null)
				return
			}

			const saveData = (data: any) => {
				const latestShape = (this.editor.getShape(currentShape.id) as IJsShape | undefined) ?? currentShape
				let prevObj: any = {}
				try {
					prevObj = latestShape?.props.data ? JSON.parse(latestShape.props.data) : {}
				} catch {}
				const nextObj = typeof data === 'function' ? data(prevObj) : data
				const mergedObj = prevObj && typeof prevObj === 'object' && nextObj && typeof nextObj === 'object' ? { ...prevObj, ...nextObj } : nextObj
				let dataStr = ''
				try {
					dataStr = JSON.stringify(mergedObj)
				} catch {}
				this.editor.updateShape({ id: latestShape.id, type: latestShape.type, props: { ...latestShape.props, data: dataStr } })
			}

			const getData = () => {
				const latestShape = (this.editor.getShape(currentShape.id) as IJsShape | undefined) ?? currentShape
				try {
					return latestShape?.props.data ? JSON.parse(latestShape.props.data) : null
				} catch {
					return null
				}
			}

			const clearData = () => {
				const latestShape = (this.editor.getShape(currentShape.id) as IJsShape | undefined) ?? currentShape
				this.editor.updateShape({ id: latestShape.id, type: latestShape.type, props: { ...latestShape.props, data: '{}' } })
			}

			const env: ScriptRunnerEnv = { dom: host, saveData, getData, clearData }

			try {
				const fn = new Function('api', `'use strict'\n${trimmed}`)
				const result = fn(env)
				if (typeof result === 'function') {
					cleanupRef.current = result
				}
				setRuntimeError(null)
			} catch (err: any) {
				setRuntimeError(err?.message ?? String(err))
			}
		}, [])

		const persistScript = useCallback((nextScript: string) => {
			scriptRef.current = nextScript
			this.editor.updateShape({ id: shape.id, type: shape.type, props: { ...shapeRef.current.props, script: nextScript } })
			showMessage('脚本已保存并运行')
			runScript(nextScript)
		}, [runScript, shape.id, shape.type])

		const openScriptEditor = useCallback(() => {
			const existingDialog = dialogRef.current
			// const latestShape = (this.editor.getShape(shape.id) as IJsShape | undefined) ?? shapeRef.current
			
			if (existingDialog) {
				// 如果对话框已存在，聚焦即可
				return
			}

			let currentCode = scriptRef.current ?? ''
			let editorRoot: ReturnType<typeof createRoot> | null = null
			const editorRef = { current: null as CodeEditorRef | null }
			const cleanupListeners: Array<() => void> = []
			
			const dialog = new Dialog({
				title: '📝 JavaScript 脚本编辑器',
				content: createEditorDialogContent(),
				width: '1100px',
				height: '680px',
				destroyCallback: () => {
					cleanupListeners.forEach((dispose) => dispose())
					if (editorRoot) {
						editorRoot.unmount()
						editorRoot = null
					}
					dialogRef.current = null
				},
			})
			dialogRef.current = dialog

			// 挂载 CodeMirror 编辑器
			const editorContainer = dialog.element.querySelector('[data-editor-mount]')
			if (editorContainer) {
				editorRoot = createRoot(editorContainer)
				editorRoot.render(
					<CodeEditor
						ref={editorRef}
						value={currentCode}
						onChange={(newValue) => {
							currentCode = newValue
						}}
						onSave={() => {
							persistScript(currentCode)
						}}
						theme={document.body.classList.contains('body--light') ? 'light' : 'dark'}
						height="100%"
					/>
				)
			}

			const saveHandler = () => persistScript(currentCode)
			const restoreHandler = () => {
				currentCode = DEFAULT_SCRIPT
				persistScript(DEFAULT_SCRIPT)
				// 重新渲染编辑器以显示默认脚本
				if (editorRoot && editorContainer) {
					editorRoot.render(
						<CodeEditor
							ref={editorRef}
							value={currentCode}
							onChange={(newValue) => {
								currentCode = newValue
							}}
							onSave={() => {
								persistScript(currentCode)
							}}
							theme={document.body.classList.contains('body--light') ? 'light' : 'dark'}
							height="100%"
						/>
					)
				}
			}
			const closeHandler = () => dialog.destroy()

			const bind = (selector: string, handler: EventListener) => {
				const node = dialog.element.querySelector(selector)
				if (node) {
					node.addEventListener('click', handler)
					cleanupListeners.push(() => node.removeEventListener('click', handler))
				}
			}
			bind('[data-action="save"]', () => saveHandler())
			bind('[data-action="restore"]', () => restoreHandler())
			bind('[data-action="close"]', () => closeHandler())
			
			// 绑定工具按钮
			bind('[data-tool="search"]', () => editorRef.current?.openSearch())
			bind('[data-tool="format"]', () => editorRef.current?.formatCode())
			bind('[data-tool="undo"]', () => editorRef.current?.undo())
			bind('[data-tool="redo"]', () => editorRef.current?.redo())

			// 删除了 keyHandler，因为 CodeEditor 内部已经处理了 Ctrl+S

			// 移除交互开关
		}, [persistScript, shape.id])

		useEffect(() => {
			const off = this.editor.on('sttools:editJsShape', (targetId?: string) => {
				if (!targetId || targetId === shape.id) {
					openScriptEditor()
				}
			})
			return typeof off === 'function' ? off : () => {
				try { (off as any)?.dispose?.() } catch {}
			}
		}, [openScriptEditor, shape.id])

		useEffect(() => {
			const off = this.editor.on('sttools:rerunJsShape', (targetId?: string) => {
				if (!targetId || targetId === shape.id) {
					runScript(scriptRef.current ?? '')
				}
			})
			return typeof off === 'function' ? off : () => {
				try { (off as any)?.dispose?.() } catch {}
			}
		}, [runScript, shape.id])

		return (
			<HTMLContainer
				id={shape.id}
				style={{
					display: 'flex',
					flexDirection: 'column',
					width: '100%',
					height: '100%',
					backgroundColor: theme[shape.props.color].semi,
					color: theme[shape.props.color].solid,
					border: `2px solid ${theme[shape.props.color].solid}`,
					borderRadius: '10px',
					overflow: 'hidden',
					pointerEvents: 'auto',
				}}
				title="使用画布悬浮按钮打开脚本编辑器"
			>
				<div
					ref={runtimeRef}
					style={{
						pointerEvents: interactiveEnabled ? 'auto' : 'none',
				}}
				/>
				{runtimeError && (
					<div style={{
						padding: '6px 10px',
						background: 'rgba(239,68,68,0.15)',
						color: '#b91c1c',
						fontSize: '12px',
						borderTop: '1px solid rgba(239,68,68,0.4)',
					}}
					>
						{runtimeError}
					</div>
				)}
			</HTMLContainer>
		)
	}

	indicator(shape: IJsShape) {
		return <rect width={shape.props.w} height={shape.props.h} />
	}

	override onResize(shape: IJsShape, info: TLResizeInfo<IJsShape>) {
		return resizeBox(shape, info)
	}

	override toSvg(shape: IJsShape, ctx: SvgExportContext) {
		const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode })
		const { w, h, color } = shape.props
		return (
			<g>
				<rect
					width={w}
					height={h}
					rx={10}
					ry={10}
					fill={theme[color].semi}
					stroke={theme[color].solid}
					strokeWidth={2}
				/>
				<text
					x={w / 2}
					y={h / 2}
					fill={theme[color].solid}
					fontSize={Math.max(14, Math.min(w, h) * 0.12)}
					dominantBaseline="middle"
					textAnchor="middle"
				>
					JS
				</text>
			</g>
		)
	}
}

