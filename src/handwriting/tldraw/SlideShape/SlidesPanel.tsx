import {
	TldrawUiButton,
	TldrawUiIcon,
	getIndexBetween,
	stopEventPropagation,
	track,
	useEditor,
	useValue,
} from '@tldraw/tldraw'
import type { TLShapePartial } from '@tldraw/tldraw'
import { moveToSlide, useCurrentSlide, useSlides } from './useSlides'
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { SlideShape } from './SlideShapeUtil'
import { settingdata } from '@/index'

/** 拖拽放置目标：条目前后 / 分组标题（追加到组尾） */
type DropTarget =
	| { kind: 'item'; id: string; position: 'before' | 'after' }
	| { kind: 'group'; group: string }

/** 获取 slide 的分组名（`组名/名称` 命名约定）；未分组返回 null */
function getSlideGroup(slide: SlideShape): string | null {
	const parts = (slide.props.name || '').split('/')
	return parts.length > 1 ? parts[0] : null
}

function isSameDropTarget(a: DropTarget | null, b: DropTarget | null): boolean {
	if (a === b) return true
	if (!a || !b || a.kind !== b.kind) return false
	if (a.kind === 'item' && b.kind === 'item') return a.id === b.id && a.position === b.position
	if (a.kind === 'group' && b.kind === 'group') return a.group === b.group
	return false
}

export const SlidesPanel = track(() => {
	const editor = useEditor()
	const slides = useSlides()
	const currentSlide = useCurrentSlide()
	const selectedShapes = useValue('selected shapes', () => editor.getSelectedShapes(), [editor])
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
	const [draggingId, setDraggingId] = useState<string | null>(null)
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
	const [renamingId, setRenamingId] = useState<string | null>(null)
	const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
	const panelRef = useRef<HTMLDivElement>(null)
	// 工具栏为垂直时占据左侧，slide 面板改放底部并横向排列，避免重叠
	const toolbarOrientation = (settingdata?.['tldraw-toolbar-orientation'] as 'vertical' | 'horizontal') || 'vertical'
	const isHorizontalPanel = toolbarOrientation === 'vertical'
	const wrapperClassNames = [
		'slides-panel-wrapper',
		isHorizontalPanel ? 'slides-panel-wrapper--bottom' : '',
	]
		.filter(Boolean)
		.join(' ')

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

	/** 结束拖拽，清理状态 */
	const clearDragState = useCallback(() => {
		setDraggingId(null)
		setDropTarget(null)
	}, [])

	/** 计算移动到目标分组后的新名称；分组未变化时返回 undefined */
	const getMovedName = useCallback((slide: SlideShape, targetGroup: string | null): string | undefined => {
		const name = slide.props.name || ''
		const parts = name.split('/')
		const currentGroup = parts.length > 1 ? parts[0] : null
		if (currentGroup === targetGroup) return undefined
		const rest = parts.length > 1 ? parts.slice(1).join('/') : name
		return targetGroup === null ? rest : `${targetGroup}/${rest}`
	}, [])

	/** 执行拖拽排序：更新 fractional index，跨分组时同步更新名称前缀 */
	const handleDrop = useCallback(
		(target: DropTarget) => {
			const dragged = slides.find((s) => s.id === draggingId)
			clearDragState()
			if (!dragged) return

			// 全局顺序中排除被拖拽项，计算插入点前后的邻居
			const ordered = slides.filter((s) => s.id !== dragged.id)
			let below: SlideShape | undefined
			let above: SlideShape | undefined
			let targetGroup: string | null

			if (target.kind === 'item') {
				if (target.id === dragged.id) return
				const targetIdx = ordered.findIndex((s) => s.id === target.id)
				if (targetIdx === -1) return
				const insertIdx = target.position === 'before' ? targetIdx : targetIdx + 1
				below = ordered[insertIdx - 1]
				above = ordered[insertIdx]
				targetGroup = getSlideGroup(ordered[targetIdx])
			} else {
				// 拖放到分组标题：追加到该分组末尾
				targetGroup = target.group
				const lastIdx = ordered.map(getSlideGroup).lastIndexOf(target.group)
				if (lastIdx !== -1) {
					below = ordered[lastIdx]
					above = ordered[lastIdx + 1]
				}
			}

			const name = getMovedName(dragged, targetGroup)
			const index = below || above ? getIndexBetween(below?.index, above?.index) : undefined
			if (index === undefined && name === undefined) return

			const partial: TLShapePartial<SlideShape> = { id: dragged.id, type: 'slide' }
			if (index !== undefined) partial.index = index
			if (name !== undefined) partial.props = { name }
			editor.run(() => {
				editor.updateShape(partial)
			})
		},
		[editor, slides, draggingId, clearDragState, getMovedName]
	)

	/**
	 * dragover/drop 必须用原生监听器处理：
	 * tldraw 的 useDocumentEvents 在编辑器容器上注册了原生 dragover/drop，
	 * 会 stopPropagation 并把事件重派发到画布，导致事件永远到不了 React 根，
	 * 按钮上的 React onDragOver/onDrop 不会触发。
	 * 面板比容器更深，冒泡阶段先触发，这里自己 stopPropagation 截住即可。
	 */
	useEffect(() => {
		const panel = panelRef.current
		if (!panel) return

		const resolveTarget = (e: DragEvent): DropTarget | null => {
			const el = e.target as HTMLElement | null
			const itemEl = el?.closest?.('[data-slide-id]') as HTMLElement | null
			if (itemEl) {
				const id = itemEl.dataset.slideId!
				if (id === draggingId) return null
				const rect = itemEl.getBoundingClientRect()
				// 横向排列时以水平中线判断插入位置
				const position = isHorizontalPanel
					? e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
					: e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
				return { kind: 'item', id, position }
			}
			const groupEl = el?.closest?.('[data-group-name]') as HTMLElement | null
			if (groupEl) return { kind: 'group', group: groupEl.dataset.groupName! }
			return null
		}

		const onDragOver = (e: DragEvent) => {
			if (!draggingId) return // 非面板内的拖拽（如拖文件入画布），交给 tldraw
			e.preventDefault()
			e.stopPropagation()
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
			const target = resolveTarget(e)
			setDropTarget((prev) => (isSameDropTarget(prev, target) ? prev : target))
		}

		const onDrop = (e: DragEvent) => {
			if (!draggingId) return
			e.preventDefault()
			e.stopPropagation()
			const target = resolveTarget(e)
			if (target) {
				handleDrop(target)
			} else {
				clearDragState()
			}
		}

		const onDragLeave = (e: DragEvent) => {
			if (!draggingId) return
			// 只在真正离开面板时清除指示线
			const related = e.relatedTarget as Node | null
			if (!related || !panel.contains(related)) {
				setDropTarget(null)
			}
		}

		panel.addEventListener('dragover', onDragOver)
		panel.addEventListener('drop', onDrop)
		panel.addEventListener('dragleave', onDragLeave)
		return () => {
			panel.removeEventListener('dragover', onDragOver)
			panel.removeEventListener('drop', onDrop)
			panel.removeEventListener('dragleave', onDragLeave)
		}
		// isPanelCollapsed：面板重新展开时 ref 指向新元素，需要重新绑定监听
	}, [draggingId, handleDrop, clearDragState, isPanelCollapsed, isHorizontalPanel])

	/** 提交重命名（空值或未变化时不更新） */
	const commitRename = useCallback(
		(slide: SlideShape, value: string) => {
			setRenamingId(null)
			const trimmed = value.trim()
			if (trimmed && trimmed !== slide.props.name) {
				editor.updateShape<SlideShape>({ id: slide.id, type: 'slide', props: { name: trimmed } })
			}
		},
		[editor]
	)

	/** 渲染单个 slide 条目（分组内与未分组共用） */
	const renderSlideItem = (slide: SlideShape, displayName: string) => {
		const isSelected = selectedShapes.includes(slide)
		const isCurrent = currentSlide?.id === slide.id
		const isRenaming = renamingId === slide.id
		const itemDrop = dropTarget?.kind === 'item' && dropTarget.id === slide.id ? dropTarget.position : null
		const classNames = [
			'slides-panel-button',
			isSelected ? 'selected' : '',
			isCurrent ? 'current' : '',
			draggingId === slide.id ? 'dragging' : '',
			itemDrop === 'before' ? 'drop-before' : '',
			itemDrop === 'after' ? 'drop-after' : '',
		]
			.filter(Boolean)
			.join(' ')

		return (
			<TldrawUiButton
				key={'slides-panel-button:' + slide.id}
				type="normal"
				className={classNames}
				data-slide-id={slide.id}
				onClick={() => {
					if (!isRenaming) moveToSlide(editor, slide)
				}}
				onDoubleClick={() => setRenamingId(slide.id)}
				title={isRenaming ? undefined : `${displayName}\n拖拽排序 · 双击重命名`}
				draggable={!isRenaming}
				onDragStart={(e) => {
					e.dataTransfer.effectAllowed = 'move'
					e.dataTransfer.setData('text/plain', slide.id)
					setDraggingId(slide.id)
				}}
				onDragEnd={clearDragState}
			>
				{isRenaming ? (
					<input
						className="slides-item-rename-input"
						defaultValue={slide.props.name || ''}
						autoFocus
						spellCheck={false}
						onFocus={(e) => e.currentTarget.select()}
						onPointerDown={(e) => e.stopPropagation()}
						onClick={(e) => e.stopPropagation()}
						onDoubleClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							e.stopPropagation()
							if (e.key === 'Enter') {
								commitRename(slide, e.currentTarget.value)
							} else if (e.key === 'Escape') {
								// 还原输入值，避免随后的 blur 提交修改
								e.currentTarget.value = slide.props.name || ''
								setRenamingId(null)
							}
						}}
						onBlur={(e) => commitRename(slide, e.currentTarget.value)}
					/>
				) : (
					<span className="slides-item-text">{displayName}</span>
				)}
			</TldrawUiButton>
		)
	}

	if (slides.length === 0) {
		return (
			<div className={`${wrapperClassNames} slides-panel--empty`} onPointerDown={(e) => stopEventPropagation(e)}>
			</div>
		)
	}

	return (
		<div className={wrapperClassNames} onPointerDown={(e) => stopEventPropagation(e)}>
			{/* 面板折叠/展开按钮 */}
			<TldrawUiButton
				type="normal"
				className="slides-panel-toggle"
				onClick={() => setIsPanelCollapsed((prev) => !prev)}
				title={isPanelCollapsed ? '展开幻灯片面板' : '折叠幻灯片面板'}
			>
				<span className="slides-group-icon">
					<TldrawUiIcon label="" icon={isPanelCollapsed ? 'chevron-right' : 'chevron-down'} small />
				</span>
				<span className="slides-panel-toggle-title">幻灯片</span>
				<span className="slides-group-count">{slides.length}</span>
			</TldrawUiButton>

			{!isPanelCollapsed && (
				<div ref={panelRef} className="slides-panel scroll-light">
					{/* Render Groups */}
					{groupedSlides.sortedGroupNames.map((groupName) => {
						const isCollapsed = collapsedGroups.has(groupName)
						const groupSlides = groupedSlides.groups[groupName]
						const isDropInto = dropTarget?.kind === 'group' && dropTarget.group === groupName

						return (
							<div key={`group-${groupName}`} className="slides-group">
								<TldrawUiButton
									type="normal"
									className={`slides-group-header ${isDropInto ? 'drop-into' : ''}`}
									data-group-name={groupName}
									onPointerDown={(e) => stopEventPropagation(e)}
									onClick={() => toggleGroup(groupName)}
								>
									<span className="slides-group-icon">
										<TldrawUiIcon label="" icon={isCollapsed ? 'chevron-right' : 'chevron-down'} small />
									</span>
									<span className="slides-group-title">{groupName}</span>
									<span className="slides-group-count">{groupSlides.length}</span>
								</TldrawUiButton>

								{!isCollapsed && (
									<div className="slides-group-content">
										{groupSlides.map((slide) => {
											// Display name without group prefix
											const displayName =
												slide.props.name?.split('/').slice(1).join('/') || slide.props.name || ''
											return renderSlideItem(slide, displayName)
										})}
									</div>
								)}
							</div>
						)
					})}

					{/* Render Ungrouped Slides */}
					{groupedSlides.ungrouped.map((slide, i) =>
						renderSlideItem(slide, slide.props.name || `Slide ${i + 1}`)
					)}
				</div>
			)}
		</div>
	)
})
