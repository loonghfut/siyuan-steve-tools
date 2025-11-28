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
		// ref for the CodeEditor to allow annotating runtime errors
		const codeEditorRef = useRef<CodeEditorRef | null>(null)
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

		// 为运行容器添加 click 兼容：在某些环境中原生 click 可能不触发
		useEffect(() => {
			const host = runtimeRef.current
			if (!host || !interactiveEnabled) return

			// 仅针对左键 / 主指针进行 click 合成
			const MOVE_THRESHOLD = 8
			let lastNativeClickAt = 0
			let lastSynthClickAt = 0
			const ptrState = new Map<number, { startX: number; startY: number; startedInHost: boolean }>()

			const isInsideHost = (el: EventTarget | null) => {
				return el instanceof Node && host.contains(el)
			}

			const onPointerDown = (e: PointerEvent) => {
				// 使用捕获阶段，尽量早地记录
				if (e.button !== 0) return
				const startedInHost = isInsideHost(e.target)
				if (!startedInHost) return
				ptrState.set(e.pointerId, { startX: e.clientX, startY: e.clientY, startedInHost })
			}

			const onPointerUp = (e: PointerEvent) => {
				const st = ptrState.get(e.pointerId)
				if (!st) return
				ptrState.delete(e.pointerId)
				// 已有原生 click，避免重复
				const now = Date.now()
				if (now - lastNativeClickAt < 300 || now - lastSynthClickAt < 120) return

				const dx = e.clientX - st.startX
				const dy = e.clientY - st.startY
				const moved = Math.hypot(dx, dy) > MOVE_THRESHOLD
				if (moved) return

				// up 时命中 host 内部的元素
				const el = document.elementFromPoint(e.clientX, e.clientY)
				if (!el || !isInsideHost(el)) return

				try {
					const synthetic = new MouseEvent('click', {
						bubbles: true,
						cancelable: true,
						view: window,
						clientX: e.clientX,
						clientY: e.clientY,
						button: 0,
					})
					el.dispatchEvent(synthetic)
					lastSynthClickAt = Date.now()
				} catch {}
			}

			const onClickCapture = (e: MouseEvent) => {
				// 记录原生 click 发生时间，用于抑制重复的合成 click
				if (isInsideHost(e.target)) {
					lastNativeClickAt = Date.now()
				}
			}

			document.addEventListener('pointerdown', onPointerDown, true)
			document.addEventListener('pointerup', onPointerUp, true)
			host.addEventListener('click', onClickCapture, true)

			return () => {
				document.removeEventListener('pointerdown', onPointerDown, true)
				document.removeEventListener('pointerup', onPointerUp, true)
				host.removeEventListener('click', onClickCapture, true)
			}
		}, [interactiveEnabled])

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

			const latestShape = (this.editor.getShape(currentShape.id) as IJsShape | undefined) ?? currentShape
			const env: ScriptRunnerEnv = { 
				dom: host, 
				saveData, 
				getData, 
				clearData, 
				shape: { 
					id: latestShape.id, 
					type: latestShape.type, 
					props: latestShape.props,
					width: latestShape.props?.w ?? 0,
					height: latestShape.props?.h ?? 0,
				}
			}

			try {
				// 新增：同时把 env 作为 alias 注入，方便用户使用 `env` 或 `api` 来访问运行时环境
				const fn = new Function('api', 'env', `'use strict'\n${trimmed}`)
				const result = fn(env, env)
				if (typeof result === 'function') {
					cleanupRef.current = result
				}
				setRuntimeError(null)
				// clear editor diagnostics
				try { codeEditorRef.current?.setDiagnostics?.([]) } catch (e) {}
			} catch (err: any) {
				const msg = err?.message ?? String(err)
				setRuntimeError(msg)
				// try to parse line/col from stack or message to annotate editor
				try {
					const stack = err?.stack || msg || ''
					const match = stack.match(/:(\d+):(\d+)/) || stack.match(/\((\d+):(\d+)\)/) || stack.match(/Line (\d+):(\d+)/)
					if (match) {
						const rawLine = Number(match[1]) || 1
						const rawCol = Number(match[2]) || 1
						const adjLine = Math.max(1, rawLine - 1) // adjust for wrapper ('use strict') line offset
						codeEditorRef.current?.setDiagnosticsFromLineCol?.(adjLine, rawCol, msg)
					} else {
						// fallback: show at top
						codeEditorRef.current?.setDiagnostics?.([{ from: 0, to: 0, severity: 'error', message: msg, source: 'Runtime' }])
					}
				} catch (e) {}
			}
		}, [])

		const persistScript = useCallback((nextScript: string) => {
			scriptRef.current = nextScript
			this.editor.updateShape({ id: shape.id, type: shape.type, props: { ...shapeRef.current.props, script: nextScript } })
			showMessage('脚本已保存')
			// runScript(nextScript)
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
			let extraCompletions: Array<any> = []
			if (editorContainer) {
				editorRoot = createRoot(editorContainer)
				extraCompletions = [
					{ label: `shape.props.w`, type: 'property', detail: String(shape.props.w) },
					{ label: `shape.props.h`, type: 'property', detail: String(shape.props.h) },
					{ label: `shape.props.color`, type: 'property', detail: String(shape.props.color) },
				]
						// 将 shape.props.data (JSON 字符串) 中的键也注入为补全项，便于用户在脚本中直接访问，如 `api.shape.props.data.foo`
						try {
							if (shape.props?.data) {
								const parsedData = typeof shape.props.data === 'string' ? JSON.parse(shape.props.data) : shape.props.data
								if (parsedData && typeof parsedData === 'object') {
									for (const k of Object.keys(parsedData)) {
										extraCompletions.push({ label: `shape.props.data.${k}`, type: 'property', detail: String(typeof parsedData[k]), info: String(parsedData[k]) })
									}
								}
							}
						} catch (err) {
							// ignore parse errors
						}
				editorRoot.render(
					<CodeEditor
						extraCompletions={extraCompletions}
						ref={codeEditorRef as any}
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
									extraCompletions={extraCompletions}
									ref={codeEditorRef as any}
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
			bind('[data-tool="search"]', () => codeEditorRef.current?.openSearch())
			bind('[data-tool="format"]', () => codeEditorRef.current?.formatCode())
			bind('[data-tool="undo"]', () => codeEditorRef.current?.undo())
			bind('[data-tool="redo"]', () => codeEditorRef.current?.redo())

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
					data-js-runtime
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

	// toSvg: WYSIWYG export
	// This method will serialize the runtime DOM (the content created by user scripts) and
	// embed it into the exported SVG as a <foreignObject>, inlining computed styles and
	// embedding assets as data URLs where possible. If serialization fails, falls back to
	// the default static visual (rounded rect with "JS" text).
	override toSvg(shape: IJsShape, ctx: SvgExportContext) {
		const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode })
		const { w, h: hProp, color } = shape.props
		const border = 2
		const radius = 10
		const strokeColor = theme[color].solid
		const fillColor = theme[color].semi
		let serialized = ''

		const innerW = Math.max(w - border * 2, 1)
		const innerH = Math.max(hProp - border * 2, 1)

		const binaryToBase64 = (binary: string) => {
			let base64 = ''
			const chunkSize = 0x6000
			for (let i = 0; i < binary.length; i += chunkSize) {
				const slice = binary.slice(i, i + chunkSize)
				let normalized = ''
				for (let j = 0; j < slice.length; j++) {
					normalized += String.fromCharCode(slice.charCodeAt(j) & 0xff)
				}
				base64 += btoa(normalized)
			}
			return base64
		}

		const assetToDataUrl = (rawSrc: string | null) => {
			if (!rawSrc) return ''
			const trimmed = rawSrc.trim()
			if (!trimmed || /^data:/i.test(trimmed) || /^https?:/i.test(trimmed) || trimmed.startsWith('//')) return trimmed
			let logicalPath = trimmed.replace(/^\.\//, '')
			if (logicalPath.startsWith('/')) logicalPath = logicalPath.slice(1)
			let kernelPath = ''
			if (logicalPath.startsWith('assets/')) kernelPath = `/data/${logicalPath}`
			else if (logicalPath.startsWith('data/')) kernelPath = `/${logicalPath}`
			else if (logicalPath.startsWith('/data/')) kernelPath = logicalPath
			else return trimmed
			try {
				const xhr = new XMLHttpRequest()
				xhr.open('POST', '/api/file/getFile', false)
				xhr.overrideMimeType('text/plain; charset=x-user-defined')
				xhr.setRequestHeader('Content-Type', 'application/json')
				xhr.send(JSON.stringify({ path: kernelPath }))
				if (xhr.status >= 200 && xhr.status < 300 && typeof xhr.responseText === 'string') {
					const base64 = binaryToBase64(xhr.responseText)
					const ext = (logicalPath.split('.').pop() || 'png').toLowerCase()
					const mimeMap: Record<string, string> = {
						png: 'image/png',
						jpg: 'image/jpeg',
						jpeg: 'image/jpeg',
						gif: 'image/gif',
						webp: 'image/webp',
						svg: 'image/svg+xml',
						bmp: 'image/bmp',
						ico: 'image/x-icon',
						avif: 'image/avif',
					}
					const mime = mimeMap[ext] || 'image/png'
					return `data:${mime};base64,${base64}`
				}
			} catch (err) {
				console.warn('Embedding asset failed', err)
			}
			return trimmed
		}

		const serializeContent = () => {
			if (typeof document === 'undefined') return ''
			const host = document.getElementById(shape.id)
			if (!host) return ''
			// Find runtime container we attached on component
			const content = host.querySelector('[data-js-runtime]') as HTMLElement | null
			if (!content) return ''
			const clone = content.cloneNode(true) as HTMLElement

			const inlineComputedStyles = (source: Element, target: Element) => {
				const computed = window.getComputedStyle(source)
				const styleText = Array.from(computed)
					.map((prop) => `${prop}:${computed.getPropertyValue(prop)};`)
					.join('')
				const existing = target.getAttribute('style') || ''
				target.setAttribute('style', `${styleText}${existing}`)
				const sourceChildren = Array.from(source.children)
				const targetChildren = Array.from(target.children)
				for (let i = 0; i < sourceChildren.length; i++) {
					const srcChild = sourceChildren[i]
					const tgtChild = targetChildren[i]
					if (srcChild && tgtChild) {
						inlineComputedStyles(srcChild, tgtChild)
					}
				}
			}

			inlineComputedStyles(content, clone)
			clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'))
			clone.querySelectorAll('[data-node-id]').forEach((el) => el.removeAttribute('data-node-id'))
			clone.querySelectorAll('[data-node-index]').forEach((el) => el.removeAttribute('data-node-index'))
			clone.querySelectorAll('[updated]').forEach((el) => el.removeAttribute('updated'))
			clone.querySelectorAll('[data-realwidth]').forEach((el) => el.removeAttribute('data-realwidth'))
			clone.querySelectorAll('[data-readonly]').forEach((el) => el.removeAttribute('data-readonly'))
			clone.querySelectorAll('*').forEach((node) => {
				if (node instanceof HTMLElement) {
					node.style.setProperty('scrollbar-width', 'none', 'important')
					node.style.setProperty('ms-overflow-style', 'none', 'important')
					node.style.setProperty('overscroll-behavior', 'contain')
				}
			})
			clone.querySelectorAll('img').forEach((img) => {
				const embedded = assetToDataUrl(img.getAttribute('src'))
				if (embedded) {
					img.setAttribute('src', embedded)
					img.removeAttribute('crossorigin')
				}
				const srcset = img.getAttribute('srcset')
				if (srcset) {
					const resolvedSet = srcset
						.split(',')
						.map((entry) => {
							const [url, descriptor] = entry.trim().split(/\s+/, 2)
							const resolved = assetToDataUrl(url)
							return resolved ? (descriptor ? `${resolved} ${descriptor}` : resolved) : ''
						})
						.filter(Boolean)
						.join(', ')
					if (resolvedSet) img.setAttribute('srcset', resolvedSet)
					else img.removeAttribute('srcset')
				}
			})
			clone.querySelectorAll('source').forEach((sourceEl) => {
				const src = sourceEl.getAttribute('src')
				const resolved = assetToDataUrl(src)
				if (resolved) {
					sourceEl.setAttribute('src', resolved)
					sourceEl.removeAttribute('crossorigin')
				}
				const srcset = sourceEl.getAttribute('srcset')
				if (srcset) {
					const resolvedSet = srcset
						.split(',')
						.map((entry) => {
							const [url, descriptor] = entry.trim().split(/\s+/, 2)
							const result = assetToDataUrl(url)
							return result ? (descriptor ? `${result} ${descriptor}` : result) : ''
						})
						.filter(Boolean)
						.join(', ')
					if (resolvedSet) sourceEl.setAttribute('srcset', resolvedSet)
					else sourceEl.removeAttribute('srcset')
				}
			})
			clone.style.width = `${Math.max(innerW, 1)}px`
			clone.style.height = `${Math.max(innerH, 1)}px`
			clone.style.pointerEvents = 'none'
			clone.style.overflow = 'hidden'
			clone.style.boxSizing = 'border-box'
			return clone.outerHTML
		}

		serialized = serializeContent()
		const containerAttrSelector = `[data-sb-id="${shape.id}"]`
		const hideScrollbarStyle = serialized
			? `<style xmlns="http://www.w3.org/1999/xhtml">${containerAttrSelector} *::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}${containerAttrSelector} *::-webkit-scrollbar-thumb{display:none!important;}${containerAttrSelector} *{scrollbar-width:none!important;}</style>`
			: ''

		return (
			<g>
				<rect width={w} height={hProp} fill={fillColor} stroke={strokeColor} strokeWidth={border} rx={radius} ry={radius} />
				{serialized ? (
					<foreignObject x={border} y={border} width={Math.max(innerW, 1)} height={Math.max(innerH, 1)}>
						<div xmlns="http://www.w3.org/1999/xhtml" data-sb-id={shape.id} style={{ width: '100%', height: '100%', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: `${hideScrollbarStyle}${serialized}` }} />
					</foreignObject>
				) : (
					<text x={w / 2} y={hProp / 2} fill={strokeColor} fontSize={Math.max(14, Math.min(w, hProp) * 0.12)} dominantBaseline="middle" textAnchor="middle">
						JS
					</text>
				)}
			</g>
		)
	}
}

