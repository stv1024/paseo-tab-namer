// Calls the real local Paseo daemon: lists providers, then runs one naming
// agent in the workspace for the current directory. It does not rename it.
// Usage: npm run test:smoke -- [provider/model]
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createPaseoClient } from "@getpaseo/client";
import { SettingsSchema } from "../shared/settings";
import { buildContext } from "../server/context";
import { generate, listProviders } from "../server/model";

function localCredential() {
  try {
    return readFileSync(
      join(homedir(), ".paseo", "local-credential"),
      "utf8",
    ).trim();
  } catch {
    return undefined;
  }
}
async function main() {
  const token = localCredential();
  const paseo = createPaseoClient({
    url: process.env.PASEO_URL ?? "ws://127.0.0.1:6767/ws",
    ...(token ? { authHeader: `Bearer ${token}` } : {}),
    reconnect: { enabled: false },
  });
  await paseo.connect();
  try {
    const providers = await listProviders(paseo);
    for (const p of providers)
      console.log(
        `${p.ready ? "ready" : "not ready"}  ${p.id}  ${p.models.length} models${p.error ? `  (${p.error})` : ""}`,
      );
    const [provider, model] = process.argv[2]
      ? [
          process.argv[2].slice(0, process.argv[2].indexOf("/")),
          process.argv[2].slice(process.argv[2].indexOf("/") + 1),
        ]
      : (() => {
          const p = providers.find((x) => x.ready && x.models.length);
          if (!p) throw new Error("没有就绪的 Paseo 服务。");
          return [p.id, (p.models.find((m) => m.isDefault) ?? p.models[0]).id];
        })();
    const cwd = resolve(".").toLowerCase();
    const workspace = (await paseo.workspaces.list()).entries.find(
      (w) =>
        w.workspaceDirectory &&
        resolve(w.workspaceDirectory).toLowerCase() === cwd,
    );
    if (!workspace) throw new Error(`没有目录为 ${cwd} 的 workspace。`);
    const settings = SettingsSchema.parse({ provider, model });
    const context = buildContext(
      settings,
      { project: "paseo-tab-namer", name: "开发插件" },
      [
        {
          id: "smoke",
          title: "开发 Tab Namer 插件",
          incomplete: false,
          messages: [
            {
              role: "user",
              seq: 1,
              text: "在 Paseo 的 workspace 顶部添加按钮，根据 Tab 内容生成 workspace 名称。",
            },
            {
              role: "user",
              seq: 2,
              text: "把模型连接改成从 Paseo 的 provider 和模型列表里选择，不再绑定固定服务。",
            },
          ],
        },
      ],
    );
    const started = Date.now();
    const result = await generate(paseo, workspace.id, settings, context);
    console.log(
      JSON.stringify(
        {
          model: `${provider}/${model}`,
          seconds: (Date.now() - started) / 1000,
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await paseo.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
