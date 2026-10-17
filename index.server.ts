import type { PluginServerContext } from "@getpaseo/plugin/server";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { renameSettings } from "./shared/settings";
import {
  connectionRpc,
  detailRpc,
  listRpc,
  pollRpc,
  saveRpc,
  startRpc,
} from "./shared/contracts";
import { agentsFor, prepare, workspaceFor, workspaces } from "./server/source";
import { generate, resolveConnection } from "./server/model";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(renameSettings);
  const read = async () => {
    const s = await settings.read();
    if (s.status !== "ready")
      throw new Error("设置无效，请打开 Tab Namer 设置修复。");
    return s.values;
  };
  const busy = new Set<string>();
  type Job = z.infer<typeof pollRpc.output> & { createdAt: number };
  const jobs = new Map<string, Job>();
  const expire = setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs)
      if (
        now - job.createdAt > 10 * 60 * 1000 &&
        ["done", "error"].includes(job.status)
      )
        jobs.delete(id);
  }, 60000);
  server.handle(startRpc, async (input, { paseo }) => {
    const now = Date.now();
    for (const [id, job] of jobs)
      if (now - job.createdAt > 10 * 60 * 1000) jobs.delete(id);
    if (busy.has(input.workspaceId))
      throw new Error("此 workspace 正在处理命名请求，请等待完成。");
    if (busy.size >= 3)
      throw new Error("已有 3 个命名任务正在运行，请稍后重试。");
    const s = await read();
    const initialWorkspace = await workspaceFor(paseo, input.workspaceId);
    if (busy.has(input.workspaceId) || busy.size >= 3)
      throw new Error("已有命名任务正在处理，请稍后重试。");
    busy.add(input.workspaceId);
    const jobId = randomUUID();
    const job: Job = { status: "reading", createdAt: now };
    jobs.set(jobId, job);
    void (async () => {
      try {
        const c = await prepare(paseo, input, s, input.previousTitle);
        if (input.kind === "preview")
          job.result = {
            prompt: c.system + "\n\n" + c.content,
            stats: c.stats,
            model: s.model,
          };
        else {
          job.status = "generating";
          const generated = await generate(s, c);
          const currentWorkspace = await workspaceFor(paseo, input.workspaceId);
          if (
            (currentWorkspace.title ?? null) !==
            (initialWorkspace.title ?? null)
          )
            throw new Error(
              "生成期间名称已在其他窗口中修改。请重新加载后再生成。",
            );
          try {
            await paseo.workspaces
              .ref(input.workspaceId)
              .setTitle(generated.title);
          } catch {
            throw new Error(
              "名称已生成，但自动应用失败。请重新加载确认当前名称后重试。",
            );
          }
          job.result = {
            ...generated,
            stats: c.stats,
            model: s.model,
          };
        }
        job.status = "done";
      } catch (e) {
        job.status = "error";
        job.error = e instanceof Error ? e.message : "命名失败。";
      } finally {
        busy.delete(input.workspaceId);
      }
    })();
    return { jobId };
  });
  server.handle(pollRpc, async ({ jobId }) => {
    const job = jobs.get(jobId);
    if (!job) throw new Error("命名任务已过期或插件已重新加载，请重试。");
    return job;
  });
  server.handle(listRpc, async (_, { paseo }) =>
    (await workspaces(paseo)).map((w) => ({
      id: w.id,
      name: w.name,
      title: w.title ?? null,
      project: w.projectDisplayName,
    })),
  );
  server.handle(detailRpc, async ({ workspaceId }, { paseo }) => {
    const w = await workspaceFor(paseo, workspaceId);
    return {
      workspace: {
        id: w.id,
        name: w.name,
        title: w.title ?? null,
        project: w.projectDisplayName,
      },
      agents: (await agentsFor(paseo, workspaceId)).map((a) => ({
        id: a.id,
        title: a.title ?? a.id,
        updatedAt: a.updatedAt,
      })),
    };
  });
  server.handle(
    saveRpc,
    async ({ workspaceId, title, expectedTitle }, { paseo }) => {
      const w = await workspaceFor(paseo, workspaceId);
      if ((w.title ?? null) !== expectedTitle)
        throw new Error("名称已在其他窗口中修改。请重新加载后再保存。");
      if (/[\r\n\u0000-\u001F]/.test(title))
        throw new Error("名称必须是单行文本。");
      await paseo.workspaces.ref(workspaceId).setTitle(title);
      return { title };
    },
  );
  server.handle(connectionRpc, async () => {
    const s = await read();
    try {
      await resolveConnection(s);
      return {
        ready: true,
        model: s.model,
        message: "连接配置和密钥可用。生成时会实际调用模型。",
      };
    } catch (e) {
      return {
        ready: false,
        model: s.model,
        message: e instanceof Error ? e.message : "连接配置无效。",
      };
    }
  });
  return () => {
    clearInterval(expire);
    jobs.clear();
    busy.clear();
  };
}
