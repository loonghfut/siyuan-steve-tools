/**
 * Branch 形状样式面板区块
 */
import React from 'react'
import { Editor, TldrawUiButton } from '@tldraw/tldraw'
import type { IBranchShape } from './branch-shape-types'

export interface BranchStyleSectionProps {
	editor: Editor
	selectedBranchShapes: IBranchShape[]
}

export const BranchStyleSection: React.FC<BranchStyleSectionProps> = ({
	editor,
	selectedBranchShapes,
}) => {
	const hasBranchSelection = selectedBranchShapes.length > 0

	const showOuterFrameState = React.useMemo<boolean | 'mixed'>(() => {
		if (!hasBranchSelection) return false
		const values = selectedBranchShapes.map((shape) => shape.props.showOuterFrame === true)
		const first = values[0]
		return values.every((value) => value === first) ? first : 'mixed'
	}, [hasBranchSelection, selectedBranchShapes])

	if (!hasBranchSelection) return null

	return (
		<div className="tlui-style-panel__section">
			<div className="tlui-toggle-button-row">
				<TldrawUiButton
					type="normal"
					className={`tlui-toggle-button ${showOuterFrameState === true ? 'tlui-toggle-button--active' : showOuterFrameState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
					onClick={() => {
						const next = showOuterFrameState === 'mixed' ? true : !showOuterFrameState
						editor.run(() => {
							editor.updateShapes(
								selectedBranchShapes.map((shape) => ({
									id: shape.id,
									type: 'branch',
									props: { ...shape.props, showOuterFrame: next },
								}))
							)
						})
					}}
					title="显示/隐藏 Branch 外框"
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
			</div>
		</div>
	)
}
