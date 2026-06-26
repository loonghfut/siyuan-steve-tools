/**
 * Branch shape style panel section
 */
import React from 'react'
import { Editor, TldrawUiButton, TldrawUiSlider } from '@tldraw/tldraw'
import type { IBranchShape } from './branch-shape-types'
import { detachBranchCompletely, layoutBranchChildren } from './branch-layout'

export interface BranchStyleSectionProps {
	editor: Editor
	selectedBranchShapes: IBranchShape[]
}

export const BranchStyleSection: React.FC<BranchStyleSectionProps> = ({
	editor,
	selectedBranchShapes,
}) => {
	const hasBranchSelection = selectedBranchShapes.length > 0

	const lineWidthState = React.useMemo<number | 'mixed'>(() => {
		if (!hasBranchSelection) return 3
		const values = selectedBranchShapes.map((shape) => shape.props.lineWidth || 3)
		const first = values[0]
		return values.every((value) => value === first) ? first : 'mixed'
	}, [hasBranchSelection, selectedBranchShapes])

	const horizontalGapState = React.useMemo<number | 'mixed'>(() => {
		if (!hasBranchSelection) return 96
		const values = selectedBranchShapes.map((shape) => shape.props.horizontalGap || 96)
		const first = values[0]
		return values.every((value) => value === first) ? first : 'mixed'
	}, [hasBranchSelection, selectedBranchShapes])

	const verticalGapState = React.useMemo<number | 'mixed'>(() => {
		if (!hasBranchSelection) return 28
		const values = selectedBranchShapes.map((shape) => shape.props.verticalGap || 28)
		const first = values[0]
		return values.every((value) => value === first) ? first : 'mixed'
	}, [hasBranchSelection, selectedBranchShapes])

	const snapDistanceState = React.useMemo<number | 'mixed'>(() => {
		if (!hasBranchSelection) return 160
		const values = selectedBranchShapes.map((shape) => shape.props.snapDistance || 160)
		const first = values[0]
		return values.every((value) => value === first) ? first : 'mixed'
	}, [hasBranchSelection, selectedBranchShapes])

	const showOuterFrameState = React.useMemo<boolean | 'mixed'>(() => {
		if (!hasBranchSelection) return false
		const values = selectedBranchShapes.map((shape) => shape.props.showOuterFrame === true)
		const first = values[0]
		return values.every((value) => value === first) ? first : 'mixed'
	}, [hasBranchSelection, selectedBranchShapes])

	const updateBranchProps = React.useCallback(
		(
			propsBuilder: (shape: IBranchShape) => Partial<IBranchShape['props']>,
			options?: { relayout?: boolean }
		) => {
			editor.run(() => {
				editor.updateShapes(
					selectedBranchShapes.map((shape) => ({
						id: shape.id,
						type: 'branch',
						props: {
							...shape.props,
							...propsBuilder(shape),
						},
					}))
				)

				if (options?.relayout) {
					for (const shape of selectedBranchShapes) {
						const latestShape = editor.getShape(shape.id) as IBranchShape | undefined
						if (latestShape?.type === 'branch') {
							layoutBranchChildren(editor, latestShape)
						}
					}
				}
			})
		},
		[editor, selectedBranchShapes]
	)

	if (!hasBranchSelection) return null

	return (
		<>
			<div className="tlui-style-panel__section">
				<TldrawUiSlider
					label={`线宽${lineWidthState === 'mixed' ? '' : ` - ${lineWidthState}px`}`}
					title="Branch 连线粗细"
					min={1}
					steps={15}
					value={lineWidthState === 'mixed' ? null : lineWidthState}
					onValueChange={(value) => {
						updateBranchProps(() => ({ lineWidth: value }))
					}}
				/>
			</div>

			<div className="tlui-style-panel__section">
				<TldrawUiSlider
					label={`左右间距${horizontalGapState === 'mixed' ? '' : ` - ${horizontalGapState}px`}`}
					title="Branch 左右间距"
					min={20}
					steps={180}
					value={horizontalGapState === 'mixed' ? null : horizontalGapState}
					onValueChange={(value) => {
						updateBranchProps(() => ({ horizontalGap: value }), { relayout: true })
					}}
				/>
			</div>

			<div className="tlui-style-panel__section">
				<TldrawUiSlider
					label={`上下间距${verticalGapState === 'mixed' ? '' : ` - ${verticalGapState}px`}`}
					title="Branch 上下间距"
					min={8}
					steps={112}
					value={verticalGapState === 'mixed' ? null : verticalGapState}
					onValueChange={(value) => {
						updateBranchProps(() => ({ verticalGap: value }), { relayout: true })
					}}
				/>
			</div>

			<div className="tlui-style-panel__section">
				<div className="tlui-toggle-button-row">
					<TldrawUiButton
						type="normal"
						className={`tlui-toggle-button ${showOuterFrameState === true ? 'tlui-toggle-button--active' : showOuterFrameState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
						onClick={() => {
							const next = showOuterFrameState === 'mixed' ? true : !showOuterFrameState
							updateBranchProps(() => ({ showOuterFrame: next }))
						}}
						title="显示或隐藏 Branch 外框"
						aria-label="Branch 外框"
						style={{
							fontWeight: showOuterFrameState === true ? 700 : undefined,
							background: showOuterFrameState === true ? 'var(--tl-color-muted-2)' : undefined,
							color: showOuterFrameState === true ? 'var(--b3-theme-on-surface, var(--color-text))' : undefined,
							opacity: showOuterFrameState === 'mixed' ? 0.85 : undefined,
						}}
					>
						<span className="tlui-toggle-icon" style={{ fontSize: '12px' }}>外框</span>
					</TldrawUiButton>
					<TldrawUiButton
						type="normal"
						className="tlui-toggle-button"
						onClick={() => {
							editor.run(() => {
								for (const shape of selectedBranchShapes) {
									detachBranchCompletely(editor, shape.id)
								}
							})
						}}
						title="断开当前 Branch 的所有吸附关系"
						aria-label="断开所有吸附"
					>
						<span className="tlui-toggle-icon" style={{ fontSize: '12px' }}>断开吸附</span>
					</TldrawUiButton>
				</div>
			</div>
		</>
	)
}
