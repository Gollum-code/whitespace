/* 留白 Service Worker：离线打开应用外壳，API 请求不缓存。 */
const CACHE = 'whitespace-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const c = await caches.open(CACHE)
      await Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // 只处理同源 GET；API 与跨域资源走网络
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // 页面导航：网络优先，离线回退到缓存的外壳
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (!res.ok) throw new Error('navigation failed')
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {})
          return res
        })
        .catch(async () => {
          const hit = await caches.match('/index.html')
          if (hit) return hit
          return new Response(
            '<!doctype html><html lang="zh-CN"><body style="font-family:sans-serif;padding:40px">离线了，网络恢复后刷新再试。</body></html>',
            { status: 503, headers: { 'content-type': 'text/html;charset=utf-8' } },
          )
        }),
    )
    return
  }

  // 静态资源：缓存优先，未命中再网络并写入缓存
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          }
          return res
        }),
    ),
  )
})
