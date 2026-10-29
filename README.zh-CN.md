<p align="center">
  <img src="docs/images/banner.png" alt="Tab Namer：根据 Tab 内容为 Paseo workspace 起名" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/stv1024/paseo-tab-namer/releases"><img alt="Version" src="https://img.shields.io/badge/version-0.2.0-20744a?style=flat-square" /></a>
  <img alt="Paseo" src="https://img.shields.io/badge/paseo-%E2%89%A5%200.11.2-7ccba0?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-node%3Atest-555?style=flat-square" />
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b>
</p>

---

**Tab Namer** 是一个 [Paseo](https://github.com/getpaseo/paseo) 插件，根据 workspace 中 Tab 的对话内容，用你在 Paseo 中已启用的模型服务生成一个简短、具体的名称并直接应用，比如把 `new-workspace-7` 改成 `修复 OAuth 回调重定向循环`。

- ✨ **一键生成**：每个 workspace 顶部都有 ✨ 按钮，生成成功后立即自动应用。
- 🔌 **复用已有服务**：Claude、Codex、OMP 或任何自定义服务均可。插件本身不需要地址、密钥或额外依赖。
- 🎯 **自选上下文**：可依据最近 Tab、全部 Tab 或指定 Tab 命名。
- 📏 **长 Tab 也能装下**：按保守预算截取，保留每个 Tab 的开头和近期内容，不额外调用模型做摘要。
- 🔒 **只发文字**：仅发送用户与助手的文字消息，工具日志、推理过程和图片原始内容不进入请求。
- 🧹 **用完即清**：临时命名会话回复后立即归档；不修改目录或 Git 分支。

## 截图

<p align="center">
  <img src="docs/images/popover.png" alt="从 workspace 顶部打开的 Tab Namer 弹窗" width="100%" />
  <br /><sub>生成完成后的顶部弹窗，展开“更多”可查看预算与用量。</sub>
</p>

<p align="center">
  <img src="docs/images/settings.png" alt="Tab Namer 设置页" width="100%" />
  <br /><sub>设置对本机所有 workspace 生效：服务、模型、思考强度、预算与提示词。</sub>
</p>

> 图片为根据插件真实界面和 Paseo 深色主题制作的示意图，源文件见 [`docs/media-src`](docs/media-src)。

## 安装

需要 **Paseo 0.11.2 或更新版本**。

```sh
paseo plugin install git:stv1024/paseo-tab-namer
```

可用 `--ref <tag 或 commit>` 固定版本；之后用 `paseo plugin update tab-namer` 更新。

首次使用请打开 **设置 → Tab Namer**，选择 **服务** 和 **模型**，再点 **保存设置**。

## 使用

1. 点击 workspace 顶部的 **✨ Tab Namer** 按钮。
2. 点击弹窗最上方的大按钮 **生成名称**（就在顶部按钮正下方，弹窗一打开就能点），名称会立即应用；在同一位置点 **再次生成** 可换一个。
3. 如需改变命名依据，先选择范围：**最近 Tab**、**全部 Tab** 或 **指定 Tab**。
4. 如需手动微调，修改输入框后点击 **应用** 或按回车。

弹窗底部的 **设置** 可打开设置。展开 **更多** 后点 **预览输入**，可查看将要发送的内容和预算占用，不调用模型。

其他入口：

| 位置       | 内容                                                                         |
| ---------- | ---------------------------------------------------------------------------- |
| 命令中心   | `Tab Namer：选择 workspace 重命名`（可搜索全部 workspace）、`Tab Namer：重命名当前 workspace`、`Tab Namer：根据当前 Tab`、`Tab Namer 设置` |

## 工作原理

<p align="center">
  <img src="docs/images/flow.png" alt="读取 Tab → 适配预算 → 调用服务 → 应用并清理" width="100%" />
</p>

Paseo 目前只通过 agent 向插件提供模型能力。点击生成时，插件在当前 workspace 临时启动一个标题为 **Tab Namer**、带 `tab-namer` 标签的会话，把提示词和所选 Tab 文字作为一条消息发送，读取回复后立即归档。带该标签的会话不会被当作 Tab 读取。认证完全由 Paseo 的服务配置负责。

生成以后台任务运行，界面轮询状态，关闭弹窗也会完成。每个 workspace 同时只运行一项任务，全局最多并发三项。写入前会重读当前名称，若已被修改则拒绝覆盖。

## 设置

| 设置         | 默认值             | 说明                                   |
| ------------ | ------------------ | -------------------------------------- |
| 服务与模型   | 未选择             | 列表来自本机 Paseo 已启用的服务        |
| 思考强度     | 模型默认           | 命名任务简单，较低强度通常更快         |
| 最大输入预算 | 128,000            | 可设 2,048–256,000，保守上界           |
| 默认范围     | 最近 Tab           | 或全部 Tab                             |
| 内容         | 用户与助手文字     | 或仅用户文字                           |
| 名称长度     | 最多 48 个字符     | 8–120                                  |
| 请求超时     | 180 秒             | 15–600                                 |
| 命名提示词   | 内置中文提示词     | 所有 workspace 共用，可恢复默认        |

<details>
<summary><b>关于输入预算</b></summary>

不同模型的 tokenizer 不同，因此预算按 **UTF-8 字节数加 256** 计算，包含系统提示词和选取的消息。这个数通常显著高于实际 tokens：128,000 的预算通常容纳几万个实际 tokens。服务返回用量时界面会显示实际数值；请确保所选模型的上下文窗口足够容纳该预算。

短 Tab 的文字完整纳入。超限时每个 Tab 保留开头约 25% 和近期约 75%；多个 Tab 公平分配预算，短 Tab 退还未用空间。很长的 Tab 分页读取，有读取页数上限。一次最多处理 100 个 Tab。预览会明确显示是否截取。

Claude Code、Codex 等服务会附带自身的系统提示词与工具定义，因此实际计费的输入 tokens 会高于命名内容本身。提示词要求模型不调用工具；若模型仍请求工具权限，任务会停止并报错。

</details>

## 隐私

- 所选 Tab 的文字只发送到 **你** 选择的服务。
- 预览输入不会调用模型，也不会修改名称。
- 插件不保存任何凭据；设置保存在 Paseo 的 host settings 中。
- 完成任务的临时结果约十分钟后从内存移除。

## 限制

- Paseo 不支持把插件按钮放入原生 workspace 右键菜单或重命名对话框，因此改为提供顶部按钮和命令中心条目。插件不使用侧栏，不占用手机端 workspace 列表的空间。
- 只能依据 Paseo 当前可读取的记录命名，无法恢复宿主已丢弃的历史。
- 宿主没有原子 compare-and-set 接口，无法防止“检查后、写入前”这一瞬间的并发修改。

## 开发

```sh
npm ci
npm run typecheck
npm test                      # server/ 下的 node:test 测试

# 连接本机 Paseo，对当前目录对应的 workspace 跑一次真实命名，不修改名称
npm run test:smoke -- <provider>/<model>

paseo plugin install .        # 从本地目录安装
paseo plugin reload tab-namer # 修改后重新加载
```

Paseo 从 Git 安装插件时直接用 esbuild 打包源码，**不执行 `npm install`**。运行时代码只能导入 Paseo 自带的 `@getpaseo/plugin`、`react`、`react-native`、`zod` 和 Node 内置模块；`devDependencies` 只用于类型检查、测试和脚本。

```
index.client.tsx   界面入口：顶部按钮、页面、命令中心
index.server.ts    RPC 处理与后台任务
client/            重命名弹窗/页面、设置页、通用组件
server/            Tab 读取、预算、模型会话、命名逻辑（含测试）
shared/            RPC 契约与设置 schema
docs/media-src/    README 插图的 HTML 源（node docs/media-src/render.mjs）
```

## 参与贡献

欢迎提交 Issue 和 Pull Request。提交 PR 前请运行 `npm run typecheck` 和 `npm test`；涉及命名质量的改动，请附上 `npm run test:smoke` 的前后对比。

## 许可证

[MIT](LICENSE) © Stephen Zhou
