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
import { IJsShape } from './js-shape-types'
import { jsShapeProps } from './js-shape-props'
import { jsShapeMigrations } from './js-shape-migrations'

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
			const ensureTextareaSync = (textarea: HTMLTextAreaElement | null) => {
				if (textarea) {
					textarea.value = scriptRef.current ?? ''
					textarea.focus()
				}
			}
			if (existingDialog) {
				ensureTextareaSync(existingDialog.element?.querySelector('textarea') as HTMLTextAreaElement | null)
				return
			}

			const cleanupListeners: Array<() => void> = []
			const dialog = new Dialog({
				title: 'JS 形状脚本编辑器',
				content: `
<style>
	.st-js-editor{display:flex;flex-direction:column;height:100%;gap:12px;font-size:13px;color:var(--b3-theme-on-background);}
	.st-js-editor__body{display:flex;flex:1 1 auto;gap:12px;min-height:0;}
	.st-js-editor__workspace{flex:2 1 0;display:flex;flex-direction:column;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-surface);}
	.st-js-editor__workspace header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--b3-border-color);font-size:12px;}
	.st-js-editor__textarea{flex:1 1 auto;width:100%;border:none;outline:none;padding:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:var(--b3-theme-background);color:var(--b3-theme-on-background);resize:none;min-height:160px;}
	.st-js-editor__toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
	.st-js-editor__chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:var(--b3-theme-background);border:1px solid var(--b3-border-color);}
	.st-js-editor__aside{flex:1 1 0;min-width:220px;border:1px solid var(--b3-border-color);border-radius:8px;padding:12px;overflow:auto;background:var(--b3-theme-background);}
	.st-js-editor__aside h4{margin:0 0 8px;font-size:13px;color:var(--b3-theme-on-surface);}
	.st-js-editor__aside dl{margin:0;display:flex;flex-direction:column;gap:10px;}
	.st-js-editor__aside dt{font-weight:600;}
	.st-js-editor__aside dd{margin:4px 0 0;opacity:0.85;line-height:1.4;}
	.st-js-editor__actions{display:flex;gap:8px;flex-wrap:wrap;}
	.st-js-editor__hint{font-size:12px;opacity:0.8;}
</style>
<div class="st-js-editor">
	<div class="st-js-editor__body">
		<section class="st-js-editor__workspace">
			<header>
				<div class="st-js-editor__toolbar">
					<label class="st-js-editor__chip"><input type="checkbox" data-setting="interactive"/> 允许交互</label>
				</div>
				<div class="st-js-editor__actions">
					<button class="b3-button" data-action="save">保存并运行</button>
					<button class="b3-button b3-button--outline" data-action="restore">恢复示例</button>
					<button class="b3-button b3-button--ghost" data-action="close">关闭</button>
				</div>
			</header>
			<textarea class="st-js-editor__textarea" spellcheck="false"></textarea>
		</section>
		<aside class="st-js-editor__aside">
			<h4>API 参考</h4>
			<dl>
				<dt>dom</dt><dd>挂载容器，直接操作其内部 DOM。默认阻止画布拖拽，若需要可在事件中调用 event.stopPropagation()。</dd>
				<dt>shape</dt><dd>当前 TL 形状数据，可读取 props（宽高、颜色、脚本配置等）。</dd>
				<dt>state / setState(next)</dt><dd>保存本地状态。setState 支持函数与部分更新，更新后会自动重跑脚本。</dd>
				<dt>invalidate()</dt><dd>手动请求重新执行脚本（例如异步结果返回后）。</dd>
				<dt>editor</dt><dd>TL Editor 实例，可用于定位、选择其他形状（慎用 mutating API）。</dd>
				<dt>signal</dt><dd>AbortSignal，当脚本被重新运行或形状销毁时自动触发，适合清理异步任务。</dd>
				<dt>console / fetch</dt><dd>浏览器原生 console 与 fetch。</dd>
				<dt>requestAnimationFrame / cancelAnimationFrame</dt><dd>封装后的 RAF，脚本结束或被刷新时会统一清理。</dd>
			</dl>
			<p class="st-js-editor__hint">更完整示例见 docs/js-shape-api.md，或在脚本中打印 api 查看可用字段。</p>
		</aside>
	</div>
	<div class="st-js-editor__hint">提示：若需要 DOM 元素响应点击且不触发画布拖拽，请在事件中手动调用 event.stopPropagation()。</div>
</div>`,
				width: '820px',
				height: '560px',
				destroyCallback: () => {
					cleanupListeners.forEach((dispose) => dispose())
					dialogRef.current = null
				},
			})
			dialogRef.current = dialog

			const textarea = dialog.element.querySelector('textarea') as HTMLTextAreaElement | null
			ensureTextareaSync(textarea)

			const saveHandler = () => persistScript(textarea?.value ?? '')
			const restoreHandler = () => {
				if (textarea) textarea.value = DEFAULT_SCRIPT
				persistScript(DEFAULT_SCRIPT)
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

			// autoRun control removed; scripts are run on save or manual rerun

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

			const keyHandler = (event: KeyboardEvent) => {
				if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
					event.preventDefault()
					saveHandler()
				}
			}
			dialog.element.addEventListener('keydown', keyHandler)
			cleanupListeners.push(() => dialog.element.removeEventListener('keydown', keyHandler))
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
