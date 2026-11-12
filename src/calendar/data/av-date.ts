export interface ExtractedCalendarDateRange {
    start: number | null;
    end: number | null;
    keyID: string;
    hasEndDate: boolean;
    isNotTime?: boolean;
}

const TEMPLATE_DATETIME_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;

/**
 * 判断思源内核版本是否支持 `/api/filetree/createDailyNote` 原生 `date` 参数（3.8.0+）。
 */
export function supportsNativeDailyNoteDate(kernelVersion?: string): boolean {
    if (!kernelVersion) {
        return false;
    }
    const match = /^\s*v?(\d+)\.(\d+)/i.exec(kernelVersion);
    if (!match) {
        return false;
    }
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return major > 3 || (major === 3 && minor >= 8);
}

/**
 * 将日期或日期字符串规范化为本地公历 `YYYY-MM-DD`。
 */
export function formatLocalDailyNoteDate(input?: Date | string): string | undefined {
    if (!input) {
        return undefined;
    }
    if (typeof input === 'string') {
        const trimmed = input.trim();
        const prefixMatch = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(trimmed);
        if (prefixMatch) {
            return `${prefixMatch[1]}-${prefixMatch[2]}-${prefixMatch[3]}`;
        }
    }
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) {
        return undefined;
    }
    const year = String(date.getFullYear()).padStart(4, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 解析思源 3.8 渲染模板计算出的日期文本（按本地时区解析，与 `kernel/av/layout_calendar.go` 一致）。
 */
export function parseRenderedTemplateTimestamp(content: string): { timestamp: number; isNotTime: boolean } | null {
    const trimmed = content.trim();
    if (!trimmed) {
        return null;
    }
    const match = TEMPLATE_DATETIME_RE.exec(trimmed);
    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const hasTime = match[4] !== undefined;
        const hour = hasTime ? Number(match[4]) : 0;
        const minute = hasTime ? Number(match[5]) : 0;
        const second = hasTime && match[6] !== undefined ? Number(match[6]) : 0;
        const parsed = new Date(0);
        parsed.setFullYear(year, month - 1, day);
        parsed.setHours(hour, minute, second, 0);
        if (
            parsed.getFullYear() !== year
            || parsed.getMonth() !== month - 1
            || parsed.getDate() !== day
            || parsed.getHours() !== hour
            || parsed.getMinutes() !== minute
            || parsed.getSeconds() !== second
        ) {
            return null;
        }
        return { timestamp: parsed.getTime(), isNotTime: !hasTime };
    }
    // 兼容含时区偏移等通用 ISO 日期时间格式
    if (trimmed.includes('T') || /[+-]\d{2}:?\d{2}$|Z$/i.test(trimmed)) {
        const parsed = Date.parse(trimmed);
        if (!Number.isNaN(parsed)) {
            return { timestamp: parsed, isNotTime: false };
        }
    }
    return null;
}

/**
 * 从思源 AV 单元格提取日程起止时间戳。
 * 兼容 3.8 日历视图可选的 `date`（含 `isNotEmpty` 校验与 `hasRenderTemplate` 模板列）、`created` 和 `updated` 列。
 */
export function extractCalendarCellDateRange(timeCell: any): ExtractedCalendarDateRange | null {
    if (!timeCell) {
        return null;
    }
    const keyID = timeCell.keyID || '';

    if (timeCell.type === 'created') {
        const created = timeCell.created;
        const hasValue = created && created.isNotEmpty !== false && typeof created.content === 'number';
        return {
            start: hasValue ? created.content : null,
            end: null,
            keyID,
            hasEndDate: false,
            isNotTime: false,
        };
    }

    if (timeCell.type === 'updated') {
        const updated = timeCell.updated;
        const hasValue = updated && updated.isNotEmpty !== false && typeof updated.content === 'number';
        return {
            start: hasValue ? updated.content : null,
            end: null,
            keyID,
            hasEndDate: false,
            isNotTime: false,
        };
    }

    if (timeCell.hasRenderTemplate && typeof timeCell.renderedContent === 'string') {
        const parsed = parseRenderedTemplateTimestamp(timeCell.renderedContent);
        return {
            start: parsed ? parsed.timestamp : null,
            end: null,
            keyID,
            hasEndDate: false,
            isNotTime: parsed ? parsed.isNotTime : false,
        };
    }

    const dateValue = timeCell.date;
    if (!dateValue) {
        return {
            start: null,
            end: null,
            keyID,
            hasEndDate: false,
        };
    }

    const hasStart = dateValue.isNotEmpty !== undefined
        ? Boolean(dateValue.isNotEmpty) && typeof dateValue.content === 'number'
        : Boolean(dateValue.content);
    const hasEnd = Boolean(dateValue.hasEndDate)
        && (dateValue.isNotEmpty2 !== undefined
            ? Boolean(dateValue.isNotEmpty2) && typeof dateValue.content2 === 'number'
            : Boolean(dateValue.content2));

    let start: number | null = hasStart ? dateValue.content : null;
    let end: number | null = hasEnd ? dateValue.content2 : null;
    // 与 kernel/av/layout_calendar.go CalendarInterval 对齐：仅填结束日期时将其作为单点开始时间
    if (start === null && end !== null) {
        start = end;
        end = null;
    }

    return {
        start,
        end,
        keyID,
        hasEndDate: Boolean(dateValue.hasEndDate),
        isNotTime: Boolean(dateValue.isNotTime),
    };
}

export interface FullCalendarEventRange {
    start: Date;
    end: Date | null;
}

export interface SiYuanUpdateDateRange {
    startInput: string;
    endInput?: string;
    startMs: number | null;
    endMs: number | null;
    hasEndDate: boolean;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

function toLocalDate(input?: Date | number | string | null): Date | null {
    if (input === undefined || input === null || input === '') {
        return null;
    }
    if (input instanceof Date) {
        return Number.isNaN(input.getTime()) ? null : new Date(input.getTime());
    }
    if (typeof input === 'string') {
        const match = DATE_ONLY_RE.exec(input.trim());
        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            const local = new Date(year, month - 1, day, 0, 0, 0, 0);
            return Number.isNaN(local.getTime()) ? null : local;
        }
    }
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function calendarDayStart(value: Date | number): number {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

export function addLocalCalendarDays(value: Date | number, days: number): number {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    return date.getTime();
}

function localMorningTimestamp(value: Date | number): number {
    const date = new Date(value);
    date.setHours(8, 0, 0, 0);
    return date.getTime();
}

/**
 * 将思源 AV 日期起止转换为 FullCalendar 事件起止。
 * 与 SiYuan `kernel/av/layout_calendar.go` 的 `CalendarInterval` 保持一致：
 * 全天事件在思源中结束日为闭区间（包含当天），而 FullCalendar 的 `end` 为半开区间（不包含结束日）。
 */
export function resolveFullCalendarEventRange(input: {
    start: Date | number | string;
    end?: Date | number | string | null;
    allDay: boolean;
}): FullCalendarEventRange {
    const startDate = toLocalDate(input.start) ?? new Date(new Date().setHours(8, 0, 0, 0));
    const endDate = toLocalDate(input.end);

    if (!input.allDay) {
        return {
            start: startDate,
            end: endDate,
        };
    }

    const startDay = calendarDayStart(startDate);
    if (!endDate) {
        return {
            start: new Date(startDay),
            end: null,
        };
    }

    const endDay = calendarDayStart(endDate);
    if (endDay > startDay) {
        return {
            start: new Date(startDay),
            end: new Date(addLocalCalendarDays(endDay, 1)),
        };
    }

    return {
        start: new Date(startDay),
        end: null,
    };
}

/**
 * 将 FullCalendar 的拖放/缩放结果转换为思源 AV 写入值与本地缓存时间戳。
 * 无论拖放（eventDrop）还是缩放（eventResize），全天事件都需要将 FullCalendar 的半开 `end` 还原为思源的闭区间结束日。
 */
export function resolveSiYuanUpdateDateRange(input: {
    startStr?: string | null;
    endStr?: string | null;
    start?: Date | null;
    end?: Date | null;
    allDay: boolean;
    defaultDurationHours?: number;
}): SiYuanUpdateDateRange {
    if (input.allDay) {
        const startLocal = toLocalDate(input.startStr || input.start);
        if (!startLocal) {
            return { startInput: '', startMs: null, endMs: null, hasEndDate: false };
        }
        const startDay = calendarDayStart(startLocal);
        const startInput = formatLocalDailyNoteDate(new Date(startDay)) || '';
        const startMs = localMorningTimestamp(startDay);

        const rawEnd = input.endStr ? toLocalDate(input.endStr) : toLocalDate(input.end);
        let endInput: string | undefined;
        let endMs: number | null = null;
        if (rawEnd) {
            // FullCalendar 全天事件的 end 是排他的 00:00；若落在非零时刻则保留当日。
            const isMidnight = rawEnd.getHours() === 0
                && rawEnd.getMinutes() === 0
                && rawEnd.getSeconds() === 0
                && rawEnd.getMilliseconds() === 0;
            const inclusiveEndDay = isMidnight
                ? addLocalCalendarDays(calendarDayStart(rawEnd), -1)
                : calendarDayStart(rawEnd);
            if (inclusiveEndDay > startDay) {
                endInput = formatLocalDailyNoteDate(new Date(inclusiveEndDay));
                endMs = localMorningTimestamp(inclusiveEndDay);
            }
        }

        return {
            startInput,
            endInput,
            startMs,
            endMs,
            hasEndDate: Boolean(endInput),
        };
    }

    const startInput = input.startStr || (input.start ? input.start.toISOString() : '');
    const endInput = input.endStr ? input.endStr : (input.end ? input.end.toISOString() : undefined);
    const parsedStart = startInput ? toLocalDate(startInput) : null;
    const startMs = parsedStart ? parsedStart.getTime() : null;
    let endMs: number | null = null;
    if (endInput) {
        const parsedEnd = toLocalDate(endInput);
        endMs = parsedEnd ? parsedEnd.getTime() : null;
    } else if (startMs !== null) {
        const hours = Number(input.defaultDurationHours) || 0;
        endMs = startMs + hours * 60 * 60 * 1000;
    }

    return {
        startInput,
        endInput,
        startMs,
        endMs,
        hasEndDate: endMs !== null,
    };
}
