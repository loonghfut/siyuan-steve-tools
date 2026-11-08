import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    ensureSqlLimit,
    findOuterClauseIndex,
    hasOuterLimitClause,
    normalizeSqlStatement,
    SQL_UNLIMITED_CAP,
} from "./sql-limit.ts";

describe("normalizeSqlStatement", () => {
    it("去掉末尾分号与空白", () => {
        assert.equal(normalizeSqlStatement("SELECT 1;   "), "SELECT 1");
        assert.equal(normalizeSqlStatement("  SELECT 1  "), "SELECT 1");
    });
});

describe("hasOuterLimitClause", () => {
    it("识别最后一条语句的外层 LIMIT", () => {
        assert.equal(hasOuterLimitClause("SELECT * FROM blocks LIMIT 10"), true);
        assert.equal(hasOuterLimitClause("SELECT * FROM blocks limit 10 offset 5"), true);
        assert.equal(hasOuterLimitClause("SELECT * FROM blocks LIMIT 10 OFFSET 5"), true);
    });

    it("没有 LIMIT 时返回 false", () => {
        assert.equal(hasOuterLimitClause("SELECT * FROM blocks"), false);
        assert.equal(hasOuterLimitClause("SELECT * FROM blocks;"), false);
    });

    it("子查询里的 LIMIT 不算外层 LIMIT", () => {
        assert.equal(hasOuterLimitClause("SELECT * FROM (SELECT id FROM x LIMIT 3) t"), false);
    });

    it("注释里的 LIMIT 不算外层 LIMIT", () => {
        assert.equal(hasOuterLimitClause("SELECT * FROM blocks -- LIMIT 5"), false);
        assert.equal(hasOuterLimitClause("SELECT * FROM blocks /* LIMIT 5 */"), false);
    });

    it("字符串字面量里的 LIMIT 不算外层 LIMIT", () => {
        assert.equal(hasOuterLimitClause("SELECT 'limit me' FROM blocks"), false);
        assert.equal(hasOuterLimitClause('SELECT "a limit b" FROM blocks'), false);
    });

    it("多语句时只看最后一条", () => {
        assert.equal(hasOuterLimitClause("SELECT * FROM a; SELECT * FROM b LIMIT 7"), true);
        assert.equal(hasOuterLimitClause("SELECT * FROM a LIMIT 7; SELECT * FROM b"), false);
    });
});

describe("ensureSqlLimit", () => {
    it("没有 LIMIT 时补上限额", () => {
        assert.equal(ensureSqlLimit("SELECT * FROM blocks", 100), "SELECT * FROM blocks\nLIMIT 100");
    });

    it("已有 LIMIT 时原样返回", () => {
        assert.equal(ensureSqlLimit("SELECT * FROM blocks LIMIT 10", 100), "SELECT * FROM blocks LIMIT 10");
    });

    it("补限额前先去掉末尾分号，避免被内核判为多语句", () => {
        assert.equal(ensureSqlLimit("SELECT * FROM blocks;", 100), "SELECT * FROM blocks\nLIMIT 100");
    });

    it("空语句原样返回", () => {
        assert.equal(ensureSqlLimit("", 100), "");
        assert.equal(ensureSqlLimit("   ", 100), "");
    });

    it("支持全量上限常量", () => {
        assert.equal(ensureSqlLimit("SELECT * FROM blocks", SQL_UNLIMITED_CAP),
            `SELECT * FROM blocks\nLIMIT ${SQL_UNLIMITED_CAP}`);
    });

    it("语句以行注释结尾时 LIMIT 仍能生效", () => {
        // 回归：曾经拼接成 "SELECT ... -- 说明 LIMIT 100"，LIMIT 落在注释里被吞掉。
        const out = ensureSqlLimit("SELECT * FROM blocks -- 说明", 100);
        assert.ok(out.endsWith("\nLIMIT 100"), "LIMIT 必须换行拼接，不能被行注释吞掉");
        const withoutComment = out.replace(/--[^\n]*/g, "");
        assert.match(withoutComment, /\bLIMIT 100\b/i);
    });

    it("语句以块注释结尾时 LIMIT 仍能生效", () => {
        const out = ensureSqlLimit("SELECT * FROM blocks /* 说明 */", 100);
        const withoutComment = out.replace(/\/\*[\s\S]*?\*\//g, "");
        assert.match(withoutComment, /\bLIMIT 100\b/i);
    });
});

describe("findOuterClauseIndex", () => {
    const CLAUSES = ["GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET"];

    it("定位外层子句", () => {
        const sql = "SELECT id FROM blocks ORDER BY created DESC";
        assert.equal(sql.slice(findOuterClauseIndex(sql, CLAUSES)), "ORDER BY created DESC");
    });

    it("跳过子查询内部的子句", () => {
        const sql = "SELECT * FROM (SELECT id FROM blocks ORDER BY created DESC) t";
        // 子查询里的 ORDER BY 不算外层子句 → 返回 -1，条件应插到语句末尾
        assert.equal(findOuterClauseIndex(sql, CLAUSES), -1);
    });

    it("子查询内没有子句时仍能定位外层子句", () => {
        const sql = "SELECT * FROM (SELECT id FROM blocks) t ORDER BY id";
        assert.equal(sql.slice(findOuterClauseIndex(sql, CLAUSES)), "ORDER BY id");
    });

    it("忽略注释与字符串里的关键字", () => {
        const sql = "SELECT 'ORDER BY x' AS c FROM blocks -- ORDER BY y\n GROUP BY type";
        assert.equal(sql.slice(findOuterClauseIndex(sql, CLAUSES)), "GROUP BY type");
    });

    it("多语句时只看最后一条语句", () => {
        const sql = "SELECT 1 ORDER BY a; SELECT 2 GROUP BY b";
        assert.equal(sql.slice(findOuterClauseIndex(sql, CLAUSES)), "GROUP BY b");
    });
});
