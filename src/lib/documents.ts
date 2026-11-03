/** 从 PDF / EPUB 抽取纯文本（动态加载依赖，避免拖大首屏包）。 */

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise
  const out: string[] = []
  const maxPages = Math.min(doc.numPages, 400)
  for (let p = 1; p <= maxPages; p += 1) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    out.push(
      tc.items
        .map((it: unknown) => (typeof it === 'object' && it && 'str' in (it as { str?: unknown }) ? (it as { str: string }).str : ''))
        .join(' '),
    )
  }
  const text = out.join('\n').replace(/\s+/g, ' ').trim()
  if (text.length < 120) throw new Error('PDF 里没抽到正文，可能是扫描件，换个文件')
  return text
}

function resolvePath(dir: string, href: string): string {
  if (href.startsWith('/')) return href.replace(/^\/+/, '')
  if (!dir) return href
  const parts = (dir + '/' + href).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}

export async function extractEpubText(file: File): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const buf = new Uint8Array(await file.arrayBuffer())
  const rawFiles: Record<string, Uint8Array> = unzipSync(buf)
  // 有些打包工具（比如 Windows 的压缩）会用反斜杠做分隔符，统一成正斜杠
  const files: Record<string, Uint8Array> = {}
  for (const [name, data] of Object.entries(rawFiles)) files[name.replace(/\\/g, '/')] = data

  const container = strFromU8(files['META-INF/container.xml'] ?? new Uint8Array())
  const root = container.match(/full-path="([^"]+)"/)?.[1]
  if (!root || !files[root]) throw new Error('不是有效的 EPUB（找不到 OPF）')
  const dir = root.includes('/') ? root.slice(0, root.lastIndexOf('/')) : ''
  const opf = strFromU8(files[root])

  const manifest = new Map<string, string>()
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    const id = m[0].match(/id="([^"]+)"/)?.[1]
    const href = m[0].match(/href="([^"]+)"/)?.[1]
    if (id && href) manifest.set(id, resolvePath(dir, href))
  }

  const order: string[] = []
  for (const s of opf.matchAll(/<itemref\b[^>]*>/g)) {
    const idref = s[0].match(/idref="([^"]+)"/)?.[1]
    if (idref && manifest.has(idref)) order.push(manifest.get(idref)!)
  }

  const parts: string[] = []
  for (const path of order) {
    const data = files[path] ?? files[decodeURIComponent(path)]
    if (!data) continue
    const html = strFromU8(data)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('script,style').forEach((el) => el.remove())
    const t = doc.body?.textContent?.replace(/\s+/g, ' ').trim()
    if (t) parts.push(t)
  }
  const text = parts.join('\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
  if (text.length < 120) throw new Error('EPUB 里没抽到正文')
  return text
}
