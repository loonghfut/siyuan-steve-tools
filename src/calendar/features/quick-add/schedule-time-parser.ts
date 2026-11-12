import dayjs from 'dayjs';

export interface ParsedScheduleTimeRange {
    start: string;
    end?: string;
}

const WEEKDAY_MAP: Record<string, number> = {
    '一': 1,
    '二': 2,
    '三': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '日': 7,
    '天': 7,
};

const CHINESE_NUM_MAP: Record<string, number> = {
    '零': 0,
    '〇': 0,
    '一': 1,
    '二': 2,
    '两': 2,
    '三': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '七': 7,
    '八': 8,
    '九': 9,
    '十': 10,
};

type DayPeriod = '凌晨' | '早上' | '早晨' | '今早' | '今晨' | '明早' | '明晨' | '上午' | '中午' | '下午' | '傍晚' | '晚上' | '今晚' | '明晚' | '后晚';

const PERIOD_DEFAULT_HOUR: Record<string, number> = {
    '凌晨': 1,
    '早上': 8,
    '早晨': 8,
    '今早': 8,
    '今晨': 8,
    '明早': 8,
    '明晨': 8,
    '上午': 9,
    '中午': 12,
    '下午': 14,
    '傍晚': 18,
    '晚上': 20,
    '今晚': 20,
    '明晚': 20,
    '后晚': 20,
};

/**
 * 清理思源 Kramdown 中的块属性、块引用 ID 与 URL，避免块 ID（如 20261112213804-xxx）
 * 或链接里的数字（如 https://example.com/12:30）误触发日期/时间识别。
 */
export function sanitizeScheduleSourceText(content: string): string {
    if (!content) return '';
    return content
        .replace(/\{:[^{}\n]*\}/g, ' ')
        .replace(/\(\(\s*\d{14}-[a-z0-9]{7}\s+["']([^"']*)["']\s*\)\)/gi, ' $1 ')
        .replace(/\(\(\s*\d{14}-[a-z0-9]{7}\s*\)\)/gi, ' ')
        .replace(/https?:\/\/[^\s)>\]]+/gi, ' ')
        .replace(/\b\d{14}-[a-z0-9]{7}\b/gi, ' ');
}

function isPmPeriod(period?: string): boolean {
    return period === '下午' || period === '傍晚' || period === '晚上' || period === '今晚' || period === '明晚' || period === '后晚';
}

function isAmPeriod(period?: string): boolean {
    return period === '凌晨' || period === '早上' || period === '早晨' || period === '上午' || period === '今早' || period === '今晨' || period === '明早' || period === '明晨';
}

function convertChineseTimeNumber(chineseNumStr: string): number {
    if (!chineseNumStr) return NaN;
    if (chineseNumStr.length === 1) {
        return CHINESE_NUM_MAP[chineseNumStr] !== undefined ? CHINESE_NUM_MAP[chineseNumStr] : NaN;
    }

    if (chineseNumStr.startsWith('十')) {
        if (chineseNumStr.length === 2) {
            const ones = CHINESE_NUM_MAP[chineseNumStr[1]];
            return ones !== undefined && ones > 0 && ones < 10 ? 10 + ones : NaN;
        }
        return NaN;
    }

    if (chineseNumStr.endsWith('十')) {
        if (chineseNumStr.length === 2) {
            const tens = CHINESE_NUM_MAP[chineseNumStr[0]];
            return tens !== undefined && tens > 0 && tens < 10 ? tens * 10 : NaN;
        }
        return NaN;
    }

    if (chineseNumStr.includes('十')) {
        const parts = chineseNumStr.split('十');
        if (parts.length === 2 && parts[0] && parts[1]) {
            const tens = CHINESE_NUM_MAP[parts[0]];
            const ones = CHINESE_NUM_MAP[parts[1]];
            if (tens !== undefined && tens > 0 && tens < 10 && ones !== undefined && ones > 0 && ones < 10) {
                return tens * 10 + ones;
            }
        }
        return NaN;
    }

    if ((chineseNumStr.startsWith('零') || chineseNumStr.startsWith('〇')) && chineseNumStr.length === 2) {
        const ones = CHINESE_NUM_MAP[chineseNumStr[1]];
        return ones !== undefined && ones > 0 && ones < 10 ? ones : NaN;
    }

    return NaN;
}

function validateAndBuildYmd(base: dayjs.Dayjs, year: number, month: number, day: number): dayjs.Dayjs | null {
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
    }
    const candidate = base.year(year).date(1).month(month - 1);
    if (day > candidate.daysInMonth()) {
        return null;
    }
    const built = candidate.date(day);
    if (built.year() !== year || built.month() !== month - 1 || built.date() !== day) {
        return null;
    }
    return built;
}

function getMondayOfWeek(base: dayjs.Dayjs): dayjs.Dayjs {
    const jsDay = base.day(); // 0=Sun .. 6=Sat
    const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon .. 7=Sun
    return base.startOf('day').subtract(isoDay - 1, 'day');
}

interface ParsedDateResult {
    date: dayjs.Dayjs;
    matched: boolean;
    implicitPeriod?: DayPeriod;
}

function extractDateFromText(text: string, now: dayjs.Dayjs): ParsedDateResult {
    // 1. 完整年月日：2026-11-15 / 2026/11/15 / 2026.11.15 / 2026年11月15日(号)
    const fullYmdMatch = text.match(
        /(?<!\d)(19\d{2}|20\d{2})\s*[年\-/.]\s*(0?[1-9]|1[0-2])\s*[月\-/.]\s*(0?[1-9]|[12]\d|3[01])\s*[日号]?(?!\d)/,
    );
    if (fullYmdMatch) {
        const parsed = validateAndBuildYmd(
            now,
            parseInt(fullYmdMatch[1], 10),
            parseInt(fullYmdMatch[2], 10),
            parseInt(fullYmdMatch[3], 10),
        );
        return parsed ? { date: parsed, matched: true } : { date: now, matched: false };
    }

    // 2. 紧凑 YYYYMMDD:（如 20261115: ）
    const compactYmdMatch = text.match(/(?<!\d)(19\d{2}|20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?=\s*[:：])/);
    if (compactYmdMatch) {
        const parsed = validateAndBuildYmd(
            now,
            parseInt(compactYmdMatch[1], 10),
            parseInt(compactYmdMatch[2], 10),
            parseInt(compactYmdMatch[3], 10),
        );
        return parsed ? { date: parsed, matched: true } : { date: now, matched: false };
    }

    // 3. 中文 X月X日/号（先 date(1) 再改月，避免 3月31日 -> 4月5日 溢出到 5月）
    const cnMonthDayMatch = text.match(/(?<!\d)(0?[1-9]|1[0-2])\s*月\s*(0?[1-9]|[12]\d|3[01])\s*[日号]/);
    if (cnMonthDayMatch) {
        const parsed = validateAndBuildYmd(
            now,
            now.year(),
            parseInt(cnMonthDayMatch[1], 10),
            parseInt(cnMonthDayMatch[2], 10),
        );
        return parsed ? { date: parsed, matched: true } : { date: now, matched: false };
    }

    // 4. M/D 或 M-D（避开 HH:MM-HH:MM 时间段里的 MM-HH、分数 1/2/3 与 "11-12:30"）
    const slashDashMdMatch = text.match(
        /(?<![\d/\-.:：])(0?[1-9]|1[0-2])\s*[/\-]\s*(0?[1-9]|[12]\d|3[01])(?![\d/\-.]|:\d|\s*(?:点|时|小时|分|am|pm))/i,
    );
    if (slashDashMdMatch) {
        const parsed = validateAndBuildYmd(
            now,
            now.year(),
            parseInt(slashDashMdMatch[1], 10),
            parseInt(slashDashMdMatch[2], 10),
        );
        if (parsed) {
            return { date: parsed, matched: true };
        }
    }

    // 5. M.D(日/号)（例如 6.15日、11.15；排除 1.2.3 多段版本/IP）
    const dotMdMatch = text.match(/(?<![\d.])(0?[1-9]|1[0-2])\.(0?[1-9]|[12]\d|3[01])(?:[日号])?(?![\d.])/);
    if (dotMdMatch) {
        const parsed = validateAndBuildYmd(
            now,
            now.year(),
            parseInt(dotMdMatch[1], 10),
            parseInt(dotMdMatch[2], 10),
        );
        if (parsed) {
            return { date: parsed, matched: true };
        }
    }

    // 6. 紧凑 MMDD:（如 0809: ）
    const compactMdMatch = text.match(/(?<!\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?=\s*[:：])/);
    if (compactMdMatch) {
        const parsed = validateAndBuildYmd(
            now,
            now.year(),
            parseInt(compactMdMatch[1], 10),
            parseInt(compactMdMatch[2], 10),
        );
        if (parsed) {
            return { date: parsed, matched: true };
        }
    }

    // 7. 带周偏移的星期：本周/这周/这个周/下周/下个周/上周/上个周 + 星期/周 + X（按周一=1..周日=7）
    const prefixedWeekdayMatch = text.match(
        /(本|这|这个|下|下个|上|上个)(?:周|星期)(?:周|星期)?([一二三四五六日天])/,
    );
    if (prefixedWeekdayMatch) {
        const prefix = prefixedWeekdayMatch[1];
        const targetIsoDay = WEEKDAY_MAP[prefixedWeekdayMatch[2]];
        if (targetIsoDay) {
            let weekMonday = getMondayOfWeek(now);
            if (prefix.startsWith('下')) {
                weekMonday = weekMonday.add(7, 'day');
            } else if (prefix.startsWith('上')) {
                weekMonday = weekMonday.subtract(7, 'day');
            }
            return { date: weekMonday.add(targetIsoDay - 1, 'day'), matched: true };
        }
    }

    // 8. 复合时段词（今晚 / 明晚 / 后晚 / 今早 / 今晨 / 明早 / 明晨）
    const shortcutMatch = text.match(/(今晚|今早|今晨|明晚|明早|明晨|后晚)/);
    if (shortcutMatch) {
        const token = shortcutMatch[1] as DayPeriod;
        let d = now.startOf('day');
        if (token.startsWith('明')) d = d.add(1, 'day');
        else if (token.startsWith('后')) d = d.add(2, 'day');
        return { date: d, matched: true, implicitPeriod: token };
    }

    // 9. 相对天 / 相对周 / 相对月（注意：大后天 = +3 天，大前天 = -3 天）
    const relativeMatch = text.match(
        /(大后天|后天|大前天|前天|明天|明日|昨天|昨日|今天|本日|今日|下个星期|下星期|下周|上个星期|上星期|上周|下个月|下月|上个月|上月)/,
    );
    if (relativeMatch) {
        const keyword = relativeMatch[1];
        let d = now;
        switch (keyword) {
            case '今天':
            case '本日':
            case '今日':
                break;
            case '明天':
            case '明日':
                d = d.add(1, 'day');
                break;
            case '后天':
                d = d.add(2, 'day');
                break;
            case '大后天':
                d = d.add(3, 'day');
                break;
            case '昨天':
            case '昨日':
                d = d.subtract(1, 'day');
                break;
            case '前天':
                d = d.subtract(2, 'day');
                break;
            case '大前天':
                d = d.subtract(3, 'day');
                break;
            case '下周':
            case '下星期':
            case '下个星期':
                d = d.add(1, 'week');
                break;
            case '上周':
            case '上星期':
            case '上个星期':
                d = d.subtract(1, 'week');
                break;
            case '下月':
            case '下个月':
                d = d.add(1, 'month');
                break;
            case '上月':
            case '上个月':
                d = d.subtract(1, 'month');
                break;
        }
        return { date: d, matched: true };
    }

    // 10. 不带前缀的 周X / 星期X（取今天起最近的未来一天，含今天）
    const bareWeekdayMatch = text.match(/(?:周|星期)([一二三四五六日天])/);
    if (bareWeekdayMatch) {
        const targetIsoDay = WEEKDAY_MAP[bareWeekdayMatch[1]];
        if (targetIsoDay) {
            const currentJs = now.day();
            const currentIso = currentJs === 0 ? 7 : currentJs;
            const offset = (targetIsoDay - currentIso + 7) % 7;
            return { date: now.startOf('day').add(offset, 'day'), matched: true };
        }
    }

    // 11. 仅日：X号 / X日（避免误匹配带月份的 X月X日 尾段）
    const dayOnlyMatch = text.match(/(?<![\d月./\-])(0?[1-9]|[12]\d|3[01])[号日]/);
    if (dayOnlyMatch) {
        const day = parseInt(dayOnlyMatch[1], 10);
        const parsed = validateAndBuildYmd(now, now.year(), now.month() + 1, day);
        if (parsed) {
            return { date: parsed, matched: true };
        }
    }

    return { date: now, matched: false };
}

interface ParsedClock {
    hour: number;
    minute: number;
    period?: string;
    index: number;
    endIndex: number;
}

const SINGLE_TIME_REGEX = new RegExp(
    [
        // 可选中文时段前缀
        '(?:(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)\\s*)?',
        '(?:',
        // 分支 A: 中文 / 阿拉伯数字 + 点/时（如 下午两点半、3点一刻、14点05分、3点三刻）
        '(?:(\\d{1,2})|([一二两三四五六七八九十]+))\\s*[点时](?:\\s*(?:(一刻)|(三刻)|(半)|(?:(\\d{1,2})|([一二三四五六七八九十零〇]+))\\s*分?))?',
        '|',
        // 分支 B: HH:MM 或 HH：MM (可选 am/pm)，分钟必须两位 [0-5]\d 避免把比例 1:2 识别为时间
        '(?<![:\\d])([01]?\\d|2[0-3])\\s*[:：]\\s*([0-5]\\d)(?!\\d)(?:\\s*(am|pm))?',
        '|',
        // 分支 C: 英文 9am / 3pm
        '(?<![:\\d])(1[0-2]|0?[1-9])\\s*(am|pm)(?![a-z])',
        ')',
    ].join(''),
    'gi',
);

function adjustHourByPeriod(rawHour: number, period?: string, amPm?: string): number {
    let hour = rawHour;

    if (amPm) {
        const lower = amPm.toLowerCase();
        if (lower === 'pm' && hour < 12) {
            hour += 12;
        } else if (lower === 'am' && hour === 12) {
            hour = 0;
        }
        return hour;
    }

    if (!period) {
        return hour;
    }

    if (isPmPeriod(period)) {
        if (hour < 12) {
            hour += 12;
        } else if ((period === '晚上' || period === '今晚' || period === '明晚' || period === '后晚') && hour === 12) {
            hour = 0;
        }
    } else if (period === '中午') {
        if (hour >= 1 && hour <= 10) {
            hour += 12;
        }
    } else if (isAmPeriod(period)) {
        if (hour === 12) {
            hour = 0;
        }
    }

    return hour;
}

function extractClockMatches(text: string, fallbackPeriod?: DayPeriod): ParsedClock[] {
    const matches: ParsedClock[] = [];
    const regex = new RegExp(SINGLE_TIME_REGEX.source, 'gi');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const explicitPeriod = match[1];
        const effectivePeriod = explicitPeriod || fallbackPeriod;

        const arabicHour = match[2];
        const chineseHour = match[3];
        const quarterOne = match[4];
        const quarterThree = match[5];
        const halfMark = match[6];
        const arabicMinute = match[7];
        const chineseMinute = match[8];

        const digitalHour = match[9];
        const digitalMinute = match[10];
        const digitalAmPm = match[11];

        const merHour = match[12];
        const merAmPm = match[13];

        let rawHour = NaN;
        let minute = NaN;
        let amPm: string | undefined;

        if (arabicHour !== undefined || chineseHour !== undefined) {
            rawHour = arabicHour !== undefined ? parseInt(arabicHour, 10) : convertChineseTimeNumber(chineseHour);
            if (quarterOne) {
                minute = 15;
            } else if (quarterThree) {
                minute = 45;
            } else if (halfMark) {
                minute = 30;
            } else if (arabicMinute !== undefined) {
                minute = parseInt(arabicMinute, 10);
            } else if (chineseMinute !== undefined) {
                minute = convertChineseTimeNumber(chineseMinute);
            } else {
                minute = 0;
            }
        } else if (digitalHour !== undefined && digitalMinute !== undefined) {
            rawHour = parseInt(digitalHour, 10);
            minute = parseInt(digitalMinute, 10);
            amPm = digitalAmPm;
        } else if (merHour !== undefined && merAmPm !== undefined) {
            rawHour = parseInt(merHour, 10);
            minute = 0;
            amPm = merAmPm;
        }

        if (Number.isNaN(rawHour) || Number.isNaN(minute)) {
            continue;
        }

        const hour = adjustHourByPeriod(rawHour, effectivePeriod, amPm);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            continue;
        }

        matches.push({
            hour,
            minute,
            period: effectivePeriod,
            index: match.index,
            endIndex: match.index + match[0].length,
        });
    }

    return matches;
}

/**
 * 解析中文/常见格式的日程日期与时间（支持时间段，如 `明天下午2点到4点`、`11/15 14:00-16:00`）。
 * 可传入 `now` 基准时间以便测试确定性；未传入时默认取当前本地时间。
 */
export function parseScheduleTimeRange(
    content: string,
    now: dayjs.Dayjs = dayjs(),
): ParsedScheduleTimeRange | null {
    if (!content) {
        return null;
    }

    const cleaned = sanitizeScheduleSourceText(content).trim();
    if (!cleaned) {
        return null;
    }

    const dateResult = extractDateFromText(cleaned, now);
    const clocks = extractClockMatches(cleaned, dateResult.implicitPeriod);

    // 无任何日期或显式时间时返回 null（单独的“下午/晚上”若无日期也不误判）
    if (!dateResult.matched && clocks.length === 0) {
        return null;
    }

    if (clocks.length === 0) {
        // 识别到日期或带时段词（如“明天下午” / “今晚”），按语义或默认 08:00 设置时间
        const standalonePeriodMatch = cleaned.match(/(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)/);
        const periodKey = dateResult.implicitPeriod || standalonePeriodMatch?.[1];
        const hour = periodKey && PERIOD_DEFAULT_HOUR[periodKey] !== undefined ? PERIOD_DEFAULT_HOUR[periodKey] : 8;
        const startDt = dateResult.date.hour(hour).minute(0).second(0).millisecond(0);
        return { start: startDt.format('YYYY-MM-DDTHH:mm') };
    }

    const first = clocks[0];
    const startDt = dateResult.date.hour(first.hour).minute(first.minute).second(0).millisecond(0);

    // 若第二个时间通过区间连接符（- / ~ / 到 / 至）紧随第一个时间，解析为结束时间
    if (clocks.length >= 2) {
        const second = clocks[1];
        const connector = cleaned.slice(first.endIndex, second.index);
        if (/^\s*(?:-|—|–|~|～|到|至)\s*$/.test(connector)) {
            let endHour = second.hour;
            // 处理 "下午2点到4点" 结束时间省略时段前缀的继承场景
            if (isPmPeriod(first.period) && endHour > 0 && endHour < 12 && !textHasExplicitPeriod(cleaned, second)) {
                endHour += 12;
            }
            let endDt = dateResult.date.hour(endHour).minute(second.minute).second(0).millisecond(0);
            if (!endDt.isAfter(startDt)) {
                // 跨午夜（例如 23:00-01:00）
                endDt = endDt.add(1, 'day');
            }
            return {
                start: startDt.format('YYYY-MM-DDTHH:mm'),
                end: endDt.format('YYYY-MM-DDTHH:mm'),
            };
        }
    }

    return { start: startDt.format('YYYY-MM-DDTHH:mm') };
}

function textHasExplicitPeriod(text: string, clock: ParsedClock): boolean {
    const slice = text.slice(clock.index, clock.endIndex);
    return /(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|am|pm)/i.test(slice);
}
