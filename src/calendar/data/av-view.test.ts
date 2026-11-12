import assert from 'node:assert/strict';
import test from 'node:test';
import { extractViewItemsFromAvResponse } from './av-view.ts';

test('extractViewItemsFromAvResponse handles API error strings and nullish responses safely', () => {
    assert.deepEqual(
        extractViewItemsFromAvResponse('/api/av/renderAttributeViewerror', '20251029224308-1imsy94'),
        { valid: false, items: [] },
    );
    assert.deepEqual(
        extractViewItemsFromAvResponse(null, '20250830155000-a5verop'),
        { valid: false, items: [] },
    );
    assert.deepEqual(
        extractViewItemsFromAvResponse({}, '20250830155000-a5verop'),
        { valid: false, items: [] },
    );
});

test('extractViewItemsFromAvResponse maps views and filters malformed view entries', () => {
    const result = extractViewItemsFromAvResponse(
        {
            id: 'av-1',
            name: '日程',
            views: [
                { id: 'v1', name: '表格' },
                null,
                { name: '缺少id' },
                { id: 'v2', name: '' },
            ],
        },
        'fallback-av',
        'block-1',
    );

    assert.deepEqual(result, {
        valid: true,
        items: [
            { rootid: 'av-1', viewId: 'v1', name: '日程-表格', blockId: 'block-1' },
            { rootid: 'av-1', viewId: 'v2', name: '日程-', blockId: 'block-1' },
        ],
    });
});

test('extractViewItemsFromAvResponse falls back to viewID when views array is missing', () => {
    const result = extractViewItemsFromAvResponse(
        {
            id: 'av-2',
            name: '',
            viewID: 'v-only',
            view: { name: '日历' },
        },
        'fallback-av',
    );

    assert.deepEqual(result, {
        valid: true,
        items: [
            { rootid: 'av-2', viewId: 'v-only', name: '日历', blockId: undefined },
        ],
    });
});
