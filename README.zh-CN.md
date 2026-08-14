# dsh-plugin-worktree-manager

> [English](README.md) · **中文**

在你的 DeepSeek Harness 工作区里直接管理 `git worktree`——从 DSH 侧边栏即可操作。工作区始终是主仓库；本插件负责列出、创建、删除和清理它管理下的 worktree，**完全不动工作区注册表**（主目录的分组保持不变）。

## ✨ 功能特性

- **侧边栏入口** — 侧边栏底部（设置按钮旁）新增一个 `⎇ Worktrees` 按钮。
- **Worktree 面板** — 浮动面板列出当前工作区的所有 worktree：
  - 主仓库为绿点、worktree 为蓝点；
  - 展示分支名、路径，以及 `locked` / `prunable` 徽标；
  - 每个 worktree 有**注册**操作（`workspaceRegistry.create`），注册后它会出现在侧边栏「工作区」区域并带上 `在工作区` 徽标；删除 worktree 时自动清理注册；
  - 支持**刷新**和**Prune（清理）**。
- **创建** — 输入可选的 issue 号 + 语义名，插件会自动：
  - 创建分支 `feat/<issue>-<name>`（不带 issue 则为 `feat/<name>`）；
  - 在 `../wt/<issue>-<name>` 创建 worktree（主仓库的同级目录）；
  - 基分支优先取当天的 `release/YYYYMMDD`（若存在），否则回退到 `HEAD`。
- **删除** — 每行两步确认后执行 `git worktree remove --force`。

## 🧩 工作原理

| | |
|---|---|
| Host 半段 | 通过 DSH 的 `shell` 服务执行 git 命令，暴露 `wt.list` / `wt.register` / `wt.add` / `wt.remove` / `wt.prune` 五个包私有 RPC 方法；从工作区注册表（当前会话所属工作区）解析主仓库目录。 |
| Client 半段 | 注册侧边栏底部按钮和 shell-overlay 浮动面板；通过 `host.call` 调用 Host 半段。 |

本插件是**动态 Cordis 插件**：一段 Host 代码 + 一段 Client 代码，纯 JavaScript，无需构建。

## 🚀 安装

1. 打开你的 DeepSeek Harness GUI 会话。
2. 定义一个动态 Cordis 插件：
   - `code.host` ← 内容粘贴自 [`src/host.js`](src/host.js)
   - `code.client` ← 内容粘贴自 [`src/client.js`](src/client.js)
3. 运行该 Package（在界面批准运行）。
4. 点击侧边栏底部的 **⎇ Worktrees**。

## 📖 使用说明

- **列出** — 打开面板即执行主仓库内的 `git worktree list --porcelain` 并解析结果。
- **注册到工作区** — 点击某行「注册」，该 worktree 会出现在侧边栏「工作区」区域（`workspaceRegistry.create`）；注册后显示 `在工作区` 徽标，删除该 worktree 时自动清理注册。
- **创建** — issue（可选）+ 语义名，例如 issue `587`、名称 `loan-migration-data-repair` → 分支 `feat/587-loan-migration-data-repair`、目录 `../wt/587-loan-migration-data-repair/`。
- **删除** — 主仓库行不可删除；worktree 行需先确认。
- **Prune** — 执行 `git worktree prune` 清理失效引用。

> 注意：`env/db` 等被 `.gitignore` 忽略的内容不会自动带入新 worktree——需要手动复制（如 `cp -r env/db ../wt/<name>/env/db`）。

## 🔒 说明

- 插件绝不会自动把 worktree 注册为 DSH 工作区：注册是按需的（每行的「注册」按钮），侧边栏默认仍按主目录对会话分组，只有你主动注册的 worktree 才会出现。
- 所有 git 操作都在主仓库目录内执行，因此不会从某个 worktree 里再开 worktree。
- UI 文案为简体中文；逻辑本身与语言无关。

## 📦 文件结构

```
src/host.js     Host 半段 — git worktree RPC 处理
src/client.js   Client 半段 — 侧边栏入口 + 管理面板
```

## 许可证

[MIT](LICENSE)
