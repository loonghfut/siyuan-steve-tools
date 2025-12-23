export const DEFAULT_SCRIPT = `const { dom, saveData, getData, clearData, shape } = api

// 渲染最简 UI
dom.innerHTML = /* html */ \`
<div style="padding:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;line-height:1.6;">
	<h3 style="margin:0 0 8px;">🔧 极简 JS 形状</h3>
	<p style="margin:0 0 12px;">提供 <code>dom</code>、<code>getData()</code>、<code>saveData(data)</code>、<code>clearData()</code> 以及 <code>shape</code>（当前形状快照，包含 <code>width</code> 与 <code>height</code>）。</p>
	<div id="out" style="margin:0 8px 8px;color:#334155;"></div>
	<div style="display:flex;gap:8px;">
		<button id="save">保存时间戳</button>
		<button id="clear">清空已保存数据</button>
	</div>
</div>
\`

// 绑定事件：阻止事件冒泡，避免影响画布拖拽/选择
const out = dom.querySelector('#out')
const btn = dom.querySelector('#save')
const btnClear = dom.querySelector('#clear')
const curr = getData() || {}
// 形状基本信息（只读快照）
console.debug('当前形状信息', shape)
// 显示宽高
if (out && shape) {
	out.textContent = 'shape: ' + shape.id + ' - ' + shape.type + ' (' + shape.width + 'x' + shape.height + ')'
}
const keys = curr && typeof curr === 'object' ? Object.keys(curr) : []
if (out) out.textContent = '当前保存的数据键：' + (keys.length ? keys.join(', ') : '(空)')
btn?.addEventListener('pointerdown', (e) => {
	e.stopPropagation()
	// 将任意 JSON 数据保存到形状 props.data
	const value = { lastSavedAt: Date.now() }
	saveData(value)
	const next = getData() || {}
	const nextKeys = next && typeof next === 'object' ? Object.keys(next) : []
	if (out) out.textContent = '当前保存的数据键：' + (nextKeys.length ? nextKeys.join(', ') : '(空)')
})
btnClear?.addEventListener('pointerdown', (e) => {
	e.stopPropagation()
	clearData()
	if (out) out.textContent = '当前保存的数据键：(空)'
})
`;export const PLACEHOLDER_HTML = `
<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;color:#94a3b8;font-size:14px;">
	使用画布悬浮的 JS 按钮打开脚本编辑器
</div>
`
export type ScriptRunnerEnv = {
	dom: HTMLDivElement
	saveData: (data: any) => void
	getData: () => any
	clearData: () => void
	shape: {
		id: string
		type: string
		props: any
		width: number
		height: number
	}
}
export function createEditorDialogContent(): string {
	return `
<style>
	.st-js-editor {
		display: flex;
		flex-direction: column;
		height: 98%;
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
	
	.st-js-editor__tool-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 6px;
		background: var(--b3-theme-background);
		border: 1px solid var(--b3-border-color);
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 16px;
	}
	
	.st-js-editor__tool-btn:hover {
		background: var(--b3-theme-surface);
		border-color: var(--b3-theme-primary);
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}
	
	.st-js-editor__tool-btn:active {
		transform: translateY(0);
	}
	
	.st-js-editor__tool-btn svg {
		width: 18px;
		height: 18px;
		fill: var(--b3-theme-on-background);
		opacity: 0.75;
		transition: opacity 0.2s ease;
	}
	
	.st-js-editor__tool-btn:hover svg {
		opacity: 1;
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
					<div style="display: flex; gap: 6px;">
						<button class="st-js-editor__tool-btn" data-tool="search" title="搜索 (Ctrl+F)">
							<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
						</button>
						<button class="st-js-editor__tool-btn" data-tool="format" title="格式化代码 (Shift+Alt+F)">
							<svg viewBox="0 0 24 24"><path d="M3 3v18h18V3H3zm16 16H5V5h14v14zM11 7h2v2h-2V7zm0 4h2v6h-2v-6z"/></svg>
						</button>
						<button class="st-js-editor__tool-btn" data-tool="undo" title="撤销 (Ctrl+Z)">
							<svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
						</button>
						<button class="st-js-editor__tool-btn" data-tool="redo" title="重做 (Ctrl+Y)">
							<svg viewBox="0 0 24 24"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>
						</button>
					</div>
				</div>
				<div class="st-js-editor__actions">
					<button class="b3-button b3-button--primary" data-action="save" title="Ctrl+S">
						<span>💾 保存</span>
					</button>
					<button class="b3-button b3-button--outline" data-action="restore" title="恢复为默认示例脚本">
						<span>🔄 重置</span>
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
				<dd>
					当前 JS 形状内部的根 DOM 容器（<code>HTMLDivElement</code>）。
					你可以通过 <code>dom.innerHTML = '&lt;div&gt;...&lt;/div&gt;'</code> 渲染自定义 UI，并在其下挂载事件。
					如需响应点击 / 拖拽等交互，请在事件中调用 <code>event.stopPropagation()</code>，以避免影响画布拖拽与选择。
				</dd>
				<dt>getData()</dt>
				<dd>
					从当前形状的 <code>props.data</code> 中读取已保存的 JSON 数据，并返回解析后的对象；若没有数据或解析失败则返回 <code>null</code>。
					通常用法：<code>const state = getData() || {}</code>，用于恢复上一次运行时保存的状态。
				</dd>
				<dt>saveData(data)</dt>
				<dd>
					将任意 JSON 数据写入当前形状的 <code>props.data</code>，并与已有对象进行浅合并：
					<code>{ ...old, ...data }</code>。
					这意味着你可以多次调用 <code>saveData</code> 增量更新，例如：
					<code>saveData({ count: 1 })</code>、<code>saveData({ text: 'hello' })</code>，最终会合并保存。
				</dd>
				<dt>clearData()</dt>
				<dd>
					清空当前形状已保存的数据，将 <code>props.data</code> 重置为 <code>{}</code>。
					通常用于「重置」功能，例如清空计数器或配置。
				</dd>
				<dt>shape</dt>
				<dd>
					当前形状的只读快照：包含 <code>id</code>、<code>type</code>、<code>props</code>、以及 <code>width</code> 与 <code>height</code>（运行脚本时的静态拷贝）。
					如果需要修改脚本状态请使用 <code>saveData()</code> 持久化；不要直接尝试修改 <code>shape.props</code>，该对象不会被自动写回。
				</dd>
			</dl>
			<p class="st-js-editor__hint" style="margin-top: 16px; font-size: 11px;">
				运行逻辑：每次保存/重新运行脚本时，系统会先清空 <code>dom</code>，然后重新执行脚本；若脚本返回一个函数，该函数会在下次运行前或形状销毁时被调用，用于清理定时器、全局事件等。
			</p>
		</aside>
	</div>
	<div class="st-js-editor__hint">
		DOM 元素默认阻止画布拖拽。若需响应交互，请在事件处理中调用 <code>event.stopPropagation()</code>。使用 <strong>Ctrl+S</strong> 快速保存并运行脚本。
	</div>
</div>`
}

