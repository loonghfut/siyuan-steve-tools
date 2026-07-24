export interface DidaHttpClientOptions {
    baseUrl?: string;
}

export class DidaHttpClient {
    private readonly baseUrl: string;

    constructor(
        private readonly token: string,
        options: DidaHttpClientOptions = {},
    ) {
        this.baseUrl = options.baseUrl || "https://api.dida365.com/open/v1";
    }

    async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const headers = new Headers(options.headers);
        headers.set("Authorization", `Bearer ${this.token}`);
        headers.set("Content-Type", "application/json");

        const response = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });
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
    }
}
