/**
 * Client bundle for dsh-plugin-worktree-manager (v9) — hand-written
 * closure-factory format (no build step). Loaded by the web shell as a
 * classic script; it registers itself through window.__ModuleLoader__.load
 * and resolves React from the platform module table.
 *
 * Two contributions:
 *
 *   1. `conversation.input.dock` "worktree-dock" — the per-session start-mode
 *      picker: two inline pills 「新建 worktree」(default) / 「当前分支」 plus
 *      an optional 「已有 worktree」 panel at a blank session; a read-only
 *      badge `⎇ <branch>` once the session is active.
 *
 *   2. `sidebar.workspaces` "worktree-browser" — a full workspace/session
 *      browser that REPLACES the shipped one (single-occupant slot) and adds
 *      a small SECOND LINE under each session title: a blue `⎇ <branch>`
 *      pill for worktree-bound sessions, an amber dashed「待建 worktree」pill
 *      for pending-create ones, and the relative time right-aligned.
 *      Feature parity with the shipped browser for the common surface:
 *      local-title + remote-content session search, view options
 *      (workspace-grouped / flat; manual / updated ordering), add workspace
 *      (directory picker + create), workspace rename/delete, session
 *      rename/archive/fork, per-group new-session, group collapse.
 *      Not ported: drag reordering, subagent status pills, streaming dots.
 *
 * Data channel: same-origin HTTP JSON routes served by this package's host
 * half (GET /wtm/dock, POST /wtm/bind, GET /wtm/markers).
 */
;(function () {
  var PLUGIN_ID = 'dsh-plugin-worktree-manager'

  var CSS = ''
    + '.wtm-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto}'
    + '.wtm-dock-bar{box-sizing:border-box;width:100%;max-width:calc(var(--dsh-composer-card-max-width) - 4*var(--dsh-composer-dock-inset));margin:0 auto;display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:2px 8px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);min-height:26px;position:relative}'
    + '.wtm-dock-label{display:inline-flex;align-items:center;gap:6px;min-width:0}'
    + '.wtm-dock-glyph{font-size:13px;line-height:1}'
    + '.wtm-pill{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill,transparent);color:var(--dsw-alias-label-primary);border-radius:999px;padding:0 10px;font-size:12px;line-height:22px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.wtm-pill:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}'
    + '.wtm-pill:disabled{opacity:.7;cursor:default}'
    + '.wtm-pill.wtm-active{border-color:var(--dsw-alias-state-business-primary,#3b82f6);color:var(--dsw-alias-state-business-primary,#3b82f6)}'
    + '.wtm-badge{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-state-business-primary,#3b82f6);border-radius:999px;padding:0 10px;font-size:12px;line-height:22px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.wtm-lock{font-size:11px;color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;gap:4px}'
    + '.wtm-panel{position:absolute;top:calc(100% + 4px);left:0;z-index:1200;min-width:240px;max-width:380px;background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.16);padding:6px;max-height:280px;overflow:auto;pointer-events:auto}'
    + '.wtm-item{display:flex;align-items:center;gap:8px;cursor:pointer;border-radius:6px;padding:6px 8px;font-size:13px;line-height:18px;min-width:0}'
    + '.wtm-item:hover{background:var(--dsw-alias-interactive-bg-hover)}'
    + '.wtm-item.wtm-active{color:var(--dsw-alias-state-business-primary,#3b82f6)}'
    + '.wtm-item b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.wtm-item span{color:var(--dsw-alias-label-tertiary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.wtm-panel-head{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:4px 8px 2px}'
    + '.wtm-notice{color:var(--dsw-alias-state-success-primary);font-size:11px}'
    /* ---- sidebar browser ---- */
    + '.wtm-list{padding:4px 6px 10px;display:flex;flex-direction:column;gap:2px}'
    + '.wtm-list.dragging,.wtm-list.dragging *{cursor:grabbing!important}'
    + '.wtm-row.dragging{opacity:.4}'
    + '.wtm-row.drop-above{box-shadow:0 -2px 0 0 var(--dsw-alias-state-business-primary,#3b82f6)}'
    + '.wtm-row.drop-below{box-shadow:0 2px 0 0 var(--dsw-alias-state-business-primary,#3b82f6)}'
    + '.wtm-group-head.drop-above{box-shadow:0 -2px 0 0 var(--dsw-alias-state-business-primary,#3b82f6)}'
    + '.wtm-group-head.drop-below{box-shadow:0 2px 0 0 var(--dsw-alias-state-business-primary,#3b82f6)}'
    + '.wtm-row[draggable="true"]{cursor:grab}'
    + '.wtm-group-head.grabbable{cursor:grab}'
    + '.wtm-toolbar{display:flex;align-items:center;gap:4px;padding:6px 8px 4px}'
    + '.wtm-tbtn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill,transparent);color:var(--dsw-alias-label-secondary);border-radius:8px;height:26px;min-width:28px;padding:0 7px;font-size:13px;cursor:pointer;line-height:1}'
    + '.wtm-tbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}'
    + '.wtm-tsearch{flex:1;display:flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;height:26px;padding:0 8px}'
    + '.wtm-tsearch input{flex:1;border:none;background:transparent;outline:none;font-size:12px;color:var(--dsw-alias-label-primary);min-width:0}'
    + '.wtm-tsearch input::placeholder{color:var(--dsw-alias-label-tertiary)}'
    + '.wtm-group-head{display:flex;align-items:center;gap:6px;padding:8px 8px 4px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);user-select:none;cursor:pointer;border-radius:6px}'
    + '.wtm-group-head:hover{background:var(--dsw-alias-interactive-bg-hover)}'
    + '.wtm-count{font-weight:400;font-size:11px;color:var(--dsw-alias-label-tertiary)}'
    + '.wtm-chev{font-size:10px;color:var(--dsw-alias-label-tertiary);transition:transform .15s}'
    + '.wtm-chev.wtm-open{transform:rotate(90deg)}'
    + '.wtm-gact{margin-left:auto;display:inline-flex;gap:2px}'
    + '.wtm-gbtn{border:none;background:none;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1;padding:3px 5px;border-radius:5px;cursor:pointer}'
    + '.wtm-gbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsh-alias-label-primary)}'
    + '.wtm-row{display:block;width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:6px 8px;border-radius:8px;color:var(--dsw-alias-label-primary);position:relative}'
    + '.wtm-row:hover{background:var(--dsw-alias-interactive-bg-hover)}'
    + '.wtm-row.wtm-current{background:var(--dsw-alias-interactive-bg-hover)}'
    + '.wtm-row.wtm-current .wtm-title{color:var(--dsw-alias-state-business-primary,#3b82f6);font-weight:600}'
    + '.wtm-title{font-size:13px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:20px}'
    + '.wtm-sub{display:flex;align-items:center;gap:6px;margin-top:3px;min-height:16px}'
    + '.wtm-branch{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:16px;color:var(--dsw-alias-state-business-primary,#3b82f6);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 8px;max-width:75%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-sizing:border-box}'
    + '.wtm-branch.wtm-pending{color:var(--dsw-alias-state-warning-primary,#d97706);border-style:dashed}'
    + '.wtm-pill-status{display:inline-flex;align-items:center;font-size:10px;line-height:14px;border-radius:999px;padding:0 7px;white-space:nowrap;flex-shrink:0}'
    + '.wtm-pill-status.wtm-ongoing{color:var(--dsw-alias-state-business-primary,#3b82f6);background:rgba(59,130,246,.10)}'
    + '.wtm-pill-status.wtm-warning{color:var(--dsw-alias-state-warning-primary,#d97706);background:rgba(217,119,6,.10)}'
    + '.wtm-pill-status.wtm-sub{color:var(--dsw-alias-state-business-primary,#3b82f6);background:rgba(59,130,246,.10)}'
    + '.wtm-dot{position:absolute;left:2px;top:50%;transform:translateY(-50%);width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#16a34a);pointer-events:none}'
    + '.wtm-row.wtm-hasdot{padding-left:14px}'
    + '.wtm-snippet{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}'
    + '.wtm-time{margin-left:auto;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);flex-shrink:0}'
    + '.wtm-more{position:absolute;right:6px;top:4px;border:none;background:none;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1;padding:4px 5px;border-radius:5px;cursor:pointer;opacity:0}'
    + '.wtm-row:hover .wtm-more,.wtm-row.wtm-current .wtm-more{opacity:1}'
    + '.wtm-more:hover{background:var(--dsw-alias-border-l1,rgba(0,0,0,.08));color:var(--dsw-alias-label-primary)}'
    + '.wtm-menu{position:absolute;right:6px;top:calc(100% - 20px);z-index:1200;min-width:150px;background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:4px;text-align:left}'
    + '.wtm-menu div{padding:6px 10px;font-size:12px;border-radius:5px;cursor:pointer}'
    + '.wtm-menu div:hover{background:var(--dsw-alias-interactive-bg-hover)}'
    + '.wtm-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:4px 10px 8px 26px}'
    + '.wtm-veil{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}'
    + '.wtm-modal{background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-label-primary);border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.24);min-width:300px;max-width:420px;padding:16px}'
    + '.wtm-modal h4{margin:0 0 10px;font-size:14px;font-weight:600}'
    + '.wtm-modal p{margin:0 0 12px;font-size:12px;color:var(--dsw-alias-label-secondary);line-height:18px;word-break:break-all}'
    + '.wtm-modal input{width:100%;box-sizing:border-box;border:1px solid var(--dsh-alias-border-l2);border-radius:8px;height:30px;padding:0 10px;font-size:13px;outline:none;background:transparent;color:var(--dsw-alias-label-primary);margin-bottom:12px}'
    + '.wtm-modal input:focus{border-color:var(--dsw-alias-state-business-primary,#3b82f6)}'
    + '.wtm-mrow{display:flex;justify-content:flex-end;gap:8px}'
    + '.wtm-mbtn{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;height:28px;padding:0 14px;font-size:12px;cursor:pointer}'
    + '.wtm-mbtn:hover{background:var(--dsw-alias-interactive-bg-hover)}'
    + '.wtm-mbtn.wtm-primary{background:var(--dsw-alias-state-business-primary,#3b82f6);border-color:transparent;color:#fff}'
    + '.wtm-mbtn.wtm-primary:hover{opacity:.9}'
    + '.wtm-mbtn.wtm-danger{background:#dc2626;border-color:transparent;color:#fff}'
    + '.wtm-merr{color:var(--dsw-alias-state-danger-primary,#dc2626);font-size:11px;margin:-6px 0 10px}'

  window.__ModuleLoader__.load({
    id: PLUGIN_ID,
    factory: function (require) {
      var React = require('react')
      var h = React.createElement

      function shortBranch(branch) {
        if (!branch) return 'detached'
        return String(branch).replace(/^(feat|fix|chore|docs|refactor|release|hotfix)\//, '')
      }

      function getJson(url) {
        return fetch(url).then(function (r) { return r.json() })
      }

      function postJson(url, body) {
        return fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }).then(function (r) { return r.json() })
      }

      function relTime(ts) {
        if (!ts) return ''
        var diff = Date.now() - ts
        if (diff < 60000) return '刚刚'
        if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
        if (diff < 86400000) return Math.floor(diff / 86400000) + ' 天前'
        return Math.floor(diff / 86400000) + ' 天前'
      }

      // Subagent descendant aggregation (client-side mirror of the shipped
      // indexSubagentDescendants): count/runcount per ancestor over
      // uninterrupted subagent-origin lineage.
      function subagentLineage(byId) {
        var indexed = {}
        var ids = Object.keys(byId)
        for (var i = 0; i < ids.length; i++) {
          var d = byId[ids[i]]
          if (!d || d.origin !== 'subagent') continue
          var seen = {}
          var cur = d
          while (cur && cur.origin === 'subagent' && cur.parentId !== undefined && !seen[cur.id]) {
            seen[cur.id] = true
            var agg = indexed[cur.parentId]
            if (!agg) indexed[cur.parentId] = { count: 1, runningCount: d.running ? 1 : 0 }
            else { agg.count += 1; if (d.running) agg.runningCount += 1 }
            cur = byId[cur.parentId]
          }
        }
        return indexed
      }

      // Status pills for the second line: pending interaction (warning) >
      // running (blue) > running subagents (blue count); green completion dot
      // renders separately on the row edge.
      function statusPills(s, lineage) {
        var pills = []
        if (s.pendingInteraction === 'approval') pills.push('待审批')
        else if (s.pendingInteraction === 'plan-review') pills.push('待方案确认')
        else if (s.pendingInteraction === 'question') pills.push('待答复')
        else if (s.running) pills.push('运行中')
        var agg = lineage[s.id]
        if (agg && agg.runningCount > 0) pills.push('子代理 ×' + agg.runningCount)
        return pills
      }

      // ---- Dock: per-session start-mode picker (blank) / badge (active).
      function WorktreeDock(props) {
        var sessionId = props.sessionId
        var useSession = props.useSession
        var listState = React.useState(null)
        var list = listState[0]; var setList = listState[1]
        var currentState = React.useState({ mode: 'create' })
        var current = currentState[0]; var setCurrent = currentState[1]
        var busyState = React.useState(false)
        var busy = busyState[0]; var setBusy = busyState[1]
        var noticeState = React.useState('')
        var notice = noticeState[0]; var setNotice = noticeState[1]
        var openState = React.useState(false)
        var open = openState[0]; var setOpen = openState[1]

        var phase = 'blank'
        try {
          phase = useSession ? useSession(function (s) { return s.composerPhase }) : 'blank'
        } catch (e) {}
        var locked = phase === 'active'

        var load = function () {
          getJson('/wtm/dock?session=' + encodeURIComponent(sessionId || '')).then(function (res) {
            if (res && res.ok) {
              setList(res.worktrees || [])
              setCurrent(res.bound || { mode: res.defaultMode || 'create' })
            }
          }).catch(function () {})
        }

        React.useEffect(function () {
          load()
        }, [sessionId])

        var pick = function (mode, path) {
          setBusy(true); setNotice(''); setOpen(false)
          postJson('/wtm/bind', { sessionId: sessionId, mode: mode, path: path }).then(function (res) {
            setBusy(false)
            if (res && res.ok) {
              setNotice(res.message || '已切换')
              load()
            } else {
              setNotice((res && res.message) || '切换失败')
            }
          }).catch(function (e) {
            setBusy(false)
            setNotice('切换失败')
          })
        }

        var isCreate = current && current.mode === 'create'
        var isMain = current && current.mode === 'main'
        var isWorktree = current && current.path
        var existing = (list || []).filter(function (wt) { return !wt.main })

        if (locked) {
          var text = isCreate ? '新建 worktree'
            : isMain ? '当前分支（主目录）'
            : shortBranch(current ? current.branch : null)
          return h('div', { className: 'wtm-dock' }, h('div', { className: 'wtm-dock-bar' }, [
            h('span', { key: 'g', className: 'wtm-dock-glyph' }, '⎇'),
            h('span', { key: 'l', className: 'wtm-dock-label' }, '会话分支:'),
            h('span', { key: 'b', className: 'wtm-badge', title: isWorktree ? current.path : '' },
              isWorktree ? shortBranch(current.branch) : text),
            h('span', { key: 'lock', className: 'wtm-lock' }, '🔒'),
          ]))
        }

        var pills = [
          h('button', {
            key: 'create',
            type: 'button',
            className: 'wtm-pill' + (isCreate ? ' wtm-active' : ''),
            disabled: busy,
            onClick: function () { pick('create') },
          }, '新建 worktree'),
          h('button', {
            key: 'main',
            type: 'button',
            className: 'wtm-pill' + (isMain ? ' wtm-active' : ''),
            disabled: busy,
            onClick: function () { pick('main') },
          }, '当前分支'),
        ]
        if (existing.length > 0) {
          pills.push(h('button', {
            key: 'existing',
            type: 'button',
            className: 'wtm-pill' + (isWorktree ? ' wtm-active' : ''),
            disabled: busy,
            onClick: function () { setOpen(function (o) { return !o }) },
          }, '已有 worktree (' + existing.length + ')'))
        }

        var panel = null
        if (open && existing.length > 0) {
          panel = h('div', { key: 'm', className: 'wtm-panel' },
            [h('div', { key: 'h', className: 'wtm-panel-head' }, '选择一个已有 worktree 开始')].concat(
              existing.map(function (wt) {
                var parts = wt.path.split('/').filter(Boolean)
                var namePart = parts[parts.length - 1] || wt.path
                var active = isWorktree && current.path === wt.path
                return h('div', {
                  key: wt.path,
                  className: 'wtm-item' + (active ? ' wtm-active' : ''),
                  onClick: function () { pick('worktree', wt.path) },
                }, [
                  h('b', { key: 'b' }, namePart),
                  h('span', { key: 's' }, shortBranch(wt.branch)),
                ])
              }),
            ))
        }

        return h('div', { className: 'wtm-dock' }, h('div', { className: 'wtm-dock-bar' }, [
          h('span', { key: 'g', className: 'wtm-dock-glyph' }, '⎇'),
          h('span', { key: 'l', className: 'wtm-dock-label' }, '会话工作目录:'),
        ].concat(pills).concat([
          notice ? h('span', { key: 'n', className: 'wtm-notice' }, notice) : null,
          panel,
        ])))
      }

      return {
        name: PLUGIN_ID,
        inject: ['slots', 'sessions', 'workspaces', 'timer'],
        apply: function (ctx) {
          var styleEl = document.createElement('style')
          styleEl.setAttribute('data-plugin', PLUGIN_ID)
          styleEl.textContent = CSS
          document.head.append(styleEl)

          // ---- Generic small modal (rename / delete confirm / add workspace).
          // onOk returning a promise keeps the modal open and shows the
          // error string on rejection.
          function Modal(props) {
            var title = props.title
            var body = props.body
            var placeholder = props.placeholder
            var initial = props.initial || ''
            var confirmText = props.confirmText || '确定'
            var danger = props.danger
            var onOk = props.onOk
            var onCancel = props.onCancel
            var inputState = React.useState(initial)
            var draft = inputState[0]; var setDraft = inputState[1]
            var errState = React.useState('')
            var err = errState[0]; var setErr = errState[1]
            var busyState = React.useState(false)
            var busy = busyState[0]; var setBusy = busyState[1]

            var ok = function () {
              if (busy) return
              setBusy(true); setErr('')
              Promise.resolve(onOk(draft)).then(function () { onCancel() })
                .catch(function (e) { setErr(String((e && e.message) || e)); setBusy(false) })
            }

            return h('div', {
              className: 'wtm-veil',
              onClick: function (e) { if (e.target === e.currentTarget && !busy) onCancel() },
            }, h('div', { className: 'wtm-modal' }, [
              h('h4', { key: 't' }, title),
              body ? h('p', { key: 'b' }, body) : null,
              placeholder !== undefined ? h('input', {
                key: 'i',
                autoFocus: true,
                placeholder: placeholder,
                value: draft,
                onChange: function (e) { setDraft(e.target.value) },
                onKeyDown: function (e) { if (e.key === 'Enter') ok() },
              }) : null,
              err ? h('div', { key: 'e', className: 'wtm-merr' }, err) : null,
              h('div', { key: 'r', className: 'wtm-mrow' }, [
                h('button', { key: 'c', type: 'button', className: 'wtm-mbtn', onClick: onCancel }, '取消'),
                h('button', {
                  key: 'o',
                  type: 'button',
                  className: 'wtm-mbtn' + (danger ? ' wtm-danger' : ' wtm-primary'),
                  disabled: busy,
                  onClick: ok,
                }, busy ? '…' : confirmText),
              ]),
            ]))
          }

          // ---- Sidebar: full workspace/session browser with badges.
          function WorktreeBrowser(props) {
            var useSessions = props.useSessions
            var useWorkspaces = props.useWorkspaces
            var list = useSessions(function (s) { return s })
            var wsState = useWorkspaces(function (s) { return s })
            var workspaces = wsState.items || []
            var archived = wsState.archivedSessionIds || []

            var markersState = React.useState({})
            var markers = markersState[0]; var setMarkers = markersState[1]
            var collapsedState = React.useState({})
            var collapsed = collapsedState[0]; var setCollapsed = collapsedState[1]
            var queryState = React.useState('')
            var query = queryState[0]; var setQuery = queryState[1]
            var remoteState = React.useState({ loading: false, items: [] })
            var remote = remoteState[0]; var setRemote = remoteState[1]
            var viewState = React.useState({ groupBy: 'workspace', orderBy: 'manual' })
            var view = viewState[0]; var setView = viewState[1]
            var menuForState = React.useState(null)
            var menuFor = menuForState[0]; var setMenuFor = menuForState[1]
            var modalState = React.useState(null)
            var modal = modalState[0]; var setModal = modalState[1]

            // ---- Drag state: { id, over:{id,edge} } for sessions;
            // { id } for workspaces (drop between group headers).
            var dragState = React.useState(null)
            var drag = dragState[0]; var setDrag = dragState[1]
            var wsDragState = React.useState(null)
            var wsDrag = wsDragState[0]; var setWsDrag = wsDragState[1]
            var wsOverState = React.useState(null) // { id, edge }
            var wsOver = wsOverState[0]; var setWsOver = wsOverState[1]

            // Commit a session drag: move `drag.id` before/after `target` in
            // the target's workspace via insertSessionBefore.
            var commitSessionDrag = function (d, target, byIdMap, wsList) {
              var targetWs = wsList.find(function (w) { return (w.sessionIds || []).indexOf(target.id) !== -1 })
              if (!targetWs) return
              var ids = (targetWs.sessionIds || []).slice()
              var from = ids.indexOf(d.id)
              var ti = ids.indexOf(target.id)
              var beforeId
              if (d.over && d.over.edge === 'above') {
                beforeId = target.id
              } else {
                beforeId = ti >= 0 && ti + 1 < ids.length ? ids[ti + 1] : undefined
              }
              if (from !== -1 && beforeId === d.id) return
              if (from !== -1 && ti >= 0 && from === ti + 1 && d.over && d.over.edge === 'below') return
              ctx.workspaces.insertSessionBefore(targetWs.workspaceId, d.id, beforeId).catch(function () {})
            }

            var loadMarkers = function () {
              getJson('/wtm/markers').then(function (res) {
                if (res && res.ok) {
                  var map = {}
                  var arr = res.bindings || []
                  for (var i = 0; i < arr.length; i++) map[arr[i].sessionId] = arr[i]
                  setMarkers(map)
                }
              }).catch(function () {})
            }

            React.useEffect(function () {
              loadMarkers()
              return ctx.interval(loadMarkers, 6000)
            }, [])

            // Debounced remote content search (400ms after the last key).
            React.useEffect(function () {
              var q = query.trim()
              if (q.length < 2) { setRemote({ loading: false, items: [] }); return undefined }
              setRemote(function (r) { return { loading: true, items: r.items } })
              var signal = (typeof AbortController !== 'undefined') ? new AbortController() : undefined
              var dispose = ctx.timeout(function () {
                ctx.sessions.search(q, signal ? signal.signal : undefined).then(function (result) {
                  if (result && result.ok) setRemote({ loading: false, items: result.value.items || [] })
                  else setRemote({ loading: false, items: [] })
                }).catch(function () { setRemote({ loading: false, items: [] }) })
              }, 400)
              return function () { dispose(); if (signal) signal.abort() }
            }, [query])

            var byId = list.byId || {}
            var currentId = list.current
            var hidden = {}
            for (var ai = 0; ai < archived.length; ai++) hidden[archived[ai]] = true
            var lineage = subagentLineage(byId)

            var renderRow = function (s, snippet) {
              var marker = markers[s.id]
              var isCreate = marker && marker.mode === 'create'
              var isBound = marker && marker.path
              var badge = null
              if (isBound) {
                badge = h('span', { key: 'b', className: 'wtm-branch', title: marker.path },
                  '⎇ ' + shortBranch(marker.branch))
              } else if (isCreate) {
                badge = h('span', { key: 'b', className: 'wtm-branch wtm-pending', title: '将由 AI 按项目 AGENTS.md 创建' }, '待建 worktree')
              }
              // Status pills: pending interaction / running / subagent count.
              var pills = statusPills(s, lineage)
              var pillEls = pills.map(function (p, i) {
                var warn = p === '待审批' || p === '待方案确认' || p === '待答复'
                return h('span', { key: 'sp' + i, className: 'wtm-pill-status ' + (warn ? 'wtm-warning' : 'wtm-ongoing') }, p)
              })
              var done = s.completed === true && s.id !== currentId
              var dragCls = drag && drag.id === s.id ? ' dragging' : ''
              var dropCls = drag && drag.over && drag.over.id === s.id
                ? (drag.over.edge === 'above' ? ' drop-above' : ' drop-below') : ''
              return h('div', { key: s.id, style: { position: 'relative' } }, [
                done ? h('span', { key: 'dot', className: 'wtm-dot', title: '已完成，尚未查看' }) : null,
                h('button', {
                  key: 'row',
                  type: 'button',
                  draggable: view.groupBy === 'workspace' && view.orderBy === 'manual',
                  className: 'wtm-row' + (s.id === currentId ? ' wtm-current' : '') + (done ? ' wtm-hasdot' : '') + dragCls + dropCls,
                  onClick: function () { try { ctx.sessions.open(s.id) } catch (e) {} },
                  onDragStart: function (e) {
                    if (!(view.groupBy === 'workspace' && view.orderBy === 'manual')) return
                    e.dataTransfer.effectAllowed = 'move'
                    try { e.dataTransfer.setData('text/plain', s.id) } catch (err) {}
                    setDrag({ id: s.id, over: null })
                  },
                  onDragEnd: function () { setDrag(null) },
                  onDragOver: function (e) {
                    if (!drag || drag.id === s.id) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    var rect = e.currentTarget.getBoundingClientRect()
                    var edge = (e.clientY - rect.top) < rect.height / 2 ? 'above' : 'below'
                    if (!drag.over || drag.over.id !== s.id || drag.over.edge !== edge) {
                      setDrag(function (d) { return d ? { id: d.id, over: { id: s.id, edge: edge } } : d })
                    }
                  },
                  onDrop: function (e) {
                    e.preventDefault()
                    if (!drag || !drag.over || drag.over.id !== s.id || drag.id === s.id) return
                    e.stopPropagation()
                    commitSessionDrag(drag, s, byId, workspaces)
                    setDrag(null)
                  },
                }, [
                  h('div', { key: 't', className: 'wtm-title' }, s.displayTitle || s.title || s.id),
                  h('div', { key: 's', className: 'wtm-sub' }, [
                    badge,
                    pillEls.length > 0 ? pillEls : null,
                    snippet ? h('span', { key: 'sn', className: 'wtm-snippet' }, snippet) : null,
                    h('span', { key: 'time', className: 'wtm-time' }, relTime(s.updatedAt)),
                  ]),
                ]),
                h('button', {
                  key: 'more',
                  type: 'button',
                  className: 'wtm-more',
                  title: '更多操作',
                  onClick: function (e) {
                    e.stopPropagation()
                    setMenuFor(menuFor === s.id ? null : s.id)
                  },
                }, '⋯'),
                menuFor === s.id ? h('div', { key: 'menu', className: 'wtm-menu' }, [
                  h('div', {
                    key: 'r',
                    onClick: function () {
                      setMenuFor(null)
                      setModal({ kind: 'session-rename', sessionId: s.id, title: s.displayTitle || s.title || '' })
                    },
                  }, '重命名会话'),
                  h('div', {
                    key: 'f',
                    onClick: function () {
                      setMenuFor(null)
                      ctx.sessions.fork({ sessionId: s.id, increaseTitle: true })
                        .then(function (childId) { ctx.sessions.open(childId) })
                        .catch(function () {})
                    },
                  }, '复制会话 (fork)'),
                  h('div', {
                    key: 'a',
                    onClick: function () {
                      setMenuFor(null)
                      ctx.workspaces.archiveSession(s.id).catch(function () {})
                    },
                  }, '归档会话'),
                ]) : null,
              ])
            }

            // ---- Search mode: local title matches + remote content hits.
            var q = query.trim().toLowerCase()
            if (q.length >= 1) {
              var localHits = (list.ids || []).filter(function (id) {
                var s = byId[id]
                if (!s || hidden[id]) return false
                var title = (s.displayTitle || s.title || id).toLowerCase()
                return title.indexOf(q) !== -1
              }).map(function (id) { return renderRow(byId[id], null) })
              var seenLocal = {}
              ;(list.ids || []).forEach(function (id) { seenLocal[id] = true })
              var remoteHits = (remote.items || []).filter(function (it) { return !seenLocal[it.sessionId] && byId[it.sessionId] })
                .map(function (it) { return renderRow(byId[it.sessionId], it.snippet) })
              return h('div', { className: 'wtm-list' }, [
                h('div', { key: 'tb', className: 'wtm-toolbar' }, [
                  h('div', { key: 's', className: 'wtm-tsearch' }, [
                    h('span', { key: 'i' }, '🔍'),
                    h('input', {
                      key: 'in',
                      autoFocus: true,
                      placeholder: '搜索会话标题与内容…',
                      value: query,
                      onChange: function (e) { setQuery(e.target.value) },
                    }),
                    remote.loading ? h('span', { key: 'ld', style: { fontSize: 11 } }, '…') : null,
                  ]),
                ]),
                h('div', { key: 'lbl', className: 'wtm-panel-head' },
                  '标题匹配 ' + localHits.length + ' · 内容匹配 ' + remoteHits.length),
                localHits.length + remoteHits.length === 0
                  ? h('div', { key: 'e', className: 'wtm-empty' }, '没有匹配的会话')
                  : h('div', { key: 'res' }, localHits.concat(remoteHits)),
              ])
            }

            // ---- Normal mode: grouped or flat, manual or updated order.
            var sessionsOf = function (ids) {
              return ids.map(function (id) { return byId[id] })
                .filter(function (s) { return s && !hidden[s.id] })
            }
            var order = function (arr) {
              var out = arr.slice()
              if (view.orderBy === 'updated') out.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0) })
              return out
            }

            var body
            if (view.groupBy === 'flat') {
              var all = []
              workspaces.forEach(function (w) { all = all.concat(sessionsOf(w.sessionIds || [])) })
              var stray = (list.ids || []).filter(function (id) {
                var inWs = workspaces.some(function (w) { return (w.sessionIds || []).indexOf(id) !== -1 })
                return !inWs && byId[id] && !hidden[id]
              }).map(function (id) { return byId[id] })
              body = order(all.concat(stray)).map(function (s) { return renderRow(s, null) })
            } else {
              var groups = workspaces.map(function (w) {
                return { key: w.workspaceId, title: w.title || w.workspaceId, real: true, sessionIds: w.sessionIds || [] }
              })
              var accounted = {}
              groups.forEach(function (g) { g.sessionIds.forEach(function (id) { accounted[id] = true }) })
              var strayIds = (list.ids || []).filter(function (id) { return byId[id] && !accounted[id] && !hidden[id] })
              if (strayIds.length > 0) groups.push({ key: '__stray__', title: '未分组', real: false, sessionIds: strayIds })
              body = groups.map(function (group) {
                var open = !collapsed[group.key]
                var visible = order(sessionsOf(group.sessionIds))
                var wsDropCls = wsDrag && wsOver && wsOver.id === group.key
                  ? (wsOver.edge === 'above' ? ' drop-above' : ' drop-below') : ''
                return h('div', { key: group.key }, [
                  h('div', {
                    key: 'head',
                    className: 'wtm-group-head' + (group.real && wsDrag ? ' grabbable' : '') + wsDropCls,
                    onClick: function () { setCollapsed(function (c) { var n = {}; n[group.key] = !c[group.key]; return n }) },
                    onDragStart: group.real ? function (e) {
                      e.dataTransfer.effectAllowed = 'move'
                      try { e.dataTransfer.setData('text/plain', 'ws:' + group.key) } catch (err) {}
                      setWsDrag({ id: group.key })
                    } : undefined,
                    onDragEnd: group.real ? function () { setWsDrag(null); setWsOver(null) } : undefined,
                    onDragOver: wsDrag && wsDrag.id !== group.key ? function (e) {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      var rect = e.currentTarget.getBoundingClientRect()
                      var edge = (e.clientY - rect.top) < rect.height / 2 ? 'above' : 'below'
                      if (!wsOver || wsOver.id !== group.key || wsOver.edge !== edge) setWsOver({ id: group.key, edge: edge })
                    } : undefined,
                    onDrop: wsDrag && wsOver && wsOver.id === group.key ? function (e) {
                      e.preventDefault()
                      e.stopPropagation()
                      if (wsDrag.id !== group.key) {
                        var wsIds = workspaces.map(function (w) { return w.workspaceId })
                        var ti = wsIds.indexOf(group.key)
                        var beforeId
                        if (wsOver.edge === 'above') beforeId = group.key
                        else beforeId = ti >= 0 && ti + 1 < wsIds.length ? wsIds[ti + 1] : undefined
                        if (beforeId !== wsDrag.id) {
                          ctx.workspaces.insertBefore(wsDrag.id, beforeId).catch(function () {})
                        }
                      }
                      setWsDrag(null); setWsOver(null)
                    } : undefined,
                  }, [
                    h('span', { key: 'c', className: 'wtm-chev' + (open ? ' wtm-open' : '') }, '▶'),
                    h('span', { key: 't' }, group.title),
                    h('span', { key: 'n', className: 'wtm-count' }, String(visible.length)),
                    h('span', { key: 'acts', className: 'wtm-gact' }, [
                      group.real ? h('button', {
                        key: 'rn',
                        type: 'button',
                        className: 'wtm-gbtn',
                        title: '重命名工作区',
                        onClick: function (e) {
                          e.stopPropagation()
                          setModal({ kind: 'ws-rename', workspaceId: group.key, title: group.title })
                        },
                      }, '✎') : null,
                      group.real ? h('button', {
                        key: 'del',
                        type: 'button',
                        className: 'wtm-gbtn',
                        title: '删除工作区（不删磁盘文件）',
                        onClick: function (e) {
                          e.stopPropagation()
                          setModal({ kind: 'ws-delete', workspaceId: group.key, title: group.title })
                        },
                      }, '🗑') : null,
                      h('button', {
                        key: 'new',
                        type: 'button',
                        className: 'wtm-gbtn',
                        title: '在此工作区新建会话',
                        onClick: function (e) {
                          e.stopPropagation()
                          try { ctx.workspaces.startSession(group.real ? group.key : undefined) } catch (err) {}
                        },
                      }, '＋'),
                    ]),
                  ]),
                  open
                    ? (visible.length > 0
                        ? visible.map(function (s) { return renderRow(s, null) })
                        : [h('div', { key: 'empty', className: 'wtm-empty' }, '暂无会话')])
                    : null,
                ])
              })
            }

            var modalEl = null
            if (modal) {
              if (modal.kind === 'ws-rename') {
                modalEl = h(Modal, {
                  key: 'm',
                  title: '重命名工作区',
                  placeholder: '工作区名称',
                  initial: modal.title,
                  onOk: function (draft) {
                    var v = draft.trim()
                    if (!v) throw new Error('名称不能为空')
                    return ctx.workspaces.rename(modal.workspaceId, v)
                  },
                  onCancel: function () { setModal(null) },
                })
              } else if (modal.kind === 'ws-delete') {
                modalEl = h(Modal, {
                  key: 'm',
                  title: '删除工作区',
                  body: '确定删除工作区「' + modal.title + '」吗？会话记录保留在磁盘，仅从列表移除。',
                  confirmText: '删除',
                  danger: true,
                  onOk: function () { return ctx.workspaces.delete(modal.workspaceId) },
                  onCancel: function () { setModal(null) },
                })
              } else if (modal.kind === 'session-rename') {
                modalEl = h(Modal, {
                  key: 'm',
                  title: '重命名会话',
                  placeholder: '会话标题',
                  initial: modal.title,
                  onOk: function (draft) {
                    var v = draft.trim()
                    if (!v) throw new Error('标题不能为空')
                    var binding = ctx.sessions.binding(modal.sessionId)
                    if (!binding) throw new Error('会话不存在')
                    return binding.session.rename(v).then(function (r) {
                      if (!r || !r.ok) throw new Error((r && r.error && r.error.message) || '重命名失败')
                    })
                  },
                  onCancel: function () { setModal(null) },
                })
              } else if (modal.kind === 'ws-add') {
                modalEl = h(Modal, {
                  key: 'm',
                  title: '添加工作区',
                  placeholder: '/绝对/路径/到/项目',
                  confirmText: '选择目录…',
                  onOk: function () {
                    return ctx.workspaces.pickDirectory().then(function (p) {
                      if (!p) return undefined // picker cancelled: close silently
                      return ctx.workspaces.create({ path: p })
                    }).then(function () { setModal(null) })
                  },
                  onCancel: function () { setModal(null) },
                })
              }
            }

            return h('div', { className: 'wtm-list' + (drag || wsDrag ? ' dragging' : '') }, [
              h('div', { key: 'tb', className: 'wtm-toolbar' }, [
                h('div', { key: 's', className: 'wtm-tsearch' }, [
                  h('span', { key: 'i' }, '🔍'),
                  h('input', {
                    key: 'in',
                    placeholder: '搜索会话…',
                    value: query,
                    onChange: function (e) { setQuery(e.target.value) },
                  }),
                ]),
                h('button', {
                  key: 'vo',
                  type: 'button',
                  className: 'wtm-tbtn',
                  title: '视图选项',
                  onClick: function () {
                    setView(function (v) {
                      if (v.groupBy === 'workspace') return { groupBy: 'flat', orderBy: v.orderBy }
                      if (v.orderBy === 'manual') return { groupBy: 'flat', orderBy: 'updated' }
                      return { groupBy: 'workspace', orderBy: 'manual' }
                    })
                  },
                }, view.groupBy === 'workspace'
                  ? (view.orderBy === 'manual' ? '▤ 手动' : '▤ 按更新')
                  : '☰ 扁平'),
                h('button', {
                  key: 'add',
                  type: 'button',
                  className: 'wtm-tbtn',
                  title: '添加工作区',
                  onClick: function () { setModal({ kind: 'ws-add' }) },
                }, '＋'),
              ]),
              body,
              modalEl,
            ])
          }

          ctx.effect(function () {
            return ctx.slots.inject('sidebar.workspaces', function () {
              return ctx.slots.register(
                // Single slot: shadow the shipped occupant (priority 0) by
                // registering lower — lowest priority renders.
                { name: 'sidebar.workspaces', priority: -1 },
                function (props) { return h(WorktreeBrowser, props) },
              )
            })
          }, 'worktree: sidebar browser')

          ctx.effect(function () {
            return ctx.slots.inject('conversation.input.dock', function () {
              return ctx.slots.register(
                { name: 'conversation.input.dock', id: 'worktree-dock' },
                function (props) { return h(WorktreeDock, props) },
              )
            })
          }, 'worktree: dock')
        },
      }
    },
  })
})()
