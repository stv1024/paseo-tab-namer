import assert from "node:assert/strict";
import { test } from "node:test";
import { generate, parseTitle } from "./model";
import { SettingsSchema } from "../shared/settings";
test("title parsing accepts plain and JSON names, rejects bad output", () => {
  assert.equal(parseTitle("“修复登录跳转”", 30), "修复登录跳转");
  assert.equal(parseTitle('{"title":"修复登录"}', 30), "修复登录");
  for (const text of ["", "a\nb", "x".repeat(31), "```标题```", "{bad json}"])
    assert.throws(() => parseTitle(text, 30));
});
test("HTTP failures redact response contents and never leak API secrets", async () => {
  const original = globalThis.fetch;
  process.env.AI_RENAME_TEST_KEY = "secret-not-for-output";
  try {
    globalThis.fetch = async () =>
      new Response("secret-not-for-output", { status: 401 });
    await assert.rejects(
      generate(
        SettingsSchema.parse({
          connection: "custom",
          baseUrl: "https://example.test/v1",
          apiKeyEnv: "AI_RENAME_TEST_KEY",
        }),
        { system: "name", content: "test" },
      ),
      (e: Error) =>
        e.message.includes("401") &&
        !e.message.includes("secret-not-for-output"),
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "合适的名称" }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 4 },
        }),
      );
    const r = await generate(
      SettingsSchema.parse({
        connection: "custom",
        baseUrl: "https://example.test/v1",
        apiKeyEnv: "AI_RENAME_TEST_KEY",
      }),
      { system: "name", content: "test" },
    );
    assert.equal(r.title, "合适的名称");
    assert.equal(r.inputTokens, 10);
  } finally {
    globalThis.fetch = original;
    delete process.env.AI_RENAME_TEST_KEY;
  }
});
