/**
 * Static host plugin: Codex-style worktree binding (v7, profile-mounted).
 *
 * A worktree is NOT a separate DSH workspace. Sessions stay in the main
 * workspace; each session can be *bound* to one worktree, which marks that
 * choice into the model's prompt for that session only.
 *
 * New-session flow: a blank session defaults to "create a worktree"
 * (`CONFIG.defaultMode`); the prompt then directs the agent to create the
 * worktree (per the project AGENTS.md) and bind it before working. The user
 * can instead choose「当前分支（主目录）」to work directly in the main repo.
 *
 * Mounting: this plugin loads once per process (profile loader row), so all
 * bindings live in a Map keyed by sessionId. The client bundle's sidebar
 * session list reads them through GET /wtm/markers and renders a small
 * second-line branch badge under each bound session.
 *
 * Surfaces:
 *   - model Tool `worktree` on `ctx.tools`: list / add / remove / use /
 *     unuse — the AGENT manages worktrees; `add` also binds the calling
 *     session to the new worktree.
 *   - HTTP JSON routes on `ctx.webServer` for the browser client:
 *       GET  /wtm/dock?session=<id>  -> picker data + effective binding
 *       POST /wtm/bind {sessionId, mode, path} -> set the start mode/binding
 *       GET  /wtm/markers -> raw per-session bindings (sidebar badges)
 *
 * Installation: `link:` dependency of the dsh profile plus a loader row in
 * the profile's `cordis.patch.yml`; see README.md.
 */
export const name = 'dsh-plugin-worktree-manager'

export const inject = ['shell', 'tools']

/**
 * Plugin body: register the model tool, the prompt annotation, and the
 * dock/marker HTTP routes.
 * @param ctx - plugin context; `webServer`, `systemPrompt`,
 * `workspaceRegistry`, and `agents` are optional and degrade gracefully.
 */
export function apply(ctx) {
  const CONFIG = {
    // Where new worktrees are created. Relative paths resolve against the
    // main repo; use an absolute path to centralize under one directory.
    worktreeRoot: '../wt',
    // Default start mode for a brand-new session: 'create' (new worktree)
    // or 'main' (current branch directory).
    defaultMode: 'create',
    // HTTP prefix for the dock routes (same origin as the web GUI).
    routePrefix: '/wtm',
  }

  // Per-session bindings. Value shape:
  //   { mode: 'create' }  -> pending: create a worktree per AGENTS.md
  //   { mode: 'main' }    -> work in the main repo (current branch)
  //   { path, branch }    -> bound to an existing worktree
  //   undefined           -> fall back to CONFIG.defaultMode
  const bindings = new Map()

  function effective(binding) {
    if (binding === undefined) return { mode: CONFIG.defaultMode }
    return binding
  }

  // Short branch label for the badge: strip the conventional prefix so the
  // sidebar shows `637-unified-repair-api` instead of
  // `feat/637-unified-repair-api`.
  function shortBranch(branch) {
    if (!branch) return 'detached'
    return String(branch).replace(/^(feat|fix|chore|docs|refactor|release|hotfix)\//, '')
  }

  function worktreePath(prefix, name) {
    const root = CONFIG.worktreeRoot.replace(/\/+$/, '')
    return root + '/' + prefix + name
  }

  async function baseDirOf() {
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

  const shq = (value) => "'" + String(value).replace(/'/g, "'\\''") + "'"

  async function runGit(workdir, args, exec) {
    const request = {
      command: 'git ' + args.map(shq).join(' '),
      workdir,
      timeoutMs: 30000,
      stdoutMaxBytes: 1024 * 1024,
    }
    // Carry the calling session's sandbox policy when we have one (model-tool
    // executions): a direct service call otherwise falls back to the stricter
    // deployment default, which denies git's writes into .git/refs.
    if (exec && exec.agent && exec.agent.session) {
      const policy = ctx.get('sandboxPolicy')
      if (policy !== undefined) {
        try { request.sandboxPolicy = policy.resolve({ session: exec.agent.session }) } catch (e) {}
      }
    }
    const spec = ctx.shell.resolve(request)
    const result = await ctx.shell.run(spec)
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

  // One binding write shared by the HTTP route and the model tool.
  async function setBinding(sessionId, mode, rawPath) {
    const base = await baseDirOf()
    if (!base) return { ok: false, message: '无法确定主仓库目录（没有可用的工作区）' }
    if (mode === 'create') {
      bindings.set(sessionId, { mode: 'create' })
      return { ok: true, bound: { mode: 'create' }, message: '本会话将新建 worktree（由 AI 按项目 AGENTS.md 创建）' }
    }
    if (mode === 'main') {
      bindings.set(sessionId, { mode: 'main' })
      return { ok: true, bound: { mode: 'main' }, message: '已切回当前分支（主目录）' }
    }
    const path = String(rawPath || '').trim()
    if (!path) {
      bindings.set(sessionId, { mode: 'main' })
      return { ok: true, bound: { mode: 'main' }, message: '已切回当前分支（主目录）' }
    }
    const res = await listWorktrees(base)
    if (!res.ok) return res
    const resolved = path.startsWith('/') ? path : (base + '/../' + path)
    const found = res.worktrees.find((wt) => wt.path === resolved)
    if (!found) return { ok: false, message: '未找到该 worktree：' + path }
    bindings.set(sessionId, { path: found.path, branch: found.branch })
    return { ok: true, bound: { path: found.path, branch: found.branch }, message: '本会话工作目录已绑定 ' + found.path }
  }

  // ---- Per-session prompt annotation (create directive or bound worktree).
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined) {
    ctx.effect(() => systemPrompt.context({
      name: 'worktree:session',
      order: 90,
      text: (context) => {
        const agent = context && context.agent
        const id = agent && agent.id
        if (!id) return ''
        const b = effective(bindings.get(id))
        if (b.mode === 'main') return ''
        if (b.mode === 'create') {
          return '本会话需要在 git worktree 中工作，但 worktree 尚未创建。开始任务前请：\n'
            + '1. 阅读项目根目录的 AGENTS.md（若存在），按其约定确定 worktree 的分支、issue 号和基分支；\n'
            + '2. 若缺少 issue 号或语义名，用 ask_user_question 向用户确认；\n'
            + '3. 调用 worktree 工具（action=add）创建 worktree（会自动绑定本会话）。\n'
            + '创建后，本会话所有文件操作、git 命令都应基于该 worktree 目录进行。'
        }
        const label = shortBranch(b.branch)
        return '本会话的工作目录已绑定到 git worktree「' + label + '」：\n'
          + '- 绝对路径：' + b.path + '\n'
          + '- 分支：' + (b.branch || 'detached') + '\n'
          + '本会话所有文件操作、git 命令应基于该 worktree 目录进行（bash 使用 workdir 或 cd 到该目录）；会话归属的工作区仍是主仓库，请勿在主仓库直接改动本 worktree 分支相关文件。'
      },
    }), 'worktree: session context')
  }

  // ---- Model tool: the agent manages worktrees. `add` creates AND binds
  // the calling session; `use` binds the calling session to an existing one.
  ctx.effect(() => ctx.tools.register({
    name: 'worktree',
    description: '管理当前工作区（主仓库）的 git worktree：列出、创建、删除、绑定当前会话的工作目录。创建遵循约定：分支 feat/<issue>-<name>、目录 <worktreeRoot>/<issue>-<name>、基分支默认当天 release/YYYYMMDD（不存在则 HEAD）。add 创建后自动绑定当前会话。用户说“开个 worktree / 帮我建 worktree”时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add', 'remove', 'use', 'unuse'],
          description: 'list=列出所有 worktree；add=新建并绑定当前会话；remove=删除；use=把当前会话绑定到某个已有 worktree；unuse=解除绑定回到主分支。',
        },
        issue: { type: 'string', description: 'add 时可选：issue 号，作为分支/目录前缀，如 587 或 NL-581' },
        name: { type: 'string', description: 'add 时必填：语义名，如 loan-migration-data-repair' },
        baseBranch: { type: 'string', description: 'add 时可选：基分支，默认当天 release/YYYYMMDD 或 HEAD' },
        path: { type: 'string', description: 'remove/use 时的 worktree 绝对路径或相对 <worktreeRoot> 的路径' },
      },
      required: ['action'],
    },
    output: {
      // Raw registry schema: annotation-only `{}` = any JSON value (the
      // `{ type: 'json' }` shorthand exists only on the defineTool path).
      schema: {},
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const base = await baseDirOf()
      if (!base) return { ok: false, message: '无法确定主仓库目录（没有可用的工作区）' }
      const action = args && args.action
      if (action === 'list' || action === undefined) {
        const res = await listWorktrees(base)
        if (!res.ok) return res
        return { ok: true, basePath: base, worktreeRoot: CONFIG.worktreeRoot, worktrees: res.worktrees }
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
        const wtDir = worktreePath(prefix, name)
        let baseRef = (args && args.baseBranch && String(args.baseBranch).trim() !== '')
          ? String(args.baseBranch).trim()
          : null
        if (!baseRef) {
          const candidate = todayRelease()
          const check = await runGit(base, ['-C', base, 'rev-parse', '--verify', '--quiet', candidate], exec)
          baseRef = check.ok ? candidate : 'HEAD'
        }
        const res = await runGit(base, ['-C', base, 'worktree', 'add', '-b', branch, wtDir, baseRef], exec)
        if (!res.ok) return res
        const sessionId = exec && exec.agent && exec.agent.id
        if (sessionId) {
          bindings.set(sessionId, { path: wtDir, branch })
        }
        return {
          ok: true,
          branch,
          path: wtDir,
          baseRef,
          bound: !!sessionId,
          message: '已创建 worktree ' + branch + '（' + wtDir + '）' + (sessionId ? '，并绑定本会话' : ''),
        }
      }
      if (action === 'remove') {
        const raw = String((args && args.path) || '').trim()
        if (!raw) return { ok: false, message: 'remove 需要 path' }
        const path = raw.startsWith('/') ? raw : (base + '/../' + raw)
        const force = !!(args && args.force)
        const cmd = ['-C', base, 'worktree', 'remove']
        if (force) cmd.push('--force')
        cmd.push(path)
        const res = await runGit(base, cmd, exec)
        if (!res.ok) return res
        for (const [sid, b] of bindings) {
          if (b.path === path) bindings.set(sid, { mode: 'main' })
        }
        return { ok: true, message: '已移除 worktree ' + path }
      }
      if (action === 'use') {
        const raw = String((args && args.path) || '').trim()
        if (!raw) return { ok: false, message: 'use 需要 path（worktree 路径）' }
        const sessionId = exec && exec.agent && exec.agent.id
        if (!sessionId) return { ok: false, message: '需要 Agent 会话上下文' }
        return setBinding(sessionId, 'worktree', raw)
      }
      if (action === 'unuse') {
        const sessionId = exec && exec.agent && exec.agent.id
        if (sessionId) bindings.set(sessionId, { mode: 'main' })
        return { ok: true, message: '已切回主分支（主目录）' }
      }
      return { ok: false, message: '未知 action：' + String(action) }
    },
  }), 'worktree: model tool')

  // ---- Dock HTTP routes (same origin as the web GUI; the client bundle
  // fetches these instead of a package-private RPC channel). Nested inject:
  // the routes mount when the webserver service activates, and stay absent
  // on compositions (e.g. headless) that never provide it.
  ctx.inject(['webServer'], (webCtx) => {
    const sendJson = (res, status, value) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(value))
    }
    const readBody = (req) => new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: CONFIG.routePrefix + '/dock',
      handler: async (req, res) => {
        try {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { ok: false, message: 'method not allowed' })
            return
          }
          const base = await baseDirOf()
          if (!base) return sendJson(res, 200, { ok: false, message: '无法确定主仓库目录（没有可用的工作区）' })
          const res2 = await listWorktrees(base)
          if (!res2.ok) return sendJson(res, 200, res2)
          const url = new URL(req.url, 'http://localhost')
          const sessionId = url.searchParams.get('session')
          const bound = sessionId ? effective(bindings.get(sessionId)) : null
          sendJson(res, 200, {
            ok: true,
            basePath: base,
            worktreeRoot: CONFIG.worktreeRoot,
            defaultMode: CONFIG.defaultMode,
            worktrees: res2.worktrees,
            bound,
          })
        } catch (e) {
          sendJson(res, 500, { ok: false, message: String((e && e.message) || e) })
        }
      },
    }), 'worktree: dock route')

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: CONFIG.routePrefix + '/markers',
      handler: (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendJson(res, 405, { ok: false, message: 'method not allowed' })
          return
        }
        // RAW bindings (no effective-default projection): the sidebar shows
        // a badge only for sessions that are actually bound or explicitly
        // pending worktree creation.
        const out = []
        for (const [sessionId, b] of bindings) {
          if (b.mode === 'create') out.push({ sessionId, mode: 'create' })
          else if (b.mode === 'main') out.push({ sessionId, mode: 'main' })
          else out.push({ sessionId, path: b.path, branch: b.branch })
        }
        sendJson(res, 200, { ok: true, bindings: out })
      },
    }), 'worktree: markers route')

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: CONFIG.routePrefix + '/bind',
      handler: async (req, res) => {
        try {
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, message: 'method not allowed' })
            return
          }
          const raw = await readBody(req)
          let body = {}
          try { body = raw ? JSON.parse(raw) : {} } catch (e) {}
          const sessionId = body && body.sessionId
          if (!sessionId) return sendJson(res, 200, { ok: false, message: '缺少 sessionId' })
          const result = await setBinding(sessionId, body.mode, body.path)
          sendJson(res, 200, result)
        } catch (e) {
          sendJson(res, 500, { ok: false, message: String((e && e.message) || e) })
        }
      },
    }), 'worktree: bind route')
  })
}
