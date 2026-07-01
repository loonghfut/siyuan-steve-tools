import type {
	AgentBranchChildRef,
	AgentBranchCreateArgs,
	AgentBranchSide,
	AgentCardCreateArgs,
	AgentCreateKind,
	AgentCreateShapeArgs,
	AgentSingleBlockCreateArgs,
} from './types'
import { normalizeAgentColor, normalizeBranchLineStyle } from './schema'

export function parseCreateShapeArgs(args: Record<string, unknown>): AgentCreateShapeArgs {
	const kind = parseKind(args.kind)

	if (kind === 'card') {
		return parseCardCreateArgs(args)
	}
	if (kind === 'single-block') {
		return parseSingleBlockCreateArgs(args)
	}
	return parseBranchCreateArgs(args)
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
	throw new Error('kind must be "card", "single-block", or "branch"')
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
