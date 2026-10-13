import { SettingsSchema } from "../shared/settings";
import { buildContext } from "../server/context";
import { generate, resolveConnection } from "../server/model";
async function main() {
  const settings = SettingsSchema.parse({});
  await resolveConnection(settings);
  const context = buildContext(
    settings,
    { project: "paseo-ai-rename", name: "开发插件" },
    [
      {
        id: "smoke",
        title: "开发 AI 重命名插件",
        incomplete: false,
        messages: [
          {
            role: "user",
            seq: 1,
            text: "在 Paseo 的 workspace 顶部添加 AI 重命名按钮，根据会话生成名称。",
          },
          {
            role: "user",
            seq: 2,
            text: "加一个统一设置界面，可以设置提示词、最大输入 token 数和模型，先在本机使用。",
          },
        ],
      },
    ],
  );
  const result = await generate(settings, context);
  console.log(
    JSON.stringify(
      { model: settings.model, ...result, stats: context.stats },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
