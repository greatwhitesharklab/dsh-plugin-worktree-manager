/**
 * Host half of the dsh-plugin-worktree-manager plugin.
 *
 * Runs git worktree commands through the DSH `shell` service and exposes
 * four Package-private RPC handlers consumed by the browser half:
 *
 *   wt.list   -> parse `git worktree list --porcelain`
 *   wt.add    -> create `../wt/<issue>-<name>` on `feat/<issue>-<name>`
 *   wt.remove -> `git worktree remove [--force]`
 *   wt.prune  -> `git worktree prune`
 *
 * The main repository directory is resolved from the workspace registry
 * (current session's workspace, else the first registered workspace); a
 * caller may pass an explicit `basePath` to override it.
 *
 * Load this file's body into `code.host` of a dynamic Cordis Package
 * (cordis_define), or copy it into a Cordis plugin host entry.
 */
return {
  apply(ctx) {
    const shell = ctx.get('shell')
    if (shell === undefined) return

    const shq = (value) => "'" + String(value).replace(/'/g, "'\\''") + "'"

    // Resolve the main repo directory: explicit basePath wins, then the
    // workspace registry (current session's workspace, else the first one).
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

    harness.handle('wt.list', async (args) => {
      const base = await baseDirOf(args)
      if (!base) return { ok: false, message: '无法确定主目录（没有可用的工作区）' }
      const res = await runGit(base, ['-C', base, 'worktree', 'list', '--porcelain'])
      if (!res.ok) return res
      const worktrees = parsePorcelain(res.stdout, base)
      return { ok: true, basePath: base, worktrees }
    })

    harness.handle('wt.add', async (args) => {
      const base = await baseDirOf(args)
      if (!base) return { ok: false, message: '无法确定主目录（没有可用的工作区）' }
      const name = String((args && args.name) || '').trim()
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
      // Base ref: explicit baseBranch wins; else today's release/YYYYMMDD if it exists; else HEAD.
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
      return { ok: true, branch, path: wtDir, baseRef, message: '已创建 worktree ' + branch }
    })

    harness.handle('wt.remove', async (args) => {
      const base = await baseDirOf(args)
      if (!base) return { ok: false, message: '无法确定主目录（没有可用的工作区）' }
      const path = String((args && args.path) || '').trim()
      if (!path) return { ok: false, message: '缺少 worktree 路径' }
      const force = !!(args && args.force)
      const cmd = ['-C', base, 'worktree', 'remove']
      if (force) cmd.push('--force')
      cmd.push(path)
      const res = await runGit(base, cmd)
      if (!res.ok) return res
      return { ok: true, message: '已移除 worktree ' + path }
    })

    harness.handle('wt.prune', async (args) => {
      const base = await baseDirOf(args)
      if (!base) return { ok: false, message: '无法确定主目录（没有可用的工作区）' }
      const res = await runGit(base, ['-C', base, 'worktree', 'prune'])
      if (!res.ok) return res
      return { ok: true, message: '已清理失效的 worktree 引用' }
    })
  },
}
