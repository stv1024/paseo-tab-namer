import assert from "node:assert/strict";
import { test } from "node:test";
import contribute from "../index.server";
import { SettingsSchema } from "../shared/settings";
import type { PluginServerContext } from "@getpaseo/plugin/server";

test("background preview completes without changing the name; stale save is rejected", async () => {
  const handlers = new Map<
    string,
    (input: any, context: any) => Promise<any>
  >();
  const writes: string[] = [];
  let currentTitle = "原名称";
  const server = {
    registerSettings: () => ({
      read: async () => ({
        status: "ready",
        revision: "one",
        values: SettingsSchema.parse({}),
      }),
    }),
    handle: (contract: { name: string }, handler: any) =>
      handlers.set(contract.name, handler),
    on: () => () => {},
  } as unknown as PluginServerContext;
  const dispose = contribute(server);
  const context = {
    paseo: {
      workspaces: {
        ref: () => ({
          refresh: async () => ({
            id: "w",
            name: "branch",
            title: currentTitle,
            projectDisplayName: "Project",
          }),
          setTitle: async (title: string) => {
            writes.push(title);
            currentTitle = title;
          },
        }),
      },
      agents: {
        list: async () => ({
          entries: [{ agent: { id: "a", workspaceId: "w", title: "session" } }],
          pageInfo: {},
        }),
        ref: () => ({
          timeline: {
            refetch: async () => ({
              error: null,
              hasOlder: false,
              entries: [
                {
                  seqStart: 1,
                  item: { type: "user_message", text: "修复登录重定向循环" },
                },
              ],
            }),
          },
        }),
      },
    },
  };
  try {
    const { jobId } = await handlers.get("rename.start")!(
      { workspaceId: "w", scope: "latest", kind: "preview" },
      context,
    );
    let job;
    for (let i = 0; i < 100; i++) {
      job = await handlers.get("rename.poll")!({ jobId }, context);
      if (job.status === "done" || job.status === "error") break;
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.equal(job.status, "done");
    assert.match(job.result.prompt, /修复登录重定向循环/);
    assert.deepEqual(writes, []);
    await assert.rejects(
      handlers.get("rename.save")!(
        { workspaceId: "w", title: "新名称", expectedTitle: "过期名称" },
        context,
      ),
      /其他窗口/,
    );
    assert.deepEqual(writes, []);
    assert.deepEqual(
      await handlers.get("rename.save")!(
        { workspaceId: "w", title: "新名称", expectedTitle: "原名称" },
        context,
      ),
      { title: "新名称" },
    );
    assert.deepEqual(writes, ["新名称"]);
  } finally {
    dispose();
  }
});
