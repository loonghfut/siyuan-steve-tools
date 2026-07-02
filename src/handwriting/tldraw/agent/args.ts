import type {
	AgentBranchChildRef,
	AgentBranchCreateArgs,
	AgentBranchSide,
	AgentBasicShapeCreateArgs,
	AgentConnectorCreateArgs,
	AgentConnectorKind,
	AgentCardCreateArgs,
	AgentCreateKind,
	AgentCreateShapeArgs,
	AgentSingleBlockCreateArgs,
	AgentShapeUpdatePatch,
} from './types'
import { normalizeAgentColor, normalizeBranchLineStyle } from './schema'

const COMMON_WHITEBOARD_ARG_KEYS = ['whiteboardId', 'id', 'rootId']
const INTERNAL_AGENT_ARG_KEYS = ['action']

const CREATE_SHAPE_ARG_KEYS = [
	...COMMON_WHITEBOARD_ARG_KEYS,
	'kind',
	'x',
	'y',
	'w',
	'h',
	'color',
	'blockId',
	'isMain',
	'isCollapsed',
	'showMask',
	'rootShapeId',
	'childIds',
	'children',
	'leftChildren',
	'rightChildren',
	'direction',
	'horizontalGap',
	'verticalGap',
	'lineStyle',
	'lineWidth',
	'snapDistance',
	'showBackground',
	'select',
	'zoom',
]

const CREATE_BASIC_SHAPE_ARG_KEYS = [
	...COMMON_WHITEBOARD_ARG_KEYS,
	'kind',
	'x',
	'y',
	'w',
	'h',
	'color',
	'text',
	'geo',
	'name',
	'blockId',
	'direction',
	'theme',
	'select',
	'zoom',
]

const CREATE_CONNECTOR_ARG_KEYS = [
	...COMMON_WHITEBOARD_ARG_KEYS,
	'kind',
	'startShapeId',
	'endShapeId',
	'fromShapeId',
	'toShapeId',
	'sourceShapeId',
	'targetShapeId',
	'shapeId',
	'shapeIds',
	'start',
	'end',
	'color',
	'text',
	'strokeWidth',
	'lineWidth',
	'select',
	'zoom',
]

const SHAPE_UPDATE_PATCH_ARG_KEYS = [
	'shapeId',
	'x',
	'y',
	'w',
	'h',
	'color',
	'text',
	'name',
	'select',
	'zoom',
]

export function parseCreateShapeArgs(args: Record<string, unknown>): AgentCreateShapeArgs {
	assertKnownArgs(args, CREATE_SHAPE_ARG_KEYS, 'tldraw_create_shape')
	const kind = parseKind(args.kind)

	if (kind === 'card') {
		return parseCardCreateArgs(args)
	}
	if (kind === 'single-block') {
		return parseSingleBlockCreateArgs(args)
	}
	return parseBranchCreateArgs(args)
}

export function parseCreateBasicShapeArgs(args: Record<string, unknown>): AgentBasicShapeCreateArgs {
	assertKnownArgs(args, CREATE_BASIC_SHAPE_ARG_KEYS, 'tldraw_create_basic_shape')
	const kind = parseBasicKind(args.kind)
	return {
		kind,
		x: numberArg(args.x),
		y: numberArg(args.y),
		w: numberArg(args.w),
		h: numberArg(args.h),
		color: colorArg(args.color),
		text: stringArg(args.text),
		geo: stringArg(args.geo),
		name: stringArg(args.name),
		blockId: stringArg(args.blockId),
		direction: parseMindMapDirection(args.direction),
		theme: stringArg(args.theme),
		select: booleanArg(args.select),
		zoom: booleanArg(args.zoom),
	}
}

export function parseCreateConnectorArgs(args: Record<string, unknown>): AgentConnectorCreateArgs {
	assertKnownArgs(args, CREATE_CONNECTOR_ARG_KEYS, 'tldraw_create_connector')
	const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId)
	return {
		kind: parseConnectorKind(args.kind),
		startShapeId: stringArg(args.startShapeId || args.fromShapeId || args.sourceShapeId) || shapeIds[0],
		endShapeId: stringArg(args.endShapeId || args.toShapeId || args.targetShapeId) || shapeIds[1],
		shapeIds,
		start: pointArg(args.start),
		end: pointArg(args.end),
		color: colorArg(args.color),
		text: stringArg(args.text),
		strokeWidth: numberArg(args.strokeWidth || args.lineWidth),
		select: booleanArg(args.select),
		zoom: booleanArg(args.zoom),
	}
}

export function parseShapeUpdatePatch(args: Record<string, unknown>): AgentShapeUpdatePatch {
	assertKnownArgs(args, SHAPE_UPDATE_PATCH_ARG_KEYS, 'shape patch')
	const shapeId = stringArg(args.shapeId)
	if (!shapeId) throw new Error('missing required argument: shapeId')
	return {
		shapeId,
		x: numberArg(args.x),
		y: numberArg(args.y),
		w: numberArg(args.w),
		h: numberArg(args.h),
		color: stringArg(args.color),
		text: stringArg(args.text),
		name: stringArg(args.name),
		select: booleanArg(args.select),
		zoom: booleanArg(args.zoom),
	}
}

export function assertKnownArgs(args: Record<string, unknown>, allowedKeys: readonly string[], context: string) {
	const allowed = new Set(allowedKeys)
	const internal = new Set(INTERNAL_AGENT_ARG_KEYS)
	const unknown = Object.keys(args).filter((key) => !allowed.has(key) && !internal.has(key))
	if (unknown.length > 0) {
		throw new Error(`${context} received unsupported argument(s): ${unknown.join(', ')}`)
	}
}

export function stringArg(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function numberArg(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
	return undefined
}

export function booleanArg(value: unknown, fallback?: boolean): boolean | undefined {
	if (typeof value === 'boolean') return value
	return fallback
}

export function booleanArgWithFallback(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	const n = numberArg(value)
	if (typeof n !== 'number') return fallback
	return Math.max(min, Math.min(max, Math.floor(n)))
}

export function shapeIdArrayArg(value: unknown): string[] {
	if (typeof value === 'string' && value.trim()) return [value.trim()]
	if (!Array.isArray(value)) return []
	const out = value.map(stringArg).filter(Boolean) as string[]
	return Array.from(new Set(out))
}

export function pointArg(value: unknown): { x: number; y: number } | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
	const obj = value as Record<string, unknown>
	const x = numberArg(obj.x)
	const y = numberArg(obj.y)
	return x === undefined || y === undefined ? undefined : { x, y }
}

function parseCardCreateArgs(args: Record<string, unknown>): AgentCardCreateArgs {
	return {
		kind: 'card',
		x: numberArg(args.x),
		y: numberArg(args.y),
		w: numberArg(args.w),
		h: numberArg(args.h),
		color: colorArg(args.color),
		blockId: stringArg(args.blockId),
		isMain: booleanArg(args.isMain),
		isCollapsed: booleanArg(args.isCollapsed),
		showMask: booleanArg(args.showMask),
		select: booleanArg(args.select),
		zoom: booleanArg(args.zoom),
	}
}

function parseSingleBlockCreateArgs(args: Record<string, unknown>): AgentSingleBlockCreateArgs {
	return {
		kind: 'single-block',
		x: numberArg(args.x),
		y: numberArg(args.y),
		w: numberArg(args.w),
		h: numberArg(args.h),
		color: colorArg(args.color),
		blockId: stringArg(args.blockId),
		select: booleanArg(args.select),
		zoom: booleanArg(args.zoom),
	}
}

function parseBranchCreateArgs(args: Record<string, unknown>): AgentBranchCreateArgs {
	return {
		kind: 'branch',
		x: numberArg(args.x),
		y: numberArg(args.y),
		rootShapeId: stringArg(args.rootShapeId),
		childIds: stringArrayArg(args.childIds),
		children: parseBranchChildArray(args.children),
		leftChildren: parseBranchChildArray(args.leftChildren),
		rightChildren: parseBranchChildArray(args.rightChildren),
		direction: parseSide(args.direction),
		horizontalGap: numberArg(args.horizontalGap),
		verticalGap: numberArg(args.verticalGap),
		lineStyle: args.lineStyle === undefined ? undefined : normalizeBranchLineStyle(args.lineStyle),
		lineWidth: numberArg(args.lineWidth),
		snapDistance: numberArg(args.snapDistance),
		showBackground: booleanArg(args.showBackground),
		color: colorArg(args.color),
		select: booleanArg(args.select),
		zoom: booleanArg(args.zoom),
	}
}

function parseKind(value: unknown): AgentCreateKind {
	const raw = stringArg(value)
	if (raw === 'card' || raw === 'single-block' || raw === 'branch') return raw
	throw new Error('kind must be "card", "single-block", or "branch"; use tldraw_create_basic_shape for note/text/geo/arrow/line/frame and other basic shapes')
}

function parseBasicKind(value: unknown): AgentBasicShapeCreateArgs['kind'] {
	const raw = stringArg(value)
	if (
		raw === 'text' ||
		raw === 'note' ||
		raw === 'geo' ||
		raw === 'arrow' ||
		raw === 'line' ||
		raw === 'draw' ||
		raw === 'highlight' ||
		raw === 'frame' ||
		raw === 'bezier-connector' ||
		raw === 'slide' ||
		raw === 'mind-map' ||
		raw === 'js-shape'
	) return raw
	throw new Error('kind must be "text", "note", "geo", "arrow", "line", "draw", "highlight", "frame", "bezier-connector", "slide", "mind-map", or "js-shape"')
}

function parseConnectorKind(value: unknown): AgentConnectorKind | undefined {
	const raw = stringArg(value)
	if (raw === 'arrow' || raw === 'bezier-connector') return raw
	return undefined
}

function parseMindMapDirection(value: unknown): AgentBasicShapeCreateArgs['direction'] {
	const raw = stringArg(value)
	return raw === 'left' || raw === 'right' || raw === 'both' ? raw : undefined
}

function parseSide(value: unknown): AgentBranchSide | undefined {
	const raw = stringArg(value)
	return raw === 'left' || raw === 'right' ? raw : undefined
}

function colorArg(value: unknown) {
	return value === undefined || value === null || value === '' ? undefined : normalizeAgentColor(value)
}

function stringArrayArg(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined
	const out = value.map(stringArg).filter(Boolean) as string[]
	return out.length ? out : undefined
}

function parseBranchChildRef(value: unknown): AgentBranchChildRef | undefined {
	if (typeof value === 'string' && value.trim()) return value.trim()
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

	const obj = value as Record<string, unknown>
	const kind = parseChildKind(obj.kind)
	return {
		shapeId: stringArg(obj.shapeId),
		kind,
		x: numberArg(obj.x),
		y: numberArg(obj.y),
		w: numberArg(obj.w),
		h: numberArg(obj.h),
		color: colorArg(obj.color),
		blockId: stringArg(obj.blockId),
		isMain: kind === 'card' ? booleanArg(obj.isMain) : undefined,
		isCollapsed: kind === 'card' ? booleanArg(obj.isCollapsed) : undefined,
		showMask: kind === 'card' ? booleanArg(obj.showMask) : undefined,
		side: parseSide(obj.side),
	}
}

function parseBranchChildArray(value: unknown): AgentBranchChildRef[] | undefined {
	if (!Array.isArray(value)) return undefined
	const out = value.map(parseBranchChildRef).filter(Boolean) as AgentBranchChildRef[]
	return out.length ? out : undefined
}

function parseChildKind(value: unknown): 'card' | 'single-block' | undefined {
	const raw = stringArg(value)
	if (raw === 'card' || raw === 'single-block') return raw
	return undefined
}
