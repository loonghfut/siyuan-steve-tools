import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAiEndpoint, buildAiRequestBody, extractAiText } from "./ai-provider.ts";

describe("buildAiEndpoint", () => {
    it("openai 协议追加 /chat/completions", () => {
        assert.equal(buildAiEndpoint("https://api.openai.com/v1", "openai"),
            "https://api.openai.com/v1/chat/completions");
    });

    it("openai-responses 协议追加 /responses", () => {
        assert.equal(buildAiEndpoint("https://api.openai.com/v1", "openai-responses"),
            "https://api.openai.com/v1/responses");
    });

    it("缺省协议按 openai 处理", () => {
        assert.equal(buildAiEndpoint("https://api.deepseek.com"), "https://api.deepseek.com/chat/completions");
    });

    it("去掉基址末尾的斜杠，避免出现双斜杠", () => {
        assert.equal(buildAiEndpoint("https://api.deepseek.com/", "openai"),
            "https://api.deepseek.com/chat/completions");
        assert.equal(buildAiEndpoint("https://api.deepseek.com///", "openai"),
            "https://api.deepseek.com/chat/completions");
    });

    it("不支持的协议返回 null", () => {
        assert.equal(buildAiEndpoint("https://api.anthropic.com", "anthropic-messages"), null);
        assert.equal(buildAiEndpoint("https://api.anthropic.com", "gemini-interactions"), null);
    });

    it("空基址返回 null", () => {
        assert.equal(buildAiEndpoint("", "openai"), null);
    });
});

describe("buildAiRequestBody", () => {
    it("openai 协议用 messages / max_tokens", () => {
        const body = buildAiRequestBody("openai", "gpt-test", "sys", "user", 0.5, 256);
        assert.deepEqual(body.messages, [
            {role: "system", content: "sys"},
            {role: "user", content: "user"},
        ]);
        assert.equal(body.max_tokens, 256);
        assert.equal(body.temperature, 0.5);
        assert.equal(body.model, "gpt-test");
        assert.equal(body.instructions, undefined);
    });

    it("openai-responses 协议用 instructions / input / max_output_tokens", () => {
        const body = buildAiRequestBody("openai-responses", "gpt-test", "sys", "user", 0.5, 256);
        assert.equal(body.instructions, "sys");
        assert.deepEqual(body.input, [{type: "message", role: "user", content: "user"}]);
        assert.equal(body.max_output_tokens, 256);
        assert.equal(body.messages, undefined);
    });

    it("未定义的 temperature / maxTokens 不会写进请求体", () => {
        const body = buildAiRequestBody("openai", "gpt-test", "sys", "user");
        assert.equal("temperature" in body, false);
        assert.equal("max_tokens" in body, false);
    });
});

describe("extractAiText", () => {
    it("openai 协议读 choices[0].message.content", () => {
        const text = extractAiText({choices: [{message: {content: " 2026-01-02T03:04 "}}]}, "openai");
        assert.equal(text, "2026-01-02T03:04");
    });

    it("openai-responses 协议读 output[].content[].text", () => {
        const text = extractAiText({
            output: [
                {type: "message", content: [{type: "output_text", text: "2026-01-02T03:04"}]},
            ],
        }, "openai-responses");
        assert.equal(text, "2026-01-02T03:04");
    });

    it("openai-responses 协议拼接多段文本", () => {
        const text = extractAiText({
            output: [
                {content: [{type: "output_text", text: "a"}]},
                {content: [{type: "output_text", text: "b"}]},
            ],
        }, "openai-responses");
        assert.equal(text, "ab");
    });

    it("结构缺失时返回空串而不是抛错", () => {
        assert.equal(extractAiText({}, "openai"), "");
        assert.equal(extractAiText({}, "openai-responses"), "");
        assert.equal(extractAiText(null, "openai"), "");
    });
});
