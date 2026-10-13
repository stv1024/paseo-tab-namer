import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View, Pressable } from "react-native";
import {
  useRpc,
  useSettings,
  type PluginHostProps,
  type PluginScreenProps,
} from "@getpaseo/plugin/client";
import {
  detailRpc,
  listRpc,
  pollRpc,
  saveRpc,
  startRpc,
  type Selection,
} from "../shared/contracts";
import { renameSettings } from "../shared/settings";
import { Button, Choices, Field, Note } from "./ui";
type Detail = {
  workspace: {
    id: string;
    name: string;
    title: string | null;
    project: string;
  };
  agents: { id: string; title: string; updatedAt: string }[];
};
type Stats = {
  estimatedTokens: number;
  budgetTokens: number;
  maxInputTokens: number;
  messages: number;
  sessions: number;
  truncated: boolean;
  warnings: string[];
};
export function RenameForm({
  workspaceId,
  theme,
  openSettings,
  initialAgentId,
}: PluginHostProps & {
  workspaceId: string;
  openSettings(): void;
  initialAgentId?: string;
}) {
  const preferences = useSettings(renameSettings);
  const load = useRpc(detailRpc),
    start = useRpc(startRpc),
    poll = useRpc(pollRpc),
    save = useRpc(saveRpc);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selection, setSelection] = useState<Selection>({
    workspaceId,
    scope: initialAgentId ? "selected" : "latest",
    agentId: initialAgentId,
  });
  const [scopeTouched, setScopeTouched] = useState(!!initialAgentId);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [usage, setUsage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [previousTitle, setPreviousTitle] = useState("");
  useEffect(() => {
    if (!scopeTouched && preferences.status === "ready")
      setSelection((s) => ({ ...s, scope: preferences.values.scope }));
  }, [
    preferences.status === "ready" ? preferences.values.scope : null,
    scopeTouched,
  ]);
  useEffect(() => {
    let active = true;
    void load({ workspaceId })
      .then((d) => {
        if (active) {
          setDetail(d);
          setTitle(d.workspace.title ?? d.workspace.name);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);
  async function act(kind: "preview" | "generate" | "save" | "reload") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      if (kind === "reload") {
        const d = await load({ workspaceId });
        setDetail(d);
        setTitle(d.workspace.title ?? d.workspace.name);
        setPreviousTitle("");
        setPrompt("");
        setStats(null);
      }
      if (kind === "preview" || kind === "generate") {
        const { jobId } = await start({
          ...selection,
          kind,
          ...(previousTitle ? { previousTitle } : {}),
        });
        const deadline = Date.now() + 8 * 60 * 1000;
        while (mounted.current) {
          const job = await poll({ jobId });
          if (!mounted.current) return;
          if (job.status === "error") throw new Error(job.error);
          if (job.status === "done" && job.result) {
            const r = job.result;
            setStats(r.stats);
            if (kind === "preview") {
              setPrompt(r.prompt ?? "");
              setUsage(`模型：${r.model}`);
              setNotice("输入已准备好，尚未调用模型。");
            } else {
              setTitle(r.title!);
              setDetail((current) =>
                current
                  ? {
                      ...current,
                      workspace: { ...current.workspace, title: r.title! },
                    }
                  : current,
              );
              setPreviousTitle(r.title!);
              setPrompt("");
              setUsage(
                `模型：${r.model}${r.inputTokens != null ? ` · 实际输入 ${r.inputTokens.toLocaleString()} tokens` : ""}${r.outputTokens != null ? ` · 输出 ${r.outputTokens} tokens` : ""}`,
              );
              setNotice("新名称已自动应用。可以再次生成。");
            }
            break;
          }
          if (Date.now() > deadline)
            throw new Error("等待任务超时，请稍后重新打开。");
          setNotice(
            job.status === "reading"
              ? "正在读取所选会话…"
              : "上下文已准备好，正在等待模型…",
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      if (kind === "save" && detail) {
        const r = await save({
          workspaceId,
          title: title.trim(),
          expectedTitle: detail.workspace.title,
        });
        setDetail({
          ...detail,
          workspace: { ...detail.workspace, title: r.title },
        });
        setTitle(r.title);
        setNotice("名称已保存。");
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : String(e));
        setNotice("");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy("");
    }
  }
  const c = theme.colors;
  return (
    <View style={{ gap: 14, width: "100%" }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text style={{ color: c.foreground, fontSize: 22, fontWeight: "700" }}>
          AI 重命名
        </Text>
        <Button theme={theme} disabled={!!busy} onPress={openSettings}>
          设置
        </Button>
      </View>
      {detail ? (
        <>
          <Note theme={theme}>
            {detail.workspace.project} · 当前名称：
            {detail.workspace.title ?? detail.workspace.name}
          </Note>
          <Choices
            theme={theme}
            disabled={!!busy}
            value={selection.scope}
            onChange={(scope) => {
              setScopeTouched(true);
              setSelection((s) => ({
                ...s,
                scope,
                agentId: s.agentId ?? detail.agents[0]?.id,
              }));
              setStats(null);
              setPrompt("");
              setPreviousTitle("");
            }}
            options={[
              { value: "latest", label: "最近会话" },
              { value: "all", label: `全部会话 (${detail.agents.length})` },
              { value: "selected", label: "指定会话" },
            ]}
          />
          {selection.scope === "latest" && (
            <Note theme={theme}>
              最近会话：{detail.agents[0]?.title ?? "无会话"}
            </Note>
          )}
          {selection.scope === "selected" && (
            <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
              {detail.agents.map((a) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`选择会话 ${a.title}`}
                  key={a.id}
                  disabled={!!busy}
                  onPress={() => {
                    setSelection((s) => ({ ...s, agentId: a.id }));
                    setPreviousTitle("");
                    setPrompt("");
                    setStats(null);
                  }}
                  style={{
                    padding: 10,
                    borderWidth: 1,
                    borderRadius: 6,
                    marginBottom: 6,
                    borderColor:
                      selection.agentId === a.id ? c.accent : c.border,
                  }}
                >
                  <Text style={{ color: c.foreground }}>{a.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Field
            theme={theme}
            label="新名称"
            value={title}
            onChange={setTitle}
            disabled={!!busy}
          />
          <Note theme={theme}>生成成功后会自动应用名称。</Note>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button
              theme={theme}
              disabled={!!busy || !detail.agents.length}
              primary
              onPress={() => {
                void act("generate");
              }}
            >
              {busy === "generate"
                ? "正在生成…"
                : previousTitle
                  ? "再次生成"
                  : "生成名称"}
            </Button>
            <Button
              theme={theme}
              disabled={!!busy || !detail.agents.length}
              onPress={() => {
                void act("preview");
              }}
            >
              {busy === "preview" ? "正在读取…" : "预览输入"}
            </Button>
            {title.trim() !==
              (detail.workspace.title ?? detail.workspace.name) && (
              <Button
                theme={theme}
                disabled={
                  !!busy ||
                  !title.trim() ||
                  title.trim() ===
                    (detail.workspace.title ?? detail.workspace.name)
                }
                onPress={() => {
                  void act("save");
                }}
              >
                {busy === "save" ? "正在应用…" : "应用手动修改"}
              </Button>
            )}
            <Button
              theme={theme}
              disabled={!!busy}
              onPress={() => {
                void act("reload");
              }}
            >
              重新加载
            </Button>
          </View>
          {stats && (
            <View
              style={{
                backgroundColor: c.surface1,
                padding: 12,
                borderRadius: 8,
                gap: 6,
              }}
            >
              <Note theme={theme}>
                输入估算 {stats.estimatedTokens.toLocaleString()} tokens ·
                保守预算 {stats.budgetTokens.toLocaleString()} /{" "}
                {stats.maxInputTokens.toLocaleString()}
              </Note>
              <Note theme={theme}>
                {stats.sessions} 个会话 · 已读取 {stats.messages} 条文字消息 ·{" "}
                {stats.truncated
                  ? "已截取：保留开头和近期内容"
                  : "所选会话文字完整纳入"}
              </Note>
              <Note theme={theme}>{usage}</Note>
              {stats.warnings.map((w, i) => (
                <Note key={i} theme={theme}>
                  {w}
                </Note>
              ))}
            </View>
          )}
          {!!prompt && (
            <View style={{ gap: 8 }}>
              <Note theme={theme}>
                以下为本次准备的输入。生成时会重新读取会话中的最新内容。
              </Note>
              <ScrollView
                style={{
                  maxHeight: 260,
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 8,
                }}
                nestedScrollEnabled
              >
                <Text
                  selectable
                  style={{
                    color: c.foregroundMuted,
                    fontSize: 12,
                    lineHeight: 18,
                    padding: 12,
                  }}
                >
                  {prompt}
                </Text>
              </ScrollView>
              <Button theme={theme} onPress={() => setPrompt("")}>
                收起预览
              </Button>
            </View>
          )}
        </>
      ) : (
        <>
          <Note theme={theme}>
            {error ? "Workspace 加载失败。" : "正在加载 workspace…"}
          </Note>
          {!!error && (
            <Button
              theme={theme}
              disabled={!!busy}
              onPress={() => {
                void act("reload");
              }}
            >
              重新加载
            </Button>
          )}
        </>
      )}
      {!!error && (
        <Note theme={theme} error>
          {error}
        </Note>
      )}
      {!!notice && <Note theme={theme}>{notice}</Note>}
    </View>
  );
}
export function RenameScreen(
  props: PluginScreenProps & { openSettings(): void },
) {
  const list = useRpc(listRpc);
  const [workspaces, setWorkspaces] = useState<Detail["workspace"][]>([]);
  const [selected, setSelected] = useState(props.params.workspaceId ?? "");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setSelected(props.params.workspaceId ?? "");
  }, [props.params.workspaceId]);
  useEffect(() => {
    let active = true;
    void list({})
      .then((w) => {
        if (active) setWorkspaces(w);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected]);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: props.theme.colors.surface0 }}
      contentContainerStyle={{
        padding: props.layout.compact ? 16 : 28,
        gap: 18,
        maxWidth: 920,
        width: "100%",
      }}
    >
      {selected ? (
        <>
          <Button theme={props.theme} onPress={() => setSelected("")}>
            选择其他 workspace
          </Button>
          <RenameForm
            key={`${selected}:${selected === props.params.workspaceId ? (props.params.agentId ?? "") : ""}`}
            {...props}
            workspaceId={selected}
            initialAgentId={
              selected === props.params.workspaceId
                ? props.params.agentId
                : undefined
            }
          />
        </>
      ) : (
        <>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text
              style={{
                color: props.theme.colors.foreground,
                fontSize: 24,
                fontWeight: "700",
              }}
            >
              AI 重命名
            </Text>
            <Button theme={props.theme} onPress={props.openSettings}>
              设置
            </Button>
          </View>
          <Field
            theme={props.theme}
            label="搜索 workspace"
            value={query}
            onChange={setQuery}
          />
          {workspaces
            .filter((w) =>
              `${w.title ?? w.name} ${w.project}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((w) => (
              <Pressable
                key={w.id}
                accessibilityRole="button"
                onPress={() => setSelected(w.id)}
                style={{
                  padding: 14,
                  gap: 5,
                  backgroundColor: props.theme.colors.surface1,
                  borderRadius: 8,
                }}
              >
                <Text
                  style={{
                    color: props.theme.colors.foreground,
                    fontWeight: "600",
                  }}
                >
                  {w.title ?? w.name}
                </Text>
                <Note theme={props.theme}>{w.project}</Note>
              </Pressable>
            ))}
          {!!error && (
            <Note theme={props.theme} error>
              {error}
            </Note>
          )}
        </>
      )}
    </ScrollView>
  );
}
