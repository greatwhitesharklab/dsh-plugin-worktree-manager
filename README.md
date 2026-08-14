# dsh-plugin-worktree-manager

> **English** · [中文](README.zh-CN.md)

Manage `git worktree`s of your current DeepSeek Harness workspace — Codex-style. A worktree is **not** a separate workspace: sessions stay in the main workspace, and each session can be *bound* to a worktree (marked into that session's model prompt). Worktree create/remove is owned by the **agent** via a model Tool.

## ✨ Features

- **New-session start mode** — a slim `⎇ 会话工作目录` row above the composer shows two inline pills at a blank session:
  - **新建 worktree** (default) — the session starts by creating a worktree (per the project `AGENTS.md`: branch/issue/base-branch convention) and working inside it;
  - **当前分支** — work directly in the main repo.
  An optional **已有 worktree** pill lets you start on an existing worktree. No floating dropdown menu.
- **Sidebar with second-line branch badges** — the plugin takes over the workspace/session list (`sidebar.workspaces`): under each session title, a small muted line shows a blue `⎇ <branch>` pill (the conventional `feat/` prefix stripped) for worktree-bound sessions, an amber dashed「待建 worktree」pill for pending-create ones, and the relative time right-aligned. Group headers are collapsible with a ＋ button that starts a new session in that workspace. Bound markers come from `GET /wtm/markers`.
- **Agent-managed worktrees** — a `worktree` model Tool lets the agent (not the user) create / remove / list worktrees:
  - `add` creates branch `feat/<issue>-<name>` and directory `<worktreeRoot>/<issue>-<name>`, based on today's `release/YYYYMMDD` when it exists, else `HEAD`, then binds the calling session;
  - `use` binds the current session to an existing worktree;
  - `remove` deletes a worktree.
  Just say *"帮我开个 worktree 587 xxx"* and the agent does it.

## 🧩 How it works

| | |
|---|---|
| Host plugin | A static Cordis function plugin (`src/index.js`, mounted by your dsh profile). Runs git through the DSH `shell` service; registers the model Tool `worktree` on `ctx.tools`, a `systemPrompt.context` contribution (bound worktree, or the "create a worktree" directive), and three same-origin JSON routes (`GET /wtm/dock`, `POST /wtm/bind`, `GET /wtm/markers`) for the browser client. |
| Client bundle | A hand-written closure-factory bundle (`src/client.bundle.js`, no build step) contributing the `conversation.input.dock` picker and the `sidebar.workspaces` session list with second-line branch badges; React resolves from the platform module table, data comes from the three JSON routes. |

Bindings are per-session in a `Map` keyed by `sessionId` (the host plugin is process-wide), and the workspace registry is never touched, so the sidebar keeps grouping sessions by the main directory.

## ⚙️ Configuration

Edit the `CONFIG` object at the top of [`src/index.js`](src/index.js) and restart `dsh web`:

```js
const CONFIG = {
  worktreeRoot: '../wt',   // where new worktrees are created (relative to the repo, or absolute)
  defaultMode: 'create',   // 'create' (new worktree) or 'main' (current branch)
}
```

## 🚀 Install (profile-mounted, loads on every boot)

1. Add the plugin as a `link:` dependency of your dsh web profile — in `~/.dsh/profiles/web/package.json`:
   ```json
   "dependencies": {
     "dsh-plugin-worktree-manager": "link:/home/fredgu/git_home/dsh-plugin-worktree-manager"
   }
   ```
   then run `pnpm install` in that directory.
2. Append a loader row to `~/.dsh/profiles/web/cordis.patch.yml`:
   ```yaml
   - insert:
       - id: worktree-manager
         name: dsh-plugin-worktree-manager
   ```
3. Restart `dsh web`. The tool, routes, and dock UI load on every boot — no per-session define/run, no approval. The `⎇ 会话工作目录` row appears above the composer at a blank session.

## 📖 Usage

- **Start on a new worktree (default)** — leave the pill on **新建 worktree**; the agent reads `AGENTS.md`, confirms issue/name if needed, then creates and binds the worktree before working.
- **Start on the current branch** — click **当前分支**.
- **Start on an existing worktree** — click **已有 worktree** and pick one.
- **Create / list / remove** — tell the agent, e.g. *"帮我在 issue 587 开个 worktree 做 loan migration"*. It calls the `worktree` tool (`add`), creating `feat/587-loan-migration-data-repair` at `<worktreeRoot>/587-loan-migration-data-repair/`.

> Note: `env/db` and other `.gitignore`d content do not travel into a new worktree automatically — copy what you need (e.g. `cp -r env/db ../wt/<name>/env/db`).

## 🔒 Notes

- The plugin never registers worktrees as DSH workspaces and never creates a separate management page.
- A session bound to a worktree still belongs to the main workspace in the sidebar; only its model prompt and title badge are worktree-aware.
- UI strings are in Simplified Chinese; the logic is locale-agnostic.

## 📦 Files

```
src/index.js          Static host plugin — worktree tool + session binding + prompt annotation + dock routes
src/client.bundle.js  Client bundle (closure-factory) — input-dock worktree picker
```

## License

[MIT](LICENSE)
