/**
 * Branch shape style panel section
 */
import React from 'react'
import { Editor, StylePanelDropdownPicker, TLShapeId, TldrawUiButton, TldrawUiIcon, TldrawUiSlider } from '@tldraw/tldraw'
import type { BranchLineStyle, IBranchShape } from './branch-shape-types'
import {
	alignBranchToRootContent,
	detachBranchCompletely,
	detachBranchRootShape,
	layoutBranchChildren,
	relayoutBranchesContainingShapes,
} from './branch-layout'

export interface BranchStyleSectionProps {
	editor: Editor
	selectedBranchShapes: IBranchShape[]
}

export const BranchStyleSection: React.FC<BranchStyleSectionProps> = ({
	editor,
	selectedBranchShapes,
}) => {
	const hasBranchSelection = selectedBranchShapes.length > 0

	const relayoutBranchesNow = React.useCallback(
		(branchIds: TLShapeId[]) => {
			const laidOutBranchIds: TLShapeId[] = []
			for (const branchId of Array.from(new Set(branchIds))) {
				const latestShape = editor.getShape(branchId) as IBranchShape | undefined
				if (latestShape?.type !== 'branch') continue

				layoutBranchChildren(editor, latestShape)
				const laidOutShape = editor.getShape(latestShape.id) as IBranchShape | undefined
				if (laidOutShape?.type === 'branch') {
					alignBranchToRootContent(editor, laidOutShape)
					laidOutBranchIds.push(laidOutShape.id)
				} else {
					laidOutBranchIds.push(latestShape.id)
				}
			}

			if (laidOutBranchIds.length > 0) {
				relayoutBranchesContainingShapes(editor, laidOutBranchIds)
			}
		},
		[editor]
	)

	const lineWidthState = React.useMemo<number | 'mixed'>(() => {
		if (!hasBranchSelection) return 3
		const values = selectedBranchShapes.map((shape) => shape.props.lineWidth || 3)
		const first = values[0]
		return values.every((value) => value === first) ? first : 'mixed'
	}, [hasBranchSelection, selectedBranchShapes])

	const lineStyleState = React.useMemo<BranchLineStyle | 'mixed'>(() => {
		if (!hasBranchSelection) return 'curve-solid'
		const values = selectedBranchShapes.map((shape) => shape.props.lineStyle || 'curve-solid')
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

	const showBackgroundState = React.useMemo<boolean | 'mixed'>(() => {
		if (!hasBranchSelection) return false
		const values = selectedBranchShapes.map((shape) => shape.props.showBackground === true)
		const first = values[0]
		return values.every((value) => value === first) ? first : 'mixed'
	}, [hasBranchSelection, selectedBranchShapes])

	const updateBranchProps = React.useCallback(
		(
			propsBuilder: (shape: IBranchShape) => Partial<IBranchShape['props']>,
			options?: { relayout?: boolean }
		) => {
			editor.run(() => {
				const branchIds: TLShapeId[] = []
				const updates = selectedBranchShapes
					.map((shape) => {
						const latestShape = editor.getShape(shape.id) as IBranchShape | undefined
						if (latestShape?.type !== 'branch') return null

						branchIds.push(latestShape.id)
						return {
							id: latestShape.id,
							type: 'branch',
							props: propsBuilder(latestShape),
						}
					})
					.filter((update): update is { id: TLShapeId; type: 'branch'; props: Partial<IBranchShape['props']> } => !!update)

				editor.updateShapes(updates)

				if (options?.relayout) relayoutBranchesNow(branchIds)
			})
		},
		[editor, relayoutBranchesNow, selectedBranchShapes]
	)

	if (!hasBranchSelection) return null

	return (
		<>
			<div className="tlui-style-panel__section">
				<StylePanelDropdownPicker
					label="连接风格"
					type="menu"
					id="branch-line-style"
					uiType="branch-line-style"
					stylePanelType="branch-line-style"
					style={{ id: 'branch-line-style' } as any}
					items={[
						{ value: 'curve-solid', icon: 'branch-curve-solid' },
						{ value: 'elbow-solid', icon: 'branch-elbow-solid' },
						{ value: 'straight-solid', icon: 'branch-straight-solid' },
						{ value: 'curve-dashed', icon: 'branch-curve-dashed' },
						{ value: 'tree-table', icon: 'branch-tree-table' },
						{ value: 'frame-floating', icon: 'branch-frame-floating' },
					]}
					value={
						lineStyleState === 'mixed'
							? { type: 'mixed' as const }
							: { type: 'shared' as const, value: lineStyleState }
					}
					onValueChange={(_style, nextValue: any) => {
						updateBranchProps(() => ({ lineStyle: nextValue as BranchLineStyle }), { relayout: true })
					}}
				/>
			</div>

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
						className={`tlui-toggle-button ${showBackgroundState === true ? 'tlui-toggle-button--active' : showBackgroundState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
						onClick={() => {
							const next = showBackgroundState === 'mixed' ? true : !showBackgroundState
							updateBranchProps(() => ({ showBackground: next }), { relayout: true })
						}}
						title="显示或隐藏 Branch 背景"
						aria-label="Branch 背景"
						style={{
							fontWeight: showBackgroundState === true ? 700 : undefined,
							background: showBackgroundState === true ? 'var(--tl-color-muted-2)' : undefined,
							color: showBackgroundState === true ? 'var(--b3-theme-on-surface, var(--color-text))' : undefined,
							opacity: showBackgroundState === 'mixed' ? 0.85 : undefined,
						}}
					>
						<TldrawUiIcon label="" icon="branch-background" />
					</TldrawUiButton>
					<TldrawUiButton
						type="normal"
						className="tlui-toggle-button"
						onClick={() => {
							editor.run(() => {
								for (const shape of selectedBranchShapes) {
									detachBranchRootShape(editor, shape.id)
								}
							})
						}}
						title="Detach branch center content"
						aria-label="Detach branch center content"
						disabled={!selectedBranchShapes.some((shape) => !!shape.props.rootShapeId)}
					>
						<TldrawUiIcon label="" icon="ungroup" />
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
						<TldrawUiIcon label="" icon="branch-detach" />
					</TldrawUiButton>
				</div>
			</div>
		</>
	)
}
