import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_PROMPT = `为工作区生成一个准确、易辨认的简体中文名称。
根据 Tab 的主要目标、用户最新确认的方向和已完成的工作命名。后续明确的目标变更优先于最初的模糊请求。
采用“操作 + 具体对象”的表达，保留必要的产品名、组件名或问题编号。不要把助手提出但用户未采纳的方案当作目标。
多个 Tab 时概括共同主题。不要编造，不要使用“工作区”“新任务”等空泛名称。`;

export const SettingsSchema = z.object({
  connection: z.enum(["omp", "custom"]).default("omp"),
  ompProvider: z.string().trim().min(1).max(100).default("custom"),
  model: z.string().trim().min(1).max(200).default("qwen3.5-flash"),
  baseUrl: z.string().max(1000).default(""),
  apiKeyEnv: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .default("AI_RENAME_API_KEY"),
  prompt: z.string().trim().min(1).max(16000).default(DEFAULT_PROMPT),
  maxInputTokens: z.number().int().min(2048).max(256000).default(128000),
  maxTitleChars: z.number().int().min(8).max(120).default(48),
  scope: z.enum(["latest", "all"]).default("latest"),
  includeAssistant: z.boolean().default(true),
  temperature: z.number().min(0).max(1.5).default(0.3),
  timeoutSeconds: z.number().int().min(15).max(180).default(90),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const renameSettings = defineSettings({
  id: "preferences",
  scope: "host",
  version: 1,
  schema: SettingsSchema,
});
