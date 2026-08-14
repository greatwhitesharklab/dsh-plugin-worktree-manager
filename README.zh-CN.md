# dsh-plugin-worktree-manager

> [English](README.md) · **中文**

在你的 DeepSeek Harness 工作区里管理 `git worktree`——Codex 风格。**worktree 不是独立工作区**：会话仍归属主工作区，每个会话可以*绑定*一个 worktree（并把该绑定写进本会话的模型提示词）。worktree 的新建/删除由 **AI（模型 Tool）** 负责——没有独立的管理页面。

## ✨ 功能特性

- **会话工作目录 dock** — 输入框上方一条细窄的 `⎇` 行，显示当前会话的工作目录。点击胶囊即可选择：
  - **当前分支（主目录）** — 直接在主仓库工作；
  - 主仓库下的任意 **worktree**（带分支名显示）— 选择后，本会话的模型提示词会注入该 worktree 的绝对路径和分支，之后本会话的所有文件/git 操作都基于该 worktree 目录进行。
- **AI 管理 worktree** — `worktree` 模型 Tool 让 AI（而非用户）负责 worktree 的新建 / 删除 / 列出：
  - `add`：创建分支 `feat/<issue>-<name>`、目录 `../wt/<issue>-<name>`（主仓库同级），基分支优先当天 `release/YYYYMMDD`（不存在则 `HEAD`）；
  - `use`：把当前会话绑定到某个已有 worktree；
  - `remove`：删除 worktree。
  直接说*"帮我开个 worktree 587 xxx"*，AI 就会执行。
- **没有独立管理页面** — 旧版浮动面板和侧边栏入口都已移除，dock 是唯一的 UI 表面。

## 🧩 工作原理

| | |
|---|---|
| Host 半段 | 会话级插件实例。通过 DSH `shell` 服务执行 git 命令；注册模型 Tool `worktree`（`harness.defineTool` / `harness.registerTool`）、RPC `wt.dock` / `wt.bind` / `wt.unbind`，以及一条 `systemPrompt.context` 注入——把本会话绑定的 worktree 路径 + 分支写进该会话的提示词。 |
| Client 半段 | 注册 `conversation.input.dock` 的 worktree-dock 选择器；通过 `host.call` 调用 Host 半段。 |

因为 Host 半段是会话级实例，绑定和提示词注入**只影响做出选择的那个会话**；插件完全不触碰工作区注册表，侧边栏仍按主目录对会话分组。

## 🚀 安装

1. 打开你的 DeepSeek Harness GUI 会话。
2. 定义一个动态 Cordis 插件：
   - `code.host` ← 内容粘贴自 [`src/host.js`](src/host.js)
   - `code.client` ← 内容粘贴自 [`src/client.js`](src/client.js)
3. 运行该 Package（在界面批准运行）。
4. 输入框上方会出现 `⎇ 会话工作目录` dock。

## 📖 使用说明

- **把本会话绑定到 worktree** — 点 dock 胶囊，选一个 worktree。胶囊变蓝并显示 `worktree · 分支`；本会话的模型提示词会告诉 AI 在哪个目录下工作。
- **切回主分支** — 选 **当前分支（主目录）**。
- **新建 worktree** — 告诉 AI，例如 *"帮我在 issue 587 开个 worktree 做 loan migration"*。AI 调用 `worktree` 工具（`add`），创建 `feat/587-loan-migration-data-repair` 于 `../wt/587-loan-migration-data-repair/`（基分支 = 当天 `release/YYYYMMDD` 或 `HEAD`）。
- **删除 / 列出** — 让 AI 用 `worktree` 工具执行即可。

> 注意：`env/db` 等被 `.gitignore` 忽略的内容不会自动带入新 worktree——需要手动复制（如 `cp -r env/db ../wt/<name>/env/db`）。

## 🔒 说明

- 插件绝不会把 worktree 注册为 DSH 工作区，也不会提供独立管理页面。
- 绑定 worktree 的会话在侧边栏仍归属主工作区；只有它的模型提示词是 worktree 感知的。
- UI 文案为简体中文；逻辑本身与语言无关。

## 📦 文件结构

```
src/host.js     Host 半段 — worktree 模型工具 + 会话绑定 + 提示词注入
src/client.js   Client 半段 — 输入区 dock worktree 选择器
```

## 许可证

[MIT](LICENSE)
