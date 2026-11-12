import assert from "node:assert/strict";
import test from "node:test";
import {
    buildDidaTaskUpdatePayload,
    extractSiyuanBlockIdFromDidaTitle,
    hasDidaTaskChanged,
    hasSiyuanTaskChanged,
    mapDidaTaskToSiyuan,
    removeDidaLinks,
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
