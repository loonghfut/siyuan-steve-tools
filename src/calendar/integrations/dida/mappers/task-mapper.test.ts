import assert from "node:assert/strict";
import test from "node:test";
import {
    buildCreatingIntent,
    buildDidaTaskUpdatePayload,
    buildSiyuanBacklinkMarker,
    extractSiyuanBlockIdFromDidaTitle,
    findTaskBySiyuanBacklink,
    hasDidaTaskChanged,
    hasSiyuanTaskChanged,
    mapDidaTaskToSiyuan,
    mergePendingDidaIdWrite,
    removeDidaLinks,
    resolveDidaBinding,
    resolvePendingDidaIdWriteAction,
} from "./task-mapper.ts";
import type { Task } from "../dida_interface.ts";

test("extractSiyuanBlockIdFromDidaTitle extracts [S] backlink block ID", () => {
    assert.equal(
        extractSiyuanBlockIdFromDidaTitle("写周报 [S](siyuan://blocks/20261112100000-abcdefg)"),
        "20261112100000-abcdefg",
    );
    assert.equal(
        extractSiyuanBlockIdFromDidaTitle("无链接任务"),
        "",
    );
    assert.equal(
        extractSiyuanBlockIdFromDidaTitle("仅有滴答链接 [D](https://dida365.com/webapp/#p/p1/tasks/t1)"),
        "",
    );
});

test("removeDidaLinks strips both [D] and [S] links", () => {
    assert.equal(
        removeDidaLinks("写周报 [D](https://dida365.com/webapp/#p/p1/tasks/t1) [S](siyuan://blocks/b1)"),
        "写周报",
    );
});

test("buildDidaTaskUpdatePayload and hasDidaTaskChanged detect no-op vs real diffs", () => {
    const startMs = Date.parse("2026-11-12T08:00:00.000Z");
    const endMs = Date.parse("2026-11-12T09:00:00.000Z");
    const cachedTask: Task = {
        id: "t1",
        projectId: "p1",
        title: "整理代码 [S](siyuan://blocks/block-1)",
        content: "备注",
        status: 0,
        priority: 3,
        startDate: "2026-11-12T08:00:00.000+0000",
        dueDate: "2026-11-12T09:00:00.000+0000",
        tags: ["工作", "进行中"],
    };

    const siyuanRow = {
        事件: { content: "整理代码 [D](https://dida365.com/webapp/#p/p1/tasks/t1)" },
        描述: { content: "备注" },
        优先级: { content: "中" },
        状态: { content: "进行中" },
        开始时间: { start: startMs, end: endMs },
        标签: { content: ["工作"] },
    };

    const payloadSame = buildDidaTaskUpdatePayload(siyuanRow, "block-1", cachedTask, "-PT15M");
    assert.equal(hasDidaTaskChanged(payloadSame, cachedTask), false);
    assert.equal(payloadSame.reminders, undefined);

    // Same instant expressed with Z timezone should still match
    const cachedTaskWithZ: Task = {
        ...cachedTask,
        startDate: "2026-11-12T08:00:00.000Z",
        dueDate: "2026-11-12T09:00:00.000Z",
    };
    assert.equal(hasDidaTaskChanged(payloadSame, cachedTaskWithZ), false);

    // Changing status to 完成 is detected
    const completedPayload = buildDidaTaskUpdatePayload(
        { ...siyuanRow, 状态: { content: "完成" } },
        "block-1",
        cachedTask,
    );
    assert.equal(completedPayload.status, 2);
    assert.equal(hasDidaTaskChanged(completedPayload, cachedTask), true);

    // Changing tags is detected regardless of ordering
    const retaggedPayload = buildDidaTaskUpdatePayload(
        { ...siyuanRow, 标签: { content: ["工作", "加急"] } },
        "block-1",
        cachedTask,
    );
    assert.equal(hasDidaTaskChanged(retaggedPayload, cachedTask), true);

    // Changing start time injects normalized default reminders
    const rescheduledPayload = buildDidaTaskUpdatePayload(
        { ...siyuanRow, 开始时间: { start: startMs + 3600_000, end: endMs + 3600_000 } },
        "block-1",
        cachedTask,
        "-PT15M",
    );
    assert.equal(hasDidaTaskChanged(rescheduledPayload, cachedTask), true);
    assert.deepEqual(rescheduledPayload.reminders, ["TRIGGER:-PT15M"]);
});

test("hasSiyuanTaskChanged avoids false positives on unchanged Dida -> Siyuan round-trip", () => {
    const didaTask: Task = {
        id: "t2",
        projectId: "p1",
        title: "测试任务 [S](siyuan://blocks/block-2)",
        content: "",
        status: 0,
        priority: 1,
        startDate: "2026-11-12T08:00:00.000+0000",
        dueDate: "2026-11-12T09:00:00.000+0000",
        tags: ["生活"],
    };
    const mapped = mapDidaTaskToSiyuan(didaTask);
    const existingRow = {
        事件: { content: "测试任务 [D](https://dida365.com/webapp/#p/p1/tasks/t2)" },
        优先级: { content: "低" },
        状态: { content: "未完成" },
        标签: { content: ["生活"] },
        描述: { content: "" },
        开始时间: {
            start: Date.parse("2026-11-12T08:00:00.000Z"),
            end: Date.parse("2026-11-12T09:00:00.000Z"),
        },
        链接: { content: "https://dida365.com/webapp/#p/p1/tasks/t2" },
    };
    assert.equal(hasSiyuanTaskChanged(mapped, existingRow), false);
});

test("resolveDidaBinding only trusts the didaID column for dedup", () => {
    // 列中有值 -> 更新该滴答任务
    assert.deepEqual(
        resolveDidaBinding({ didaID: { content: "t1" } }),
        { action: "update", didaTaskId: "t1" },
    );

    // 列为空 -> 新建滴答任务
    assert.deepEqual(
        resolveDidaBinding({ didaID: { content: "" } }),
        { action: "create", didaTaskId: "" },
    );
    assert.deepEqual(
        resolveDidaBinding({}),
        { action: "create", didaTaskId: "" },
    );

    // 列为空但存在待补写记录（上次落盘失败）-> 先补写去重键
    assert.deepEqual(
        resolveDidaBinding({ didaID: { content: "" } }, "t2"),
        { action: "repair", didaTaskId: "t2" },
    );

    // 列有值时以列为准，待补写记录不得覆盖数据库列
    assert.deepEqual(
        resolveDidaBinding({ didaID: { content: "t1" } }, "t2"),
        { action: "update", didaTaskId: "t1" },
    );
});

test("resolvePendingDidaIdWriteAction decides compensate / drop / block / unknown", () => {
    const MAX = 5;
    const pending = {
        itemID: "item-1",
        blockId: "block-1",
        didaTaskId: "t1",
        attempts: 1,
        landed: false,
    };

    // 行不可见 -> 状态未知，交给调用方确认
    assert.equal(resolvePendingDidaIdWriteAction(pending, null, MAX), "unknown");

    // 列里已经是同一个去重键 -> 记录失效，可清理
    assert.equal(resolvePendingDidaIdWriteAction(pending, "t1", MAX), "drop");

    // 列里是别的滴答任务 -> 记录过期，可清理
    assert.equal(resolvePendingDidaIdWriteAction(pending, "t2", MAX), "drop");

    // 列是空的且从未落盘 -> 需要补写
    assert.equal(resolvePendingDidaIdWriteAction(pending, "", MAX), "compensate");

    // 曾经落盘过、之后被用户清空 -> 尊重用户操作，不还原
    assert.equal(resolvePendingDidaIdWriteAction({ ...pending, landed: true }, "", MAX), "drop");

    // 重试次数用尽 -> 保留记录但不再写入
    assert.equal(resolvePendingDidaIdWriteAction({ ...pending, attempts: MAX }, "", MAX), "block");
    assert.equal(resolvePendingDidaIdWriteAction({ ...pending, attempts: MAX + 3 }, "", MAX), "block");

    // 未到上限仍然补写
    assert.equal(resolvePendingDidaIdWriteAction({ ...pending, attempts: MAX - 1 }, "", MAX), "compensate");
});

test("mergePendingDidaIdWrite keeps landed only for the same dedup key", () => {    const previous = {
        itemID: "item-1",
        blockId: "block-1",
        didaTaskId: "t1",
        attempts: 2,
        landed: true,
    };

    // 同一个去重键再次失败：保留重试次数与"已落盘"结论
    assert.deepEqual(
        mergePendingDidaIdWrite(previous, { blockId: "block-1", itemID: "item-1", didaTaskId: "t1" }),
        { blockId: "block-1", itemID: "item-1", didaTaskId: "t1", attempts: 3, landed: true, creating: false, rowUnregistered: false },
    );

    // 换了滴答任务 ID：必须重置"已落盘"，否则新任务的去重键会被误判为"用户手动清空"而丢失
    assert.deepEqual(
        mergePendingDidaIdWrite(previous, { blockId: "block-1", itemID: "item-1", didaTaskId: "t2" }),
        { blockId: "block-1", itemID: "item-1", didaTaskId: "t2", attempts: 3, landed: false, creating: false, rowUnregistered: false },
    );

    // 首次登记
    assert.deepEqual(
        mergePendingDidaIdWrite(undefined, { blockId: "block-1", itemID: "item-1", didaTaskId: "t1" }),
        { blockId: "block-1", itemID: "item-1", didaTaskId: "t1", attempts: 1, landed: false, creating: false, rowUnregistered: false },
    );
});

test("mergePendingDidaIdWrite keeps the rowUnregistered flag only for the same dedup key", () => {
    const pending = {
        itemID: "item-1",
        blockId: "block-1",
        didaTaskId: "t1",
        attempts: 1,
        landed: false,
        rowUnregistered: true,
    };

    // 同一个去重键：块还没登记进数据库，标记要保留，补偿时先补登记行
    assert.equal(
        mergePendingDidaIdWrite(pending, { blockId: "block-1", itemID: "item-1", didaTaskId: "t1" }).rowUnregistered,
        true,
    );

    // 换了去重键：那是另一个任务，行缺失与它无关，不能沿用标记
    assert.equal(
        mergePendingDidaIdWrite(pending, { blockId: "block-1", itemID: "item-1", didaTaskId: "t2" }).rowUnregistered,
        false,
    );

    // 首次登记没有标记
    assert.equal(
        mergePendingDidaIdWrite(undefined, { blockId: "block-1", itemID: "item-1", didaTaskId: "t1" }).rowUnregistered,
        false,
    );
});

test("buildCreatingIntent records an unknown remote task before it is created", () => {
    const intent = buildCreatingIntent("block-1", "item-1");
    assert.deepEqual(intent, {
        blockId: "block-1",
        itemID: "item-1",
        didaTaskId: "",
        attempts: 0,
        landed: false,
        creating: true,
    });

    // 创建意图在拿到真实任务 ID 后结束
    assert.equal(
        mergePendingDidaIdWrite(intent, { blockId: "block-1", itemID: "item-1", didaTaskId: "t9" }).creating,
        false,
    );
    // 仍然是意图（没有任务 ID）
    assert.equal(
        mergePendingDidaIdWrite(intent, { blockId: "block-1", itemID: "item-1", didaTaskId: "" }).creating,
        true,
    );
});

test("findTaskBySiyuanBacklink locates the remote task created for a Siyuan block", () => {
    const blockId = "20261112100000-abcdefg";
    const marker = buildSiyuanBacklinkMarker(blockId);
    assert.equal(marker, "[S](siyuan://blocks/20261112100000-abcdefg)");

    const tasks: Task[] = [
        { id: "t1", projectId: "p1", title: "无关任务", status: 0, priority: 0, tags: [] },
        { id: "t2", projectId: "p1", title: `写周报 ${marker}`, status: 0, priority: 0, tags: [] },
        // 另一个块的回链不能命中
        { id: "t3", projectId: "p1", title: "另一件事 [S](siyuan://blocks/20261112100000-zzzzzz)", status: 0, priority: 0, tags: [] },
    ];

    assert.equal(findTaskBySiyuanBacklink(tasks, blockId)?.id, "t2");
    // 空块 ID 不匹配任何任务
    assert.equal(findTaskBySiyuanBacklink(tasks, ""), undefined);
    // 没有对应回链时返回 undefined（此时才允许新建任务）
    assert.equal(findTaskBySiyuanBacklink(tasks, "not-exist-block"), undefined);
});
