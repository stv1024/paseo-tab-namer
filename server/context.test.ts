import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetCount, buildContext, clip, type Conversation } from "./context";
import { SettingsSchema } from "../shared/settings";
const settings = SettingsSchema.parse({});
test("small conversation stays intact, and instructions count toward the budget", () => {
  const c = buildContext(settings, { project: "Example", name: "旧名" }, [
    {
      id: "a",
      title: "修复登录",
      incomplete: false,
      messages: [{ role: "user", text: "修复登录后跳转循环", seq: 1 }],
    },
  ]);
  assert.match(c.content, /修复登录后跳转循环/);
  assert.equal(c.stats.truncated, false);
  assert.equal(c.stats.budgetTokens, budgetCount(c.system + c.content) + 256);
});
test("large Unicode input is bounded and retains the original goal and latest correction", () => {
  const text =
    "最初目标：登录修复。" +
    "历史内容😀修复过程。".repeat(20000) +
    "最终目标：登录重定向循环。";
  const c = buildContext(
    { ...settings, maxInputTokens: 4096 },
    { project: "Example", name: "旧名" },
    [
      {
        id: "a",
        title: "任务",
        incomplete: false,
        messages: [{ role: "user", text, seq: 1 }],
      },
    ],
  );
  assert(c.stats.budgetTokens <= 4096);
  assert(c.stats.truncated);
  assert.match(c.content, /最初目标/);
  assert.match(c.content, /最终目标/);
});
test("multiple conversations share the budget and short sessions return unused space", () => {
  const conversations: Conversation[] = [
    {
      id: "a",
      title: "短会话",
      incomplete: false,
      messages: [{ role: "user", text: "短会话目标", seq: 1 }],
    },
    {
      id: "b",
      title: "长会话",
      incomplete: true,
      messages: [
        { role: "user", text: "较长目标".repeat(30000) + "最终方向", seq: 1 },
      ],
    },
  ];
  const c = buildContext(
    { ...settings, maxInputTokens: 4096 },
    { project: "Example", name: "旧名" },
    conversations,
  );
  assert(c.stats.budgetTokens <= 4096);
  assert(c.stats.budgetTokens > 3500);
  assert.match(c.content, /短会话目标/);
  assert.match(c.content, /最终方向/);
  assert.equal(c.stats.sessions, 2);
});
test("oversized instructions fail before any model request", () => {
  assert.throws(
    () =>
      buildContext(
        {
          ...settings,
          prompt: "很长的提示词".repeat(1000),
          maxInputTokens: 2048,
        },
        { project: "x", name: "x" },
        [],
      ),
    /预算/,
  );
});
test("UTF8 clipping does not create broken surrogate pairs", () => {
  for (let n = 0; n < 25; n++)
    for (const tail of [true, false]) {
      const s = clip("开头😀中文🦊末尾", n, tail);
      assert(budgetCount(s) <= n);
      assert(!/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/.test(s));
    }
});
