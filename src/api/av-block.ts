export interface AvBlockCandidate {
    id?: string | null;
    name?: string | null;
    ial?: string | null;
    updated?: string | null;
}

export interface AvBlockSelectionResult {
    id: string;
    ids: string[];
    selectedHasContextFilter: boolean;
    hasMixedContextFilters: boolean;
    shouldWarnAmbiguousContext: boolean;
}

const CONTEXT_FILTER_IAL_REGEX = /(?:^|[\s:])custom-sy-av-context-filter="([^"]*)"/;

/**
 * 判断数据库物理块（NodeAttributeView）的 IAL 中是否配置了块级上下文筛选（custom-sy-av-context-filter）。
 *
 * 对照思源源码 kernel/model/attribute_view.go 的 GetAttributeViewContextFilter：
 * 只有该属性存在且值非空时，渲染才会按物理块所在根文档筛选条目；
 * 普通镜像数据库块若未开启上下文筛选，渲染任意镜像块（在显式传入 viewID 时）结果一致。
 */
export function hasAvContextFilterInIal(ial?: string | null): boolean {
    if (!ial || typeof ial !== "string") {
        return false;
    }
    const match = ial.match(CONTEXT_FILTER_IAL_REGEX);
    return Boolean(match && match[1].trim() !== "");
}

/**
 * 从多个引用同一 avID 的物理数据库块中选出最合适的承载块 ID。
 *
 * 选择优先级（同级内保持输入顺序，即 SQL 的 updated DESC）：
 * 1. 无块级上下文筛选 且 块名命中 preferredNames（如「日程」「周期」）；
 * 2. 无块级上下文筛选（避免被某个子文档内开启了上下文筛选的镜像块意外过滤掉全局数据）；
 * 3. 有块级上下文筛选 且 块名命中 preferredNames；
 * 4. 有块级上下文筛选的最近更新块。
 *
 * 仅当存在多个候选块且最终选中块本身仍带有上下文筛选时，才标记 shouldWarnAmbiguousContext，
 * 避免对普通数据库镜像反复误报警告。
 */
export function selectPreferredAvBlock(
    candidates: readonly AvBlockCandidate[],
    preferredNames?: readonly string[],
): AvBlockSelectionResult {
    const preferredSet = new Set(
        (Array.isArray(preferredNames) ? preferredNames : [])
            .map((name) => String(name || "").trim())
            .filter(Boolean),
    );

    const seenIds = new Set<string>();
    const normalized: Array<{
        id: string;
        hasContextFilter: boolean;
        matchesPreferredName: boolean;
        tier: number;
    }> = [];

    for (const candidate of Array.isArray(candidates) ? candidates : []) {
        const id = String(candidate?.id || "").trim();
        if (!id || seenIds.has(id)) {
            continue;
        }
        seenIds.add(id);

        const hasContextFilter = hasAvContextFilterInIal(candidate?.ial);
        const name = String(candidate?.name || "").trim();
        const matchesPreferredName = preferredSet.size > 0 && preferredSet.has(name);

        let tier: number;
        if (!hasContextFilter && matchesPreferredName) {
            tier = 0;
        } else if (!hasContextFilter) {
            tier = 1;
        } else if (matchesPreferredName) {
            tier = 2;
        } else {
            tier = 3;
        }

        normalized.push({ id, hasContextFilter, matchesPreferredName, tier });
    }

    if (normalized.length === 0) {
        return {
            id: "",
            ids: [],
            selectedHasContextFilter: false,
            hasMixedContextFilters: false,
            shouldWarnAmbiguousContext: false,
        };
    }

    let best = normalized[0];
    for (let i = 1; i < normalized.length; i++) {
        if (normalized[i].tier < best.tier) {
            best = normalized[i];
        }
    }

    const anyFiltered = normalized.some((item) => item.hasContextFilter);
    const anyUnfiltered = normalized.some((item) => !item.hasContextFilter);

    return {
        id: best.id,
        ids: normalized.map((item) => item.id),
        selectedHasContextFilter: best.hasContextFilter,
        hasMixedContextFilters: anyFiltered && anyUnfiltered,
        shouldWarnAmbiguousContext: normalized.length > 1 && best.hasContextFilter,
    };
}
