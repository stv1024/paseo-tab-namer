import type { PaseoApi, Agent } from "./types";
import type { Selection } from "../shared/contracts";
import type { Settings } from "../shared/settings";
import {
  budgetCount,
  buildContext,
  type Conversation,
  type Message,
} from "./context";
import { isGenerator } from "./model";

export async function workspaces(paseo: PaseoApi) {
  const entries = [];
  let cursor: string | undefined;
  do {
    const page = await paseo.workspaces.list({
      page: { limit: 100, ...(cursor ? { cursor } : {}) },
    });
    entries.push(...page.entries);
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  return entries;
}
export async function workspaceFor(paseo: PaseoApi, id: string) {
  const workspace = await paseo.workspaces.ref(id).refresh();
  if (!workspace) throw new Error("Workspace 不存在或已归档。请刷新后重试。");
  return workspace;
}
export async function agentsFor(paseo: PaseoApi, workspaceId: string) {
  const agents: Agent[] = [];
  let cursor: string | undefined;
  do {
    const page = await paseo.agents.list({
      filter: { includeArchived: true },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: 100, ...(cursor ? { cursor } : {}) },
    });
    agents.push(
      ...page.entries
        .map((e) => e.agent)
        .filter((a) => a.workspaceId === workspaceId && !isGenerator(a)),
    );
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  return agents;
}
export async function readConversation(
  paseo: PaseoApi,
  agent: Agent,
  settings: Settings,
): Promise<Conversation> {
  const timeline = paseo.agents.ref(agent.id).timeline;
  const page = await timeline.refetch({
    direction: "tail",
    limit: 100,
    projection: "canonical",
  });
  if (page.error)
    throw new Error(`无法读取 Tab ${agent.title ?? agent.id}：${page.error}`);
  const found = new Map<number, Message>();
  let bytes = 0;
  const add = (entries: typeof page.entries) => {
    for (const e of entries) {
      const item = e.item;
      if (
        found.has(e.seqStart) ||
        (item.type !== "user_message" &&
          !(settings.includeAssistant && item.type === "assistant_message"))
      )
        continue;
      if (!item.text.trim()) continue;
      found.set(e.seqStart, {
        seq: e.seqStart,
        role: item.type === "user_message" ? "user" : "assistant",
        text: item.text,
      });
      bytes += budgetCount(item.text);
    }
  };
  add(page.entries);
  let current = page,
    calls = 0;
  while (
    current.hasOlder &&
    current.startCursor &&
    bytes < settings.maxInputTokens * 2 &&
    calls++ < 100
  ) {
    const older = await timeline.refetch({
      direction: "before",
      cursor: current.startCursor,
      limit: 100,
      projection: "canonical",
    });
    if (older.error || older.staleCursor || older.epoch !== page.epoch)
      throw new Error("Tab 正在压缩或更新，请稍后重试。");
    add(older.entries);
    if (!older.startCursor || older.startCursor.seq >= current.startCursor.seq)
      break;
    current = older;
  }
  const incomplete = current.hasOlder;
  if (incomplete) {
    // Fetch the beginning separately, so a long conversation retains its goal.
    let cursor = { epoch: page.epoch, seq: page.window.minSeq - 1 };
    for (let i = 0; i < 10; i++) {
      const head = await timeline.refetch({
        direction: "after",
        cursor,
        limit: 100,
        projection: "canonical",
      });
      if (head.error || head.staleCursor || head.epoch !== page.epoch)
        throw new Error("Tab 正在压缩或更新，请稍后重试。");
      add(head.entries);
      if (
        head.entries.some((e) => e.item.type === "user_message") ||
        !head.hasNewer ||
        !head.endCursor
      )
        break;
      cursor = head.endCursor;
    }
  }
  return {
    id: agent.id,
    title: agent.title ?? agent.id,
    messages: [...found.values()].sort((a, b) => a.seq - b.seq),
    incomplete,
  };
}
export async function prepare(
  paseo: PaseoApi,
  selection: Selection,
  settings: Settings,
  previousTitle?: string,
) {
  const workspace = await workspaceFor(paseo, selection.workspaceId);
  let agents = await agentsFor(paseo, selection.workspaceId);
  if (selection.scope === "selected")
    agents = agents.filter((a) => a.id === selection.agentId);
  if (selection.scope === "latest") agents = agents.slice(0, 1);
  if (!agents.length)
    throw new Error("此范围内没有可读取的 Tab。请选择其他 Tab。");
  if (agents.length > 100)
    throw new Error("此 workspace 超过 100 个 Tab，请选择一个 Tab 生成名称。");
  const conversations: Conversation[] = [];
  for (const agent of agents)
    conversations.push(await readConversation(paseo, agent, settings));
  if (!conversations.some((c) => c.messages.some((m) => m.role === "user")))
    throw new Error("此范围内没有用户消息，无法可靠地生成名称。");
  const warnings = conversations.some((c) => c.incomplete)
    ? ["过长的 Tab 已保留开头与近期内容，部分历史未载入。"]
    : [];
  return buildContext(
    settings,
    {
      name: workspace.title ?? workspace.name,
      project: workspace.projectDisplayName,
    },
    conversations,
    warnings,
    previousTitle,
  );
}
