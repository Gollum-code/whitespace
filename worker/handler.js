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
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-app-key',
    'access-control-max-age': '86400',
  }
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

  return json({ error: 'not found' }, 404)
}
