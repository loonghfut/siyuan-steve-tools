export interface ExportProgressOverlay {
	update: (message: string, current?: number, total?: number) => void
	close: () => void
}

let activeOverlay: ExportProgressOverlay | null = null

export function waitForPaint(): Promise<void> {
	if (typeof requestAnimationFrame === 'function') {
		return new Promise((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		})
	}
	return new Promise((resolve) => setTimeout(resolve, 0))
}

export function createExportProgressOverlay(title = '正在导出图片'): ExportProgressOverlay {
	activeOverlay?.close()

	const root = document.createElement('div')
	root.style.cssText = [
		'position:fixed',
		'inset:0',
		'z-index:2147483647',
		'display:flex',
		'align-items:center',
		'justify-content:center',
		'pointer-events:none',
		'background:rgba(16,24,32,0.18)',
	].join(';')

	const panel = document.createElement('div')
	panel.style.cssText = [
		'width:min(360px,calc(100vw - 48px))',
		'border:1px solid rgba(255,255,255,0.18)',
		'border-radius:8px',
		'box-shadow:0 14px 36px rgba(0,0,0,0.28)',
		'background:var(--b3-theme-surface,#fff)',
		'color:var(--b3-theme-on-surface,#1f2933)',
		'font:13px/1.5 var(--b3-font-family,system-ui,sans-serif)',
		'padding:14px 16px 16px',
		'box-sizing:border-box',
	].join(';')

	const label = document.createElement('div')
	label.textContent = title
	label.style.cssText = 'font-weight:600;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'

	const track = document.createElement('div')
	track.style.cssText = 'height:6px;border-radius:999px;background:var(--b3-theme-background,#e5e7eb);overflow:hidden'

	const bar = document.createElement('div')
	bar.style.cssText = [
		'width:0%',
		'height:100%',
		'border-radius:999px',
		'background:var(--b3-theme-primary,#3578e5)',
		'transition:width 160ms ease',
	].join(';')

	const detail = document.createElement('div')
	detail.style.cssText = 'margin-top:8px;color:var(--b3-theme-on-surface-light,#667085);min-height:18px'

	track.appendChild(bar)
	panel.append(label, track, detail)
	root.appendChild(panel)
	document.body.appendChild(root)

	const overlay: ExportProgressOverlay = {
		update(message: string, current = 0, total = 0) {
			label.textContent = message
			const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 8
			bar.style.width = `${percent}%`
			detail.textContent = total > 0 ? `${current}/${total}` : '正在处理...'
		},
		close() {
			root.remove()
			if (activeOverlay === overlay) activeOverlay = null
		},
	}

	activeOverlay = overlay
	overlay.update(title)
	return overlay
}
