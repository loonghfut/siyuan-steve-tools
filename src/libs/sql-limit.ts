/**
 * 思源 3.8 起，`/api/query/sql` 对**没有自带外层 LIMIT** 的语句会套用服务端默认上限
 * （设置 → 搜索 → "查询结果上限"，默认 64，最小 32），超出的行会被静默丢弃，
 * 且旧版插件从响应里读不到任何被截断的提示。
 *
 * 这里在插件侧补齐 LIMIT，保持升级前"取全量"的语义，同时避免用户自写 SQL 被截断后
 * 图表/聚合结果莫名其妙变少。
 *
 * 参考实现（思源 3.8.9-alpha.9，行号会随版本漂移，以函数名为准）：
 * - kernel/sql/query_limit.go 的 QueryWithLimitInfo
 * - kernel/sql/query_limit.go 的 containsOuterLimitClause
 * - kernel/sql/block_query.go 的 queryWithLimitInfo（语句自带外层 LIMIT 时不再叠加默认上限）
 * - kernel/conf/search.go 的 NewSearch（Limit 默认 64）
 * - kernel/api/sql.go 的 SQL handler（读取上限并回传 limit / truncated）
 */

/** 插件内部"取全量"语义使用的 LIMIT，与插件既有的 `limit 9999999` 写法保持一致。 */
export const SQL_UNLIMITED_CAP = 9999999;

/** 默认补齐的行数上限；用于用户可编辑的 SQL，避免一次拉取过多数据。 */
export const SQL_DEFAULT_CAP = 1000;

/**
 * 去掉语句末尾的分号。
 * 内核在默认模式下用 `CheckSingleStatement` 拒绝多语句，带分号的语句会被判为多语句而报错。
 */
export function normalizeSqlStatement(stmt: string): string {
    return (stmt || "").trim().replace(/;\s*$/, "");
}

/**
 * 判断语句最后一条非空语句是否已带**外层** LIMIT。
 * 语义对齐思源 kernel/sql/query_limit.go 的 containsOuterLimitClause：
 * 跳过引号、注释与括号内的内容，只认最后一条语句顶层出现的 LIMIT 关键字。
 */
export function hasOuterLimitClause(stmt: string): boolean {
    const text = normalizeSqlStatement(stmt);
    let depth = 0;
    let found = false;
    let nextStatement = false;

    for (let i = 0; i < text.length;) {
        const ch = text[i];

        if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "\f") {
            i++;
            continue;
        }

        // 行注释
        if (text.startsWith("--", i)) {
            i += 2;
            while (i < text.length && text[i] !== "\n") {
                i++;
            }
            continue;
        }

        // 块注释
        if (text.startsWith("/*", i)) {
            const end = text.indexOf("*/", i + 2);
            if (end === -1) {
                break;
            }
            i = end + 4;
            continue;
        }

        // 语句分隔符：后一条语句的 LIMIT 才是"最后一条语句"的外层 LIMIT
        if (ch === ";" && depth === 0) {
            nextStatement = true;
            i++;
            continue;
        }
        if (nextStatement) {
            found = false;
            nextStatement = false;
        }

        // 引号包裹的标识符/字符串，跳过其中内容
        if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
            const end = ch === "[" ? "]" : ch;
            i++;
            while (i < text.length) {
                if (text[i] === end) {
                    i++;
                    // 连续两个引号表示转义，继续留在引号内
                    if (ch !== "[" && i < text.length && text[i] === end) {
                        i++;
                        continue;
                    }
                    break;
                }
                i++;
            }
            continue;
        }

        if (ch === "(") {
            depth++;
        } else if (ch === ")") {
            depth--;
        }

        // 关键字扫描
        if (isSqlWordByte(ch)) {
            const start = i;
            while (i < text.length && isSqlWordByte(text[i])) {
                i++;
            }
            if (depth === 0 && text.slice(start, i).toLowerCase() === "limit") {
                found = true;
            }
            continue;
        }
        i++;
    }
    return found;
}

/**
 * 确保语句带有外层 LIMIT。
 * - 语句为空时原样返回，交给上层报错；
 * - 已自带外层 LIMIT 时原样返回（尊重用户意图）；
 * - 否则追加 `LIMIT n`。
 */
export function ensureSqlLimit(stmt: string, limit: number = SQL_DEFAULT_CAP): string {
    const normalized = normalizeSqlStatement(stmt);
    if (!normalized) {
        return normalized;
    }
    if (hasOuterLimitClause(normalized)) {
        return normalized;
    }
    const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : SQL_DEFAULT_CAP;
    return `${normalized} LIMIT ${cap}`;
}

/** 判断单词字符（思源 kernel/sql/query_limit.go 的 isSQLLimitWordByte 同款判定）。 */
function isSqlWordByte(ch: string): boolean {
    if (!ch) {
        return false;
    }
    const code = ch.charCodeAt(0);
    return (code >= 0x61 && code <= 0x7a) || // a-z
        (code >= 0x41 && code <= 0x5a) || // A-Z
        (code >= 0x30 && code <= 0x39) || // 0-9
        ch === "_" || ch === "$" || code >= 0x80; // _ $ 及非 ASCII
}
