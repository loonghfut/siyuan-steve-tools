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
 *
 * 内核在默认模式下用 `CheckSingleStatement` 拒绝多语句，但它**允许**尾部分号
 * （分号后只有空白/注释时仍算同一条语句，见 kernel/sql/stmt_validate.go）。
 * 这里去分号的真正原因是：随后要在语句末尾追加 "LIMIT n"，带着分号会拼出
 * "SELECT ...; LIMIT n" 这样的真·第二条语句而被判为多语句。
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
    // 必须换行拼接：若语句以 `-- 行注释` 结尾，同一行的 " LIMIT n" 会被注释吞掉，
    // 语句实际没有 LIMIT，内核就会套用默认上限（默认 64）造成静默截断。
    return `${normalized}\nLIMIT ${cap}`;
}

/**
 * 查找语句中第一个**外层**子句关键字的位置（不在括号内、不在注释/字符串里）。
 *
 * 与 hasOuterLimitClause 一样只看**最后一条**非空语句：分号会重置匹配状态。
 * 用于把 WHERE 条件插到正确的外层作用域——若不跳过括号深度，
 * 子查询里的 ORDER BY / GROUP BY 会被误判成外层子句，条件就会插进子查询里。
 *
 * @returns 关键字的起始下标；没找到返回 -1
 */
export function findOuterClauseIndex(stmt: string, keywords: string[]): number {
    const text = stmt || "";
    // 多词关键字（"GROUP BY" / "ORDER BY"）按首词建索引，命中后再比对完整关键字。
    const byFirstWord = new Map<string, string[]>();
    for (const keyword of keywords) {
        const first = keyword.trim().toLowerCase().split(/\s+/)[0];
        if (!first) {
            continue;
        }
        const list = byFirstWord.get(first) ?? [];
        list.push(keyword.trim().toLowerCase());
        byFirstWord.set(first, list);
    }
    let depth = 0;
    let found = -1;
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

        // 语句分隔符：后一条语句的子句才是"最后一条语句"的外层子句
        if (ch === ";" && depth === 0) {
            nextStatement = true;
            i++;
            continue;
        }
        if (nextStatement) {
            found = -1;
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
            if (depth === 0 && found === -1) {
                const word = text.slice(start, i).toLowerCase();
                const candidates = byFirstWord.get(word);
                if (candidates && candidates.some((keyword) => matchesKeywordAt(text, start, keyword))) {
                    found = start;
                }
            }
            continue;
        }
        i++;
    }
    return found;
}

/**
 * 判断 text[start] 处是否匹配完整关键字（允许关键字内部有任意空白）。
 * 词边界要求：关键字之后不能再跟单词字符，避免 "ORDER BYX" 误判为 "ORDER BY"。
 */
function matchesKeywordAt(text: string, start: number, keyword: string): boolean {
    const parts = keyword.split(/\s+/);
    let pos = start;
    for (const part of parts) {
        while (pos < text.length && /\s/.test(text[pos])) {
            pos++;
        }
        if (text.slice(pos, pos + part.length).toLowerCase() !== part) {
            return false;
        }
        pos += part.length;
        const after = text[pos];
        if (after !== undefined && isSqlWordByte(after)) {
            return false;
        }
    }
    return true;
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
