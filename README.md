# dsh-plugin-worktree-manager

> **English** · [中文](README.zh-CN.md)

Manage `git worktree`s of your current DeepSeek Harness workspace — Codex-style. A worktree is **not** a separate workspace: sessions stay in the main workspace, and each session can be *bound* to a worktree (marked into that session's model prompt). Worktree create/remove is owned by the **agent** via a model Tool — no separate management panel.

## ✨ Features

- **Session working-directory dock** — a slim `⎇` row above the composer shows this session's working directory. Click the chip to pick:
  - **当前分支（主目录）** — work directly in the main repo;
  - any **worktree** of the main repo (shown with its branch) — the session's model prompt is then annotated with the worktree path + branch, so all file/git operations in that session happen inside the worktree.
- **Agent-managed worktrees** — a `worktree` model Tool lets the agent (not the user) create / remove / list worktrees:
  - `add` creates branch `feat/<issue>-<name>` and directory `../wt/<issue>-<name>` (sibling of the main repo), based on today's `release/YYYYMMDD` when it exists, else `HEAD`;
  - `use` binds the current session to an existing worktree;
  - `remove` deletes a worktree.
  Just say *"帮我开个 worktree 587 xxx"* and the agent does it.
- **No separate management page** — the old floating panel and sidebar launcher are gone; the dock is the only UI surface.

## 🧩 How it works

| | |
|---|---|
| Host half | Per-session plugin instance. Runs git commands through the DSH `shell` service; registers the model Tool `worktree` (via `harness.defineTool` / `harness.registerTool`), RPC handlers `wt.dock` / `wt.bind` / `wt.unbind`, and a `systemPrompt.context` contribution that annotates this session's prompt with its bound worktree path + branch. |
| Client half | Registers the `conversation.input.dock` worktree-dock picker. Calls the host half via `host.call`. |

Because the host half is a per-session instance, the binding and the prompt annotation affect **only the session that chose it** — the workspace registry is never touched, so the sidebar keeps grouping sessions by the main directory.

## 🚀 Install

1. Open your DeepSeek Harness GUI session.
2. Define a dynamic Cordis plugin:
   - `code.host` ← contents of [`src/host.js`](src/host.js)
   - `code.client` ← contents of [`src/client.js`](src/client.js)
3. Run the package (approve the run in the UI).
4. The `⎇ 会话工作目录` dock appears above the composer.

## 📖 Usage

- **Bind this session to a worktree** — click the dock chip, pick a worktree. The chip turns blue and shows `worktree · branch`; the model prompt for this session now tells the agent to work inside that directory.
- **Back to main** — pick **当前分支（主目录）**.
- **Create a worktree** — tell the agent, e.g. *"帮我在 issue 587 开个 worktree 做 loan migration"*. The agent calls the `worktree` tool (`add`), creating `feat/587-loan-migration-data-repair` at `../wt/587-loan-migration-data-repair/` (base = today's `release/YYYYMMDD` or `HEAD`).
- **Remove / list** — ask the agent; it uses the `worktree` tool.

> Note: `env/db` and other `.gitignore`d content do not travel into a new worktree automatically — copy what you need (e.g. `cp -r env/db ../wt/<name>/env/db`).

## 🔒 Notes

- The plugin never registers worktrees as DSH workspaces and never creates a separate management page.
- A session bound to a worktree still belongs to the main workspace in the sidebar; only its model prompt is worktree-aware.
- UI strings are in Simplified Chinese; the logic is locale-agnostic.

## 📦 Files

```
src/host.js     Host half — worktree model tool + session binding + prompt annotation
src/client.js   Client half — input-dock worktree picker
```

## License

[MIT](LICENSE)
