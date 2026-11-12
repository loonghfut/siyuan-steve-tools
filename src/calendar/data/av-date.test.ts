import assert from 'node:assert/strict';
import test from 'node:test';
import {
    extractCalendarCellDateRange,
    formatLocalDailyNoteDate,
    parseRenderedTemplateTimestamp,
    resolveFullCalendarEventRange,
    resolveSiYuanUpdateDateRange,
    supportsNativeDailyNoteDate,
} from './av-date.ts';

test('supportsNativeDailyNoteDate checks SiYuan 3.8+', () => {
    assert.equal(supportsNativeDailyNoteDate('3.8.9-alpha.9'), true);
    assert.equal(supportsNativeDailyNoteDate('3.8.0'), true);
    assert.equal(supportsNativeDailyNoteDate('4.0.0'), true);
    assert.equal(supportsNativeDailyNoteDate('3.7.9'), false);
    assert.equal(supportsNativeDailyNoteDate(''), false);
    assert.equal(supportsNativeDailyNoteDate(undefined), false);
});

test('formatLocalDailyNoteDate normalizes dates without timezone drift', () => {
    assert.equal(formatLocalDailyNoteDate('2026-11-12'), '2026-11-12');
    assert.equal(formatLocalDailyNoteDate('2026-11-12T00:00:00'), '2026-11-12');
    assert.equal(formatLocalDailyNoteDate(new Date(2026, 10, 5, 23, 30)), '2026-11-05');
    assert.equal(formatLocalDailyNoteDate('invalid'), undefined);
});

test('parseRenderedTemplateTimestamp parses date and datetime in local timezone', () => {
    const dateOnly = parseRenderedTemplateTimestamp('2026-10-16');
    assert.ok(dateOnly);
    assert.equal(dateOnly.isNotTime, true);
    assert.equal(new Date(dateOnly.timestamp).getFullYear(), 2026);
    assert.equal(new Date(dateOnly.timestamp).getMonth(), 9);
    assert.equal(new Date(dateOnly.timestamp).getDate(), 16);
    assert.equal(new Date(dateOnly.timestamp).getHours(), 0);

    const dateTime = parseRenderedTemplateTimestamp('2026/10/16 14:30:15');
    assert.ok(dateTime);
    assert.equal(dateTime.isNotTime, false);
    assert.equal(new Date(dateTime.timestamp).getHours(), 14);
    assert.equal(new Date(dateTime.timestamp).getMinutes(), 30);
    assert.equal(new Date(dateTime.timestamp).getSeconds(), 15);

    assert.equal(parseRenderedTemplateTimestamp('2026-02-30'), null);
});

test('extractCalendarCellDateRange supports date, created, updated, cleared date, and renderTemplate', () => {
    assert.deepEqual(
        extractCalendarCellDateRange({
            keyID: 'k1',
            type: 'date',
            date: { content: 1700000000000, isNotEmpty: false, hasEndDate: false },
        }),
        { start: null, end: null, keyID: 'k1', hasEndDate: false, isNotTime: false },
    );

    assert.deepEqual(
        extractCalendarCellDateRange({
            keyID: 'k2',
            type: 'created',
            created: { content: 1700000000000, isNotEmpty: true },
        }),
        { start: 1700000000000, end: null, keyID: 'k2', hasEndDate: false, isNotTime: false },
    );

    assert.deepEqual(
        extractCalendarCellDateRange({
            keyID: 'k3',
            type: 'updated',
            updated: { content: 1700001000000, isNotEmpty: true },
        }),
        { start: 1700001000000, end: null, keyID: 'k3', hasEndDate: false, isNotTime: false },
    );

    const templated = extractCalendarCellDateRange({
        keyID: 'k4',
        type: 'date',
        hasRenderTemplate: true,
        renderedContent: '2026-11-12 09:30',
    });
    assert.ok(templated);
    assert.equal(templated.keyID, 'k4');
    assert.equal(templated.isNotTime, false);
    assert.equal(new Date(templated.start!).getHours(), 9);
    assert.equal(new Date(templated.start!).getMinutes(), 30);
});

test('resolveFullCalendarEventRange converts inclusive all-day end to exclusive FullCalendar end', () => {
    const start = new Date(2026, 8, 19, 8, 0, 0, 0).getTime();
    const sameDayEnd = new Date(2026, 8, 19, 8, 0, 0, 0).getTime();
    const single = resolveFullCalendarEventRange({ start, end: sameDayEnd, allDay: true });
    assert.equal(formatLocalDailyNoteDate(single.start), '2026-09-19');
    assert.equal(single.end, null);

    const nextDayEnd = new Date(2026, 8, 20, 8, 0, 0, 0).getTime();
    const multi = resolveFullCalendarEventRange({ start, end: nextDayEnd, allDay: true });
    assert.equal(formatLocalDailyNoteDate(multi.start), '2026-09-19');
    assert.equal(formatLocalDailyNoteDate(multi.end!), '2026-09-21');
});

test('resolveSiYuanUpdateDateRange converts exclusive FullCalendar all-day end back to inclusive SiYuan end', () => {
    const updated = resolveSiYuanUpdateDateRange({
        startStr: '2026-09-19',
        endStr: '2026-09-21',
        allDay: true,
    });
    assert.equal(updated.startInput, '2026-09-19');
    assert.equal(updated.endInput, '2026-09-20');
    assert.equal(updated.hasEndDate, true);
    assert.equal(new Date(updated.startMs!).getHours(), 8);
    assert.equal(formatLocalDailyNoteDate(new Date(updated.endMs!)), '2026-09-20');

    const single = resolveSiYuanUpdateDateRange({
        startStr: '2026-09-19',
        endStr: '',
        allDay: true,
    });
    assert.equal(single.startInput, '2026-09-19');
    assert.equal(single.endInput, undefined);
    assert.equal(single.hasEndDate, false);
});

test('resolveSiYuanUpdateDateRange preserves timed event strings and fallback duration', () => {
    const timed = resolveSiYuanUpdateDateRange({
        startStr: '2026-09-19T09:30:00',
        endStr: '',
        allDay: false,
        defaultDurationHours: 2,
    });
    assert.equal(timed.startInput, '2026-09-19T09:30:00');
    assert.equal(timed.endInput, undefined);
    assert.equal(timed.endMs! - timed.startMs!, 2 * 60 * 60 * 1000);
    assert.equal(timed.hasEndDate, true);
});
