import assert from 'node:assert/strict';
import test from 'node:test';
import {
    extractCalendarCellDateRange,
    formatLocalDailyNoteDate,
    parseRenderedTemplateTimestamp,
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
