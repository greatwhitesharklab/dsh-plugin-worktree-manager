# dsh-plugin-worktree-manager

> [English](README.md) · **中文**

在你的 DeepSeek Harness 工作区里管理 `git worktree`——Codex 风格。**worktree 不是独立工作区**：会话仍归属主工作区，每个会话可以*绑定*一个 worktree（并把该绑定写进本会话的模型提示词）。worktree 的新建/删除由 **AI（模型 Tool）** 负责——没有独立的管理页面。

## ✨ 功能特性

- **新会话起始模式** — 输入框上方一条细窄的 `⎇ 会话工作目录` 行，在空会话时显示两个内联胶囊：
  - **新建 worktree**（默认）— 会话开始时按项目 `AGENTS.md` 约定（分支/issue/基分支）新建 worktree 并在其中工作；
  - **当前分支** — 直接在主仓库当前分支工作。
  另有可选 **已有 worktree** 胶囊，可从已有 worktree 开始。没有悬浮下拉菜单。
- **侧边栏第二行分支徽章** — 插件接管工作区/会话列表（`sidebar.workspaces`）：每个会话标题下方一行小字——绑定 worktree 的会话显示蓝色 `⎇ <分支>` 胶囊（剥掉惯用 `feat/` 前缀），待建 worktree 的会话显示琥珀色虚线「待建 worktree」胶囊，右侧对齐相对时间。分组头可折叠，带 ＋ 按钮在该工作区新建会话。绑定数据来自 `GET /wtm/markers`。
- **AI 管理 worktree** — `worktree` 模型 Tool 让 AI（而非用户）负责新建 / 删除 / 列出：
  - `add`：创建分支 `feat/<issue>-<name>`、目录 `<worktreeRoot>/<issue>-<name>`，基分支优先当天 `release/YYYYMMDD`（不存在则 `HEAD`），随后自动绑定当前会话；
  - `use`：把当前会话绑定到某个已有 worktree；
  - `remove`：删除 worktree。
  直接说*"帮我开个 worktree 587 xxx"*，AI 就会执行。

## 🧩 工作原理

| | |
|---|---|
| Host 插件 | 静态 Cordis 函数插件（`src/index.js`，由 dsh profile 挂载）。通过 DSH `shell` 服务执行 git 命令；在 `ctx.tools` 注册模型 Tool `worktree`，注入一条 `systemPrompt.context`（绑定 worktree 路径 + 分支，或「新建 worktree」指令），并向浏览器暴露三个同源 JSON 路由（`GET /wtm/dock`、`POST /wtm/bind`、`GET /wtm/markers`）。 |
| Client bundle | 手写闭包工厂 bundle（`src/client.bundle.js`，无需构建）：注册 `conversation.input.dock` 选择器 + `sidebar.workspaces` 会话列表（第二行分支徽章）；React 从平台模块表解析，数据走三个 JSON 路由。 |

绑定按 `sessionId` 存在一个 `Map` 里（Host 插件是进程级的），插件完全不触碰工作区注册表，侧边栏仍按主目录对会话分组。

## ⚙️ 配置

修改 [`src/index.js`](src/index.js) 顶部的 `CONFIG` 对象后重启 `dsh web`：

```js
const CONFIG = {
  worktreeRoot: '../wt',   // 新建 worktree 的目录（相对主仓库，或用绝对路径）
  defaultMode: 'create',   // 'create'（新建 worktree）或 'main'（当前分支）
}
```

## 🚀 安装（挂进 profile，每次启动自动加载）

1. 在 `~/.dsh/profiles/web/package.json` 里把插件加为 `link:` 依赖：
   ```json
   "dependencies": {
     "dsh-plugin-worktree-manager": "link:/home/fredgu/git_home/dsh-plugin-worktree-manager"
   }
   ```
   然后在该目录执行 `pnpm install`。
2. 在 `~/.dsh/profiles/web/cordis.patch.yml` 追加 loader 行：
   ```yaml
   - insert:
       - id: worktree-manager
         name: dsh-plugin-worktree-manager
   ```
3. 重启 `dsh web`。工具、路由和 dock UI 每次启动自动加载——不再需要每会话 define/run，也不需要批准。空会话的输入框上方会出现 `⎇ 会话工作目录` 行。

## 📖 使用说明

- **默认新建 worktree 开始** — 保持 **新建 worktree** 选中；AI 会读取 `AGENTS.md`，必要时确认 issue/语义名，然后创建并绑定 worktree 再开工。
- **在当前分支开始** — 点 **当前分支**。
- **在已有 worktree 开始** — 点 **已有 worktree** 并选择。
- **新建 / 列出 / 删除** — 告诉 AI，例如 *"帮我在 issue 587 开个 worktree 做 loan migration"*。AI 调用 `worktree` 工具（`add`），在 `<worktreeRoot>/587-loan-migration-data-repair/` 创建 `feat/587-loan-migration-data-repair`。

> 注意：`env/db` 等被 `.gitignore` 忽略的内容不会自动带入新 worktree——需要手动复制（如 `cp -r env/db ../wt/<name>/env/db`）。

## 🔒 说明

- 插件绝不会把 worktree 注册为 DSH 工作区，也不会提供独立管理页面。
- 绑定 worktree 的会话在侧边栏仍归属主工作区；只有它的模型提示词与标题 badge 是 worktree 感知的。
- UI 文案为简体中文；逻辑本身与语言无关。

## 📦 文件结构

```
src/index.js          静态 Host 插件 — worktree 工具 + 会话绑定 + 提示词注入 + dock 路由
src/client.bundle.js  Client bundle（闭包工厂）— 输入区 dock worktree 选择器
```

## 许可证

[MIT](LICENSE)
