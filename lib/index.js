/**
 * dsh-reasoning-levels host half
 *
 * 按模型编辑 llm-pi-ai 的 reasoningEfforts（思考强度档位）。
 * 写入走官方 configEditor.edit() 通道：写前校验完整候选值、原子替换当前 profile 的
 * cordis.patch.yml、保留其余 YAML 注释与 !!js 表达式、与 HMR 串行、失败自动回滚。
 * 通过 webServer 暴露 /rlevels/* JSON 端点供浏览器端读写。
 *
 * 档位集合与升序对齐宿主 dsh-llm-pi-ai 的 THINKING_LEVELS；
 * wire 值默认等于档位名（off 为 null），已存在的自定义 wire 值会被保留。
 */

const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const ENTRY_ID = 'llm-pi-ai'

function apply(ctx) {
  // ---------- HTTP 工具 ----------

  function sendJson(res, status, body) {
    const payload = JSON.stringify(body)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload)
    })
    res.end(payload)
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (chunk) => { data += chunk })
      req.on('end', () => resolve(data))
      req.on('error', reject)
    })
  }

  // ---------- 配置定位 ----------

  /** 当前 profile 里可编辑的 llm-pi-ai 条目（configEditor 只接受唯一可定位的条目）。 */
  function findEntry() {
    const ed = ctx.get('configEditor')
    if (!ed || typeof ed.entries !== 'function') return null
    const list = ed.entries() || []
    for (const e of list) {
      if (e && e.options && e.options.id === ENTRY_ID) return e
    }
    return null
  }

  /** 条目的生效配置（各层合成后的结果，也就是 edit() 回调里的 current）。 */
  function configOf(entry) {
    const c = entry && entry.options ? entry.options.config : null
    return c && typeof c === 'object' ? c : {}
  }

  /** 把配置里的 reasoningEfforts 归一成前端好处理的形状。 */
  function normalize(value) {
    if (value === false) return { mode: 'false', levels: {} }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { mode: 'inherit', levels: {} }
    const levels = {}
    for (const level of LEVELS) {
      if (!Object.prototype.hasOwnProperty.call(value, level)) continue
      const wire = value[level]
      levels[level] = wire === null || wire === undefined ? null : String(wire)
    }
    return { mode: 'levels', levels }
  }

  /** 全量快照：provider → model → 当前档位状态。 */
  function snapshot() {
    const ed = ctx.get('configEditor')
    const entry = findEntry()
    const out = {
      levels: LEVELS,
      entryFound: Boolean(entry),
      documentPath: ed && typeof ed.documentPath === 'string' ? ed.documentPath : null,
      providers: []
    }
    if (!entry) return out
    const providers = configOf(entry).providers
    if (!providers || typeof providers !== 'object') return out
    for (const pid of Object.keys(providers)) {
      const p = providers[pid]
      if (!p || typeof p !== 'object') continue
      const models = Array.isArray(p.models) ? p.models : []
      out.providers.push({
        id: pid,
        displayName: typeof p.displayName === 'string' && p.displayName ? p.displayName : pid,
        models: models
          .filter((m) => m && typeof m === 'object' && typeof m.id === 'string')
          .map((m) => ({
            id: m.id,
            name: typeof m.name === 'string' && m.name ? m.name : m.id,
            efforts: normalize(m.reasoningEfforts)
          }))
      })
    }
    return out
  }

  // ---------- 写入 ----------

  async function write(body) {
    const ed = ctx.get('configEditor')
    if (!ed || typeof ed.edit !== 'function') throw new Error('configEditor 服务不可用')
    const entry = findEntry()
    if (!entry) throw new Error('当前 profile 里没有可编辑的 ' + ENTRY_ID + ' 条目')
    if (!body || typeof body !== 'object') throw new Error('请求体必须是 JSON 对象')

    const provider = typeof body.provider === 'string' ? body.provider : ''
    const model = typeof body.model === 'string' ? body.model : ''
    if (!provider) throw new Error('缺少 provider')
    if (!model) throw new Error('缺少 model')

    const mode = body.mode === 'false' ? 'false' : body.mode === 'inherit' ? 'inherit' : 'levels'
    const wanted = Array.isArray(body.levels) ? body.levels.filter((l) => LEVELS.indexOf(l) >= 0) : []
    // 宿主规则：reasoningEfforts 至少要提供一个高于 off 的档位，否则应写 false 或省略该字段
    if (mode === 'levels' && !wanted.some((l) => l !== 'off')) {
      throw new Error('至少要选择一个高于「关闭」的档位；若该模型不支持思考，请选「非推理模型」')
    }

    await ed.edit(entry, (current) => {
      const next = structuredClone(current && typeof current === 'object' ? current : {})
      const providers = next.providers && typeof next.providers === 'object' ? next.providers : (next.providers = {})
      const p = providers[provider]
      if (!p || typeof p !== 'object') throw new Error('provider 不存在：' + provider)
      const models = Array.isArray(p.models) ? p.models : (p.models = [])
      const m = models.find((x) => x && x.id === model)
      if (!m) throw new Error('model 不存在：' + model)

      if (mode === 'false') {
        m.reasoningEfforts = false
        return next
      }
      if (mode === 'inherit') {
        delete m.reasoningEfforts
        return next
      }

      const prev = m.reasoningEfforts
      const prevMap = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {}
      const efforts = {}
      for (const level of LEVELS) {
        if (wanted.indexOf(level) < 0) continue
        if (level === 'off') { efforts.off = null; continue }
        const wire = prevMap[level]
        efforts[level] = typeof wire === 'string' && wire.length > 0 ? wire : level
      }
      m.reasoningEfforts = efforts
      return next
    })

    return snapshot()
  }

  // ---------- 端点 ----------

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname
    try {
      if (path === '/rlevels/list' && req.method === 'GET') {
        return sendJson(res, 200, { ok: true, state: snapshot() })
      }
      if (path === '/rlevels/set' && req.method === 'POST') {
        const raw = await readBody(req)
        let body = {}
        try { body = JSON.parse(raw || '{}') } catch { body = {} }
        return sendJson(res, 200, { ok: true, state: await write(body) })
      }
      return sendJson(res, 404, { ok: false, error: 'not found' })
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: String((e && e.message) || e) })
    }
  }

  // webServer 可能晚于本插件出现：出现即注册路由（fiber 清理时自动解除）
  const registerRoute = (target) => {
    ctx.effect(() => target.register({
      kind: 'prefix',
      path: '/rlevels',
      handler: handle
    }), 'reasoning-levels: http route')
  }
  const ws = ctx.get('webServer')
  if (ws) {
    registerRoute(ws)
  } else {
    ctx.on('webServer', (sctx) => registerRoute(sctx.webServer))
  }
}

export { apply }
