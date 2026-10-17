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

for (const scenario of [
  "success",
  "model failure",
  "apply failure",
  "concurrent rename",
] as const) {
  test(`automatic apply: ${scenario}`, async () => {
    const handlers = new Map<
      string,
      (input: any, context: any) => Promise<any>
    >();
    const writes: string[] = [];
    let title = "原名称",
      requests = 0;
    const dispose = contribute({
      registerSettings: () => ({
        read: async () => ({
          status: "ready",
          values: SettingsSchema.parse({ provider: "claude", model: "haiku" }),
        }),
      }),
      handle: (contract: { name: string }, handler: any) =>
        handlers.set(contract.name, handler),
    } as unknown as PluginServerContext);
    const context = {
      paseo: {
        providers: { waitForReady: async () => ({ entries: [] }) },
        workspaces: {
          ref: () => ({
            refresh: async () => ({
              id: "w",
              name: "branch",
              title,
              projectDisplayName: "Project",
            }),
            setTitle: async (next: string) => {
              if (scenario === "apply failure") throw new Error("write failed");
              writes.push(next);
              title = next;
            },
            agents: {
              create: async () => ({
                run: async (text: string) => {
                  requests++;
                  if (scenario === "concurrent rename")
                    title = "其他窗口的新名称";
                  return scenario === "model failure"
                    ? { status: "error", error: "unavailable", final: null }
                    : {
                        status: "idle",
                        lastMessage: `修复登录跳转 ${requests}`,
                        final: null,
                      };
                },
                archive: async () => {},
              }),
            },
          }),
        },
        agents: {
          list: async () => ({
            entries: [
              {
                agent: {
                  id: "n",
                  workspaceId: "w",
                  title: "Tab Namer",
                  labels: { "tab-namer": "generator" },
                },
              },
              { agent: { id: "a", workspaceId: "w", title: "session" } },
            ],
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
                    item: { type: "user_message", text: "修复登录跳转" },
                  },
                ],
              }),
            },
          }),
        },
      },
    };
    const run = async () => {
      const { jobId } = await handlers.get("rename.start")!(
        { workspaceId: "w", scope: "latest", kind: "generate" },
        context,
      );
      for (let i = 0; i < 100; i++) {
        const job = await handlers.get("rename.poll")!({ jobId }, context);
        if (job.status === "done" || job.status === "error") return job;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error("job did not finish");
    };
    try {
      const job = await run();
      if (scenario === "success") {
        assert.equal(job.status, "done");
        assert.equal(title, job.result.title);
        assert.deepEqual(writes, ["修复登录跳转 1"]);
        const again = await run();
        assert.equal(again.status, "done");
        assert.equal(title, "修复登录跳转 2");
        assert.deepEqual(writes, ["修复登录跳转 1", "修复登录跳转 2"]);
      } else {
        assert.equal(job.status, "error");
        assert.equal(job.result, undefined);
        assert.deepEqual(writes, []);
        assert.equal(
          title,
          scenario === "concurrent rename" ? "其他窗口的新名称" : "原名称",
        );
        if (scenario === "apply failure")
          assert.match(job.error, /自动应用失败/);
        if (scenario === "concurrent rename")
          assert.match(job.error, /其他窗口/);
      }
    } finally {
      dispose();
    }
  });
}
