export interface NetworkRequestOptions {
    method: string;
    path: string;
    body?: string;
    headers?: Record<string, string>;
    timeout?: number;
    contentType?: string;
}

export interface NetworkClientOptions {
    serverUrl: string;
    proxyApiUrl?: string;
    defaultHeaders?: Record<string, string>;
    useProxy?: boolean;
}

export class NetworkClient {
    private serverUrl: string;
    private proxyApiUrl: string;
    private defaultHeaders: Record<string, string>;
    private useProxy: boolean;

    constructor(options: NetworkClientOptions) {
        const {
            serverUrl,
            proxyApiUrl = "/api/network/forwardProxy",
            defaultHeaders = {},
            useProxy = true,
        } = options;

        this.serverUrl = serverUrl;
        this.proxyApiUrl = proxyApiUrl;
        this.defaultHeaders = defaultHeaders;
        this.useProxy = useProxy;
    }

    private getStatusText(status: number, fallback?: string) {
        // 可根据需要完善
        const statusTexts: Record<number, string> = {
            200: "OK",
            201: "Created",
            207: "Multi-Status",
            400: "Bad Request",
            401: "Unauthorized",
            403: "Forbidden",
            404: "Not Found",
            500: "Internal Server Error",
            503: "Service Unavailable",
        };
        return statusTexts[status] || fallback || "";
    }

    async request(options: NetworkRequestOptions): Promise<Response> {
        const { method, path, body, headers = {}, timeout = 15000, contentType } = options;

        // 构建完整 URL
        let url = path.startsWith("http") ? path : `${this.serverUrl}${path}`;

        // 合并 headers
        const requestHeaders = { ...this.defaultHeaders, ...headers };
        if (contentType) requestHeaders["Content-Type"] = contentType;

        if (!this.useProxy) {
            // 不使用代理，直接请求
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);

            try {
                const response = await fetch(url, {
                    method,
                    headers: requestHeaders,
                    body,
                    signal: controller.signal,
                });
                clearTimeout(timer);
                return response;
            } catch (err) {
                clearTimeout(timer);
                throw err;
            }
        }

        // 转换为代理格式
        const proxyHeaders: Array<{ [key: string]: string }> = [];
        for (const key in requestHeaders) {
            if (Object.prototype.hasOwnProperty.call(requestHeaders, key)) {
                proxyHeaders.push({ [key]: requestHeaders[key] });
            }
        }

        const proxyPayload: any = {
            url,
            method,
            headers: proxyHeaders,
            timeout,
            contentType: requestHeaders["Content-Type"] || "application/json",
        };
        if (body !== undefined) proxyPayload.payload = body;

        // 发送到代理
        const proxyApiResponse = await fetch(this.proxyApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(proxyPayload),
        });

        if (!proxyApiResponse.ok) {
            const errorText = await proxyApiResponse.text();
            throw new Error(`代理请求失败: ${proxyApiResponse.status} ${proxyApiResponse.statusText} - ${errorText}`);
        }

        const proxyResult = await proxyApiResponse.json();

        if (proxyResult.code !== 0 && proxyResult.code !== undefined) {
            const errorStatus = proxyResult.data?.status || 503;
            const errorStatusText = proxyResult.msg || "Proxy forwarding error";
            const errorBody = proxyResult.data?.body || proxyResult.msg || `Proxy error: ${errorStatusText}`;
            return new Response(errorBody, {
                status: errorStatus,
                statusText: this.getStatusText(errorStatus, errorStatusText),
                headers: new Headers(proxyResult.data?.headers || {}),
            });
        }

        if (proxyResult.data && proxyResult.data.status !== undefined) {
            const actualStatus = proxyResult.data.status;
            const actualBody = proxyResult.data.body;
            const actualHeaders = new Headers(proxyResult.data.headers || {});
            return new Response(actualBody, {
                status: actualStatus,
                statusText: this.getStatusText(actualStatus, proxyResult.data.statusText),
                headers: actualHeaders,
            });
        } else {
            throw new Error(`未预期的代理响应结构。代理返回: ${JSON.stringify(proxyResult)}`);
        }
    }
}