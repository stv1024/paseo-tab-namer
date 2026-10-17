import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  useRpc,
  useSettings,
  type PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import { SettingsCard, SettingsSelect } from "@getpaseo/plugin/client/ui";
import {
  DEFAULT_PROMPT,
  renameSettings,
  SettingsSchema,
  type Settings,
} from "../shared/settings";
import { modelsRpc, type Provider } from "../shared/contracts";
import { Button, Choices, Field, Note } from "./ui";

export function SettingsScreen(props: PluginSurfaceProps) {
  const state = useSettings(renameSettings);
  const [saved, setSaved] = useState(false);
  if (state.status !== "ready")
    return (
      <View style={{ padding: 24, gap: 12 }}>
        <Note theme={props.theme} error={state.status !== "loading"}>
          {state.status === "loading" ? "正在加载设置…" : state.error}
        </Note>
        {state.status !== "loading" && (
          <Button
            theme={props.theme}
            onPress={() => {
              void state.reload();
            }}
          >
            重新加载
          </Button>
        )}
        {state.status === "invalid" && (
          <Button
            theme={props.theme}
            onPress={() => {
              void state.reset();
            }}
          >
            恢复默认设置
          </Button>
        )}
      </View>
    );
  return (
    <SettingsForm
      key={state.revision}
      {...props}
      saved={saved}
      values={state.values}
      save={async (values) => {
        const ok = await state.save(values, state.revision);
        if (ok) setSaved(true);
        return ok;
      }}
      saving={state.saving}
      saveError={state.saveError}
    />
  );
}
function SettingsForm({
  theme,
  layout,
  values,
  save,
  saving,
  saveError,
  saved,
}: PluginSurfaceProps & {
  values: Settings;
  save(v: Settings): Promise<boolean>;
  saving: boolean;
  saveError: string | null;
  saved: boolean;
}) {
  const [draft, setDraft] = useState(values);
  const [numbers, setNumbers] = useState({
    maxInputTokens: String(values.maxInputTokens),
    maxTitleChars: String(values.maxTitleChars),
    timeoutSeconds: String(values.timeoutSeconds),
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const listModels = useRpc(modelsRpc);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [listError, setListError] = useState("");
  const loadModels = (refresh: boolean) => {
    setListError("");
    void listModels({ refresh })
      .then(setProviders)
      .catch((e) => setListError(String(e.message ?? e)));
  };
  useEffect(() => loadModels(false), []);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setNotice("");
  };
  const saveNow = async () => {
    setError("");
    const parsed = SettingsSchema.safeParse({
      ...draft,
      ...Object.fromEntries(
        Object.entries(numbers).map(([k, v]) => [
          k,
          v.trim() ? Number(v) : NaN,
        ]),
      ),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("\n"),
      );
      return;
    }
    if (!parsed.data.provider || !parsed.data.model) {
      setError("请选择命名使用的服务和模型。");
      return;
    }
    if (await save(parsed.data)) setNotice("设置已保存。下一次生成时生效。");
  };
  const c = theme.colors;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface0 }}
      contentContainerStyle={{
        padding: layout.compact ? 16 : 28,
        gap: 20,
        maxWidth: 880,
        width: "100%",
      }}
    >
      <Text style={{ color: c.foreground, fontSize: 26, fontWeight: "700" }}>
        Tab Namer 设置
      </Text>
      <Note theme={theme}>
        这些设置适用于此主机上的所有 workspace。修改后点击底部“保存设置”。
      </Note>
      {saved && <Note theme={theme}>最近一次设置保存成功。</Note>}
      <Text style={{ color: c.foreground, fontSize: 18, fontWeight: "600" }}>
        模型连接
      </Text>
      <ModelPicker
        providers={providers}
        provider={draft.provider}
        model={draft.model}
        thinkingOptionId={draft.thinkingOptionId}
        onChange={(next) => {
          setDraft((d) => ({ ...d, ...next }));
          setNotice("");
        }}
      />
      <Note theme={theme}>
        {providers
          ? "列表来自此主机 Paseo 已启用的服务。命名时会在当前 workspace 临时启动一个 Tab Namer 会话，完成后自动归档。"
          : "正在读取 Paseo 服务列表…"}
      </Note>
      {!!listError && (
        <Note theme={theme} error>
          {listError}
        </Note>
      )}
      <Button theme={theme} onPress={() => loadModels(true)}>
        刷新服务列表
      </Button>
      <Text style={{ color: c.foreground, fontSize: 18, fontWeight: "600" }}>
        上下文与输出
      </Text>
      <Field
        theme={theme}
        label="最大输入 tokens（保守预算）"
        value={numbers.maxInputTokens}
        onChange={(v) => setNumbers((n) => ({ ...n, maxInputTokens: v }))}
      />
      <Note theme={theme}>
        默认 128,000，可设 2,048–256,000。预算包含提示词和 Tab，按 UTF-8 字节加
        256 的余量计数；通常高于模型的实际 tokens。超限保留开头 25% 和近期
        75%。预览会另显示分词估算。
      </Note>
      <Choices
        theme={theme}
        value={draft.scope}
        onChange={(v) => update("scope", v)}
        options={[
          { value: "latest", label: "默认：最近 Tab" },
          { value: "all", label: "默认：全部 Tab" },
        ]}
      />
      <Choices
        theme={theme}
        value={draft.includeAssistant ? "both" : "user"}
        onChange={(v) => update("includeAssistant", v === "both")}
        options={[
          { value: "both", label: "用户与助手文字" },
          { value: "user", label: "仅用户文字" },
        ]}
      />
      <Note theme={theme}>
        使用可读取的 Tab
        文字。工具日志、推理过程和图片原始内容不进入命名请求。全部 Tab
        共享预算。
      </Note>
      <Field
        theme={theme}
        label="名称最大字符数"
        value={numbers.maxTitleChars}
        onChange={(v) => setNumbers((n) => ({ ...n, maxTitleChars: v }))}
      />
      <Field
        theme={theme}
        label="请求超时（秒）"
        value={numbers.timeoutSeconds}
        onChange={(v) => setNumbers((n) => ({ ...n, timeoutSeconds: v }))}
      />
      <Field
        theme={theme}
        label="统一命名提示词"
        multiline
        value={draft.prompt}
        onChange={(v) => update("prompt", v)}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Button theme={theme} onPress={() => update("prompt", DEFAULT_PROMPT)}>
          恢复默认提示词（待保存）
        </Button>
        <Button
          theme={theme}
          disabled={saving}
          primary
          onPress={() => {
            void saveNow();
          }}
        >
          {saving ? "正在保存…" : "保存设置"}
        </Button>
      </View>
      {(error || saveError) && (
        <Note theme={theme} error>
          {error || saveError}
        </Note>
      )}
      {!!notice && <Note theme={theme}>{notice}</Note>}
    </ScrollView>
  );
}

const UNSET = "";
function ModelPicker({
  providers,
  provider,
  model,
  thinkingOptionId,
  onChange,
}: {
  providers: Provider[] | null;
  provider: string;
  model: string;
  thinkingOptionId: string;
  onChange(next: {
    provider: string;
    model: string;
    thinkingOptionId: string;
  }): void;
}) {
  const list = providers ?? [];
  const current = list.find((p) => p.id === provider);
  const models = current?.models ?? [];
  const currentModel = models.find((m) => m.id === model);
  const thinking = currentModel?.thinkingOptions ?? [];
  // Keep a saved value selectable even when the host no longer lists it.
  const missing = (value: string, known: boolean) =>
    value && !known ? [{ value, label: `${value}（当前不可用）` }] : [];
  const pickModel = (p: Provider | undefined, id: string) =>
    onChange({
      provider: p?.id ?? provider,
      model: id,
      thinkingOptionId: UNSET,
    });
  return (
    <SettingsCard>
      <SettingsSelect
        label="服务"
        value={provider}
        disabled={!providers}
        options={[
          ...(provider ? [] : [{ value: UNSET, label: "请选择" }]),
          ...missing(provider, !!current),
          ...list.map((p) => ({
            value: p.id,
            label: p.ready ? p.label : `${p.label}（${p.error ?? "未就绪"}）`,
          })),
        ]}
        onValueChange={(id) => {
          const p = list.find((x) => x.id === id);
          const m = p?.models.find((x) => x.isDefault) ?? p?.models[0];
          pickModel(p, m?.id ?? UNSET);
        }}
      />
      <SettingsSelect
        label="模型"
        value={model}
        disabled={!current}
        options={[
          ...(model ? [] : [{ value: UNSET, label: "请选择" }]),
          ...missing(model, !!currentModel),
          ...models.map((m) => ({ value: m.id, label: m.label })),
        ]}
        onValueChange={(id) => pickModel(current, id)}
      />
      {thinking.length > 0 && (
        <SettingsSelect
          label="思考强度"
          hint="命名任务简单，较低强度通常更快。"
          value={thinkingOptionId}
          options={[
            { value: UNSET, label: "模型默认" },
            ...thinking.map((t) => ({ value: t.id, label: t.label })),
          ]}
          onValueChange={(id) =>
            onChange({ provider, model, thinkingOptionId: id })
          }
        />
      )}
    </SettingsCard>
  );
}
