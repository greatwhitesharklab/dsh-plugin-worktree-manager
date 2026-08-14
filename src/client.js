/**
 * Client (browser) half of the dsh-plugin-worktree-manager plugin.
 *
 * Registers two UI contributions:
 *   - a "Worktrees" launcher button in the sidebar footer action slot
 *   - a floating management panel in the shell overlay slot
 *
 * The panel lists every git worktree of the current workspace (main repo
 * stays the registered workspace — this plugin never touches the workspace
 * registry), and supports create / remove / prune through the Host RPC
 * handlers declared in src/host.js.
 *
 * Load this file's body into `code.client` of a dynamic Cordis Package
 * (cordis_define), or copy it into a Cordis plugin client entry.
 * Plain JavaScript only: React.createElement, no JSX/TS/import.
 */
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    // ---- tiny module-level store shared by launcher + panel ----
    const state = { open: false, worktrees: [], basePath: '', loading: false, error: '', busy: false, notice: '' }
    const subs = new Set()
    const notify = () => { for (const fn of Array.from(subs)) fn() }
    const store = {
      get: () => Object.assign({}, state),
      patch(patch) { Object.assign(state, patch); notify() },
      toggle() { state.open = !state.open; notify() },
      subscribe(fn) { subs.add(fn); return () => { subs.delete(fn) } },
    }

    function useStore() {
      const [v, setV] = React.useState(store.get())
      React.useEffect(() => store.subscribe(() => setV(store.get())), [])
      return v
    }

    const css = `
.wtm-panel {
  position: fixed; top: 16px; right: 16px; width: 400px; max-height: calc(100vh - 32px);
  display: flex; flex-direction: column; box-sizing: border-box;
  background: var(--dsw-alias-bg-elevated, #fff); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0,0,0,.18); z-index: 1000; pointer-events: auto;
  font-size: 13px; line-height: 20px; overflow: hidden;
}
.wtm-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.wtm-title { font-weight: 600; flex: 1; }
.wtm-sub { color: var(--dsw-alias-label-tertiary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.wtm-btn {
  cursor: pointer; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-button-elevated-fill, transparent);
  color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 2px 8px; font-size: 12px; line-height: 18px;
}
.wtm-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.wtm-btn:disabled { opacity: .5; cursor: default; }
.wtm-close { border: none; background: transparent; cursor: pointer; color: var(--dsw-alias-label-tertiary); font-size: 16px; line-height: 16px; }
.wtm-body { overflow: auto; padding: 8px 12px; flex: 1; }
.wtm-row { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.06)); }
.wtm-row:last-child { border-bottom: none; }
.wtm-row-main { width: 12px; height: 12px; border-radius: 50%; flex: none; background: var(--dsw-alias-state-success-primary, #22c55e); }
.wtm-row-main.wtm-dot-wt { background: var(--dsw-alias-state-business-primary, #3b82f6); }
.wtm-name { flex: 1; min-width: 0; }
.wtm-name b { font-weight: 600; font-size: 13px; }
.wtm-branch { color: var(--dsw-alias-label-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wtm-badge { font-size: 11px; border-radius: 4px; padding: 0 5px; flex: none; }
.wtm-badge-locked { background: rgba(234,179,8,.18); color: #b45309; }
.wtm-badge-prunable { background: rgba(239,68,68,.15); color: #dc2626; }
.wtm-form { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--dsw-alias-border-l2); }
.wtm-form-row { display: flex; gap: 6px; }
.wtm-input {
  flex: 1; min-width: 0; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-button-elevated-fill, transparent);
  color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 3px 8px; font-size: 12px; line-height: 18px;
}
.wtm-hint { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; }
.wtm-err { color: var(--dsw-alias-state-error-primary, #dc2626); font-size: 12px; padding: 4px 12px 0; }
.wtm-ok { color: var(--dsw-alias-state-success-primary, #16a34a); font-size: 12px; padding: 4px 12px 0; }
.wtm-empty { color: var(--dsw-alias-label-tertiary); padding: 12px 4px; text-align: center; }
`
    styles.insert(css)

    async function call(method, args) {
      try {
        return await host.call(method, args || {})
      } catch (e) {
        return { ok: false, message: String((e && e.message) || e) }
      }
    }

    async function refresh(basePath) {
      store.patch({ loading: true, error: '', notice: '' })
      const res = await call('wt.list', { basePath })
      if (res && res.ok) store.patch({ worktrees: res.worktrees || [], basePath: res.basePath || basePath })
      else store.patch({ error: (res && res.message) || '列出 worktree 失败' })
      store.patch({ loading: false })
    }

    // ---- Launcher: sidebar footer action ----
    function Launcher({ wide }) {
      const s = useStore()
      return React.createElement('button', {
        type: 'button',
        className: 'wtm-btn',
        style: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' },
        title: '管理 worktree',
        'aria-label': '管理 worktree',
        onClick: () => store.toggle(),
      }, [
        React.createElement('span', { key: 'i', style: { fontSize: 14, lineHeight: 1 } }, '⎇'),
        wide ? React.createElement('span', { key: 'l' }, 'Worktrees') : null,
      ])
    }

    // ---- Panel: shell overlay ----
    function Panel({ useWorkspaces, useSessions }) {
      const s = useStore()
      const [name, setName] = React.useState('')
      const [issue, setIssue] = React.useState('')
      const [baseBranch, setBaseBranch] = React.useState('')
      const [confirmPath, setConfirmPath] = React.useState('')

      // Resolve the main directory from the current workspace (current session's
      // workspace, else the first one) — pass it explicitly to the Host.
      const basePathRef = React.useRef('')
      try {
        const workspaces = useWorkspaces ? useWorkspaces((st) => st.items) : []
        const current = useSessions ? useSessions((st) => st.current) : undefined
        const found = (workspaces || []).find((w) => w.sessionIds && w.sessionIds.includes(current))
        const resolved = found ? found.path : ((workspaces && workspaces[0]) ? workspaces[0].path : '')
        if (resolved && resolved !== basePathRef.current) basePathRef.current = resolved
      } catch (e) {}

      React.useEffect(() => {
        if (s.open) refresh(basePathRef.current)
      }, [s.open])

      if (!s.open) return null

      const doAdd = async () => {
        store.patch({ busy: true, error: '', notice: '' })
        const res = await call('wt.add', { basePath: basePathRef.current, name, issue: issue || undefined, baseBranch: baseBranch || undefined })
        if (res && res.ok) {
          setName(''); setIssue(''); setBaseBranch('')
          store.patch({ notice: res.message || '已创建' })
          await refresh(basePathRef.current)
        } else {
          store.patch({ error: (res && res.message) || '创建失败' })
        }
        store.patch({ busy: false })
      }

      const doRemove = async (path) => {
        store.patch({ busy: true, error: '', notice: '' })
        const res = await call('wt.remove', { basePath: basePathRef.current, path, force: true })
        if (res && res.ok) {
          setConfirmPath('')
          store.patch({ notice: res.message || '已移除' })
          await refresh(basePathRef.current)
        } else {
          store.patch({ error: (res && res.message) || '移除失败' })
        }
        store.patch({ busy: false })
      }

      const doPrune = async () => {
        store.patch({ busy: true, error: '', notice: '' })
        const res = await call('wt.prune', { basePath: basePathRef.current })
        if (res && res.ok) store.patch({ notice: res.message || '已清理' })
        else store.patch({ error: (res && res.message) || '清理失败' })
        store.patch({ busy: false })
        await refresh(basePathRef.current)
      }

      const rows = (s.worktrees || []).map((wt) => {
        const namePart = wt.path.split('/').filter(Boolean).slice(-1)[0] || wt.path
        const dotClass = wt.main ? 'wtm-row-main' : 'wtm-row-main wtm-dot-wt'
        const badges = []
        if (wt.locked) badges.push(React.createElement('span', { key: 'l', className: 'wtm-badge wtm-badge-locked' }, 'locked'))
        if (wt.prunable) badges.push(React.createElement('span', { key: 'p', className: 'wtm-badge wtm-badge-prunable' }, 'prunable'))
        const action = confirmPath === wt.path
          ? React.createElement(React.Fragment, null, [
              React.createElement('span', { key: 'q', style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 } }, '确认?'),
              React.createElement('button', { key: 'y', type: 'button', className: 'wtm-btn', disabled: s.busy, onClick: () => doRemove(wt.path) }, '删除'),
              React.createElement('button', { key: 'n', type: 'button', className: 'wtm-btn', disabled: s.busy, onClick: () => setConfirmPath('') }, '取消'),
            ])
          : React.createElement('button', { type: 'button', className: 'wtm-btn', disabled: s.busy || wt.main, onClick: () => setConfirmPath(wt.path) }, '删除')
        return React.createElement('div', { key: wt.path, className: 'wtm-row' }, [
          React.createElement('span', { key: 'd', className: dotClass }),
          React.createElement('div', { key: 'n', className: 'wtm-name' }, [
            React.createElement('div', { key: 't' }, React.createElement('b', null, namePart)),
            React.createElement('div', { key: 'b', className: 'wtm-branch' }, wt.main ? '(主目录) ' : '', wt.branch ? '分支 ' + wt.branch : 'detached', ' · ' + wt.path),
          ]),
          ...badges,
          action,
        ])
      })

      return React.createElement('div', { className: 'wtm-panel' }, [
        React.createElement('div', { key: 'head', className: 'wtm-head' }, [
          React.createElement('span', { key: 't', className: 'wtm-title' }, 'Worktrees'),
          React.createElement('span', { key: 's', className: 'wtm-sub', title: s.basePath || basePathRef.current }, s.basePath || basePathRef.current || ''),
          React.createElement('button', { key: 'r', type: 'button', className: 'wtm-btn', disabled: s.busy || s.loading, onClick: () => refresh(basePathRef.current) }, '刷新'),
          React.createElement('button', { key: 'p', type: 'button', className: 'wtm-btn', disabled: s.busy, onClick: doPrune }, 'Prune'),
          React.createElement('button', { key: 'x', type: 'button', className: 'wtm-close', 'aria-label': '关闭', onClick: () => store.toggle() }, '×'),
        ]),
        s.error ? React.createElement('div', { key: 'e', className: 'wtm-err' }, s.error) : null,
        s.notice ? React.createElement('div', { key: 'n', className: 'wtm-ok' }, s.notice) : null,
        React.createElement('div', { key: 'body', className: 'wtm-body' }, [
          s.loading ? React.createElement('div', { key: 'l', className: 'wtm-empty' }, '加载中…')
            : (rows.length ? rows : React.createElement('div', { key: 'e', className: 'wtm-empty' }, '没有 worktree（除主目录外）')),
        ]),
        React.createElement('div', { key: 'form', className: 'wtm-form' }, [
          React.createElement('div', { key: 'r1', className: 'wtm-form-row' }, [
            React.createElement('input', { key: 'i', className: 'wtm-input', style: { maxWidth: 90 }, placeholder: 'issue(可选)', value: issue, onChange: (e) => setIssue(e.target.value) }),
            React.createElement('input', { key: 'n', className: 'wtm-input', placeholder: '语义名，如 loan-migration', value: name, onChange: (e) => setName(e.target.value) }),
          ]),
          React.createElement('div', { key: 'r2', className: 'wtm-form-row' }, [
            React.createElement('input', { key: 'b', className: 'wtm-input', placeholder: '基分支(可选，默认当天 release 或 HEAD)', value: baseBranch, onChange: (e) => setBaseBranch(e.target.value) }),
            React.createElement('button', { key: 'a', type: 'button', className: 'wtm-btn', disabled: s.busy || !name.trim(), onClick: doAdd }, '创建'),
          ]),
          React.createElement('div', { key: 'h', className: 'wtm-hint' }, '分支 feat/<issue>-<name>，目录 ../wt/<issue>-<name>，基分支默认 release/当天或 HEAD'),
        ]),
      ])
    }

    slots.inject('sidebar.footer.action', () => slots.register(
      { name: 'sidebar.footer.action', id: 'worktree-manager' },
      (props) => React.createElement(Launcher, props),
    ))
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'worktree-manager-panel' },
      (props) => React.createElement(Panel, props),
    ))
  },
}
