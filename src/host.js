/**
 * Host half of the dsh-plugin-worktree-manager plugin (v3).
 *
 * Design (Codex-style): a worktree is NOT a separate DSH workspace. Sessions
 * stay in the main workspace; each session can be *bound* to one worktree,
 * which marks that choice into the model's prompt for that session only
 * (the plugin host half is a per-session instance, so the systemPrompt
 * context contribution below affects only this session's assemblies).
 *
 * Capabilities:
 *   - model Tool `worktree` (harness.defineTool/registerTool):
 *       list / add / remove / use  — the AGENT manages worktrees, the user
 *       just says "帮我开个 worktree 587 xxx".
 *   - RPC wt.dock  -> input-dock picker data (worktrees + current binding)
 *   - RPC wt.bind / wt.unbind -> bind this session to a worktree / main
 *
 * Conventions (aligned with AGENTS.md): branch `feat/<issue>-<name>`,
 * directory `../wt/<issue>-<name>`, base branch = today's release/YYYYMMDD
 * or HEAD. Load into `code.host` of a dynamic Cordis Package.
 */
return {
  apply(ctx) {
    const shell = ctx.get('shell')
    if (shell === undefined) return

    // Per-session plugin instance: this binding marks ONLY this session's
    // worktree choice (main branch / a specific worktree).
    let bound = null

    const shq = (value) => "'" + String(value).replace(/'/g, "'\\''") + "'"

    async function baseDirOf(args) {
      if (args && typeof args.basePath === 'string' && args.basePath.trim() !== '') {
        return args.basePath.trim()
      }
      const registry = ctx.get('workspaceRegistry')
      if (registry === undefined) return null
      let list = []
      try { list = registry.list() } catch (e) { return null }
      if (list.length === 0) return null
      const agents = ctx.get('agents')
      let sessionId = null
      try {
        const initiator = agents && agents.currentInitiator ? agents.currentInitiator() : undefined
        if (initiator && initiator.session && initiator.session.id) sessionId = initiator.session.id
      } catch (e) {}
      if (sessionId) {
        const found = list.find((w) => w.sessionIds && w.sessionIds.includes(sessionId))
        if (found) return found.path
      }
      return list[0].path
    }

    async function runGit(workdir, args) {
      const spec = shell.resolve({
        command: 'git ' + args.map(shq).join(' '),
        workdir,
        timeoutMs: 30000,
        stdoutMaxBytes: 1024 * 1024,
      })
      const result = await shell.run(spec)
      const stdout = (result.stdout && result.stdout.text) || ''
      const stderr = (result.stderr && result.stderr.text) || ''
      if (result.exitCode !== 0) {
        const msg = (stderr || stdout).trim()
        return { ok: false, message: msg || ('git exited with ' + String(result.exitCode)) }
      }
      return { ok: true, stdout }
    }

    // git worktree list --porcelain parser.
    function parsePorcelain(text, basePath) {
      const entries = []
      let current = null
      for (const line of text.split('\n')) {
        if (line.trim() === '') { current = null; continue }
        if (line.startsWith('worktree ')) {
          const path = line.slice('worktree '.length).trim()
          current = { path, branch: null, head: null, locked: false, prunable: false, main: path === basePath }
          entries.push(current)
        } else if (current) {
          if (line.startsWith('HEAD ')) current.head = line.slice(5).trim()
          else if (line.startsWith('branch refs/heads/')) current.branch = line.slice('branch refs/heads/'.length).trim()
          else if (line.trim() === 'locked') current.locked = true
          else if (line.trim() === 'prunable') current.prunable = true
        }
      }
      return entries
    }

    const todayRelease = () => {
      const d = new Date()
      const y = String(d.getFullYear())
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return 'release/' + y + m + day
    }

    async function listWorktrees(base) {
      const res = await runGit(base, ['-C', base, 'worktree', 'list', '--porcelain'])
      if (!res.ok) return { ok: false, message: res.message }
      return { ok: true, worktrees: parsePorcelain(res.stdout, base) }
    }

    // ---- Mark this session's worktree choice into the model prompt.
    // Because the plugin host half is a per-session instance, this context
    // contribution affects ONLY this session's assemblies.
    const systemPrompt = ctx.get('systemPrompt')
    if (systemPrompt !== undefined) {
      ctx.effect(() => systemPrompt.context({
        name: 'worktree:session',
        order: 90,
        text: () => {
          if (bound === null) return ''
          const label = bound.path.split('/').filter(Boolean).slice(-1)[0] || bound.path
          return '本会话的工作目录已绑定到 git worktree「' + label + '」：\n' +
            '- 绝对路径：' + bound.path + '\n' +
            '- 分支：' + (bound.branch || 'detached') + '\n' +
            '本会话所有文件操作、git 命令应基于该 worktree 目录进行（bash 使用 workdir 或 cd 到该目录）；会话归属的工作区仍是主仓库，请勿在主仓库直接改动本 worktree 分支相关文件。'
        },
      }), 'worktree: session context')
    }

    // ---- Model tool: I (the agent) manage worktrees.
    // Dynamic plugins MUST register model tools via harness.defineTool +
    // harness.registerTool (ctx.tools.register rejects non-harness tools).
    const wtTool = harness.defineTool({
      name: 'worktree',
      description: '管理当前工作区（主仓库）的 git worktree：列出、创建、删除、绑定当前会话的工作目录。创建遵循约定：分支 feat/<issue>-<name>、目录 ../wt/<issue>-<name>、基分支默认当天 release/YYYYMMDD（不存在则 HEAD）。用户说“开个 worktree / 帮我建 worktree”时使用此工具。',
      parameters: {
        action: {
          type: 'string',
          required: true,
          enum: ['list', 'add', 'remove', 'use'],
          description: 'list=列出所有 worktree；add=新建；remove=删除；use=把当前会话绑定到某个 worktree（之后本会话文件操作都在该目录）。'
        },
        issue: { type: 'string', description: 'add 时可选：issue 号，作为分支/目录前缀，如 587 或 NL-581' },
        name: { type: 'string', description: 'add 时必填：语义名，如 loan-migration-data-repair' },
        baseBranch: { type: 'string', description: 'add 时可选：基分支，默认当天 release/YYYYMMDD 或 HEAD' },
        path: { type: 'string', description: 'remove/use 时的 worktree 绝对路径或相对 ../wt/ 的路径' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args) {
        const base = await baseDirOf({})
        if (!base) return { ok: false, message: '无法确定主仓库目录（没有可用的工作区）' }
        const action = args && args.action
        if (action === 'list' || action === undefined) {
          const res = await listWorktrees(base)
          if (!res.ok) return res
          return { ok: true, basePath: base, worktrees: res.worktrees }
        }
        if (action === 'add') {
          const name = String((args && args.name) || '').trim()
          if (!name) return { ok: false, message: 'add 需要 name（语义名）' }
          if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
            return { ok: false, message: '名称非法：只允许字母、数字、点、横线、下划线，且不能以特殊字符开头' }
          }
          const issue = (args && args.issue !== undefined && args.issue !== null && String(args.issue).trim() !== '')
            ? String(args.issue).trim()
            : null
          if (issue !== null && !/^[A-Za-z0-9-]+$/.test(issue)) {
            return { ok: false, message: 'issue 号非法：只允许字母、数字、横线' }
          }
          const prefix = issue ? issue + '-' : ''
          const branch = 'feat/' + prefix + name
          const wtDir = '../wt/' + prefix + name
          let baseRef = (args && args.baseBranch && String(args.baseBranch).trim() !== '')
            ? String(args.baseBranch).trim()
            : null
          if (!baseRef) {
            const candidate = todayRelease()
            const check = await runGit(base, ['-C', base, 'rev-parse', '--verify', '--quiet', candidate])
            baseRef = check.ok ? candidate : 'HEAD'
          }
          const res = await runGit(base, ['-C', base, 'worktree', 'add', '-b', branch, wtDir, baseRef])
          if (!res.ok) return res
          return { ok: true, branch, path: wtDir, baseRef, message: '已创建 worktree ' + branch + '（' + wtDir + '）' }
        }
        if (action === 'remove') {
          const raw = String((args && args.path) || '').trim()
          if (!raw) return { ok: false, message: 'remove 需要 path' }
          const path = raw.startsWith('/') ? raw : (base + '/../' + raw)
          const force = !!(args && args.force)
          const cmd = ['-C', base, 'worktree', 'remove']
          if (force) cmd.push('--force')
          cmd.push(path)
          const res = await runGit(base, cmd)
          if (!res.ok) return res
          if (bound && bound.path === path) bound = null
          return { ok: true, message: '已移除 worktree ' + path }
        }
        if (action === 'use') {
          const raw = String((args && args.path) || '').trim()
          if (!raw) return { ok: false, message: 'use 需要 path（worktree 路径）' }
          const path = raw.startsWith('/') ? raw : (base + '/../' + raw)
          const res = await listWorktrees(base)
          if (!res.ok) return res
          const found = res.worktrees.find((wt) => wt.path === path)
          if (!found) return { ok: false, message: '未找到该 worktree：' + path + '（先用 list 查看）' }
          bound = { path: found.path, branch: found.branch }
          return { ok: true, bound: { path: found.path, branch: found.branch }, message: '本会话工作目录已绑定 ' + found.path }
        }
        return { ok: false, message: '未知 action：' + String(action) }
      },
    })
    ctx.effect(() => harness.registerTool(ctx, wtTool), 'worktree: model tool')

    // ---- RPC for the input dock (per-session worktree picker).
    harness.handle('wt.dock', async () => {
      const base = await baseDirOf({})
      if (!base) return { ok: false, message: '无法确定主仓库目录（没有可用的工作区）' }
      const res = await listWorktrees(base)
      if (!res.ok) return res
      return { ok: true, basePath: base, worktrees: res.worktrees, bound }
    })

    harness.handle('wt.bind', async (args) => {
      const base = await baseDirOf({})
      if (!base) return { ok: false, message: '无法确定主仓库目录（没有可用的工作区）' }
      const path = String((args && args.path) || '').trim()
      const res = await listWorktrees(base)
      if (!res.ok) return res
      if (!path) {
        bound = null
        return { ok: true, message: '已切回主分支（主目录）' }
      }
      const resolved = path.startsWith('/') ? path : (base + '/../' + path)
      const found = res.worktrees.find((wt) => wt.path === resolved)
      if (!found) return { ok: false, message: '未找到该 worktree：' + path }
      bound = { path: found.path, branch: found.branch }
      return { ok: true, bound: { path: found.path, branch: found.branch }, message: '本会话工作目录已绑定 ' + found.path }
    })

    harness.handle('wt.unbind', async () => {
      bound = null
      return { ok: true, message: '已切回主分支（主目录）' }
    })
  },
}
