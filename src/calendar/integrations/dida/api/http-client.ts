export interface DidaHttpClientOptions {
    baseUrl?: string;
    /** 单次请求超时（毫秒）。默认 60 秒，避免远端挂起时把同步流程无限期堵住。 */
    timeoutMs?: number;
}

/** 请求选项：在标准 RequestInit 之上允许单独指定超时。 */
export interface DidaHttpRequestOptions extends RequestInit {
    /** 本次请求的超时（毫秒），覆盖客户端默认值。 */
    timeoutMs?: number;
}

/** 默认请求超时：滴答接口偶发卡住时必须有上限，否则同步会一直挂着。 */
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;

export class DidaHttpClient {
    private readonly baseUrl: string;
    private readonly timeoutMs: number;
    private readonly token: string;

    constructor(token: string, options: DidaHttpClientOptions = {}) {
        this.token = token;
        this.baseUrl = options.baseUrl || "https://api.dida365.com/open/v1";
        this.timeoutMs = options.timeoutMs && options.timeoutMs > 0
            ? options.timeoutMs
            : DEFAULT_REQUEST_TIMEOUT_MS;
    }

    async request<T>(endpoint: string, options: DidaHttpRequestOptions = {}): Promise<T> {
        const { timeoutMs, signal, ...init } = options;
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${this.token}`);
        headers.set("Content-Type", "application/json");

        // 用 AbortController 给每次请求加上硬上限：远端无响应时不能让调用方无限期等待
        const limit = timeoutMs && timeoutMs > 0 ? timeoutMs : this.timeoutMs;
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, limit);
        const onExternalAbort = () => controller.abort();
        if (signal) {
            if (signal.aborted) controller.abort();
            else signal.addEventListener("abort", onExternalAbort, { once: true });
        }

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...init,
                headers,
                signal: controller.signal,
            });
            if (!response.ok) {
                let message = response.statusText;
                try {
                    const errorData = await response.json();
                    message = errorData?.message || message;
                } catch {
                    // Some OpenAPI errors have an empty or non-JSON body.
                }
                throw new Error(`API request failed with status ${response.status}: ${message}`);
            }

            const responseText = await response.text();
            return responseText ? JSON.parse(responseText) as T : null as T;
        } catch (error) {
            // 超时与外部取消都表现为 abort：统一抛成可读的错误，调用方按失败处理
            if (controller.signal.aborted) {
                throw new Error(timedOut
                    ? `API request timed out after ${limit}ms: ${endpoint}`
                    : `API request aborted: ${endpoint}`);
            }
            throw error;
        } finally {
            clearTimeout(timer);
            if (signal) signal.removeEventListener("abort", onExternalAbort);
        }
    }
}
