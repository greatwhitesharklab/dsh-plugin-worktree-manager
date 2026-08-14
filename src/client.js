/**
 * Client (browser) half of the dsh-plugin-worktree-manager plugin (v5).
 *
 * No separate management panel anymore. One additive contribution:
 *   - `conversation.input.dock` "worktree-dock": a slim per-session row
 *     above the composer showing this session's working directory
 *     (main branch by default, or a bound worktree). The choice is made
 *     when creating a session; once the session is active the chip is
 *     LOCKED (composerPhase === 'active') so the worktree cannot be
 *     changed mid-conversation. The binding is applied via the Host RPC
 *     wt.bind / wt.unbind.
 *
 * Worktree create/remove is owned by the AGENT via the model Tool
 * `worktree` (see src/host.js) — no manual create form in the UI.
 *
 * Load this file's body into `code.client` of a dynamic Cordis Package
 * (cordis_define), or copy it into a Cordis plugin client entry.
 * Plain JavaScript only: React.createElement, no JSX/TS/import.
 */
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    const css = `
.wtm-dock {
  box-sizing: border-box;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));
  margin: 0 auto;
}
.wtm-dock-bar {
  box-sizing: border-box;
  width: 100%; max-width: calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));
  margin: 0 auto;
  display: flex; align-items: center; gap: 8px;
  padding: 2px 8px; font-size: 12px; line-height: 20px;
  color: var(--dsw-alias-label-secondary); min-height: 26px; position: relative;
}
.wtm-dock-label { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.wtm-dock-glyph { font-size: 13px; line-height: 1; }
.wtm-dock-chip {
  cursor: pointer; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-button-elevated-fill, transparent);
  color: var(--dsw-alias-label-primary); border-radius: 999px; padding: 0 10px; font-size: 12px; line-height: 22px;
  max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wtm-dock-chip:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.wtm-dock-chip:disabled { opacity: .7; cursor: default; }
.wtm-dock-chip.wtm-bound { border-color: var(--dsw-alias-state-business-primary, #3b82f6); color: var(--dsw-alias-state-business-primary, #3b82f6); }
.wtm-lock {
  font-size: 11px; color: var(--dsw-alias-label-tertiary); display: inline-flex; align-items: center; gap: 4px;
}
.wtm-menu {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 1200; min-width: 260px; max-width: 420px;
  background: var(--dsw-alias-bg-elevated, #fff); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,.16);
  padding: 6px; max-height: 320px; overflow: auto; pointer-events: auto;
}
.wtm-menu-item {
  display: flex; align-items: center; gap: 8px; cursor: pointer; border-radius: 6px; padding: 6px 8px;
  font-size: 13px; line-height: 18px; min-width: 0;
}
.wtm-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.wtm-menu-item.wtm-active { color: var(--dsw-alias-state-business-primary, #3b82f6); }
.wtm-menu-item b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wtm-menu-item span { color: var(--dsw-alias-label-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wtm-menu-head { font-size: 11px; color: var(--dsw-alias-label-tertiary); padding: 4px 8px 2px; }
.wtm-menu-hint { font-size: 11px; color: var(--dsw-alias-label-tertiary); padding: 6px 8px 2px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.06)); margin-top: 4px; line-height: 16px; }
`
    styles.insert(css)

    async function call(method, args) {
      try {
        return await host.call(method, args || {})
      } catch (e) {
        return { ok: false, message: String((e && e.message) || e) }
      }
    }

    // sessionId + composerPhase come from the framework (session-scope slot).
    // The chip is LOCKED once the session is active (composerPhase 'active'):
    // a worktree choice is made when creating a session, not mid-conversation.
    function WorktreeDock({ sessionId, useSession }) {
      const [open, setOpen] = React.useState(false)
      const [list, setList] = React.useState(null)
      const [current, setCurrent] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState('')

      let phase = 'blank'
      try {
        phase = useSession ? useSession((s) => s.composerPhase) : 'blank'
      } catch (e) {}
      const locked = phase === 'active'

      const load = async () => {
        const res = await call('wt.dock', { sessionId })
        if (res && res.ok) {
          setList(res.worktrees || [])
          setCurrent(res.bound)
        }
      }

      React.useEffect(() => {
        load()
      }, [sessionId])

      const pick = async (path) => {
        setBusy(true); setNotice('')
        const res = await call(path ? 'wt.bind' : 'wt.unbind', { sessionId, path })
        setBusy(false)
        if (res && res.ok) {
          setOpen(false)
          setNotice(res.message || '已切换')
          await load()
        } else {
          setNotice((res && res.message) || '切换失败')
        }
      }

      const boundName = current ? (current.path.split('/').filter(Boolean).slice(-1)[0] || current.path) : ''
      const rows = []
      rows.push(React.createElement('div', {
        key: '__main__',
        className: 'wtm-menu-item' + (current === null ? ' wtm-active' : ''),
        onClick: () => pick(null),
      }, [
        React.createElement('b', { key: 'b' }, '当前分支（主目录）'),
      ]))
      for (const wt of (list || [])) {
        if (wt.main) continue
        const namePart = wt.path.split('/').filter(Boolean).slice(-1)[0] || wt.path
        const active = current !== null && current.path === wt.path
        rows.push(React.createElement('div', {
          key: wt.path,
          className: 'wtm-menu-item' + (active ? ' wtm-active' : ''),
          onClick: () => pick(wt.path),
        }, [
          React.createElement('b', { key: 'b' }, namePart),
          React.createElement('span', { key: 's' }, wt.branch || 'detached'),
        ]))
      }

      return React.createElement('div', { className: 'wtm-dock' }, React.createElement('div', { className: 'wtm-dock-bar' }, [
        React.createElement('span', { key: 'g', className: 'wtm-dock-glyph' }, '⎇'),
        React.createElement('span', { key: 'l', className: 'wtm-dock-label' }, '会话工作目录:'),
        React.createElement('button', {
          key: 'c',
          type: 'button',
          className: 'wtm-dock-chip' + (current ? ' wtm-bound' : ''),
          disabled: busy || locked,
          title: locked ? '会话进行中，不能更换 worktree' : '选择本会话的工作目录',
          onClick: () => { setOpen((o) => !o); if (!list) load() },
        }, current ? (boundName + (current.branch ? ' · ' + current.branch : '')) : '当前分支（主目录）'),
        locked ? React.createElement('span', { key: 'lock', className: 'wtm-lock' }, '🔒 会话中锁定') : null,
        notice ? React.createElement('span', { key: 'n', style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 11 } }, notice) : null,
        !locked && open ? React.createElement('div', { key: 'm', className: 'wtm-menu' }, [
          React.createElement('div', { key: 'h', className: 'wtm-menu-head' }, '选择本会话的工作目录'),
          ...rows,
          React.createElement('div', { key: 't', className: 'wtm-menu-hint' }, '创建会话时确定；会话开始后锁定。worktree 的新建/删除由 AI 管理。'),
        ]) : null,
      ]))
    }

    slots.inject('conversation.input.dock', () => slots.register(
      { name: 'conversation.input.dock', id: 'worktree-dock' },
      (props) => React.createElement(WorktreeDock, props),
    ))
  },
}
