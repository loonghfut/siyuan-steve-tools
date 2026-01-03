import React from 'react'
import { stopEventPropagation, track, useEditor, useValue } from '@tldraw/tldraw'
import { setSlideFocusMode, useCurrentSlide, useSlideFocusMode } from './useSlides'

function clamp(n: number, min: number, max: number) {
	return Math.min(max, Math.max(min, n))
}

export const SlideFocusOverlay = track(() => {
	const editor = useEditor()
	const currentSlide = useCurrentSlide()
	const isFocus = useSlideFocusMode()
	const exitFocus = React.useCallback(() => setSlideFocusMode(false), [])

	// If focus is enabled but we have no current slide, disable focus.
	React.useEffect(() => {
		if (isFocus && !currentSlide) setSlideFocusMode(false)
	}, [isFocus, currentSlide])

	const overlay = useValue(
		'slide focus overlay bounds',
		() => {
			if (!isFocus || !currentSlide) return null

			const slideBounds = editor.getShapePageBounds(currentSlide.id)
			if (!slideBounds) return null

			const screenBounds = editor.getViewportScreenBounds()
			const topLeft = editor.pageToScreen({ x: slideBounds.x, y: slideBounds.y })
			const zoom = editor.getZoomLevel()

			const x = topLeft.x - screenBounds.x
			const y = topLeft.y - screenBounds.y
			const w = slideBounds.width * zoom
			const h = slideBounds.height * zoom

			// Clamp to viewport so the masks behave even when slide is partially off-screen
			const clampedX = clamp(x, -100000, screenBounds.width + 100000)
			const clampedY = clamp(y, -100000, screenBounds.height + 100000)
			const clampedW = clamp(w, 0, 200000)
			const clampedH = clamp(h, 0, 200000)

			return {
				viewportW: screenBounds.width,
				viewportH: screenBounds.height,
				x: clampedX,
				y: clampedY,
				w: clampedW,
				h: clampedH,
			}
		},
		[editor, isFocus, currentSlide?.id]
	)

	React.useEffect(() => {
		if (!isFocus) return
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setSlideFocusMode(false)
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [isFocus])

	if (!overlay) return null

	const { viewportW, viewportH, x, y, w, h } = overlay

	// Masks (outside the slide)
	const topH = Math.max(0, y)
	const bottomY = y + h
	const bottomH = Math.max(0, viewportH - bottomY)
	const leftW = Math.max(0, x)
	const rightX = x + w
	const rightW = Math.max(0, viewportW - rightX)

	const maskStyleBase: React.CSSProperties = {
		position: 'absolute',
		background: 'var(--b3-theme-background, var(--color-background))',
		pointerEvents: 'all',
	}

	const stop = stopEventPropagation

	return (
		<div
			className="slide-focus-overlay"
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				width: '100%',
				height: '100%',
				zIndex: 200,
				pointerEvents: 'none',
			}}
		>
			{/* top */}
			<div
				className="slide-focus-mask"
				style={{ ...maskStyleBase, left: 0, top: 0, width: '100%', height: topH }}
				onPointerDown={(e) => {
					stop(e)
					exitFocus()
				}}
				onPointerMove={stop}
				onPointerUp={stop}
				onWheel={stop as any}
			/>
			{/* bottom */}
			<div
				className="slide-focus-mask"
				style={{ ...maskStyleBase, left: 0, top: bottomY, width: '100%', height: bottomH }}
				onPointerDown={(e) => {
					stop(e)
					exitFocus()
				}}
				onPointerMove={stop}
				onPointerUp={stop}
				onWheel={stop as any}
			/>
			{/* left */}
			<div
				className="slide-focus-mask"
				style={{ ...maskStyleBase, left: 0, top: y, width: leftW, height: h }}
				onPointerDown={(e) => {
					stop(e)
					exitFocus()
				}}
				onPointerMove={stop}
				onPointerUp={stop}
				onWheel={stop as any}
			/>
			{/* right */}
			<div
					onPointerDown={(e) => {
						stopEventPropagation(e)
						exitFocus()
					}}
				style={{ ...maskStyleBase, left: rightX, top: y, width: rightW, height: h }}
			/>
						onPointerDown={(e) => {
							stop(e)
							exitFocus()
						}}
			{/* outline (optional visual cue) */}
			<div
				className="slide-focus-outline"
				style={{
					position: 'absolute',
					left: x,
					top: y,
					width: w,
					height: h,
					boxShadow: '0 0 0 2px rgba(0, 0, 0, 0.08)',
					border: '1px solid rgba(0, 0, 0, 0.18)',
					pointerEvents: 'none',
				}}
			/>
		</div>
	)
})
