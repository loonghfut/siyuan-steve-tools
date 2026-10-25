/**
 * 解析思源的 AI 提供商配置。
 *
 * 思源 3.7 起重构了「设置 → AI」：单个 `config.ai.openAI`（apiKey / apiBaseURL / apiModel /
 * apiTemperature / apiMaxTokens）已经不存在，改为
 * `config.ai.providers: IProvider[]` + `config.ai.editing: IEditing`
 * （见 app/src/types/config.d.ts 的 IAI / IProvider / IEditing）。
 *
 * 这里按思源自己的解析顺序取配置（app/src/ai/editor.ts 的 getEditingModelName）：
 * 先用 editing.modelId 在启用的提供商里找模型，找不到再退到第一个启用的提供商。
 */

export interface AiProviderConfig {
    /** 兼容 OpenAI 协议时使用；anthropic-messages 协议不支持。 */
    apiKey: string;
    baseURL: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    headers?: Record<string, string>;
    /** openai / openai-responses / anthropic-messages */
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

    const pickModel = (provider: any): any => {
        if (!provider || !Array.isArray(provider.models)) return null;
        if (modelId) {
            const matched = provider.models.find(
                (item: any) => item && item.enabled && (item.id === modelId || item.name === modelId)
            );
            if (matched) return matched;
        }
        return provider.models.find((item: any) => item && item.enabled) || null;
    };

    for (const provider of providers) {
        if (!provider || provider.enabled === false) continue;
        const model = pickModel(provider);
        if (!provider.apiKey || !provider.baseURL) continue;
        if (!model) continue;
        return {
            apiKey: provider.apiKey,
            baseURL: provider.baseURL,
            model: model.id || model.name,
            temperature: typeof editing.temperature === "number" ? editing.temperature : undefined,
            maxTokens: typeof editing.maxCompletionTokens === "number" ? editing.maxCompletionTokens : undefined,
            headers: provider.headers,
            protocol: provider.protocol,
            providerId: provider.id,
        };
    }

    return null;
}
