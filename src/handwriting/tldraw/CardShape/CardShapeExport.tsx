/**
 * CardShape export.
 *
 * The visible card body may be scrolled. Export the current DOM viewport instead
 * of rebuilding Protyle HTML from block data, otherwise image export drifts away
 * from what the user sees on the canvas.
 */
import React, { ReactElement } from 'react'
import { SvgExportContext } from '@tldraw/tldraw'
import { ICardShape } from './card-shape-types'
import { settingdata } from '@/index'
import { getDefaultColorTheme } from '../utils/color-theme'
import { getShapeHostElement } from '../utils/getShapeHostElement'
import { getCachedSvgExportSnapshot, getSvgExportGlobalStyles, serializeElementForSvgExport } from '../utils/export-dom-snapshot'

function resolveBodyBackgroundColor(root?: ParentNode): string {
	if (typeof window === 'undefined') return '#fff'

	const candidates: Array<Element | null | undefined> = []
	if (root instanceof Document) {
		candidates.push(root.documentElement, root.body)
	} else if (root instanceof Element) {
		candidates.push(root)
	}
	candidates.push(document.body, document.documentElement)

	for (const candidate of candidates) {
		if (!candidate) continue
		const styles = window.getComputedStyle(candidate)
		const value = styles.getPropertyValue('--b3-body-background').trim()
			|| styles.getPropertyValue('--b3-theme-background').trim()
		if (value) return value
	}

	return 'var(--b3-body-background, var(--b3-theme-background, #fff))'
}

function getCardContentSource(shape: ICardShape, isCollapsed: boolean, root?: ParentNode): HTMLElement | null {
	if (typeof document === 'undefined') return null

	const host = getShapeHostElement(shape.id, root)
	if (!host) return null

	const content = host.querySelector('[blockid]') as HTMLElement | null
	if (!content) return null

	if (!isCollapsed) return content

	const collapsedContent = content.querySelector(':scope > .card-shape-collapsed-content') as HTMLElement | null
	return collapsedContent || content
}

export function exportCardShapeToSvg(shape: ICardShape, ctx: SvgExportContext, root?: ParentNode): ReactElement | null {
	const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode })
	const { w, h, color, fontSize = 16, blockId, isCollapsed } = shape.props
	const bodyBackground = resolveBodyBackgroundColor(root)

	const borderWidth = 3
	const radius = 10
	const strokeColor = theme[color].solid
	const fillColor = theme[color].semi
	const showBorder = settingdata["showCardBorder"] !== false
	const drawnBorderWidth = showBorder ? borderWidth : 0
	const contentWidth = Math.max(w - drawnBorderWidth * 2, 1)
	const contentHeight = Math.max(h - drawnBorderWidth * 2, 1)
	const clipId = `clip-${shape.id}`
	const scopeId = `st-card-export-${shape.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

	const cachedSnapshot = getCachedSvgExportSnapshot(shape.id)
	const source = cachedSnapshot === null ? getCardContentSource(shape, !!isCollapsed, root) : null
	const serialized = cachedSnapshot ?? (source
		? serializeElementForSvgExport(source, {
			viewportWidth: contentWidth,
			viewportHeight: contentHeight,
			fontSize: isCollapsed ? undefined : fontSize,
		})
		: '')

	const placeholder = (
		<text
			x={w / 2}
			y={h / 2}
			fill={strokeColor}
			fontSize={Math.min(fontSize * 0.9, 16)}
			dominantBaseline="middle"
			textAnchor="middle"
		>
			{blockId ? `Block ${blockId.slice(-6)}` : 'Card'}
		</text>
	)

	return (
		<g>
			<rect
				width={w}
				height={h}
				fill={fillColor}
				stroke={strokeColor}
				strokeWidth={drawnBorderWidth}
				rx={radius}
				ry={radius}
			/>
			{drawnBorderWidth > 0 ? (
				<rect
					x={drawnBorderWidth}
					y={drawnBorderWidth}
					width={Math.max(w - drawnBorderWidth * 2, 1)}
					height={Math.max(h - drawnBorderWidth * 2, 1)}
					fill="none"
					stroke={bodyBackground}
					strokeWidth={1}
					rx={Math.max(radius - drawnBorderWidth, 0)}
					ry={Math.max(radius - drawnBorderWidth, 0)}
				/>
			) : null}
			<defs>
				<clipPath id={clipId}>
					<rect
						x={drawnBorderWidth}
						y={drawnBorderWidth}
						width={contentWidth}
						height={contentHeight}
						rx={Math.max(radius - drawnBorderWidth, 0)}
						ry={Math.max(radius - drawnBorderWidth, 0)}
					/>
				</clipPath>
			</defs>
			{serialized ? (
				<foreignObject
					x={drawnBorderWidth}
					y={drawnBorderWidth}
					width={contentWidth}
					height={contentHeight}
					clipPath={`url(#${clipId})`}
				>
					<div
						xmlns="http://www.w3.org/1999/xhtml"
						id={scopeId}
						style={{
							width: '100%',
							height: '100%',
							overflow: 'hidden',
							backgroundColor: 'transparent',
							color: strokeColor,
						}}
						dangerouslySetInnerHTML={{ __html: `${getSvgExportGlobalStyles(`#${scopeId}`)}${serialized}` }}
					/>
				</foreignObject>
			) : (
				placeholder
			)}
		</g>
	)
}
