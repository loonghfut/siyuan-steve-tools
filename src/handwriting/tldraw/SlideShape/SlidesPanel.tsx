import { TldrawUiButton, stopEventPropagation, track, useEditor, useValue, TldrawUiIcon } from '@tldraw/tldraw'
import { moveToSlide, useCurrentSlide, useSlides } from './useSlides'
import { useState, useMemo } from 'react'
import { SlideShape } from './SlideShapeUtil'

export const SlidesPanel = track(() => {
	const editor = useEditor()
	const slides = useSlides()
	const currentSlide = useCurrentSlide()
	const selectedShapes = useValue('selected shapes', () => editor.getSelectedShapes(), [editor])
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

	const groupedSlides = useMemo(() => {
		const groups: Record<string, SlideShape[]> = {}
		const ungrouped: SlideShape[] = []

		slides.forEach((slide, i) => {
			const name = slide.props.name || `Slide ${i + 1}`
			const parts = name.split('/')
			if (parts.length > 1) {
				const groupName = parts[0]
				if (!groups[groupName]) {
					groups[groupName] = []
				}
				groups[groupName].push(slide)
			} else {
				ungrouped.push(slide)
			}
		})

		// Sort groups alphabetically
		const sortedGroupNames = Object.keys(groups).sort()

		return { groups, sortedGroupNames, ungrouped }
	}, [slides])

	const toggleGroup = (groupName: string) => {
		const newCollapsed = new Set(collapsedGroups)
		if (newCollapsed.has(groupName)) {
			newCollapsed.delete(groupName)
		} else {
			newCollapsed.add(groupName)
		}
		setCollapsedGroups(newCollapsed)
	}

	if (slides.length === 0) {
		return (
			<div className="slides-panel slides-panel--empty" onPointerDown={(e) => stopEventPropagation(e)}>
				<div className="slides-panel-empty-message">No slides</div>
			</div>
		)
	}

	return (
		<div className="slides-panel scroll-light" onPointerDown={(e) => stopEventPropagation(e)}>
			{/* Render Groups */}
			{groupedSlides.sortedGroupNames.map((groupName) => {
				const isCollapsed = collapsedGroups.has(groupName)
				const groupSlides = groupedSlides.groups[groupName]

				return (
					<div key={`group-${groupName}`} className="slides-group">
						<TldrawUiButton
							type="normal"
							className="slides-group-header"
							onPointerDown={(e) => stopEventPropagation(e)}
							onClick={() => toggleGroup(groupName)}
						>
							<span className="slides-group-icon">
								<TldrawUiIcon icon={isCollapsed ? 'chevron-right' : 'chevron-down'} small />
							</span>
							<span className="slides-group-title">{groupName}</span>
							<span className="slides-group-count">{groupSlides.length}</span>
						</TldrawUiButton>

						{!isCollapsed && (
							<div className="slides-group-content">
								{groupSlides.map((slide) => {
									const isSelected = selectedShapes.includes(slide)
									const isCurrent = currentSlide?.id === slide.id
									// Display name without group prefix
									const displayName = slide.props.name?.split('/').slice(1).join('/') || slide.props.name

									return (
										<TldrawUiButton
											key={'slides-panel-button:' + slide.id}
											type="normal"
											className={`slides-panel-button ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
											onClick={() => moveToSlide(editor, slide)}
											title={displayName}
										>
											<span className="slides-item-text">{displayName}</span>
										</TldrawUiButton>
									)
								})}
							</div>
						)}
					</div>
				)
			})}

			{/* Render Ungrouped Slides */}
			{groupedSlides.ungrouped.map((slide, i) => {
				const isSelected = selectedShapes.includes(slide)
				const isCurrent = currentSlide?.id === slide.id
				const displayName = slide.props.name || `Slide ${i + 1}`
				return (
					<TldrawUiButton
						key={'slides-panel-button:' + slide.id}
						type="normal"
						className={`slides-panel-button ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
						onClick={() => moveToSlide(editor, slide)}
						title={displayName}
					>
						<span className="slides-item-text">{displayName}</span>
					</TldrawUiButton>
				)
			})}
		</div>
	)
})