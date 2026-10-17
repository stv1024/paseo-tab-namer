import type { Provider } from "../shared/contracts";
import type { Settings } from "../shared/settings";
import type { Agent, PaseoApi } from "./types";

// Marks the short-lived naming agents so they are never read as user Tabs.
export const GENERATOR_LABEL = "tab-namer";
export const isGenerator = (agent: Agent) =>
  agent.labels?.[GENERATOR_LABEL] !== undefined;

export async function listProviders(
  paseo: PaseoApi,
  refresh = false,
): Promise<Provider[]> {
  if (refresh) await paseo.providers.refresh();
  const snapshot = await paseo.providers.waitForReady({ timeoutMs: 30000 });
  return snapshot.entries
    .filter((e) => e.enabled)
    .map((e) => ({
      id: e.provider,
      label: e.label ?? e.provider,
      ready: e.status === "ready",
      error: e.error ?? null,
      models: (e.models ?? [])
        .filter((m) => m.isSelectable !== false)
        .map((m) => ({
          id: m.id,
          label: m.label,
          isDefault: !!m.isDefault,
          thinkingOptions: (m.thinkingOptions ?? []).map((t) => ({
            id: t.id,
            label: t.label,
            isDefault: !!t.isDefault || t.id === m.defaultThinkingOptionId,
          })),
        })),
    }));
}
export function parseTitle(raw: string, max: number): string {
  let title = raw.trim();
  if (title.startsWith("{")) {
    try {
      const parsed = JSON.parse(title);
      title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    } catch {
      throw new Error("模型返回了无效的名称，请重新生成。");
    }
  }
  title = title.replace(/^["“「](.*)["”」]$/u, "$1").trim();
  if (
    !title ||
    /[\r\n\u0000-\u001F]/.test(title) ||
    Array.from(title).length > max ||
    title.startsWith("```")
  )
    throw new Error(
      `模型未返回有效的单行名称（最多 ${max} 字）。请重新生成或调整提示词。`,
    );
  return title;
}
export async function generate(
  paseo: PaseoApi,
  workspaceId: string,
  settings: Settings,
  context: { system: string; content: string },
) {
  if (!settings.provider || !settings.model)
    throw new Error("尚未选择模型。请在 Tab Namer 设置中选择服务和模型。");
  // "Model default" still sends the model's default option, as the Paseo app
  // does; some gateways never answer Claude requests that omit it.
  const thinkingOptionId =
    settings.thinkingOptionId ||
    (await listProviders(paseo))
      .find((p) => p.id === settings.provider)
      ?.models.find((m) => m.id === settings.model)
      ?.thinkingOptions.find((t) => t.isDefault)?.id;
  let agent;
  try {
    // Paseo exposes LLMs to plugins as agents; plugins cannot create internal
    // agents, so this one lives briefly in the workspace and is archived below.
    agent = await paseo.workspaces.ref(workspaceId).agents.create({
      config: {
        provider: `${settings.provider}/${settings.model}`,
        ...(thinkingOptionId ? { thinkingOptionId } : {}),
      },
      title: "Tab Namer",
      labels: { [GENERATOR_LABEL]: "generator" },
    });
  } catch (e) {
    throw new Error(
      `无法启动 ${settings.provider}/${settings.model}：${e instanceof Error ? e.message : "未知错误"}。请检查 Paseo 中的服务状态或在设置中更换模型。`,
    );
  }
  try {
    // Sent after creation: a create-time prompt can reach Claude Code before its
    // process accepts input. Not every provider maps systemPrompt, so the
    // instructions lead the message.
    const run = await agent.run(
      `${context.system}

${context.content}`,
      {
        timeoutMs: settings.timeoutSeconds * 1000,
      },
    );
    if (run.status === "timeout")
      throw new Error("命名请求超时。可以重试或在设置中延长超时。");
    if (run.status === "permission")
      throw new Error("命名模型试图调用工具，已停止。请重试或更换模型。");
    if (run.status === "error")
      throw new Error(`命名模型运行失败：${run.error ?? "未知错误"}`);
    const usage = run.final?.lastUsage;
    return {
      title: parseTitle(run.lastMessage ?? "", settings.maxTitleChars),
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
    };
  } finally {
    await agent.archive().catch(() => {
      /* Generation outcome matters more than cleanup of the helper Tab. */
    });
  }
}
