import type { DidaFocusCreateInput, DidaFocusRecord, DidaFocusType } from "../features/focus/models";
import { DidaHttpClient } from "./http-client";

export class DidaFocusApi {
    constructor(private readonly http: DidaHttpClient) {}

    getFocus(focusId: string, type: DidaFocusType): Promise<DidaFocusRecord> {
        return this.http.request(`/focus/${focusId}?type=${type}`);
    }

    getFocuses(from: string, to: string, type: DidaFocusType): Promise<DidaFocusRecord[]> {
        const query = new URLSearchParams({ from, to, type: String(type) });
        return this.http.request(`/focus?${query.toString()}`);
    }

    createFocus(input: DidaFocusCreateInput): Promise<DidaFocusRecord> {
        return this.http.request("/focus", { method: "POST", body: JSON.stringify(input) });
    }

    async deleteFocus(focusId: string, type: DidaFocusType): Promise<void> {
        await this.http.request(`/focus/${focusId}?type=${type}`, { method: "DELETE" });
    }
}
