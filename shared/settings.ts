import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_PROMPT = `为工作区生成一个准确、易辨认的简体中文名称。
根据 Tab 的主要目标、用户最新确认的方向和已完成的工作命名。后续明确的目标变更优先于最初的模糊请求。
采用“操作 + 具体对象”的表达，保留必要的产品名、组件名或问题编号。不要把助手提出但用户未采纳的方案当作目标。
多个 Tab 时概括共同主题。不要编造，不要使用“工作区”“新任务”等空泛名称。`;

export const SettingsSchema = z.object({
  // Empty until the user picks one of the host's Paseo providers.
  provider: z.string().trim().max(100).default(""),
  model: z.string().trim().max(200).default(""),
  thinkingOptionId: z.string().trim().max(100).default(""),
  prompt: z.string().trim().min(1).max(16000).default(DEFAULT_PROMPT),
  maxInputTokens: z.number().int().min(2048).max(256000).default(128000),
  maxTitleChars: z.number().int().min(8).max(120).default(48),
  scope: z.enum(["latest", "all"]).default("latest"),
  includeAssistant: z.boolean().default(true),
  timeoutSeconds: z.number().int().min(15).max(600).default(180),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const renameSettings = defineSettings({
  id: "preferences",
  scope: "host",
  version: 1,
  schema: SettingsSchema,
});
