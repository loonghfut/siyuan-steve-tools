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
import { CodeEditor } from './CodeEditor'

const DEFAULT_SCRIPT = `const { dom, shape, state, setState } = api

// 初始化状态（第一次运行时设置），注意：我们不在这里 return，以便在首个运行期也能绑定事件
if (state.clicks == null) {
	setState({ clicks: 0 })
}

dom.innerHTML = /* html */ \`
<style>
	#wrap {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
		padding: 12px;
		line-height: 1.5;
	}
</style>
<div id="wrap">
	<h3 style="margin: 0 0 8px;">🔧 自定义 JS 形状</h3>
	<p style="margin: 0;">当前尺寸：\${Math.round(shape.props.w)} × \${Math.round(shape.props.h)}</p>
	<p style="margin: 12px 0 0;">按钮被点击了 \${state.clicks} 次。</p>
	<button id="inc">+1</button>
</div>
\`

// 绑定事件：使用 pointerdown 并 stopPropagation 避免触发画布拖拽
const _bind = () => {
	const btn = dom.querySelector('#inc')
	if (!btn) return
	btn.addEventListener('pointerdown', (e) => {
		e.stopPropagation()
		console.log('js-shape pointerdown')
		setState(prev => ({ ...prev, clicks: (prev.clicks ?? 0) + 1 }))
	})
	// 兼容 click 事件
	btn.addEventListener('click', (e) => {
		e.stopPropagation()
		console.log('js-shape click')
		setState(prev => ({ ...prev, clicks: (prev.clicks ?? 0) + 1 }))
	})
}
_bind()
// 在 DOM 变化时也尝试重新绑定（防止脚本中异步更新覆盖 DOM）
const mutationObserver = new MutationObserver(() => _bind())
mutationObserver.observe(dom, { childList: true, subtree: true })
// 返回清理函数，框架将在重新执行或销毁时调用
return () => {
	mutationObserver.disconnect()
}
// 若脚本不是模块式返回（旧示例），cleanup 也会在下一次 run 时被覆盖并执行
`

const PLACEHOLDER_HTML = `
<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;color:#94a3b8;font-size:14px;">
	使用画布悬浮的 JS 按钮打开脚本编辑器
</div>
`

type ScriptRunnerEnv = {
	dom: HTMLDivElement
	shape: IJsShape
	state: any
	setState: (next: any) => void
	invalidate: () => void
	editor: ShapeUtil<IJsShape>['editor']
	signal: AbortSignal
	console: Console
	fetch: typeof fetch
	requestAnimationFrame: typeof requestAnimationFrame
	cancelAnimationFrame: typeof cancelAnimationFrame
}

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
		const [runToken, setRunToken] = useState(0)
		const [runtimeError, setRuntimeError] = useState<string | null>(null)
		const runtimeRef = useRef<HTMLDivElement>(null)
		const abortRef = useRef<AbortController | null>(null)
		const cleanupRef = useRef<(() => void) | null>(null)
		const rafIdsRef = useRef<Set<number>>(new Set())
		const stateRef = useRef<any>({})
		const scriptRef = useRef(shape.props.script)
		const shapeRef = useRef(shape)
		const dialogRef = useRef<Dialog | null>(null)
		// Auto-run is deprecated. Scripts will be executed when saved, or when user manually requests rerun.
		const interactiveEnabled = shape.props.interactive === true

		useEffect(() => {
			shapeRef.current = shape
		}, [shape])

		useEffect(() => {
			scriptRef.current = shape.props.script
		}, [shape.props.script])

		const requestRun = useCallback(() => {
			setRunToken((token) => token + 1)
		}, [])

		// no automatic run on prop change; scripts are executed on save or manual rerun

		useEffect(() => {
			return () => {
				cleanupRef.current?.()
				cleanupRef.current = null
				abortRef.current?.abort()
				abortRef.current = null
				rafIdsRef.current.forEach((id) => cancelAnimationFrame(id))
				rafIdsRef.current.clear()
			}
		}, [])

		const applySetState = useCallback(
			(nextState: any) => {
				const prev = stateRef.current
				let resolved = typeof nextState === 'function' ? nextState(prev) : nextState
				if (resolved === undefined) return
				if (resolved && typeof resolved === 'object' && !Array.isArray(resolved) && typeof prev === 'object' && prev !== null) {
					resolved = { ...prev, ...resolved }
				}
				stateRef.current = resolved
				requestRun()
			},
			[requestRun]
		)

		const runScript = useCallback(
			(source: string) => {
				const currentShape = shapeRef.current
				if (!currentShape) return
				const host = runtimeRef.current
				if (!host) return

				abortRef.current?.abort()
				abortRef.current = new AbortController()
				cleanupRef.current?.()
				cleanupRef.current = null
				rafIdsRef.current.forEach((id) => cancelAnimationFrame(id))
				rafIdsRef.current.clear()
				host.replaceChildren()

				const trimmed = source?.trim()
				if (!trimmed) {
					host.innerHTML = PLACEHOLDER_HTML
					setRuntimeError(null)
					return
				}

				const env: ScriptRunnerEnv = {
					dom: host,
					shape: currentShape,
					state: stateRef.current,
					setState: applySetState,
					invalidate: requestRun,
					editor: this.editor,
					signal: abortRef.current.signal,
					console,
					fetch,
					requestAnimationFrame: (cb) => {
						const id = requestAnimationFrame(cb)
						rafIdsRef.current.add(id)
						return id
					},
					cancelAnimationFrame: (id) => {
						rafIdsRef.current.delete(id)
						cancelAnimationFrame(id)
					},
				}

				try {
					const fn = new Function('api', `'use strict'\n${trimmed}`)
					const result = fn(env)
					const assignCleanup = (value: any) => {
						if (typeof value === 'function') {
							cleanupRef.current = value
						}
					}
					if (result && typeof (result as Promise<unknown>).then === 'function') {
						;(result as Promise<any>)
							.then(assignCleanup)
							.catch((err) => {
								console.error(err)
								setRuntimeError(err instanceof Error ? err.message : String(err))
							})
					} else {
						assignCleanup(result)
					}
					setRuntimeError(null)
				} catch (err: any) {
					setRuntimeError(err?.message ?? String(err))
				}
			},
			[applySetState, requestRun]
		)

		useEffect(() => {
			runScript(scriptRef.current ?? '')
		}, [runToken, runScript])

		const persistScript = useCallback(
			(nextScript: string) => {
				scriptRef.current = nextScript
				this.editor.updateShape({
					id: shape.id,
					type: shape.type,
					props: { ...shapeRef.current.props, script: nextScript },
				})
				showMessage('脚本已保存并运行')
				requestRun()
			},
			[requestRun, shape.id, shape.type]
		)

		const openScriptEditor = useCallback(() => {
			const existingDialog = dialogRef.current
			const latestShape = (this.editor.getShape(shape.id) as IJsShape | undefined) ?? shapeRef.current
			const latestProps = latestShape.props
			
			if (existingDialog) {
				// 如果对话框已存在，聚焦即可
				return
			}

			let currentCode = scriptRef.current ?? ''
			let editorRoot: ReturnType<typeof createRoot> | null = null
			const cleanupListeners: Array<() => void> = []
			
			const dialog = new Dialog({
				title: '📝 JavaScript 脚本编辑器',
				content: `
<style>
	.st-js-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 16px;
		font-size: 13px;
		color: var(--b3-theme-on-background);
		padding: 4px;
	}
	
	.st-js-editor__body {
		display: flex;
		flex: 1 1 auto;
		gap: 16px;
		min-height: 0;
	}
	
	.st-js-editor__workspace {
		flex: 2 1 0;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--b3-border-color);
		border-radius: 12px;
		background: var(--b3-theme-surface);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
		overflow: hidden;
	}
	
	.st-js-editor__workspace header {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: linear-gradient(to bottom, var(--b3-theme-surface), var(--b3-theme-background));
		border-bottom: 1px solid var(--b3-border-color);
		font-size: 12px;
	}
	
	.st-js-editor__editor-container {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		background: var(--b3-theme-background);
	}
	
	.st-js-editor__toolbar {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
	}
	
	.st-js-editor__chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 6px;
		background: var(--b3-theme-background);
		border: 1px solid var(--b3-border-color);
		font-size: 12px;
		font-weight: 500;
		transition: all 0.2s ease;
		cursor: pointer;
		user-select: none;
	}
	
	.st-js-editor__chip:hover {
		background: var(--b3-theme-surface);
		border-color: var(--b3-theme-primary);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}
	
	.st-js-editor__chip input[type="checkbox"] {
		margin: 0;
		cursor: pointer;
	}
	
	.st-js-editor__chip input[type="checkbox"]:checked {
		accent-color: var(--b3-theme-primary);
	}
	
	.st-js-editor__aside {
		flex: 1 1 0;
		min-width: 260px;
		max-width: 320px;
		border: 1px solid var(--b3-border-color);
		border-radius: 12px;
		padding: 16px;
		overflow: auto;
		background: var(--b3-theme-surface);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
	}
	
	.st-js-editor__aside h4 {
		margin: 0 0 12px;
		font-size: 14px;
		font-weight: 600;
		color: var(--b3-theme-on-surface);
		display: flex;
		align-items: center;
		gap: 6px;
	}
	
	.st-js-editor__aside h4::before {
		content: "📚";
		font-size: 16px;
	}
	
	.st-js-editor__aside dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	
	.st-js-editor__aside dt {
		font-weight: 600;
		font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
		color: var(--b3-theme-primary);
		font-size: 12px;
		background: var(--b3-theme-background);
		padding: 4px 8px;
		border-radius: 4px;
		display: inline-block;
		width: fit-content;
	}
	
	.st-js-editor__aside dd {
		margin: 6px 0 0;
		opacity: 0.85;
		line-height: 1.6;
		font-size: 12px;
	}
	
	.st-js-editor__actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	
	.st-js-editor__actions .b3-button {
		font-size: 12px;
		font-weight: 500;
		padding: 6px 14px;
		border-radius: 6px;
		transition: all 0.2s ease;
	}
	
	.st-js-editor__actions .b3-button:hover {
		transform: translateY(-1px);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
	}
	
	.st-js-editor__actions .b3-button:active {
		transform: translateY(0);
	}
	
	.st-js-editor__hint {
		font-size: 12px;
		opacity: 0.7;
		line-height: 1.5;
		padding: 8px 12px;
		background: var(--b3-theme-surface);
		border-radius: 8px;
		border-left: 3px solid var(--b3-theme-primary-lighter);
	}
	
	.st-js-editor__hint::before {
		content: "💡 ";
	}
	
	/* 滚动条美化 */
	.st-js-editor__aside::-webkit-scrollbar {
		width: 6px;
	}
	
	.st-js-editor__aside::-webkit-scrollbar-track {
		background: transparent;
	}
	
	.st-js-editor__aside::-webkit-scrollbar-thumb {
		background: var(--b3-border-color);
		border-radius: 3px;
	}
	
	.st-js-editor__aside::-webkit-scrollbar-thumb:hover {
		background: var(--b3-theme-primary-lighter);
	}
</style>
<div class="st-js-editor">
	<div class="st-js-editor__body">
		<section class="st-js-editor__workspace">
			<header>
				<div class="st-js-editor__toolbar">
					<label class="st-js-editor__chip" title="启用后允许与脚本生成的 UI 交互">
						<input type="checkbox" data-setting="interactive"/>
						<span>允许交互</span>
					</label>
				</div>
				<div class="st-js-editor__actions">
					<button class="b3-button b3-button--primary" data-action="save" title="Ctrl+S">
						<span>💾 保存并运行</span>
					</button>
					<button class="b3-button b3-button--outline" data-action="restore" title="恢复为默认示例脚本">
						<span>🔄 恢复示例</span>
					</button>
					<button class="b3-button b3-button--text" data-action="close">
						<span>✕ 关闭</span>
					</button>
				</div>
			</header>
			<div class="st-js-editor__editor-container" data-editor-mount></div>
		</section>
		<aside class="st-js-editor__aside">
			<h4>API 参考</h4>
			<dl>
				<dt>dom</dt>
				<dd>挂载容器，可直接操作其内部 DOM。默认阻止画布拖拽，若需响应事件可调用 <code>event.stopPropagation()</code>。</dd>
				
				<dt>shape</dt>
				<dd>当前 TLDraw 形状数据对象，包含 props（宽高、颜色、脚本配置等）属性。</dd>
				
				<dt>state / setState</dt>
				<dd>本地状态管理。<code>setState(next)</code> 支持函数式更新，触发后自动重新执行脚本。</dd>
				
				<dt>invalidate()</dt>
				<dd>手动请求重新执行脚本，适用于异步操作完成后需要更新 UI 的场景。</dd>
				
				<dt>editor</dt>
				<dd>TLDraw Editor 实例，可用于操作画布、选择其他形状（慎用可变 API）。</dd>
				
				<dt>signal</dt>
				<dd>AbortSignal 对象，脚本重跑或形状销毁时自动触发，用于清理异步任务。</dd>
				
				<dt>console / fetch</dt>
				<dd>浏览器原生 API，可用于调试输出和网络请求。</dd>
				
				<dt>requestAnimationFrame</dt>
				<dd>封装的动画帧请求函数，脚本结束时自动清理，避免内存泄漏。</dd>
			</dl>
			<p class="st-js-editor__hint" style="margin-top: 16px; font-size: 11px;">
				更多示例和详细文档请参考 <strong>docs/js-shape-api.md</strong>
			</p>
		</aside>
	</div>
	<div class="st-js-editor__hint">
		DOM 元素默认阻止画布拖拽。若需响应交互，请在事件处理中调用 <code>event.stopPropagation()</code>。使用 <strong>Ctrl+S</strong> 快速保存并运行脚本。
	</div>
</div>`,
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

			// 删除了 keyHandler，因为 CodeEditor 内部已经处理了 Ctrl+S

			const interactiveToggle = dialog.element.querySelector('[data-setting="interactive"]') as HTMLInputElement | null
			if (interactiveToggle) {
				interactiveToggle.checked = latestProps.interactive === true
				const handler = (event: Event) => {
					const target = event.currentTarget as HTMLInputElement
					this.editor.updateShape({
						id: latestShape.id,
						type: latestShape.type,
						props: { ...((this.editor.getShape(latestShape.id) as IJsShape)?.props ?? latestProps), interactive: target.checked },
					})
				}
				interactiveToggle.addEventListener('change', handler)
				cleanupListeners.push(() => interactiveToggle.removeEventListener('change', handler))
			}
		}, [persistScript, requestRun, shape.id])

		useEffect(() => {
			const off = this.editor.on('sttools:editJsShape', (targetId?: string) => {
				if (!targetId || targetId === shape.id) {
					openScriptEditor()
				}
			})
			return off
		}, [openScriptEditor, shape.id])

		useEffect(() => {
			const off = this.editor.on('sttools:rerunJsShape', (targetId?: string) => {
				if (!targetId || targetId === shape.id) {
					requestRun()
				}
			})
			return off
		}, [requestRun, shape.id])

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
						flex: '1 1 auto',
						background: '#fff',
						color: '#0f172a',
						overflow: 'auto',
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
