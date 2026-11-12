import dayjs from 'dayjs';
import { showMessage } from 'siyuan';
import { buildAiEndpoint, buildAiRequestBody, extractAiText, resolveAiProviderConfig } from '@/api/ai-provider';
import {
    parseScheduleTimeRange as parseScheduleTimeRangeCore,
    type ParsedScheduleTimeRange,
} from './schedule-time-parser';

export type { ParsedScheduleTimeRange } from './schedule-time-parser';

/**
 * 解析块文本中的日程时间区间（如 `明天 14:00-16:00`），命中时弹出提示。
 */
export function parseScheduleTimeRange(content: string): ParsedScheduleTimeRange | null {
    const parsed = parseScheduleTimeRangeCore(content);
    if (!parsed) {
        return null;
    }
    const label = parsed.end ? `${parsed.start} ~ ${parsed.end}` : parsed.start;
    showMessage(`识别到日程时间: ${label}`);
    return parsed;
}

export function parseScheduleTime(content: string): string | null {
    return parseScheduleTimeRange(content)?.start ?? null;
}



export async function parseScheduleTimeWithAi(content: string): Promise<string | null> {
    if (content === '') {
        return null;
    }

    // 思源 3.7 起 AI 设置改为 config.ai.providers[]，旧的 config.ai.openAI 已移除。
    const provider = resolveAiProviderConfig();
    const apiKey = provider?.apiKey;

    if (!provider || !apiKey) {
        console.error("思源 AI 提供商未配置 API Key，无法使用 AI 识别日程时间。");
        // 回退到原始解析器
        console.warn("Falling back to original parser due to missing AI provider API key.");
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
        // 思源的 baseURL 是**基址**，请求端点要按协议追加（/chat/completions 或 /responses）。
        // 只支持 OpenAI 兼容的两种协议；其它协议（anthropic-messages 等）请求体结构不同。
        const endpoint = buildAiEndpoint(provider.baseURL, provider.protocol);
        if (!endpoint) {
            console.warn(`AI 提供商协议 ${provider.protocol} 不支持日程时间识别，回退到原始解析器。`);
            return parseScheduleTime(content);
        }
        const systemPrompt = "You are an expert at parsing dates and times from Chinese text and formatting them according to instructions.";
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                ...(provider.headers || {}),
            },
            body: JSON.stringify(buildAiRequestBody(
                provider.protocol,
                provider.model,
                systemPrompt,
                prompt,
                provider.temperature,
                provider.maxTokens,
            )),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`AI API error: ${response.status} ${response.statusText}`, errorBody);
            console.warn(`AI API error. Falling back to original parser for content: "${content}".`);
            return parseScheduleTime(content);
        }

        const completion = await response.json();
        // 两种协议的响应结构不同：openai 是 choices[0].message.content，
        // openai-responses 是 output[].content[].text。
        const aiResponse = extractAiText(completion, provider.protocol);

        if (aiResponse && aiResponse.toLowerCase() !== "null") {
            const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
            if (dateTimeRegex.test(aiResponse)) {
                return aiResponse;
            } else {
                console.warn(`AI returned a malformed date-time: "${aiResponse}" for content: "${content}". Falling back to original parser.`);
                return parseScheduleTime(content);
            }
        } else {
            console.debug(`AI could not parse date/time from content: "${content}". Falling back to original parser.`);
            return parseScheduleTime(content);
        }

    } catch (error) {
        console.error("Error calling AI API:", error);
        console.warn(`AI API call failed. Falling back to original parser for content: "${content}".`);
        return parseScheduleTime(content);
    }
}



