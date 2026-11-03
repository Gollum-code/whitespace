import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// 本地云同步的临时存储（内存，刷新进程即清空；部署后走 Cloudflare KV）
const syncStore = new Map()

/**
 * 本地开发时，用 vite 内置的中间件实现和线上 Worker 完全一致的 /api/llm 与 /api/fetch。
 * 这样前端代码在 dev / prod 下没有任何区别，也不需要本地跑一个后端。
 */
function devApi(env) {
  const base = (env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')
  const key = env.AI_API_KEY || ''
  const model = env.AI_MODEL || 'deepseek-chat'

  const isPrivate = (u) => {
    const h = u.hostname
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '0.0.0.0' ||
      h === '[::1]' ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^169\.254\./.test(h)
    )
  }

  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')

        // ---- AI 代理 ----
        if (url.pathname === '/api/llm' && req.method === 'POST') {
          if (!key) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: '本地未配置 AI_API_KEY，请在 .env.local 里填写' }))
            return
          }
          let body = ''
          for await (const chunk of req) body += chunk
          try {
            const parsed = JSON.parse(body || '{}')
            const upstream = await fetch(`${base}/chat/completions`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
              body: JSON.stringify({
                model: parsed.model || model,
                messages: parsed.messages,
                temperature: parsed.temperature ?? 0.7,
                response_format: { type: 'json_object' },
              }),
            })
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('content-type', 'application/json')
            res.end(text)
          } catch (e) {
            res.statusCode = 502
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: String(e) }))
          }
          return
        }

        // ---- 网页抓取代理 ----
        if (url.pathname === '/api/fetch' && req.method === 'GET') {
          const target = url.searchParams.get('url')
          res.setHeader('content-type', 'application/json')
          if (!target) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'missing url' }))
            return
          }
          try {
            const u = new URL(target)
            if (!/^https?:$/.test(u.protocol) || isPrivate(u)) throw new Error('不允许的地址')
            const upstream = await fetch(u.toString(), {
              headers: {
                'user-agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
                accept: 'text/html,application/xhtml+xml,text/plain,*/*;q=0.8',
                'accept-language': 'en,zh;q=0.9',
              },
            })
            const html = await upstream.text()
            res.statusCode = 200
            res.end(JSON.stringify({ url: u.toString(), html: html.slice(0, 3_000_000) }))
          } catch (e) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: String(e) }))
          }
          return
        }

        // ---- 云同步（本地用内存模拟 KV；部署时走 Cloudflare KV）----
        if (url.pathname === '/api/sync') {
          const room = (url.searchParams.get('room') || '').slice(0, 64)
          res.setHeader('content-type', 'application/json')
          if (!room) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'missing room' }))
            return
          }
          if (req.method === 'PUT') {
            let body = ''
            for await (const chunk of req) body += chunk
            try {
              const parsed = JSON.parse(body || '{}')
              if (!parsed.ct) throw new Error('missing ct')
              syncStore.set(room, JSON.stringify({ iv: String(parsed.iv), ct: String(parsed.ct), ts: Date.now() }))
              res.end(JSON.stringify({ ok: true }))
            } catch (e) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: String(e) }))
            }
            return
          }
          if (req.method === 'GET') {
            const rec = syncStore.get(room)
            res.end(JSON.stringify(rec ? JSON.parse(rec) : { ct: null }))
            return
          }
          if (req.method === 'DELETE') {
            syncStore.delete(room)
            res.end(JSON.stringify({ ok: true }))
            return
          }
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'method not allowed' }))
          return
        }

        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), devApi(env)],
    build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  }
})
