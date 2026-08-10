import {
	PORTRAIT_BREAKPOINT,
	canonicalizeRotation,
	toDomPrecision,
	type Editor,
	type TLFrameShape,
	type TLShapeId,
	useBreakpoint,
	useEditor,
	useIsEditing,
	useTranslation,
	useValue,
} from '@tldraw/tldraw'
import { forwardRef, memo, useCallback, useEffect, useRef } from 'react'

const DEFAULT_FRAME_NAME = 'Frame'

function getFrameHeadingSide(editor: Editor, shape: TLFrameShape): 0 | 1 | 2 | 3 {
	const pageRotation = canonicalizeRotation(editor.getShapePageTransform(shape.id)!.rotation())
	const offsetRotation = pageRotation + Math.PI / 4
	const scaledRotation = (offsetRotation * (2 / Math.PI) + 4) % 4
	return Math.floor(scaledRotation) as 0 | 1 | 2 | 3
}

function getFrameHeadingTranslation(shape: TLFrameShape, side: 0 | 1 | 2 | 3) {
	switch (side) {
		case 0:
			return ''
		case 3:
			return `translate(${toDomPrecision(shape.props.w)}px, 0px) rotate(90deg)`
		case 2:
			return `translate(${toDomPrecision(shape.props.w)}px, ${toDomPrecision(shape.props.h)}px) rotate(180deg)`
		case 1:
			return `translate(0px, ${toDomPrecision(shape.props.h)}px) rotate(270deg)`
	}
}

function getFrameLabel(name: string) {
	return (name.trim() === '' ? DEFAULT_FRAME_NAME : name) + String.fromCharCode(8203)
}

export const ZoomInvariantFrameHeading = memo(function ZoomInvariantFrameHeading({
	id,
	name,
	width,
	height,
	fill,
	stroke,
	color,
	offsetX,
	showColors,
}: {
	id: TLShapeId
	name: string
	width: number
	height: number
	fill: string
	stroke: string
	color: string
	offsetX: number
	showColors: boolean
}) {
	const editor = useEditor()
	const { side, translation } = useValue(
		'frame heading rotation',
		() => {
			const shape = editor.getShape<TLFrameShape>(id)
			if (!shape) {
				return { side: 0 as const, translation: 'translate(0, 0)' }
			}

			const labelSide = getFrameHeadingSide(editor, shape)
			return {
				side: labelSide,
				translation: getFrameHeadingTranslation(shape, labelSide),
			}
		},
		[editor, id, offsetX]
	)

	const inputRef = useRef<HTMLInputElement>(null)
	const isEditing = useIsEditing(id)

	useEffect(() => {
		if (inputRef.current && isEditing) {
			inputRef.current.focus()
			inputRef.current.select()
		}
	}, [isEditing])

	return (
		<div
			className="tl-frame-heading"
			style={{
				overflow: isEditing ? 'visible' : 'hidden',
				maxWidth: `calc(var(--tl-zoom) * ${
					side === 0 || side === 2 ? Math.ceil(width) : Math.ceil(height)
				}px + ${showColors ? '0px' : 'var(--tl-frame-offset-width)'})`,
				bottom: '100%',
				// Unlike the native Frame heading, do not cap inverse scaling at 3.5.
				// This keeps the label at a readable screen size even when zoomed far out.
				transform: `${translation} scale(var(--tl-scale)) translateX(${offsetX}px)`,
			}}
		>
			<div
				className="tl-frame-heading-hit-area"
				style={{ color, backgroundColor: fill, boxShadow: `inset 0px 0px 0px 1px ${stroke}` }}
			>
				<FrameLabelInput ref={inputRef} id={id} name={name} isEditing={isEditing} />
			</div>
		</div>
	)
})

const FrameLabelInput = forwardRef<
	HTMLInputElement,
	{ id: TLShapeId; name: string; isEditing: boolean }
>(function FrameLabelInput({ id, name, isEditing }, ref) {
	const editor = useEditor()
	const breakpoint = useBreakpoint()
	const isCoarsePointer = useValue(
		'isCoarsePointer',
		() => editor.getInstanceState().isCoarsePointer,
		[editor]
	)
	const shouldUseWindowPrompt = breakpoint < PORTRAIT_BREAKPOINT.TABLET_SM && isCoarsePointer
	const promptOpen = useRef(false)
	const msg = useTranslation()

	const renameFrame = useCallback(
		(value: string) => {
			const shape = editor.getShape<TLFrameShape>(id)
			if (!shape || shape.props.name === value) return

			editor.updateShapes([
				{
					id,
					type: 'frame',
					props: { name: value },
				},
			])
		},
		[editor, id]
	)

	const handlePointerDown = useCallback(
		(event: React.PointerEvent) => {
			if (isEditing) editor.markEventAsHandled(event)
		},
		[editor, isEditing]
	)

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
				editor.markEventAsHandled(event)
				event.currentTarget.blur()
				editor.setEditingShape(null)
			}
		},
		[editor]
	)

	useEffect(() => {
		if (!isEditing) {
			promptOpen.current = false
			return
		}

		if (shouldUseWindowPrompt && !promptOpen.current) {
			promptOpen.current = true
			const currentName = editor.getShape<TLFrameShape>(id)?.props.name ?? ''
			const newName = window.prompt(msg('action.rename'), currentName)
			promptOpen.current = false
			if (newName !== null) renameFrame(newName)
			editor.setEditingShape(null)
		}
	}, [editor, id, isEditing, msg, renameFrame, shouldUseWindowPrompt])

	return (
		<div className={`tl-frame-label ${isEditing && !shouldUseWindowPrompt ? 'tl-frame-label__editing' : ''}`}>
			<input
				className="tl-frame-name-input"
				ref={ref}
				disabled={!isEditing || shouldUseWindowPrompt}
				readOnly={!isEditing || shouldUseWindowPrompt}
				style={{ display: isEditing ? undefined : 'none' }}
				value={name}
				autoFocus={!shouldUseWindowPrompt}
				onKeyDown={handleKeyDown}
				onBlur={(event) => renameFrame(event.currentTarget.value)}
				onChange={(event) => renameFrame(event.currentTarget.value)}
				onPointerDown={handlePointerDown}
				draggable={false}
			/>
			{getFrameLabel(name)}
		</div>
	)
})
