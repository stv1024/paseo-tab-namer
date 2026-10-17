import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  project: z.string(),
});
export const SelectionSchema = z.object({
  workspaceId: z.string().min(1),
  agentId: z.string().optional(),
  scope: z.enum(["latest", "all", "selected"]),
});
export type Selection = z.infer<typeof SelectionSchema>;
export const StatsSchema = z.object({
  budgetTokens: z.number(),
  maxInputTokens: z.number(),
  messages: z.number(),
  sessions: z.number(),
  truncated: z.boolean(),
  warnings: z.array(z.string()),
});
export const listRpc = defineRpc({
  name: "rename.list",
  input: z.object({}),
  output: z.array(WorkspaceSchema),
});
export const detailRpc = defineRpc({
  name: "rename.detail",
  input: z.object({ workspaceId: z.string() }),
  output: z.object({
    workspace: WorkspaceSchema,
    agents: z.array(
      z.object({ id: z.string(), title: z.string(), updatedAt: z.string() }),
    ),
  }),
});
export const saveRpc = defineRpc({
  name: "rename.save",
  input: z.object({
    workspaceId: z.string(),
    title: z.string().trim().min(1).max(120),
    expectedTitle: z.string().nullable(),
  }),
  output: z.object({ title: z.string() }),
});
const OptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  isDefault: z.boolean(),
});
export const ProviderSchema = z.object({
  id: z.string(),
  label: z.string(),
  ready: z.boolean(),
  error: z.string().nullable(),
  models: z.array(
    OptionSchema.extend({ thinkingOptions: z.array(OptionSchema) }),
  ),
});
export type Provider = z.infer<typeof ProviderSchema>;
export const modelsRpc = defineRpc({
  name: "rename.models",
  input: z.object({ refresh: z.boolean().default(false) }),
  output: z.array(ProviderSchema),
});
export const startRpc = defineRpc({
  name: "rename.start",
  input: SelectionSchema.extend({
    kind: z.enum(["preview", "generate"]),
    previousTitle: z.string().max(120).optional(),
  }),
  output: z.object({ jobId: z.string() }),
});
export const pollRpc = defineRpc({
  name: "rename.poll",
  input: z.object({ jobId: z.string() }),
  output: z.object({
    status: z.enum(["reading", "generating", "done", "error"]),
    error: z.string().optional(),
    result: z
      .object({
        title: z.string().optional(),
        prompt: z.string().optional(),
        stats: StatsSchema,
        model: z.string(),
        inputTokens: z.number().nullable().optional(),
        outputTokens: z.number().nullable().optional(),
      })
      .optional(),
  }),
});
