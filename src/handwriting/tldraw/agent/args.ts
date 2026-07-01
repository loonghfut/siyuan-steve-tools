import type { AgentBranchSide, AgentCreateKind, AgentNodeKind, AgentCreateShapeArgs, AgentShapeRef } from './types'

export function parseCreateShapeArgs(args: Record<string, unknown>): AgentCreateShapeArgs {
    const kind = parseKind(args.kind)
    return {
        kind,
        x: numberArg(args.x),
        y: numberArg(args.y),
        w: numberArg(args.w),
        h: numberArg(args.h),
        color: stringArg(args.color),
        blockId: stringArg(args.blockId),
        isMain: booleanArg(args.isMain),
        isCollapsed: booleanArg(args.isCollapsed),
        showMask: booleanArg(args.showMask),
        select: booleanArg(args.select),
        zoom: booleanArg(args.zoom),
        rootShapeId: stringArg(args.rootShapeId),
        root: parseShapeRef(args.root),
        childShapeIds: stringArrayArg(args.childShapeIds),
        children: parseShapeRefArray(args.children),
        leftChildren: parseShapeRefArray(args.leftChildren),
        rightChildren: parseShapeRefArray(args.rightChildren),
        direction: parseSide(args.direction),
        horizontalGap: numberArg(args.horizontalGap),
        verticalGap: numberArg(args.verticalGap),
        lineStyle: stringArg(args.lineStyle),
        lineWidth: numberArg(args.lineWidth),
        snapDistance: numberArg(args.snapDistance),
        showBackground: booleanArg(args.showBackground),
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

function parseKind(value: unknown): AgentCreateKind {
    const raw = stringArg(value)
    if (raw === 'card' || raw === 'single-block' || raw === 'branch') return raw
    if (raw === 'singleblock') return 'single-block'
    return 'card'
}

function parseSide(value: unknown): AgentBranchSide | undefined {
    const raw = stringArg(value)
    return raw === 'left' || raw === 'right' ? raw : undefined
}

function stringArrayArg(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined
    const out = value.map(stringArg).filter(Boolean) as string[]
    return out.length ? out : undefined
}

function parseShapeRef(value: unknown): AgentShapeRef | undefined {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const obj = value as Record<string, unknown>
    return {
        shapeId: stringArg(obj.shapeId),
        id: stringArg(obj.id),
        kind: parseRefKind(obj.kind),
        blockId: stringArg(obj.blockId),
        x: numberArg(obj.x),
        y: numberArg(obj.y),
        w: numberArg(obj.w),
        h: numberArg(obj.h),
        color: stringArg(obj.color),
        isMain: booleanArg(obj.isMain),
        isCollapsed: booleanArg(obj.isCollapsed),
        showMask: booleanArg(obj.showMask),
        side: parseSide(obj.side),
        rootShapeId: stringArg(obj.rootShapeId),
        root: parseShapeRef(obj.root),
        childShapeIds: stringArrayArg(obj.childShapeIds),
        children: parseShapeRefArray(obj.children),
        leftChildren: parseShapeRefArray(obj.leftChildren),
        rightChildren: parseShapeRefArray(obj.rightChildren),
        direction: parseSide(obj.direction),
        horizontalGap: numberArg(obj.horizontalGap),
        verticalGap: numberArg(obj.verticalGap),
        lineStyle: stringArg(obj.lineStyle),
        lineWidth: numberArg(obj.lineWidth),
        snapDistance: numberArg(obj.snapDistance),
        showBackground: booleanArg(obj.showBackground),
    }
}

function parseShapeRefArray(value: unknown): AgentShapeRef[] | undefined {
    if (!Array.isArray(value)) return undefined
    const out = value.map(parseShapeRef).filter(Boolean) as AgentShapeRef[]
    return out.length ? out : undefined
}

function parseRefKind(value: unknown): AgentNodeKind | undefined {
    const raw = stringArg(value)
    if (raw === 'card' || raw === 'single-block' || raw === 'branch') return raw
    if (raw === 'singleblock') return 'single-block'
    return undefined
}
