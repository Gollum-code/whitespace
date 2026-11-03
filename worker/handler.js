/**
 * 共享的 Worker 逻辑：同时被
 *  - worker/index.js （Cloudflare Workers 独立部署）
 *  - functions/api/[[path]].js （Cloudflare Pages Functions）
 * 复用。
 *
 * 两个接口：
 *  - POST /api/llm   代理到大模型，key 只在服务端
 *  - GET  /api/fetch 代理抓取网页 HTML（绕 CORS），带 SSRF 防护
 */

const DEFAULT_BASE = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, x-app-key',
    'access-control-max-age': '86400',
  }
}

/** 简单内存限流（每个 isolate 独立，best-effort）：40 次/分钟/IP。 */
const RATE = { windowMs: 60_000, max: 40 }
const hits = new Map()

function rateLimited(request) {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  const now = Date.now()
  let rec = hits.get(ip)
  if (!rec || now - rec.start > RATE.windowMs) {
    rec = { start: now, n: 0 }
    hits.set(ip, rec)
  }
  rec.n += 1
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v.start > RATE.windowMs) hits.delete(k)
  }
  return rec.n > RATE.max
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() },
  })
}

function authorized(request, env) {
  const key = env.APP_KEY || ''
  if (!key) return true
  return request.headers.get('x-app-key') === key
}

function isPrivate(host) {
  const h = host.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]') return true
  if (h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  return false
}

export async function handle(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const url = new URL(request.url)
  const path = url.pathname

  if (path === '/api/llm' && request.method === 'POST') {
    if (!authorized(request, env)) return json({ error: '口令不对' }, 401)
    if (rateLimited(request)) return json({ error: '请求太频繁，稍后再试' }, 429)
    const apiKey = env.AI_API_KEY
    if (!apiKey) return json({ error: '服务端未配置 AI_API_KEY' }, 500)

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'body 不是 JSON' }, 400)
    }

    const base = (env.AI_BASE_URL || DEFAULT_BASE).replace(/\/$/, '')
    const upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: body.model || env.AI_MODEL || DEFAULT_MODEL,
        messages: body.messages,
        temperature: body.temperature ?? 0.7,
        response_format: { type: 'json_object' },
      }),
    })
    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: { 'content-type': 'application/json', ...corsHeaders() },
    })
  }

  if (path === '/api/fetch' && request.method === 'GET') {
    if (!authorized(request, env)) return json({ error: '口令不对' }, 401)
    const target = url.searchParams.get('url')
    if (!target) return json({ error: 'missing url' }, 400)
    let u
    try {
      u = new URL(target)
    } catch {
      return json({ error: 'URL 不合法' }, 400)
    }
    if (!/^https?:$/.test(u.protocol) || isPrivate(u.hostname)) {
      return json({ error: '不允许的地址' }, 400)
    }
    try {
      const upstream = await fetch(u.toString(), {
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain,*/*;q=0.8', 'accept-language': 'en,zh;q=0.9' },
      })
      const html = await upstream.text()
      return json({ url: u.toString(), html: html.slice(0, 3_000_000) })
    } catch (e) {
      return json({ error: String(e) }, 502)
    }
  }

  // ---- 云同步：把加密后的备份存进 KV，服务端不看内容 ----
  if (path === '/api/sync') {
    if (!authorized(request, env)) return json({ error: '口令不对' }, 401)
    const kv = env.SYNC
    if (!kv) return json({ error: '未配置云同步：部署时需绑定名为 SYNC 的 KV namespace（见 README「云同步」）' }, 501)
    if (rateLimited(request)) return json({ error: '请求太频繁，稍后再试' }, 429)
    const room = (url.searchParams.get('room') || '').slice(0, 64)
    if (!room) return json({ error: 'missing room' }, 400)
    const key = `sync:${room}`

    if (request.method === 'PUT') {
      const size = Number(request.headers.get('content-length') || 0)
      if (size > 5_000_000) return json({ error: '备份太大（>5MB）' }, 413)
      let body
      try {
        body = await request.json()
      } catch {
        return json({ error: 'body 不是 JSON' }, 400)
      }
      if (!body || !body.ct) return json({ error: '缺少密文' }, 400)
      await kv.put(key, JSON.stringify({ iv: String(body.iv), ct: String(body.ct), ts: Date.now() }))
      return json({ ok: true, ts: Date.now() })
    }

    if (request.method === 'GET') {
      const rec = await kv.get(key)
      if (!rec) return json({ ct: null })
      return json(JSON.parse(rec))
    }

    if (request.method === 'DELETE') {
      await kv.delete(key)
      return json({ ok: true })
    }

    return json({ error: 'method not allowed' }, 405)
  }

  return json({ error: 'not found' }, 404)
}
