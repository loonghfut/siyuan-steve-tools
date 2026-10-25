import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readCalendarDateKeyID, resolveCalendarDateFieldName } from "./field-config.ts";

describe("readCalendarDateKeyID", () => {
    it("读渲染响应里的 view.calendar.dateKeyID", () => {
        assert.equal(readCalendarDateKeyID({calendar: {dateKeyID: "key-c"}}), "key-c");
    });

    it("兼容存储层的 view.calendar.settings.dateKeyID", () => {
        assert.equal(readCalendarDateKeyID({calendar: {settings: {dateKeyID: "key-d"}}}), "key-d");
    });

    it("没有日历设置时返回空串", () => {
        assert.equal(readCalendarDateKeyID({}), "");
        assert.equal(readCalendarDateKeyID(null), "");
        assert.equal(readCalendarDateKeyID({calendar: {}}), "");
    });
});

describe("resolveCalendarDateFieldName", () => {
    const columns = [
        {id: "key-a", name: "事件", type: "block"},
        {id: "key-b", name: "开始时间", type: "date"},
        {id: "key-c", name: "截止时间", type: "date"},
    ];

    it("按 dateKeyID 定位日期列名", () => {
        assert.equal(resolveCalendarDateFieldName(columns, "key-c"), "截止时间");
        assert.equal(resolveCalendarDateFieldName(columns, "key-b"), "开始时间");
    });

    it("dateKeyID 为空时回退到「开始时间」", () => {
        assert.equal(resolveCalendarDateFieldName(columns, ""), "开始时间");
        assert.equal(resolveCalendarDateFieldName(columns, undefined), "开始时间");
    });

    it("dateKeyID 找不到对应列时回退", () => {
        assert.equal(resolveCalendarDateFieldName(columns, "not-exist"), "开始时间");
    });

    it("列定义缺失时回退", () => {
        assert.equal(resolveCalendarDateFieldName(undefined, "key-b"), "开始时间");
        assert.equal(resolveCalendarDateFieldName(null, "key-b"), "开始时间");
    });

    it("支持自定义回退列名", () => {
        assert.equal(resolveCalendarDateFieldName(columns, "not-exist", "截止时间"), "截止时间");
    });
});
