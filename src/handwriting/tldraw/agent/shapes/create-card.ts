import { type Editor, type TLShapeId, createShapeId } from '@tldraw/tldraw'
import type { ICardShape } from '../../CardShape/card-shape-types'
import type { AgentCardCreateArgs } from '../core/types'
import { AGENT_SHAPE_BOUNDS, getAgentCardDefaults } from '../core/defaults'
import { finiteNumberInRange } from '../core/schema'

export function createAgentCardShape(editor: Editor, options: AgentCardCreateArgs): TLShapeId {
	const id = createShapeId()
	const defaults = getAgentCardDefaults()
	const props: ICardShape['props'] = {
		...defaults,
		w: finiteNumberInRange(options.w, defaults.w, AGENT_SHAPE_BOUNDS.minSize, AGENT_SHAPE_BOUNDS.maxSize),
		h: finiteNumberInRange(options.h, defaults.h, AGENT_SHAPE_BOUNDS.minSize, AGENT_SHAPE_BOUNDS.maxSize),
		color: options.color ?? defaults.color,
		showMask: options.showMask ?? defaults.showMask,
		blockId: options.blockId ?? defaults.blockId,
		isMain: options.isMain ?? defaults.isMain,
		isCollapsed: options.isCollapsed ?? defaults.isCollapsed,
		isNewlyCreated: !options.blockId,
		refreshNonce: Date.now(),
	}

	editor.createShape<ICardShape>({
		id,
		type: 'card',
		x: finiteNumber(options.x, 0),
		y: finiteNumber(options.y, 0),
		props,
	})

	return id
}

export function finiteNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
