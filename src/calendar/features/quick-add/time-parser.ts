import dayjs from 'dayjs';
import { showMessage } from 'siyuan';

function mapDayCharToJsDay(dayChar: string): number {
    // ...existing code...
    switch (dayChar) {
        case '一': return 1; // Monday
        case '二': return 2; // Tuesday
        case '三': return 3; // Wednesday
        case '四': return 4; // Thursday
        case '五': return 5; // Friday
        case '六': return 6; // Saturday
        case '日': case '天': return 0; // Sunday
        default: return -1; // Invalid
    }
}

function parseDateFromString(dateMatch: RegExpMatchArray | null, initialDate: dayjs.Dayjs): dayjs.Dayjs {
    let targetDate = initialDate;
    if (!dateMatch) return targetDate;

    // Group 1: Relative keywords (今天, 明天, 下周 (general), 下月, etc.)
    if (dateMatch[1]) {
        const keyword = dateMatch[1];
        switch (keyword) {
            case '今天':
            case '本日':
                break;
            case '明天':
            case '明日':
                targetDate = targetDate.add(1, 'day');
                break;
            case '后天':
            case '大后天':
                targetDate = targetDate.add(2, 'day');
                break;
            case '昨天':
            case '昨日':
                targetDate = targetDate.subtract(1, 'day');
                break;
            case '前天':
                targetDate = targetDate.subtract(2, 'day');
                break;
            case '下周':
            case '下星期':
            case '下个星期':
                targetDate = targetDate.add(1, 'week');
                break;
            case '上周':
            case '上星期':
            case '上个星期':
                targetDate = targetDate.subtract(1, 'week');
                break;
            case '下月':
            case '下个月':
                targetDate = targetDate.add(1, 'month');
                break;
            case '上月':
            case '上个月':
                targetDate = targetDate.subtract(1, 'month');
                break;
        }
    }
    // Group 2 & 3: X月X日
    else if (dateMatch[2] && dateMatch[3]) {
        const month = parseInt(dateMatch[2]);
        const day = parseInt(dateMatch[3]);
        targetDate = targetDate.month(month - 1).date(day);
    }
    // NEW Group 4 & 5: X.Y日 (e.g., 6.15日)
    else if (dateMatch[4] && dateMatch[5]) {
        const month = parseInt(dateMatch[4]);
        const day = parseInt(dateMatch[5]);
        targetDate = targetDate.month(month - 1).date(day);
    }
    // OLD G4 -> NEW Group 6: X日
    else if (dateMatch[6]) {
        const day = parseInt(dateMatch[6]);
        targetDate = targetDate.date(day);
    }
    // OLD G5 & G6 -> NEW Group 7 & 8: (本周|下周|上周)(周|星期)?([一二三四五六日天])
    else if (dateMatch[7] && dateMatch[8]) {
        const weekPrefix = dateMatch[7]; // "本周", "下周", "上周"
        const dayChar = dateMatch[8];
        const dayOfWeekJs = mapDayCharToJsDay(dayChar);

        if (dayOfWeekJs === -1) {
            console.warn(`无法识别的星期字符: ${dayChar}`);
            return initialDate;
        }

        let tempTargetDate = initialDate;
        if (weekPrefix === '下周') {
            tempTargetDate = tempTargetDate.add(1, 'week');
        } else if (weekPrefix === '上周') {
            tempTargetDate = tempTargetDate.subtract(1, 'week');
        }
        targetDate = tempTargetDate.day(dayOfWeekJs);
    }
    // OLD G7 & G8 -> NEW Group 9 & 10: (周|星期)([一二三四五六日天])
    else if (dateMatch[9] && dateMatch[10]) {
        const dayChar = dateMatch[10];
        const dayOfWeekJs = mapDayCharToJsDay(dayChar);

        if (dayOfWeekJs === -1) {
            console.warn(`无法识别的星期字符: ${dayChar}`);
            return initialDate;
        }
        let tempDate = initialDate.day(dayOfWeekJs);
        if (tempDate.isBefore(initialDate.startOf('day'))) {
            tempDate = tempDate.add(7, 'days');
        }
        targetDate = tempDate;
    }

    // NEW Group 11,12,13: YYYYMMDD (e.g., 20250809)
    else if (dateMatch[11] && dateMatch[12] && dateMatch[13]) {
        const year = parseInt(dateMatch[11], 10);
        const month = parseInt(dateMatch[12], 10);
        const day = parseInt(dateMatch[13], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            targetDate = targetDate.year(year).month(month - 1).date(day);
        }
    }
    // NEW Group 14 & 15: M-D or M/D (e.g., 8-9, 08-09, 8/9)
    else if (dateMatch[14] && dateMatch[15]) {
        const month = parseInt(dateMatch[14], 10);
        const day = parseInt(dateMatch[15], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            targetDate = targetDate.month(month - 1).date(day);
        }
    }
    // NEW Group 16 & 17: MMDD compact (e.g., 0809)
    else if (dateMatch[16] && dateMatch[17]) {
        const month = parseInt(dateMatch[16], 10);
        const day = parseInt(dateMatch[17], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            targetDate = targetDate.month(month - 1).date(day);
        }
    }

    return targetDate;
}

/**
 * Converts Chinese numeral string (for time, 0-59) to an integer.
 * e.g., "七" -> 7, "十五" -> 15, "二十三" -> 23, "零五" -> 5
 */
function chineseToInteger(chineseNumStr: string): number {
    if (!chineseNumStr) return NaN;

    const numMap: { [key: string]: number } = {
        '零': 0, '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
    };

    // Handle single characters "一" through "十" and "零"
    if (chineseNumStr.length === 1) {
        return numMap[chineseNumStr] !== undefined ? numMap[chineseNumStr] : NaN;
    }

    let val = 0;
    if (chineseNumStr.startsWith('十')) { // "十", "十一" to "十九"
        val = 10;
        if (chineseNumStr.length === 2) { // "十一" to "十九"
            const onesDigit = numMap[chineseNumStr[1]];
            if (onesDigit !== undefined && onesDigit > 0 && onesDigit < 10) {
                val += onesDigit;
            } else { return NaN; } // Invalid like "十〇" or "十十"
        } else if (chineseNumStr.length > 2) { return NaN; } // Invalid like "十二三"
        // If length is 1, it's "十", val is 10.
    } else if (chineseNumStr.endsWith('十')) { // "二十", "三十", ..., "五十" (up to "九十")
        if (chineseNumStr.length === 2) {
            const tensDigit = numMap[chineseNumStr[0]];
            if (tensDigit !== undefined && tensDigit > 0 && tensDigit < 10) {
                val = tensDigit * 10;
            } else { return NaN; } // Invalid like "〇十" or "十十"
        } else { return NaN; } // Invalid like "一百十"
    } else if (chineseNumStr.includes('十')) { // "二十一", "三十五", etc.
        const parts = chineseNumStr.split('十');
        if (parts.length === 2 && parts[0] && parts[1]) {
            const tensDigit = numMap[parts[0]];
            const onesDigit = numMap[parts[1]];
            if (tensDigit !== undefined && tensDigit > 0 && tensDigit < 10 &&
                onesDigit !== undefined && onesDigit > 0 && onesDigit < 10) {
                val = tensDigit * 10 + onesDigit;
            } else { return NaN; }
        } else { return NaN; } // Malformed
    } else if ((chineseNumStr.startsWith('零') || chineseNumStr.startsWith('〇')) && chineseNumStr.length === 2) { // "零五"
        const onesDigit = numMap[chineseNumStr[1]];
        if (onesDigit !== undefined && onesDigit > 0 && onesDigit < 10) {
            val = onesDigit;
        } else { return NaN; }
    } else {
        return NaN; // Not a recognized Chinese numeral for time
    }
    return val;
}

function parseTimeFromString(timeMatch: RegExpMatchArray | null, initialDate: dayjs.Dayjs): dayjs.Dayjs | null {
    let targetDate = initialDate;
    if (timeMatch) {
        let hours: number | undefined = undefined;
        let minutes: number | undefined = undefined;

        const period = timeMatch[1];        // Capture Group 1: (上午|下午|中午|晚上)

        // Time format: (上午|下午|中午|晚上)? (?:(\d{1,2})|([一二三四五六七八九十]+)) 点 (?:(?:(\d{1,2})|([一二三四五六七八九十零]+))分?|(半))?
        const arabicHourStr = timeMatch[2];   // Capture Group 2: Arabic hour (\d{1,2})
        const chineseHourStr = timeMatch[3];  // Capture Group 3: Chinese hour ([一二三四五六七八九十]+)
        const arabicMinuteStr = timeMatch[4]; // Capture Group 4: Arabic minute (\d{1,2})
        const chineseMinuteStr = timeMatch[5];// Capture Group 5: Chinese minute ([一二三四五六七八九十零]+)
        const halfHourMarker = timeMatch[6];  // Capture Group 6: "半"

        // Time format: HH:MM
        const digitalHourStr = timeMatch[7];  // Capture Group 7: Digital hour (\d{1,2})
        const digitalMinuteStr = timeMatch[8];// Capture Group 8: Digital minute (\d{1,2})

        if (arabicHourStr !== undefined || chineseHourStr !== undefined) { // "X点Y分" or "X点半" format
            if (arabicHourStr !== undefined) {
                hours = parseInt(arabicHourStr, 10);
            } else if (chineseHourStr !== undefined) {
                hours = chineseToInteger(chineseHourStr);
            }

            if (halfHourMarker === '半') {
                minutes = 30;
            } else if (arabicMinuteStr !== undefined) {
                minutes = parseInt(arabicMinuteStr, 10);
            } else if (chineseMinuteStr !== undefined) {
                minutes = chineseToInteger(chineseMinuteStr);
            } else {
                minutes = 0; // Default to 0 minutes if no minute part or "半" (e.g., "七点")
            }
        } else if (digitalHourStr !== undefined && digitalMinuteStr !== undefined) { // "HH:MM" format
            hours = parseInt(digitalHourStr, 10);
            minutes = parseInt(digitalMinuteStr, 10);
        }

        if (hours === undefined || Number.isNaN(hours) || minutes === undefined || Number.isNaN(minutes)) {
            console.warn(`无法解析时间中的数字或时间格式不完整: ${timeMatch[0]}`);
            return null;
        }

        // Adjust hours based on period (上午, 下午, etc.)
        if (period === '下午' || period === '晚上') {
            if (hours < 12) hours += 12;
            if (period === '晚上' && hours === 12) hours = 0; // 晚上12点 is 00:00 (midnight)
            // Note: 下午12点 is 12:00 (noon), no change needed by this block
        } else if (period === '中午') {
            // e.g., 中午1点 (parsed as 1) -> 13. 中午12点 (parsed as 12) -> 12.
            if (hours >= 1 && hours <= 4) { // Typically 中午1点 to 中午4点 implies PM
                if (hours < 12) hours += 12; // Ensure it doesn't affect 12 itself
            } else if (hours < 11 && hours !== 0) { // For other early hours if context implies it, e.g. 中午1点
                hours += 12;
            }
            // 中午12点 is 12:00. No change needed if hours is 12.
        } else if (period === '上午') {
            if (hours === 12) hours = 0; // 上午12点 (12 AM) is 00:00
        }


        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            targetDate = targetDate.hour(hours).minute(minutes).second(0).millisecond(0);
        } else {
            console.warn(`无效的时间值 (超出范围): ${hours}:${minutes} from match ${timeMatch[0]}`);
            return null;
        }

    } else { // No timeMatch found
        targetDate = targetDate.hour(8).minute(0).second(0).millisecond(0); // Default to 8 AM
    }
    return targetDate;
}

export function parseScheduleTime(content: string): string | null {
    if (content === '') {
        return null;
    }
    const datePattern = new RegExp(
        "(今天|本日|明天|明日|后天|大后天|昨天|昨日|前天|" +
        "下周(?!(?:周|星期)?[一二三四五六日天])|" +
        "下星期(?!(?:周|星期)?[一二三四五六日天])|" +
        "下个星期(?!(?:周|星期)?[一二三四五六日天])|" +
        "上周(?!(?:周|星期)?[一二三四五六日天])|" +
        "上星期(?!(?:周|星期)?[一二三四五六日天])|" +
        "上个星期(?!(?:周|星期)?[一二三四五六日天])|" +
        "下月|下个月|上月|上个月)" +
        "|(?:(\\d{1,2})月(\\d{1,2})[号日])" +
        "|(?:(\\d{1,2})\\.(\\d{1,2})(?:[号日])?)" +
        "|(?:(\\d{1,2})[号日])" +
        "|((?:本周|下周|上周))(?:周|星期)?([一二三四五六日天])" +
        "|((?:周|星期))([一二三四五六日天])" +
        // NEW: YYYYMMDD strictly bounded with valid MM and DD, must be followed by colon
        "|\\b(\\d{4})((?:0[1-9]|1[0-2]))((?:0[1-9]|[12]\\d|3[01]))\\b(?=\\s*[:|：])" +
        // NEW: M-D or M/D with valid ranges, allow leading zero, must be followed by colon
    "|\\b((?:0?[1-9]|1[0-2]))[/\\-]((?:0?[1-9]|[12]\\d|3[01]))\\b(?=\\s*[:|：])(?!\\s*(?:点|时|小时|分|am|pm|AM|PM))" +
        // NEW: MMDD compact with valid ranges (e.g., 0809), must be followed by colon
        "|\\b((?:0[1-9]|1[0-2]))((?:0[1-9]|[12]\\d|3[01]))\\b(?=\\s*[:|：])"
    );

    // Updated timePattern to support Chinese numerals and "半"
    // G1: period (上午,下午,中午,晚上)
    // G2: arabicHour (\d{1,2}) from "点" format
    // G3: chineseHour ([一二三四五六七八九十]+) from "点" format
    // G4: arabicMinute (\d{1,2}) from "分" format
    // G5: chineseMinute ([一二三四五六七八九十零]+) from "分" format
    // G6: halfHourMarker (半)
    // G7: digitalHour (\d{1,2}) from HH:MM format
    // G8: digitalMinute (\d{1,2}) from HH:MM format
    const timePattern = /(上午|下午|中午|晚上)?\s*(?:(\d{1,2})|([一二三四五六七八九十]+))\s*点(?:\s*(?:(?:(\d{1,2})|([一二三四五六七八九十零]+))\s*分?|(半)))?|(?<![:\d])(\d{1,2})\s*[:|：]\s*(\d{1,2})(?![:|：|\d])/g;

    const dateMatch = content.match(datePattern);

    const timeMatchesIterator = content.matchAll(timePattern);
    let lastTimeMatch: RegExpMatchArray | null = null;
    for (const match of timeMatchesIterator) {
        lastTimeMatch = match;
    }
    // 如果既没有日期匹配也没有时间匹配，返回 null
    if (!dateMatch && !lastTimeMatch) {
        return null;
    }
    let targetDate = dayjs();

    if (dateMatch) {
        targetDate = parseDateFromString(dateMatch, targetDate);
    }

    const finalDateWithTime = parseTimeFromString(lastTimeMatch, targetDate);

    if (!finalDateWithTime) {
        return null;
    }
    showMessage(`识别到日程时间: ${finalDateWithTime.format('YYYY-MM-DDTHH:mm')}`);
    return finalDateWithTime.format('YYYY-MM-DDTHH:mm');
}



export async function parseScheduleTimeWithAi(content: string): Promise<string | null> {
    if (content === '') {
        return null;
    }

    const apiKey = window.siyuan.config.ai.openAI.apiKey;

    if (!apiKey) {
        console.error("DeepSeek API key is not set. Please set the DEEPSEEK_API_KEY environment variable.");
        // 回退到原始解析器
        console.warn("Falling back to original parser due to missing DeepSeek API key.");
        return parseScheduleTime(content);
    }

    const today = dayjs().format('YYYY-MM-DD');
    const prompt = `
You are an AI assistant specialized in extracting date and time information from Chinese text.
The current date is ${today}.
From the user's text, extract the specific date and time.
Interpret relative terms like "明天", "下周三", "后天下午3点".
If only a date is found, use 00:00 for the time.
If only a time is found, assume the date is the current date unless specified otherwise (e.g., "明天下午").
If a period like "下午" or "晚上" is mentioned without a specific hour, use a common representation (e.g., 下午 -> 14:00, 晚上 -> 20:00).
Your response MUST be a single line containing EITHER:
1. The extracted date and time in "YYYY-MM-DDTHH:mm" format.
2. The exact string "null" if no reliable date and time can be extracted.
Do not add any other explanations or text.

User text: "${content}"

Your response:
    `;

    try {
        const response = await fetch(`${window.siyuan.config.ai.openAI.apiBaseURL}`, { // DeepSeek API endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: `${window.siyuan.config.ai.openAI.apiModel}`, // 替换为实际的 DeepSeek 模型名称
                messages: [
                    { role: "system", content: "You are an expert at parsing dates and times from Chinese text and formatting them according to instructions." },
                    { role: "user", content: prompt }
                ],
                temperature: `${window.siyuan.config.ai.openAI.apiTemperature}`,
                max_tokens: `${window.siyuan.config.ai.openAI.apiMaxTokens}`,

            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`DeepSeek API error: ${response.status} ${response.statusText}`, errorBody);
            console.warn(`DeepSeek API error. Falling back to original parser for content: "${content}".`);
            return parseScheduleTime(content);
        }

        const completion = await response.json();
        const aiResponse = completion.choices[0]?.message?.content?.trim();

        if (aiResponse && aiResponse.toLowerCase() !== "null") {
            const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
            if (dateTimeRegex.test(aiResponse)) {
                return aiResponse;
            } else {
                console.warn(`DeepSeek AI returned a malformed date-time: "${aiResponse}" for content: "${content}". Falling back to original parser.`);
                return parseScheduleTime(content);
            }
        } else {
            console.debug(`DeepSeek AI could not parse date/time from content: "${content}". Falling back to original parser.`);
            return parseScheduleTime(content);
        }

    } catch (error) {
        console.error("Error calling DeepSeek API:", error);
        console.warn(`DeepSeek API call failed. Falling back to original parser for content: "${content}".`);
        return parseScheduleTime(content);
    }
}



