import type {
    AgentBasicShapeCreateArgs,
    AgentBranchChildRef,
    AgentBranchCreateArgs,
    AgentCardCreateArgs,
    AgentConnectorCreateArgs,
    AgentCreateShapeArgs,
    AgentResultMode,
    AgentShapeSummary,
    AgentShapeUpdatePatch,
    AgentSingleBlockCreateArgs,
} from '../core/types';
import { normalizeAgentColor, normalizeBranchLineStyle } from '../core/schema';

const MAX_PLAN_WRITES = 50;

const CREATE_KINDS = new Set(['card', 'single-block', 'branch', 'text', 'frame', 'note', 'geo', 'slide', 'mind-map']);
const BUSINESS_CREATE_KINDS = new Set(['card', 'single-block', 'branch']);
const PLAN_OPS = new Set(['create', 'branch', 'connect', 'update', 'layout', 'focus', 'save']);
const LAYOUT_STYLES = new Set(['row', 'column', 'grid', 'branch', 'mindmap-like']);

type PlanCreatedRefs = Record<string, string[]>;
type AgentBranchNodeCreateArgs = AgentCardCreateArgs | AgentSingleBlockCreateArgs;
type NormalizedBranchRoot =
    | { shapeId: string; createArgs?: undefined }
    | { shapeId?: undefined; createArgs: AgentBranchNodeCreateArgs };

export type AgentPlanApplyOptions = {
    whiteboardId?: string;
    goal?: string;
    steps?: unknown[];
    dryRun?: boolean;
    select?: boolean;
    zoom?: boolean;
    save?: boolean;
    resultMode?: AgentResultMode;
};

export type AgentPlanAdapter = {
    getSummary: () => { selectedShapeIds?: string[]; [key: string]: unknown };
    createShape: (options: AgentCreateShapeArgs) => Promise<{ createdShapeIds?: string[]; [key: string]: unknown }>;
    createBasicShape: (options: AgentBasicShapeCreateArgs) => { createdShapeIds?: string[]; [key: string]: unknown };
    createConnector: (options: AgentConnectorCreateArgs) => Promise<{ createdShapeIds?: string[]; [key: string]: unknown }> | { createdShapeIds?: string[]; [key: string]: unknown };
    updateShapesBatch: (options: { patches: AgentShapeUpdatePatch[]; select?: boolean; zoom?: boolean; resultMode?: AgentResultMode }) => unknown;
    getShapeDetails: (options: { shapeIds?: string[]; limit?: number; includeBindings?: boolean; includeLinkedBlockContent?: boolean }) => Promise<{ shapes: AgentShapeSummary[] }> | { shapes: AgentShapeSummary[] };
    selectShape: (shapeId: string, zoom?: boolean) => unknown;
    zoomToShapes: (options: { shapeIds: string[] }) => unknown;
    focusShapes?: (shapeIds: string[]) => unknown;
    save: () => Promise<unknown>;
};

type AgentPlanState = {
    selectedShapeIds: string[];
    created: PlanCreatedRefs;
    lastShapeIds: string[];
};

type NormalizedPlanStep = {
    op: string;
    writeCount: number;
    [key: string]: unknown;
};

export async function executeAgentPlan(options: AgentPlanApplyOptions, adapter: AgentPlanAdapter) {
    const steps = normalizeSteps(options.steps);
    const summary = adapter.getSummary();
    const state: AgentPlanState = {
        selectedShapeIds: Array.isArray(summary.selectedShapeIds) ? summary.selectedShapeIds.map(String) : [],
        created: {},
        lastShapeIds: [],
    };
    const normalizedSteps: NormalizedPlanStep[] = [];
    const results: unknown[] = [];
    let writeCount = 0;
    let saved = false;
    let hasExplicitFocus = false;

    for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        const op = stringArg(step.op);
        if (!op || !PLAN_OPS.has(op)) {
            throw new Error(`steps[${index}].op must be one of create, branch, connect, update, layout, focus, save`);
        }
        if (op === 'focus') hasExplicitFocus = true;

        const normalized = normalizePlanStep(step, op, state);
        writeCount += normalized.writeCount;
        if (writeCount > MAX_PLAN_WRITES) {
            throw new Error(`plan writes exceed ${MAX_PLAN_WRITES}; split this into smaller tldraw_apply_plan calls`);
        }
        normalizedSteps.push(normalized);

        if (options.dryRun === true) {
            applyDryRunState(normalized, state);
            results.push({ dryRun: true, step: normalized });
            continue;
        }

        const result = await executeNormalizedStep(normalized, adapter, state, options);
        results.push(result);
        if (op === 'save') saved = true;
    }

    if (options.dryRun !== true && options.save === true && !saved) {
        results.push(await adapter.save());
        saved = true;
    }

    // One camera move at plan end instead of per-step animations; explicit focus steps win.
    if (options.dryRun !== true && options.zoom !== false && !hasExplicitFocus && adapter.focusShapes) {
        const focusIds = uniqueShapeIds([
            ...Object.values(state.created).flat(),
            ...state.lastShapeIds,
        ]);
        if (focusIds.length) adapter.focusShapes(focusIds);
    }

    const finalSummary = adapter.getSummary();
    const output: Record<string, unknown> = {
        goal: stringArg(options.goal),
        dryRun: options.dryRun === true,
        writeCount,
        saved,
        summary: options.resultMode === 'full' ? finalSummary : compactPlanSummary(finalSummary),
    };
    if (options.resultMode === 'full') {
        output.created = state.created;
        output.lastShapeIds = state.lastShapeIds;
    } else {
        output.createdAliases = summarizeCreatedRefs(state.created);
        output.createdCount = countCreatedRefs(state.created);
        output.lastShapeCount = state.lastShapeIds.length;
    }
    if (options.dryRun === true || options.resultMode === 'full') output.normalizedSteps = normalizedSteps;
    if (options.resultMode === 'full') output.results = results;
    return output;
}

function compactPlanSummary(summary: { selectedShapeIds?: string[]; sampleShapes?: unknown; [key: string]: unknown }) {
    const compact = { ...summary };
    const selectedShapeCount = Array.isArray(summary.selectedShapeIds) ? summary.selectedShapeIds.length : 0;
    delete compact.selectedShapeIds;
    delete compact.sampleShapes;
    return {
        ...compact,
        selectedShapeCount,
    };
}

function summarizeCreatedRefs(created: PlanCreatedRefs): Record<string, number> {
    return Object.fromEntries(Object.entries(created).map(([alias, shapeIds]) => [alias, shapeIds.length]));
}

function countCreatedRefs(created: PlanCreatedRefs): number {
    return Object.values(created).reduce((sum, shapeIds) => sum + shapeIds.length, 0);
}

function normalizeSteps(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('steps must be a non-empty array');
    }
    return value.map((step, index) => {
        if (!step || typeof step !== 'object' || Array.isArray(step)) {
            throw new Error(`steps[${index}] must be an object`);
        }
        return step as Record<string, unknown>;
    });
}

function normalizePlanStep(step: Record<string, unknown>, op: string, state: AgentPlanState): NormalizedPlanStep {
    if (op === 'create') {
        if (stringArg(step.kind) === 'branch') return normalizeBranchStep(step, state);
        return normalizeCreateStep(step);
    }
    if (op === 'branch') return normalizeBranchStep(step, state);
    if (op === 'connect') {
        if (stringArg(step.kind) === 'branch') return normalizeConnectBranchStep(step, state);
        return normalizeConnectStep(step, state);
    }
    if (op === 'update') return normalizeUpdateStep(step, state);
    if (op === 'layout') return normalizeLayoutStep(step, state);
    if (op === 'focus') return normalizeFocusStep(step, state);
    assertKnownPlanKeys(step, ['op'], 'save step');
    return { op: 'save', writeCount: 0 };
}

function normalizeCreateStep(step: Record<string, unknown>): NormalizedPlanStep {
    assertKnownPlanKeys(step, [
        'op', 'as', 'kind', 'x', 'y', 'w', 'h', 'color', 'blockId', 'contentMarkdown', 'title', 'text', 'geo', 'name',
        'isMain', 'isCollapsed', 'showMask', 'direction', 'theme', 'select', 'zoom',
    ], 'create step');
    rejectUnsafeCreateKeys(step);

    const kind = stringArg(step.kind);
    if (!kind || !CREATE_KINDS.has(kind)) {
        throw new Error('create.kind must be card, single-block, branch, text, frame, note, geo, slide, or mind-map');
    }

    const as = optionalAlias(step.as);
    return {
        op: 'create',
        as,
        kind,
        args: {
            kind,
            x: numberArg(step.x),
            y: numberArg(step.y),
            w: numberArg(step.w),
            h: numberArg(step.h),
            color: colorArg(step.color),
            blockId: stringArg(step.blockId),
            contentMarkdown: stringArg(step.contentMarkdown),
            title: stringArg(step.title),
            text: stringArg(step.text),
            geo: stringArg(step.geo),
            name: stringArg(step.name),
            isMain: booleanArg(step.isMain),
            isCollapsed: booleanArg(step.isCollapsed),
            showMask: booleanArg(step.showMask),
            direction: stringArg(step.direction),
            theme: stringArg(step.theme),
            select: booleanArg(step.select),
            zoom: booleanArg(step.zoom),
        },
        writeCount: 1,
    };
}

function normalizeBranchStep(step: Record<string, unknown>, state: AgentPlanState): NormalizedPlanStep {
    assertKnownPlanKeys(step, [
        'op', 'as', 'kind', 'root', 'from', 'rootShapeId', 'child', 'to', 'childIds',
        'children', 'leftChildren', 'rightChildren', 'x', 'y', 'direction', 'horizontalGap',
        'verticalGap', 'lineStyle', 'lineWidth', 'snapDistance', 'showBackground',
        'color', 'select', 'zoom',
    ], 'branch step');
    rejectUnsafeCreateKeys(step);
    const kind = stringArg(step.kind);
    if (kind && kind !== 'branch') throw new Error('branch.kind must be branch when provided');

    const rootSource = step.root ?? step.from ?? step.rootShapeId ??
        (state.selectedShapeIds.length >= 2 ? '$selection[0]' : undefined);
    const root = normalizeBranchRoot(rootSource, state, 'branch.root');
    const hasExplicitChildren =
        step.child !== undefined ||
        step.to !== undefined ||
        step.childIds !== undefined ||
        step.children !== undefined ||
        step.leftChildren !== undefined ||
        step.rightChildren !== undefined;
    const defaultChild = !hasExplicitChildren && state.selectedShapeIds.length >= 2 ? '$selection[1]' : undefined;
    const children = [
        ...normalizeBranchChildren(step.child ?? step.to ?? defaultChild, state, 'branch.child'),
        ...normalizeBranchChildren(step.childIds, state, 'branch.childIds'),
        ...normalizeBranchChildren(step.children, state, 'branch.children'),
    ];
    const leftChildren = normalizeBranchChildren(step.leftChildren, state, 'branch.leftChildren', 'left');
    const rightChildren = normalizeBranchChildren(step.rightChildren, state, 'branch.rightChildren', 'right');
    const childCount = children.length + leftChildren.length + rightChildren.length;
    if (childCount === 0) throw new Error('branch requires at least one child shape or child node');

    const args: AgentBranchCreateArgs = {
        kind: 'branch',
        x: numberArg(step.x),
        y: numberArg(step.y),
        rootShapeId: root.shapeId,
        children,
        leftChildren,
        rightChildren,
        direction: branchSideArg(step.direction),
        horizontalGap: numberArg(step.horizontalGap),
        verticalGap: numberArg(step.verticalGap),
        lineStyle: step.lineStyle === undefined ? undefined : normalizeBranchLineStyle(step.lineStyle),
        lineWidth: numberArg(step.lineWidth),
        snapDistance: numberArg(step.snapDistance),
        showBackground: booleanArg(step.showBackground),
        color: colorArg(step.color),
        select: booleanArg(step.select),
        zoom: booleanArg(step.zoom),
    };

    return {
        op: 'branch',
        as: optionalAlias(step.as),
        root,
        args,
        select: booleanArg(step.select),
        zoom: booleanArg(step.zoom),
        writeCount: 1 + (root.createArgs ? 1 : 0) + countBranchChildCreations([...children, ...leftChildren, ...rightChildren]),
    };
}

function normalizeBranchRoot(value: unknown, state: AgentPlanState, label: string): NormalizedBranchRoot {
    if (typeof value === 'string') {
        return { shapeId: firstResolvedShapeId(value, state, label) };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} is required`);
    }

    const obj = value as Record<string, unknown>;
    assertKnownPlanKeys(obj, [
        'shapeId', 'target', 'kind', 'x', 'y', 'w', 'h', 'color', 'blockId',
        'contentMarkdown', 'title', 'isMain', 'isCollapsed', 'showMask',
    ], label);
    const shapeRef = obj.shapeId ?? obj.target;
    if (shapeRef !== undefined) {
        return { shapeId: firstResolvedShapeId(shapeRef, state, `${label}.shapeId`) };
    }
    return { createArgs: buildBranchNodeCreateArgs(obj, label, 'single-block') };
}

function normalizeBranchChildren(value: unknown, state: AgentPlanState, label: string, forcedSide?: 'left' | 'right'): AgentBranchChildRef[] {
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => normalizeBranchChildren(item, state, `${label}[${index}]`, forcedSide));
    }
    if (typeof value === 'string') {
        return resolveShapeRefs(value, state, label).map((shapeId) => branchExistingChild(shapeId, forcedSide));
    }
    if (!value || typeof value !== 'object') {
        throw new Error(`${label} must be a shape reference or branch child object`);
    }

    const obj = value as Record<string, unknown>;
    assertKnownPlanKeys(obj, [
        'shapeId', 'target', 'kind', 'x', 'y', 'w', 'h', 'color', 'blockId',
        'contentMarkdown', 'title', 'isMain', 'isCollapsed', 'showMask', 'side',
    ], label);
    const side = forcedSide || branchSideArg(obj.side);
    const shapeRef = obj.shapeId ?? obj.target;
    if (shapeRef !== undefined) {
        return resolveShapeRefs(shapeRef, state, `${label}.shapeId`).map((shapeId) => branchExistingChild(shapeId, side));
    }

    return [{ ...buildBranchNodeCreateArgs(obj, label, 'single-block'), side }];
}

function branchExistingChild(shapeId: string, side?: 'left' | 'right'): AgentBranchChildRef {
    return side ? { shapeId, side } : { shapeId };
}

function buildBranchNodeCreateArgs(
    obj: Record<string, unknown>,
    label: string,
    fallbackKind: 'card' | 'single-block'
): AgentBranchNodeCreateArgs {
    const kind = branchNodeKind(obj.kind, fallbackKind, label);
    if (kind === 'card') {
        return {
            kind,
            x: numberArg(obj.x),
            y: numberArg(obj.y),
            w: numberArg(obj.w),
            h: numberArg(obj.h),
            color: colorArg(obj.color),
            blockId: stringArg(obj.blockId),
            contentMarkdown: stringArg(obj.contentMarkdown),
            title: stringArg(obj.title),
            isMain: booleanArg(obj.isMain),
            isCollapsed: booleanArg(obj.isCollapsed),
            showMask: booleanArg(obj.showMask),
            select: false,
            zoom: false,
        };
    }
    return {
        kind,
        x: numberArg(obj.x),
        y: numberArg(obj.y),
        w: numberArg(obj.w),
        h: numberArg(obj.h),
        color: colorArg(obj.color),
        blockId: stringArg(obj.blockId),
        contentMarkdown: stringArg(obj.contentMarkdown),
        title: stringArg(obj.title),
        select: false,
        zoom: false,
    };
}

function branchNodeKind(value: unknown, fallback: 'card' | 'single-block', label: string): 'card' | 'single-block' {
    const raw = stringArg(value);
    if (!raw) return fallback;
    if (raw === 'card' || raw === 'single-block') return raw;
    throw new Error(`${label}.kind must be card or single-block`);
}

function branchSideArg(value: unknown): 'left' | 'right' | undefined {
    const raw = stringArg(value);
    return raw === 'left' || raw === 'right' ? raw : undefined;
}

function countBranchChildCreations(children: AgentBranchChildRef[]) {
    return children.filter((child) => typeof child === 'object' && child && !child.shapeId).length;
}

function normalizeConnectBranchStep(step: Record<string, unknown>, state: AgentPlanState): NormalizedPlanStep {
    assertKnownPlanKeys(step, [
        'op', 'as', 'from', 'to', 'startShapeId', 'endShapeId', 'shapeIds', 'kind',
        'text', 'color', 'strokeWidth', 'lineWidth', 'select', 'zoom', 'side', 'direction',
        'horizontalGap', 'verticalGap', 'lineStyle', 'snapDistance', 'showBackground',
    ], 'connect branch step');

    const from = firstResolvedShapeId(step.from ?? step.startShapeId ?? firstArrayItem(step.shapeIds), state, 'connect branch.from');
    const to = firstResolvedShapeId(step.to ?? step.endShapeId ?? secondArrayItem(step.shapeIds), state, 'connect branch.to');
    return {
        op: 'connect',
        as: optionalAlias(step.as),
        from,
        to,
        args: {
            kind: 'branch',
            startShapeId: from,
            endShapeId: to,
            text: stringArg(step.text),
            color: colorArg(step.color),
            strokeWidth: numberArg(step.strokeWidth ?? step.lineWidth),
            side: branchSideArg(step.side ?? step.direction),
            horizontalGap: numberArg(step.horizontalGap),
            verticalGap: numberArg(step.verticalGap),
            select: booleanArg(step.select),
            zoom: booleanArg(step.zoom),
        },
        writeCount: 1,
    };
}

function normalizeConnectStep(step: Record<string, unknown>, state: AgentPlanState): NormalizedPlanStep {
    assertKnownPlanKeys(step, [
        'op', 'as', 'from', 'to', 'startShapeId', 'endShapeId', 'shapeIds', 'kind',
        'text', 'color', 'strokeWidth', 'lineWidth', 'select', 'zoom',
    ], 'connect step');
    const from = firstResolvedShapeId(step.from ?? step.startShapeId ?? step.shapeIds, state, 'connect.from');
    const to = firstResolvedShapeId(step.to ?? step.endShapeId ?? secondArrayItem(step.shapeIds), state, 'connect.to');
    const kind = stringArg(step.kind);
    if (kind && kind !== 'arrow' && kind !== 'bezier-connector') {
        throw new Error('connect.kind must be arrow or bezier-connector');
    }
    return {
        op: 'connect',
        as: optionalAlias(step.as),
        from,
        to,
        args: {
            kind,
            startShapeId: from,
            endShapeId: to,
            text: stringArg(step.text),
            color: colorArg(step.color),
            strokeWidth: numberArg(step.strokeWidth ?? step.lineWidth),
            select: booleanArg(step.select),
            zoom: booleanArg(step.zoom),
        },
        writeCount: 1,
    };
}

function normalizeUpdateStep(step: Record<string, unknown>, state: AgentPlanState): NormalizedPlanStep {
    assertKnownPlanKeys(step, [
        'op', 'target', 'shapeId', 'shapeIds', 'patches', 'x', 'y', 'w', 'h',
        'color', 'isCollapsed', 'text', 'name', 'select', 'zoom',
    ], 'update step');
    const patches = normalizeUpdatePatches(step, state);
    return {
        op: 'update',
        patches,
        select: booleanArg(step.select),
        zoom: booleanArg(step.zoom),
        writeCount: patches.length,
    };
}

function normalizeLayoutStep(step: Record<string, unknown>, state: AgentPlanState): NormalizedPlanStep {
    assertKnownPlanKeys(step, [
        'op', 'target', 'shapeId', 'shapeIds', 'style', 'gap', 'horizontalGap',
        'verticalGap', 'columns', 'x', 'y', 'select', 'zoom',
    ], 'layout step');
    const target = resolveShapeRefs(step.target ?? step.shapeIds ?? step.shapeId ?? '$selection', state, 'layout.target');
    if (target.length === 0) throw new Error('layout.target resolved to no shapes');
    const style = stringArg(step.style) || 'row';
    if (!LAYOUT_STYLES.has(style)) {
        throw new Error('layout.style must be row, column, grid, branch, or mindmap-like');
    }
    return {
        op: 'layout',
        target,
        style,
        gap: numberArg(step.gap),
        horizontalGap: numberArg(step.horizontalGap),
        verticalGap: numberArg(step.verticalGap),
        columns: numberArg(step.columns),
        x: numberArg(step.x),
        y: numberArg(step.y),
        select: booleanArg(step.select),
        zoom: booleanArg(step.zoom),
        writeCount: target.length,
    };
}

function normalizeFocusStep(step: Record<string, unknown>, state: AgentPlanState): NormalizedPlanStep {
    assertKnownPlanKeys(step, ['op', 'target', 'shapeId', 'shapeIds', 'zoom'], 'focus step');
    const target = resolveShapeRefs(step.target ?? step.shapeIds ?? step.shapeId ?? '$last', state, 'focus.target');
    return {
        op: 'focus',
        target,
        zoom: booleanArg(step.zoom),
        writeCount: 0,
    };
}

async function executeNormalizedStep(
    step: NormalizedPlanStep,
    adapter: AgentPlanAdapter,
    state: AgentPlanState,
    options: AgentPlanApplyOptions
) {
    if (step.op === 'create') {
        const args = { ...(step.args as Record<string, unknown>) };
        args.select = stepSelect(step, options, false);
        args.zoom = stepZoom(step, options, false);
        args.resultMode = options.resultMode;
        const result = BUSINESS_CREATE_KINDS.has(String(args.kind))
            ? await adapter.createShape(args as AgentCreateShapeArgs)
            : adapter.createBasicShape(args as AgentBasicShapeCreateArgs);
        const createdShapeIds = normalizeShapeIds(result.createdShapeIds);
        recordCreated(step.as, createdShapeIds, state);
        return result;
    }

    if (step.op === 'branch') {
        const args = { ...(step.args as AgentBranchCreateArgs) };
        const root = step.root as NormalizedBranchRoot;
        let rootShapeId = root.shapeId;
        let rootResult: { createdShapeIds?: string[]; [key: string]: unknown } | undefined;
        if (root.createArgs) {
            rootResult = await adapter.createShape({
                ...root.createArgs,
                select: false,
                zoom: false,
                resultMode: options.resultMode,
            });
            rootShapeId = firstCreatedShapeId(rootResult, 'branch root');
        }
        args.rootShapeId = rootShapeId;
        args.select = stepSelect(step, options, false);
        args.zoom = stepZoom(step, options, false);
        args.resultMode = options.resultMode;
        const result = await adapter.createShape(args);
        const branchShapeIds = normalizeBranchCreatedShapeIds(result);
        recordCreated(step.as, branchShapeIds, state);
        return rootResult ? { root: rootResult, branch: result } : result;
    }

    if (step.op === 'connect') {
        const args = { ...(step.args as Record<string, unknown>) };
        args.select = stepSelect(step, options, false);
        args.zoom = stepZoom(step, options, false);
        args.resultMode = options.resultMode;
        const result = await adapter.createConnector(args as AgentConnectorCreateArgs);
        const createdShapeIds = normalizeConnectorResultShapeIds(result);
        recordCreated(step.as, createdShapeIds, state);
        return result;
    }

    if (step.op === 'update') {
        const patches = step.patches as AgentShapeUpdatePatch[];
        const result = adapter.updateShapesBatch({
            patches,
            select: stepSelect(step, options, false),
            zoom: stepZoom(step, options, false),
            resultMode: options.resultMode,
        });
        state.lastShapeIds = patches.map((patch) => patch.shapeId);
        return result;
    }

    if (step.op === 'layout') {
        const shapeIds = step.target as string[];
        const details = await adapter.getShapeDetails({
            shapeIds,
            limit: shapeIds.length,
            includeBindings: false,
            includeLinkedBlockContent: false,
        });
        const patches = buildLayoutPatches(shapeIds, details.shapes, step);
        const result = adapter.updateShapesBatch({
            patches,
            select: stepSelect(step, options, false),
            zoom: stepZoom(step, options, false),
            resultMode: options.resultMode,
        });
        state.lastShapeIds = patches.map((patch) => patch.shapeId);
        return result;
    }

    if (step.op === 'focus') {
        const shapeIds = step.target as string[];
        state.lastShapeIds = shapeIds;
        if (shapeIds.length === 1) return adapter.selectShape(shapeIds[0], stepZoom(step, options, true));
        if (shapeIds.length > 1 && stepZoom(step, options, true) !== false) return adapter.zoomToShapes({ shapeIds });
        if (shapeIds.length > 1) return adapter.selectShape(shapeIds[0], false);
        return { focusedShapeIds: [] };
    }

    return adapter.save();
}

function applyDryRunState(step: NormalizedPlanStep, state: AgentPlanState) {
    if (step.op === 'create') {
        const alias = typeof step.as === 'string' ? step.as : undefined;
        const placeholder = alias ? `$created.${alias}` : `$created.step${Object.keys(state.created).length + 1}`;
        recordCreated(alias, [placeholder], state);
        return;
    }
    if (step.op === 'connect') {
        const alias = typeof step.as === 'string' ? step.as : undefined;
        const placeholder = alias ? `$created.${alias}` : '$last';
        recordCreated(alias, [placeholder], state);
        return;
    }
    if (step.op === 'branch') {
        const alias = typeof step.as === 'string' ? step.as : undefined;
        const placeholder = alias ? `$created.${alias}` : '$last';
        recordCreated(alias, [placeholder], state);
        return;
    }
    if (Array.isArray(step.target)) state.lastShapeIds = step.target.map(String);
    if (Array.isArray(step.patches)) state.lastShapeIds = (step.patches as AgentShapeUpdatePatch[]).map((patch) => patch.shapeId);
}

function normalizeUpdatePatches(step: Record<string, unknown>, state: AgentPlanState): AgentShapeUpdatePatch[] {
    if (Array.isArray(step.patches)) {
        return step.patches.flatMap((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new Error(`update.patches[${index}] must be an object`);
            }
            const patch = item as Record<string, unknown>;
            assertKnownPlanKeys(patch, [
                'target', 'shapeId', 'shapeIds', 'x', 'y', 'w', 'h',
                'color', 'isCollapsed', 'text', 'name', 'select', 'zoom',
            ], `update.patches[${index}]`);
            const ids = resolveShapeRefs(patch.target ?? patch.shapeIds ?? patch.shapeId, state, `update.patches[${index}].target`);
            return ids.map((shapeId) => buildPatch(shapeId, patch));
        });
    }

    const ids = resolveShapeRefs(step.target ?? step.shapeIds ?? step.shapeId, state, 'update.target');
    return ids.map((shapeId) => buildPatch(shapeId, step));
}

function buildPatch(shapeId: string, source: Record<string, unknown>): AgentShapeUpdatePatch {
    return {
        shapeId,
        x: numberArg(source.x),
        y: numberArg(source.y),
        w: numberArg(source.w),
        h: numberArg(source.h),
        color: stringArg(source.color),
        isCollapsed: booleanArg(source.isCollapsed),
        text: stringArg(source.text),
        name: stringArg(source.name),
        select: booleanArg(source.select),
        zoom: booleanArg(source.zoom),
    };
}

function buildLayoutPatches(shapeIds: string[], shapes: AgentShapeSummary[], step: NormalizedPlanStep): AgentShapeUpdatePatch[] {
    const byId = new Map(shapes.map((shape) => [shape.id, shape]));
    const boxes = shapeIds.map((shapeId) => toShapeBox(shapeId, byId.get(shapeId)));
    const style = String(step.style || 'row');
    if (style === 'column') return layoutColumn(boxes, step);
    if (style === 'grid') return layoutGrid(boxes, step);
    if (style === 'branch' || style === 'mindmap-like') return layoutBranch(boxes, step, style === 'mindmap-like');
    return layoutRow(boxes, step);
}

type LayoutBox = { shapeId: string; x: number; y: number; w: number; h: number };

function toShapeBox(shapeId: string, shape?: AgentShapeSummary): LayoutBox {
    return {
        shapeId,
        x: Number(shape?.x || 0),
        y: Number(shape?.y || 0),
        w: Number(shape?.props?.w || 240),
        h: Number(shape?.props?.h || 120),
    };
}

function layoutRow(boxes: LayoutBox[], step: NormalizedPlanStep): AgentShapeUpdatePatch[] {
    const gap = numberValue(step.gap, 160);
    let cursor = numberValue(step.x, Math.min(...boxes.map((box) => box.x)));
    const y = numberValue(step.y, Math.min(...boxes.map((box) => box.y)));
    return boxes.map((box) => {
        const patch = { shapeId: box.shapeId, x: cursor, y };
        cursor += box.w + gap;
        return patch;
    });
}

function layoutColumn(boxes: LayoutBox[], step: NormalizedPlanStep): AgentShapeUpdatePatch[] {
    const gap = numberValue(step.gap, 140);
    const x = numberValue(step.x, Math.min(...boxes.map((box) => box.x)));
    let cursor = numberValue(step.y, Math.min(...boxes.map((box) => box.y)));
    return boxes.map((box) => {
        const patch = { shapeId: box.shapeId, x, y: cursor };
        cursor += box.h + gap;
        return patch;
    });
}

function layoutGrid(boxes: LayoutBox[], step: NormalizedPlanStep): AgentShapeUpdatePatch[] {
    const gap = numberValue(step.gap, 140);
    const columns = Math.max(1, Math.min(12, Math.floor(numberValue(step.columns, Math.ceil(Math.sqrt(boxes.length))))));
    const startX = numberValue(step.x, Math.min(...boxes.map((box) => box.x)));
    const startY = numberValue(step.y, Math.min(...boxes.map((box) => box.y)));
    const cellW = Math.max(...boxes.map((box) => box.w)) + gap;
    const cellH = Math.max(...boxes.map((box) => box.h)) + gap;
    return boxes.map((box, index) => ({
        shapeId: box.shapeId,
        x: startX + (index % columns) * cellW,
        y: startY + Math.floor(index / columns) * cellH,
    }));
}

function layoutBranch(boxes: LayoutBox[], step: NormalizedPlanStep, balanced: boolean): AgentShapeUpdatePatch[] {
    if (boxes.length <= 1) return boxes.map((box) => ({ shapeId: box.shapeId, x: numberValue(step.x, box.x), y: numberValue(step.y, box.y) }));

    const horizontalGap = numberValue(step.horizontalGap ?? step.gap, 140);
    const verticalGap = numberValue(step.verticalGap ?? step.gap, 56);
    const root = boxes[0];
    const rootX = numberValue(step.x, root.x);
    const rootY = numberValue(step.y, root.y);
    const children = boxes.slice(1);
    const rightChildren = balanced ? children.filter((_, index) => index % 2 === 0) : children;
    const leftChildren = balanced ? children.filter((_, index) => index % 2 === 1) : [];

    return [
        { shapeId: root.shapeId, x: rootX, y: rootY },
        ...layoutBranchSide(rightChildren, rootX + root.w + horizontalGap, rootY, verticalGap, 'right'),
        ...layoutBranchSide(leftChildren, rootX - horizontalGap, rootY, verticalGap, 'left'),
    ];
}

function layoutBranchSide(children: LayoutBox[], anchorX: number, rootY: number, gap: number, side: 'left' | 'right'): AgentShapeUpdatePatch[] {
    if (children.length === 0) return [];
    const totalHeight = children.reduce((sum, child) => sum + child.h, 0) + gap * (children.length - 1);
    let cursor = rootY - totalHeight / 2;
    return children.map((child) => {
        const x = side === 'left' ? anchorX - child.w : anchorX;
        const y = cursor + child.h / 2;
        cursor += child.h + gap;
        return { shapeId: child.shapeId, x, y };
    });
}

function resolveShapeRefs(value: unknown, state: AgentPlanState, label: string): string[] {
    if (Array.isArray(value)) {
        return Array.from(new Set(value.flatMap((item) => resolveShapeRefs(item, state, label))));
    }
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${label} is required`);
    }
    const raw = value.trim();
    if (!raw.startsWith('$')) return [raw];
    if (raw === '$selection') return state.selectedShapeIds;
    if (raw === '$last') return state.lastShapeIds;

    const selectionMatch = raw.match(/^\$selection\[(\d+)\]$/);
    if (selectionMatch) return [arrayItem(state.selectedShapeIds, Number(selectionMatch[1]), raw)];

    const lastMatch = raw.match(/^\$last\[(\d+)\]$/);
    if (lastMatch) return [arrayItem(state.lastShapeIds, Number(lastMatch[1]), raw)];

    const createdMatch = raw.match(/^\$created\.([A-Za-z][\w-]*)(?:\[(\d+)\])?$/);
    if (createdMatch) {
        const ids = state.created[createdMatch[1]] || [];
        if (createdMatch[2] !== undefined) return [arrayItem(ids, Number(createdMatch[2]), raw)];
        return ids;
    }

    throw new Error(`unsupported shape reference: ${raw}`);
}

function firstResolvedShapeId(value: unknown, state: AgentPlanState, label: string): string {
    const ids = resolveShapeRefs(value, state, label);
    if (!ids.length) throw new Error(`${label} resolved to no shapes`);
    return ids[0];
}

function secondArrayItem(value: unknown) {
    return Array.isArray(value) ? value[1] : undefined;
}

function firstArrayItem(value: unknown) {
    return Array.isArray(value) ? value[0] : value;
}

function arrayItem(items: string[], index: number, label: string): string {
    const value = items[index];
    if (!value) throw new Error(`${label} is out of range`);
    return value;
}

function recordCreated(alias: unknown, shapeIds: string[], state: AgentPlanState) {
    if (shapeIds.length === 0) return;
    if (typeof alias === 'string' && alias) state.created[alias] = shapeIds;
    state.lastShapeIds = shapeIds;
}

function normalizeShapeIds(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeBranchCreatedShapeIds(result: { branchId?: unknown; createdShapeIds?: unknown }): string[] {
    const branchId = typeof result.branchId === 'string' && result.branchId ? result.branchId : undefined;
    return branchId ? [branchId] : normalizeShapeIds(result.createdShapeIds);
}

function uniqueShapeIds(shapeIds: string[]): string[] {
    return Array.from(new Set(shapeIds.filter((id) => id && !id.startsWith('$'))));
}

function normalizeConnectorResultShapeIds(result: { branchId?: unknown; updatedShapeIds?: unknown; createdShapeIds?: unknown }): string[] {
    const branchId = typeof result.branchId === 'string' && result.branchId ? result.branchId : undefined;
    if (branchId) return [branchId];
    const createdShapeIds = normalizeShapeIds(result.createdShapeIds);
    if (createdShapeIds.length) return createdShapeIds;
    return normalizeShapeIds(result.updatedShapeIds);
}

function firstCreatedShapeId(result: { createdShapeIds?: unknown }, label: string): string {
    const ids = normalizeShapeIds(result.createdShapeIds);
    if (!ids.length) throw new Error(`Failed to create ${label}`);
    return ids[0];
}

function optionalAlias(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const alias = stringArg(value);
    if (!alias || !/^[A-Za-z][\w-]{0,63}$/.test(alias)) {
        throw new Error('as must start with a letter and contain only letters, numbers, underscore, or dash');
    }
    return alias;
}

function rejectUnsafeCreateKeys(step: Record<string, unknown>) {
    for (const key of ['script', 'autoRun', 'data', 'props', 'rootNode']) {
        if (Object.prototype.hasOwnProperty.call(step, key)) {
            throw new Error(`create step cannot set unsafe field: ${key}`);
        }
    }
}

function assertKnownPlanKeys(step: Record<string, unknown>, allowedKeys: string[], context: string) {
    const allowed = new Set(allowedKeys);
    const unknown = Object.keys(step).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
        throw new Error(`${context} received unsupported field(s): ${unknown.join(', ')}`);
    }
}

function stringArg(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberArg(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return undefined;
}

function booleanArg(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function colorArg(value: unknown) {
    return value === undefined || value === null || value === '' ? undefined : normalizeAgentColor(value);
}

function numberValue(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stepSelect(step: NormalizedPlanStep, options: AgentPlanApplyOptions, fallback: boolean) {
    return typeof step.select === 'boolean' ? step.select : typeof options.select === 'boolean' ? options.select : fallback;
}

function stepZoom(step: NormalizedPlanStep, options: AgentPlanApplyOptions, fallback: boolean) {
    return typeof step.zoom === 'boolean' ? step.zoom : typeof options.zoom === 'boolean' ? options.zoom : fallback;
}
