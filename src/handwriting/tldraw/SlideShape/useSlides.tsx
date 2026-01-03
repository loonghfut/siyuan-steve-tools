import { EASINGS, Editor, atom, useEditor, useValue } from '@tldraw/tldraw'
import { SlideShape } from './SlideShapeUtil'

export const $currentSlide = atom<SlideShape | null>('current slide', null)
export const $slideFocusMode = atom<boolean>('slide focus mode', false)

export function setSlideFocusMode(enabled: boolean) {
	$slideFocusMode.set(enabled)
}

export function toggleSlideFocusMode() {
	$slideFocusMode.set(!$slideFocusMode.get())
}

export function moveToSlide(editor: Editor, slide: SlideShape) {
	const bounds = editor.getShapePageBounds(slide.id)
	if (!bounds) return
	$currentSlide.set(slide)
	editor.selectNone()
	editor.zoomToBounds(bounds, {
		inset: 0,
		animation: { duration: 500, easing: EASINGS.easeInOutCubic },
	})
}

export function useSlides() {
	const editor = useEditor()
	return useValue<SlideShape[]>('slide shapes', () => getSlides(editor), [editor])
}

export function useCurrentSlide() {
	return useValue($currentSlide)
}

export function useSlideFocusMode() {
	return useValue($slideFocusMode)
}

export function getSlides(editor: Editor) {
	return editor
		.getSortedChildIdsForParent(editor.getCurrentPageId())
		.map((id) => editor.getShape(id))
		.filter((s) => s?.type === 'slide') as SlideShape[]
}