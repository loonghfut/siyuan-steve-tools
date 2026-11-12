import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import { describe, it } from 'node:test';

import { parseScheduleTimeRange, sanitizeScheduleSourceText } from './schedule-time-parser.ts';

// 2026-11-12 是周四（Thu, isoDow=4）
const NOW_THU = dayjs('2026-11-12T10:00:00');
// 2026-11-15 是周日（Sun, isoDow=7）
const NOW_SUN = dayjs('2026-11-15T10:00:00');
// 2026-03-31 月底测试日期溢出
const NOW_MAR31 = dayjs('2026-03-31T10:00:00');

describe('sanitizeScheduleSourceText', () => {
    it('strips SiYuan IAL, block IDs, and URLs without breaking schedule text', () => {
        const raw = '- [ ] {: id="20261112213804-lxatztc"} 明天 14:30 看 https://example.com/2025-10-29/18:00 文档@日程\n{: id="20261112213804-lxatztc" updated="20261112213804"}';
        const cleaned = sanitizeScheduleSourceText(raw);
        assert.equal(cleaned.includes('20261112213804-lxatztc'), false);
        assert.equal(cleaned.includes('18:00'), false);
        assert.equal(cleaned.includes('明天 14:30'), true);
    });
});

describe('parseScheduleTimeRange date & weekday handling', () => {
    it('supports explicit ISO / slash / Chinese YYYY年M月D日 dates without colon', () => {
        assert.deepEqual(parseScheduleTimeRange('2026-11-20 15:00 提交报告', NOW_THU), {
            start: '2026-11-20T15:00',
        });
        assert.deepEqual(parseScheduleTimeRange('2027年1月5日 开会', NOW_THU), {
            start: '2027-01-05T08:00',
        });
        assert.deepEqual(parseScheduleTimeRange('11/15 上午9点半 评审', NOW_THU), {
            start: '2026-11-15T09:30',
        });
        assert.deepEqual(parseScheduleTimeRange('2026.11.15 开会', NOW_THU), {
            start: '2026-11-15T08:00',
        });
    });

    it('avoids month rollover bugs such as 4月5日 on March 31 and rejects invalid calendar dates', () => {
        assert.deepEqual(parseScheduleTimeRange('4月5日 提交报销', NOW_MAR31), {
            start: '2026-04-05T08:00',
        });
        assert.equal(parseScheduleTimeRange('2月30日 不存在的日期', NOW_THU), null);
    });

    it('handles Monday-start Chinese weekdays accurately on both weekdays and Sundays', () => {
        // 周四（2026-11-12）语境
        assert.deepEqual(parseScheduleTimeRange('本周日 看电影', NOW_THU), {
            start: '2026-11-15T08:00',
        });
        assert.deepEqual(parseScheduleTimeRange('下周日 家庭聚餐', NOW_THU), {
            start: '2026-11-22T08:00',
        });
        assert.deepEqual(parseScheduleTimeRange('下星期三 下午2点 评审', NOW_THU), {
            start: '2026-11-18T14:00',
        });
        // 周日（2026-11-15）语境
        assert.deepEqual(parseScheduleTimeRange('下周一 晨会', NOW_SUN), {
            start: '2026-11-16T08:00',
        });
        assert.deepEqual(parseScheduleTimeRange('本周一 复盘', NOW_SUN), {
            start: '2026-11-09T08:00',
        });
    });

    it('handles 大后天 (+3d), 今晚/明晚/明早, and standalone period expressions', () => {
        assert.deepEqual(parseScheduleTimeRange('大后天 提交', NOW_THU), {
            start: '2026-11-15T08:00',
        });
        assert.deepEqual(parseScheduleTimeRange('明晚8点 跑步', NOW_THU), {
            start: '2026-11-13T20:00',
        });
        assert.deepEqual(parseScheduleTimeRange('明天下午开会', NOW_THU), {
            start: '2026-11-13T14:00',
        });
    });
});

describe('parseScheduleTimeRange time & range handling', () => {
    it('supports 下午 HH:MM, 两点半, 一刻/三刻, and am/pm', () => {
        assert.deepEqual(parseScheduleTimeRange('明天 下午 3:30 面试', NOW_THU), {
            start: '2026-11-13T15:30',
        });
        assert.deepEqual(parseScheduleTimeRange('明天下午两点半开会', NOW_THU), {
            start: '2026-11-13T14:30',
        });
        assert.deepEqual(parseScheduleTimeRange('今天早上8点一刻出门', NOW_THU), {
            start: '2026-11-12T08:15',
        });
        assert.deepEqual(parseScheduleTimeRange('晚上10点三刻睡觉', NOW_THU), {
            start: '2026-11-12T22:45',
        });
        assert.deepEqual(parseScheduleTimeRange('明天 3pm 电话会', NOW_THU), {
            start: '2026-11-13T15:00',
        });
    });

    it('parses start and end for time ranges without mistaking time range hyphens for M-D dates', () => {
        assert.deepEqual(parseScheduleTimeRange('明天 14:00-16:00 评审会', NOW_THU), {
            start: '2026-11-13T14:00',
            end: '2026-11-13T16:00',
        });
        assert.deepEqual(parseScheduleTimeRange('12:05-13:30 午休', NOW_THU), {
            start: '2026-11-12T12:05',
            end: '2026-11-12T13:30',
        });
        assert.deepEqual(parseScheduleTimeRange('下周一 下午2点到4点半 培训', NOW_THU), {
            start: '2026-11-16T14:00',
            end: '2026-11-16T16:30',
        });
    });

    it('ignores ratios and SiYuan metadata timestamps when no date/time is present', () => {
        assert.equal(parseScheduleTimeRange('完成比例 1:2 或 16:9 画面{: id="20261112213804-abcdefg"}', NOW_THU), null);
    });
});
