import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  useRpc,
  useSettings,
  type PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import {
  DEFAULT_PROMPT,
  renameSettings,
  SettingsSchema,
  type Settings,
} from "../shared/settings";
import { connectionRpc } from "../shared/contracts";
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
    temperature: String(values.temperature),
    timeoutSeconds: String(values.timeoutSeconds),
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const check = useRpc(connectionRpc);
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
    if (
      parsed.data.connection === "custom" &&
      !/^https?:\/\//.test(parsed.data.baseUrl)
    ) {
      setError("请填写有效的 HTTP(S) 接口基础地址。");
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
      <Choices
        theme={theme}
        value={draft.connection}
        onChange={(v) => update("connection", v)}
        options={[
          { value: "omp", label: "复用本机 OMP" },
          { value: "custom", label: "自定义接口" },
        ]}
      />
      {draft.connection === "omp" ? (
        <>
          <Field
            theme={theme}
            label="OMP 服务名称"
            value={draft.ompProvider}
            onChange={(v) => update("ompProvider", v)}
          />
          <Note theme={theme}>
            从本机 ~/.omp/agent/models.yml
            读取地址和密钥。密钥不会发送到插件界面或写入仓库。
          </Note>
        </>
      ) : (
        <>
          <Field
            theme={theme}
            label="API 基础地址（包含 /v1）"
            value={draft.baseUrl}
            onChange={(v) => update("baseUrl", v)}
          />
          <Field
            theme={theme}
            label="API 密钥环境变量名"
            value={draft.apiKeyEnv}
            onChange={(v) => update("apiKeyEnv", v)}
          />
          <Note theme={theme}>
            支持 OpenAI Chat Completions 兼容接口。环境变量需在 Paseo
            服务进程中可用。
          </Note>
        </>
      )}
      <Field
        theme={theme}
        label="模型 ID"
        value={draft.model}
        onChange={(v) => update("model", v)}
      />
      <Button
        theme={theme}
        onPress={() => {
          void check({})
            .then((r) => {
              setNotice(r.message);
              setError("");
            })
            .catch((e) => setError(String(e.message ?? e)));
        }}
      >
        检查已保存的连接配置
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
        使用可读取的 Tab 文字。工具日志、推理过程和图片原始内容不进入命名请求。全部 Tab 共享预算。
      </Note>
      <Field
        theme={theme}
        label="名称最大字符数"
        value={numbers.maxTitleChars}
        onChange={(v) => setNumbers((n) => ({ ...n, maxTitleChars: v }))}
      />
      <Field
        theme={theme}
        label="温度（0–1.5）"
        value={numbers.temperature}
        onChange={(v) => setNumbers((n) => ({ ...n, temperature: v }))}
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
