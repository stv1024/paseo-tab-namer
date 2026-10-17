import assert from "node:assert/strict";
import { test } from "node:test";
import { generate, listProviders, parseTitle } from "./model";
import { SettingsSchema } from "../shared/settings";
import type { PaseoApi } from "./types";
test("title parsing accepts plain and JSON names, rejects bad output", () => {
  assert.equal(parseTitle("“修复登录跳转”", 30), "修复登录跳转");
  assert.equal(parseTitle('{"title":"修复登录"}', 30), "修复登录");
  for (const text of ["", "a\nb", "x".repeat(31), "```标题```", "{bad json}"])
    assert.throws(() => parseTitle(text, 30));
});
function fakePaseo(run: object, thinkingOptions: object[] = []) {
  const calls: { create: any[]; prompts: string[]; archived: number } = {
    create: [],
    prompts: [],
    archived: 0,
  };
  const paseo = {
    providers: {
      waitForReady: async () => ({
        entries: [
          {
            provider: "claude",
            status: "ready",
            enabled: true,
            models: [
              {
                id: "haiku",
                label: "Haiku",
                defaultThinkingOptionId: "medium",
                thinkingOptions,
              },
            ],
          },
        ],
      }),
    },
    workspaces: {
      ref: () => ({
        agents: {
          create: async (options: any) => {
            calls.create.push(options);
            return {
              run: async (text: string) => {
                calls.prompts.push(text);
                return run;
              },
              archive: async () => {
                calls.archived++;
              },
            };
          },
        },
      }),
    },
  } as unknown as PaseoApi;
  return { paseo, calls };
}
const settings = SettingsSchema.parse({
  provider: "claude",
  model: "haiku",
  thinkingOptionId: "low",
});
test("generation runs a labelled Paseo agent and archives it", async () => {
  const { paseo, calls } = fakePaseo({
    status: "idle",
    lastMessage: "合适的名称",
    error: null,
    final: { lastUsage: { inputTokens: 10, outputTokens: 4 } },
  });
  const r = await generate(paseo, "w", settings, {
    system: "规则",
    content: "资料",
  });
  assert.deepEqual(r, {
    title: "合适的名称",
    inputTokens: 10,
    outputTokens: 4,
  });
  assert.equal(calls.create[0].config.provider, "claude/haiku");
  assert.equal(calls.create[0].config.thinkingOptionId, "low");
  assert.equal(calls.create[0].labels["tab-namer"], "generator");
  assert.equal(calls.create[0].prompt, undefined);
  assert.deepEqual(calls.prompts, ["规则\n\n资料"]);
  assert.equal(calls.archived, 1);
});
for (const [status, pattern] of [
  ["timeout", /超时/],
  ["permission", /工具/],
  ["error", /运行失败：boom/],
] as const)
  test(`generation reports ${status} and still archives the agent`, async () => {
    const { paseo, calls } = fakePaseo({
      status,
      lastMessage: null,
      error: "boom",
      final: null,
    });
    await assert.rejects(
      generate(paseo, "w", settings, { system: "s", content: "c" }),
      pattern,
    );
    assert.equal(calls.archived, 1);
  });
test("model default sends the model's default thinking option", async () => {
  const { paseo, calls } = fakePaseo(
    { status: "idle", lastMessage: "名称", final: null },
    [
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
    ],
  );
  await generate(
    paseo,
    "w",
    SettingsSchema.parse({ provider: "claude", model: "haiku" }),
    { system: "s", content: "c" },
  );
  assert.equal(calls.create[0].config.thinkingOptionId, "medium");
});
test("generation requires a selected model", async () => {
  const { paseo, calls } = fakePaseo({});
  await assert.rejects(
    generate(paseo, "w", SettingsSchema.parse({}), {
      system: "s",
      content: "c",
    }),
    /尚未选择模型/,
  );
  assert.equal(calls.create.length, 0);
});
test("provider list keeps enabled providers and selectable models", async () => {
  const paseo = {
    providers: {
      waitForReady: async () => ({
        entries: [
          {
            provider: "claude",
            label: "Claude",
            status: "ready",
            enabled: true,
            models: [
              { id: "haiku", label: "Haiku", isDefault: true },
              { id: "hidden", label: "Hidden", isSelectable: false },
            ],
          },
          { provider: "off", status: "ready", enabled: false, models: [] },
          {
            provider: "codex",
            status: "error",
            enabled: true,
            error: "未登录",
          },
        ],
      }),
    },
  } as unknown as PaseoApi;
  assert.deepEqual(await listProviders(paseo), [
    {
      id: "claude",
      label: "Claude",
      ready: true,
      error: null,
      models: [
        { id: "haiku", label: "Haiku", isDefault: true, thinkingOptions: [] },
      ],
    },
    { id: "codex", label: "codex", ready: false, error: "未登录", models: [] },
  ]);
});
