import assert from "node:assert/strict";
import { test } from "node:test";
import { agentsFor, prepare, readConversation } from "./source";
import { SettingsSchema } from "../shared/settings";
import type { Agent, PaseoApi } from "./types";
const settings = SettingsSchema.parse({});
const agent = { id: "a", workspaceId: "w", title: "Task" } as Agent;
test("timeline selection excludes tools and reasoning and includes user/assistant only", async () => {
  const api = {
    agents: {
      ref: () => ({
        timeline: {
          refetch: async () => ({
            error: null,
            hasOlder: false,
            entries: [
              { seqStart: 1, item: { type: "user_message", text: "user" } },
              {
                seqStart: 2,
                item: { type: "reasoning", text: "private reasoning" },
              },
              {
                seqStart: 3,
                item: { type: "tool_call", text: "large output" },
              },
              {
                seqStart: 4,
                item: { type: "assistant_message", text: "assistant" },
              },
            ],
          }),
        },
      }),
    },
  } as unknown as PaseoApi;
  assert.deepEqual(
    (await readConversation(api, agent, settings)).messages.map((m) => m.text),
    ["user", "assistant"],
  );
  assert.deepEqual(
    (
      await readConversation(api, agent, {
        ...settings,
        includeAssistant: false,
      })
    ).messages.map((m) => m.text),
    ["user"],
  );
});
test("selected agent must belong to the target workspace", async () => {
  const api = {
    workspaces: {
      ref: () => ({
        refresh: async () => ({
          id: "w",
          title: "x",
          projectDisplayName: "test",
        }),
      }),
    },
    agents: {
      list: async () => ({
        entries: [{ agent: { id: "other", workspaceId: "different" } }],
        pageInfo: {},
      }),
    },
  } as unknown as PaseoApi;
  await assert.rejects(
    prepare(
      api,
      { workspaceId: "w", scope: "selected", agentId: "other" },
      settings,
    ),
    /没有可读取/,
  );
});
test("Tab Namer's own helper agents are never treated as Tabs", async () => {
  const paseo = {
    agents: {
      list: async () => ({
        entries: [
          {
            agent: {
              id: "n",
              workspaceId: "w",
              labels: { "tab-namer": "generator" },
            },
          },
          { agent: { id: "a", workspaceId: "w", labels: {} } },
        ],
        pageInfo: {},
      }),
    },
  } as unknown as PaseoApi;
  assert.deepEqual(
    (await agentsFor(paseo, "w")).map((a) => a.id),
    ["a"],
  );
});
