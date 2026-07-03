import type { TLDefaultColorStyle } from '@tldraw/tldraw'
import type { BranchLineStyle } from '../../BranchShape/branch-shape-types'

const DEFAULT_COLOR: TLDefaultColorStyle = 'black'
const DEFAULT_BRANCH_LINE_STYLE: BranchLineStyle = 'curve-solid'

const COLOR_VALUES = [
    'black',
    'grey',
    'light-violet',
    'violet',
    'blue',
    'light-blue',
    'yellow',
    'orange',
    'green',
    'light-green',
    'light-red',
    'red',
    'white',
] as const

const COLOR_ALIASES: Record<string, TLDefaultColorStyle> = {
    gray: 'grey',
    purple: 'violet',
    violet: 'violet',
    cyan: 'light-blue',
    sky: 'light-blue',
    lime: 'light-green',
    pink: 'light-red',
}

const HEX_COLOR_BUCKETS: Array<{ color: TLDefaultColorStyle; rgb: [number, number, number] }> = [
    { color: 'black', rgb: [30, 30, 30] },
    { color: 'grey', rgb: [128, 128, 128] },
    { color: 'white', rgb: [255, 255, 255] },
    { color: 'red', rgb: [224, 49, 49] },
    { color: 'light-red', rgb: [255, 135, 135] },
    { color: 'orange', rgb: [245, 159, 0] },
    { color: 'yellow', rgb: [250, 220, 70] },
    { color: 'green', rgb: [47, 158, 68] },
    { color: 'light-green', rgb: [140, 233, 154] },
    { color: 'blue', rgb: [25, 113, 194] },
    { color: 'light-blue', rgb: [116, 192, 252] },
    { color: 'violet', rgb: [103, 58, 183] },
    { color: 'light-violet', rgb: [177, 151, 252] },
]

const COLOR_SET = new Set<string>(COLOR_VALUES)

const BRANCH_LINE_STYLES = new Set<string>([
    'curve-solid',
    'elbow-solid',
    'straight-solid',
    'curve-dashed',
    'frame-floating',
])

export function normalizeAgentColor(value: unknown): TLDefaultColorStyle {
    if (typeof value !== 'string') return DEFAULT_COLOR

    const raw = value.trim().toLowerCase()
    if (!raw) return DEFAULT_COLOR
    if (COLOR_SET.has(raw)) return raw as TLDefaultColorStyle
    if (COLOR_ALIASES[raw]) return COLOR_ALIASES[raw]

    const hex = parseHexColor(raw)
    if (hex) return nearestColor(hex)

    return DEFAULT_COLOR
}

export function normalizeOptionalAgentColor(value: unknown): TLDefaultColorStyle | undefined {
    if (value === undefined || value === null || value === '') return undefined
    return normalizeAgentColor(value)
}

export function normalizeBranchLineStyle(value: unknown): BranchLineStyle {
    if (typeof value !== 'string') return DEFAULT_BRANCH_LINE_STYLE
    const raw = value.trim()
    return BRANCH_LINE_STYLES.has(raw) ? raw as BranchLineStyle : DEFAULT_BRANCH_LINE_STYLE
}

export function finiteNumberInRange(value: unknown, fallback: number, min: number, max: number): number {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
    return Math.max(min, Math.min(max, n))
}

function parseHexColor(value: string): [number, number, number] | null {
    const match = value.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (!match) return null

    const hex = match[1].length === 3
        ? match[1].split('').map((part) => part + part).join('')
        : match[1]

    return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
    ]
}

function nearestColor(rgb: [number, number, number]): TLDefaultColorStyle {
    let best = HEX_COLOR_BUCKETS[0]
    let bestDistance = Number.POSITIVE_INFINITY

    for (const bucket of HEX_COLOR_BUCKETS) {
        const distance =
            Math.pow(rgb[0] - bucket.rgb[0], 2) +
            Math.pow(rgb[1] - bucket.rgb[1], 2) +
            Math.pow(rgb[2] - bucket.rgb[2], 2)
        if (distance < bestDistance) {
            best = bucket
            bestDistance = distance
        }
    }

    return best.color
}
