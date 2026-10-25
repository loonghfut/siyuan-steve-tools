/**
 * 解析思源的 AI 提供商配置，并按协议构造请求。
 *
 * 思源 3.7 起重构了「设置 → AI」：单个 `config.ai.openAI`（apiKey / apiBaseURL / apiModel /
 * apiTemperature / apiMaxTokens）已经不存在，改为
 * `config.ai.providers: IProvider[]` + `config.ai.editing: IEditing`
 * （见 app/src/types/config.d.ts 的 IAI / IProvider / IEditing）。
 *
 * 另外注意：思源的 `baseURL` 是**基址**（默认 `https://api.openai.com/v1`，
 * 见 kernel/conf/ai.go），内核在其后追加 `/chat/completions`（openai 协议）
 * 或 `/responses`（openai-responses 协议），见 kernel/util/openai_headers_test.go。
 * 直接把 baseURL 当端点用会 404。
 */

export interface AiProviderConfig {
    apiKey: string;
    /** 基址，不是请求端点；用 buildAiEndpoint 换算。 */
    baseURL: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    headers?: Record<string, string>;
    /** openai / openai-responses / anthropic-messages / gemini-interactions */
    protocol?: string;
    providerId?: string;
}

/** 读取思源的 AI 配置；宿主未初始化时返回空对象。 */
function getAiConfig(): any {
    const siyuan = (window as any)?.siyuan;
    return siyuan?.config?.ai || null;
}

/**
 * 解析出可直接发起对话请求的提供商配置。
 * 没有可用配置（未设置 API Key、无启用提供商等）时返回 null。
 */
export function resolveAiProviderConfig(): AiProviderConfig | null {
    const ai = getAiConfig();
    if (!ai) return null;

    const providers: any[] = Array.isArray(ai.providers) ? ai.providers : [];
    const editing = ai.editing || {};
    const modelId: string = editing.modelId || "";

    const enabled = providers.filter((provider) => provider && provider.enabled !== false);
    const toConfig = (provider: any, model: any): AiProviderConfig => ({
        apiKey: provider.apiKey,
        baseURL: provider.baseURL,
        model: model.id || model.name,
        temperature: typeof editing.temperature === "number" ? editing.temperature : undefined,
        maxTokens: typeof editing.maxCompletionTokens === "number" ? editing.maxCompletionTokens : undefined,
        headers: provider.headers,
        protocol: provider.protocol,
        providerId: provider.id,
    });

    // 1) 优先按 editing.modelId 在**所有**启用提供商的模型里定位。
    //    与思源 app/src/ai/editor.ts 的 getEditingModelName 保持一致：命中即返回，
    //    不因为 apiKey 为空就跳过——否则会静默退到别的提供商的别的模型，
    //    用错模型还会计费到别的账号。能否发请求交给调用方判断。
    if (modelId) {
        for (const provider of enabled) {
            const model = (provider.models || []).find(
                (item: any) => item && item.enabled && (item.id === modelId || item.name === modelId)
            );
            if (model) {
                return toConfig(provider, model);
            }
        }
    }

    // 2) editing.modelId 没匹配上时，退到第一个可用配置的启用模型。
    for (const provider of enabled) {
        const model = (provider.models || []).find((item: any) => item && item.enabled);
        if (model && provider.apiKey && provider.baseURL) {
            console.warn(`未找到用户选中的模型 ${modelId}，已改用 ${provider.id}/${model.id}`);
            return toConfig(provider, model);
        }
    }

    return null;
}

/** 去掉基址末尾的斜杠。 */
function trimBase(baseURL: string): string {
    return (baseURL || "").trim().replace(/\/+$/, "");
}

/**
 * 按协议换算请求端点。返回 null 表示该协议不受支持（调用方应回退本地解析）。
 */
export function buildAiEndpoint(baseURL: string, protocol?: string): string | null {
    const base = trimBase(baseURL);
    if (!base) return null;
    switch ((protocol || "openai").toLowerCase()) {
        case "openai":
            return `${base}/chat/completions`;
        case "openai-responses":
            return `${base}/responses`;
        default:
            return null;
    }
}

/**
 * 按协议构造请求体。
 * - openai：chat-completions 格式（messages / max_tokens）
 * - openai-responses：responses 格式（instructions / input / max_output_tokens）
 */
export function buildAiRequestBody(
    protocol: string | undefined,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    temperature?: number,
    maxTokens?: number,
): Record<string, unknown> {
    const p = (protocol || "openai").toLowerCase();
    if (p === "openai-responses") {
        const body: Record<string, unknown> = {
            model,
            instructions: systemPrompt,
            input: [{type: "message", role: "user", content: userPrompt}],
        };
        if (typeof temperature === "number") {
            body.temperature = temperature;
        }
        if (typeof maxTokens === "number") {
            body.max_output_tokens = maxTokens;
        }
        return body;
    }

    const body: Record<string, unknown> = {
        model,
        messages: [
            {role: "system", content: systemPrompt},
            {role: "user", content: userPrompt},
        ],
    };
    if (typeof temperature === "number") {
        body.temperature = temperature;
    }
    if (typeof maxTokens === "number") {
        body.max_tokens = maxTokens;
    }
    return body;
}

/**
 * 从响应里取出模型输出的文本。
 * - openai：`choices[0].message.content`
 * - openai-responses：`output[].content[].text`
 */
export function extractAiText(payload: any, protocol?: string): string {
    const p = (protocol || "openai").toLowerCase();
    if (p === "openai-responses") {
        const output = payload?.output;
        if (!Array.isArray(output)) return "";
        const parts: string[] = [];
        for (const item of output) {
            const content = item?.content;
            if (!Array.isArray(content)) continue;
            for (const part of content) {
                const text = typeof part?.text === "string" ? part.text : "";
                if (text) {
                    parts.push(text);
                }
            }
        }
        return parts.join("").trim();
    }
    return String(payload?.choices?.[0]?.message?.content ?? "").trim();
}
