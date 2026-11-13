import assert from "node:assert/strict";
import test from "node:test";
import { DidaHttpClient } from "./http-client.ts";

const originalFetch = globalThis.fetch;

function restoreFetch(): void {
    globalThis.fetch = originalFetch;
}

test("DidaHttpClient sends the bearer token and parses JSON", async () => {
    let seenUrl = "";
    let seenAuth = "";
    globalThis.fetch = (async (url: any, init: any) => {
        seenUrl = String(url);
        seenAuth = new Headers(init?.headers).get("Authorization") || "";
        return {
            ok: true,
            status: 200,
            statusText: "OK",
            text: async () => JSON.stringify([{ id: "t1" }]),
        };
    }) as any;
    try {
        const client = new DidaHttpClient("token-123");
        const result = await client.request<Array<{ id: string }>>("/task/completed", {
            method: "POST",
            body: "{}",
        });
        assert.equal(seenUrl, "https://api.dida365.com/open/v1/task/completed");
        assert.equal(seenAuth, "Bearer token-123");
        assert.deepEqual(result, [{ id: "t1" }]);
    } finally {
        restoreFetch();
    }
});

test("DidaHttpClient aborts a hanging request once the timeout elapses", async () => {
    globalThis.fetch = ((_url: any, init: any) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
        });
    })) as any;
    try {
        const client = new DidaHttpClient("token-123", { timeoutMs: 30 });
        await assert.rejects(
            () => client.request("/task/completed", { method: "POST", body: "{}" }),
            /timed out after 30ms/,
        );
    } finally {
        restoreFetch();
    }
});

test("DidaHttpClient reports an external abort separately from a timeout", async () => {
    globalThis.fetch = ((_url: any, init: any) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
        });
    })) as any;
    try {
        const client = new DidaHttpClient("token-123", { timeoutMs: 5000 });
        const controller = new AbortController();
        const pending = client.request("/task/completed", {
            method: "POST",
            body: "{}",
            signal: controller.signal,
        });
        controller.abort();
        await assert.rejects(() => pending, /aborted/);
    } finally {
        restoreFetch();
    }
});

test("DidaHttpClient surfaces API errors with the status code", async () => {
    globalThis.fetch = (async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ message: "token expired" }),
    })) as any;
    try {
        const client = new DidaHttpClient("token-123");
        await assert.rejects(
            () => client.request("/task"),
            /status 401: token expired/,
        );
    } finally {
        restoreFetch();
    }
});
