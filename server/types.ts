import type { PluginHandlerContext } from "@getpaseo/plugin/server";
export type PaseoApi = PluginHandlerContext["paseo"];
export type Workspace = Exclude<
  Parameters<PaseoApi["workspaces"]["ref"]>[0],
  string
>;
export type Agent = Exclude<Parameters<PaseoApi["agents"]["ref"]>[0], string>;
