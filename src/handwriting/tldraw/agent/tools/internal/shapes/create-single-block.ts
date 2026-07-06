import { type Editor, type TLShapeId, createShapeId } from '@tldraw/tldraw'
import type { ISingleBlockShape } from '../../../../SingleBlockShape/single-block-shape-types'
import type { AgentSingleBlockCreateArgs } from '../core/types'
import { AGENT_SHAPE_BOUNDS, getAgentSingleBlockDefaults } from '../core/defaults'
import { finiteNumberInRange } from '../core/schema'
import { finiteNumber } from './create-card'

export function createAgentSingleBlockShape(editor: Editor, options: AgentSingleBlockCreateArgs): TLShapeId {
	const id = createShapeId()
	const defaults = getAgentSingleBlockDefaults()
	const props: ISingleBlockShape['props'] = {
		...defaults,
		w: finiteNumberInRange(options.w, defaults.w, AGENT_SHAPE_BOUNDS.minSize, AGENT_SHAPE_BOUNDS.maxSize),
		h: finiteNumberInRange(options.h, defaults.h, AGENT_SHAPE_BOUNDS.minSize, AGENT_SHAPE_BOUNDS.maxSize),
		color: options.color ?? defaults.color,
		blockId: options.blockId ?? defaults.blockId,
		isNewlyCreated: !options.blockId,
		refreshNonce: Date.now(),
	}

	editor.createShape<ISingleBlockShape>({
		id,
		type: 'single-block',
		x: finiteNumber(options.x, 0),
		y: finiteNumber(options.y, 0),
		props,
	})

	return id
}
