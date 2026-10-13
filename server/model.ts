import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import type { Settings } from "../shared/settings";

export async function resolveConnection(settings: Settings) {
  let baseUrl = settings.baseUrl,
    apiKey: string | undefined;
  if (settings.connection === "omp") {
    const dir = join(homedir(), ".omp", "agent");
    let config;
    try {
      config = parse(await readFile(join(dir, "models.yml"), "utf8"));
    } catch {
      throw new Error(
        "无法读取本机 OMP models.yml。请在设置中选择自定义接口。",
      );
    }
    const provider = config?.providers?.[settings.ompProvider];
    if (!provider)
      throw new Error(`OMP 中没有 ${settings.ompProvider} 服务配置。`);
    if (provider.api !== "openai-completions")
      throw new Error("目前只支持 OpenAI Chat Completions 兼容接口。");
    baseUrl = provider.baseUrl;
    const configuredKey = provider.apiKey;
    if (typeof configuredKey !== "string" || configuredKey.startsWith("!"))
      throw new Error("OMP 密钥类型不受支持，请使用环境变量方式。");
    // Read a literal secret in memory only; never return it via RPC or log it.
    apiKey = process.env[configuredKey];
    if (!apiKey && /^[A-Z][A-Z0-9_]+$/.test(configuredKey)) {
      try {
        const env = await readFile(join(dir, ".env"), "utf8");
        const line = env
          .split(/\r?\n/)
          .find((l) => l.trim().startsWith(`${configuredKey}=`));
        apiKey = line
          ?.slice(line.indexOf("=") + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, "$2");
      } catch {
        /* Checked below. */
      }
    } else if (!apiKey) apiKey = configuredKey;
  } else apiKey = process.env[settings.apiKeyEnv];
  if (!apiKey)
    throw new Error(
      `未找到模型密钥。请检查连接设置或 ${settings.apiKeyEnv} 环境变量。`,
    );
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("接口地址无效。请填写包含 /v1 的 API 基础地址。");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "接口地址必须是 HTTP(S) 基础地址，不包含账号、查询参数或片段。",
    );
  return { url: `${baseUrl.replace(/\/+$/, "")}/chat/completions`, apiKey };
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
  settings: Settings,
  context: { system: string; content: string },
) {
  const { url, apiKey } = await resolveConnection(settings);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    settings.timeoutSeconds * 1000,
  );
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "system", content: context.system },
          { role: "user", content: context.content },
        ],
        max_tokens: 1024,
        temperature: settings.temperature,
        stream: false,
        ...(/^qwen/i.test(settings.model)
          ? {
              enable_thinking: false,
              chat_template_kwargs: { enable_thinking: false },
            }
          : {}),
      }),
    });
    // Read the response while the timeout is still active.
    const responseText = await response.text();
    if (!response.ok) throw new ModelHttpError(response.status);
    let body: {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      body = JSON.parse(responseText);
    } catch {
      throw new ModelOutputError("命名接口没有返回有效 JSON。");
    }
    const choice = body.choices?.[0];
    if (choice?.finish_reason === "length")
      throw new ModelOutputError(
        "模型输出超过长度限制。请使用非推理模型或更简短的提示词。",
      );
    if (typeof choice?.message?.content !== "string")
      throw new ModelOutputError(
        "模型没有返回文本名称。请检查模型是否支持 Chat Completions。",
      );
    let title: string;
    try {
      title = parseTitle(choice.message.content, settings.maxTitleChars);
    } catch (e) {
      throw new ModelOutputError((e as Error).message);
    }
    return {
      title,
      inputTokens: body.usage?.prompt_tokens ?? null,
      outputTokens: body.usage?.completion_tokens ?? null,
    };
  } catch (e) {
    if (e instanceof ModelHttpError)
      throw new Error(
        `命名接口返回 HTTP ${e.status}。${e.status === 401 ? "请检查密钥。" : e.status === 429 ? "请求过多或余额不足，请稍后重试。" : "请检查模型、接口地址和输入上限。"}`,
      );
    if (e instanceof ModelOutputError) throw new Error(e.message);
    if (e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name))
      throw new Error("命名请求超时。可以重试或在设置中延长超时。");
    throw new Error("无法连接命名接口。请检查网络和连接设置。");
  } finally {
    clearTimeout(timeout);
  }
}
class ModelHttpError extends Error {
  constructor(readonly status: number) {
    super("HTTP error");
  }
}
class ModelOutputError extends Error {}
