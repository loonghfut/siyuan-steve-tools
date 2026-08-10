import {
	FrameShapeUtil,
	SVGContainer,
	getDisplayValues,
	type FrameShapeUtilDisplayValues,
	type TLFrameShape,
	useColorMode,
	useValue,
} from '@tldraw/tldraw'
import { ZoomInvariantFrameHeading } from './ZoomInvariantFrameHeading'

/**
 * Keeps the native Frame feature set while allowing its heading to remain
 * readable at any canvas zoom level.
 */
export class ZoomInvariantFrameShapeUtil extends FrameShapeUtil {
	override component(shape: TLFrameShape) {
		// eslint-disable-next-line react-hooks/rules-of-hooks
		const colorMode = useColorMode()
		const displayValues = getDisplayValues(this, shape, colorMode) as FrameShapeUtilDisplayValues

		// eslint-disable-next-line react-hooks/rules-of-hooks
		const isCreating = useValue(
			'is creating this frame',
			() => {
				const resizingState = this.editor.getStateDescendant('select.resizing')
				if (!resizingState?.getIsActive()) return false

				const info = (resizingState as typeof resizingState & { info?: { isCreating?: boolean } })
					.info
				return Boolean(info?.isCreating && this.editor.getOnlySelectedShapeId() === shape.id)
			},
			[shape.id]
		)

		const showFrameColors = this.options.showColors

		return (
			<>
				<SVGContainer>
					<rect
						className={`tl-frame__body${isCreating ? ' tl-frame__creating' : ''}`}
						fill={showFrameColors ? displayValues.showColorsFillColor : displayValues.fillColor}
						stroke={showFrameColors ? displayValues.showColorsStrokeColor : displayValues.strokeColor}
						style={{
							width: `calc(${shape.props.w}px + 1px / var(--tl-zoom))`,
							height: `calc(${shape.props.h}px + 1px / var(--tl-zoom))`,
							transform: `translate(calc(-0.5px / var(--tl-zoom)), calc(-0.5px / var(--tl-zoom)))`,
						}}
					/>
				</SVGContainer>
				{isCreating ? null : (
					<ZoomInvariantFrameHeading
						id={shape.id}
						name={shape.props.name}
						fill={showFrameColors ? displayValues.showColorsHeadingFillColor : displayValues.headingFillColor}
						stroke={showFrameColors ? displayValues.showColorsHeadingStrokeColor : displayValues.headingStrokeColor}
						color={showFrameColors ? displayValues.showColorsHeadingTextColor : displayValues.headingTextColor}
						width={shape.props.w}
						height={shape.props.h}
						offsetX={showFrameColors ? -1 : -7}
						showColors={showFrameColors}
					/>
				)}
			</>
		)
	}
}
