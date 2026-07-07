import type { ConnectorBinding } from './BezierConnectorShape'
import type { IBezierConnectorShape } from './BezierConnectorShape/bezier-connector-types'
import type { IBranchShape } from './BranchShape/branch-shape-types'
import type { ICardShape } from './CardShape/card-shape-types'
import type { IJsShape } from './JsShape/js-shape-types'
import type { IMindMapShape } from './MindMapShape/mind-map-shape-types'
import type { SingleBlockBinding } from './SingleBlockShape/SingleBlockShapeUtil'
import type { ISingleBlockShape } from './SingleBlockShape/single-block-shape-types'
import type { SlideShape } from './SlideShape/SlideShapeUtil'

declare module '@tldraw/tldraw' {
	interface TLGlobalShapePropsMap {
		card: ICardShape['props']
		'single-block': ISingleBlockShape['props']
		'bezier-connector': IBezierConnectorShape['props']
		branch: IBranchShape['props']
		'mind-map': IMindMapShape['props']
		slide: SlideShape['props']
		'js-shape': IJsShape['props']
	}

	interface TLGlobalBindingPropsMap {
		'single-block': SingleBlockBinding['props']
		'bezier-connector': ConnectorBinding['props']
	}
}
