# dsh-plugin-worktree-manager

Manage `git worktree`s of your current DeepSeek Harness workspace — right from the DSH sidebar. The workspace stays the main repository; this plugin lists, creates, removes and prunes the worktrees it manages, without touching the workspace registry.

## ✨ Features

- **Sidebar launcher** — a `⎇ Worktrees` button at the bottom of the sidebar (beside Settings).
- **Worktree panel** — a floating panel that lists every worktree of the current workspace:
  - main repo marked with a green dot, worktrees with a blue dot;
  - branch name, path, and `locked` / `prunable` badges;
  - **refresh** and **prune** actions.
- **Create** — type an optional issue id plus a semantic name, and the plugin:
  - creates branch `feat/<issue>-<name>` (or `feat/<name>` without an issue);
  - creates the worktree at `../wt/<issue>-<name>` (sibling of your main repo);
  - bases it on today's `release/YYYYMMDD` when that branch exists, otherwise `HEAD`.
- **Remove** — per-row two-step confirm, runs `git worktree remove --force`.

## 🧩 How it works

| | |
|---|---|
| Host half | Runs git commands through the DSH `shell` service and exposes `wt.list` / `wt.add` / `wt.remove` / `wt.prune` package-private RPC handlers. Resolves the main repo from the workspace registry (current session's workspace). |
| Client half | Registers the sidebar footer action and the shell-overlay panel. Calls the host half via `host.call`. |

The plugin is a **dynamic Cordis plugin**: a host body and a client body, plain JavaScript (no build step).

## 🚀 Install

1. Open your DeepSeek Harness GUI session.
2. Define a dynamic Cordis plugin:
   - `code.host` ← contents of [`src/host.js`](src/host.js)
   - `code.client` ← contents of [`src/client.js`](src/client.js)
3. Run the package (approve the run in the UI).
4. Click **⎇ Worktrees** at the bottom of the sidebar.

## 📖 Usage

- **List** — opening the panel runs `git worktree list --porcelain` in the main repo and parses the result.
- **Create** — issue (optional) + semantic name, e.g. issue `587` and name `loan-migration-data-repair` → branch `feat/587-loan-migration-data-repair`, directory `../wt/587-loan-migration-data-repair/`.
- **Remove** — the main repo row cannot be removed; worktree rows ask for confirmation first.
- **Prune** — `git worktree prune` to drop stale references.

> Note: `env/db` and other `.gitignore`d content do not travel into a new worktree automatically — copy what you need (e.g. `cp -r env/db ../wt/<name>/env/db`).

## 🔒 Notes

- The plugin never registers worktrees as DSH workspaces: your sidebar keeps grouping sessions by the main directory.
- All git operations run in the main repo directory, so a git worktree cannot be created from within another worktree.
- UI strings are in Simplified Chinese; the logic is locale-agnostic.

## 📦 Files

```
src/host.js     Host half — git worktree RPC handlers
src/client.js   Client half — sidebar launcher + management panel
```

## License

[MIT](LICENSE)
