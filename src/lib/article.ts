import { Readability } from '@mozilla/readability'

export interface ArticleResult {
  title: string
  text: string
}

const BLOCKS = 'p,div,section,article,li,h1,h2,h3,h4,h5,h6,blockquote,pre,br,tr,td,figcaption'

/** 抽取纯文本，并给块级元素补空格，避免 "endStart" 这种粘连。 */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,noscript,template,svg').forEach((el) => el.remove())
  doc.querySelectorAll(BLOCKS).forEach((el) => {
    // 前后都补空格：只补后面的话，<p> 与上一段文字会粘在一起
    el.insertBefore(doc.createTextNode(' '), el.firstChild)
    el.appendChild(doc.createTextNode(' '))
  })
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

/** 通过 /api/fetch 取 HTML（绕开 CORS），再用 Readability 抽正文。 */
export async function fetchArticle(rawUrl: string): Promise<ArticleResult> {
  const url = normalizeUrl(rawUrl)
  const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `抓取失败（HTTP ${res.status}）`)
  if (!data.html) throw new Error('抓取失败：没有返回 HTML')

  const doc = new DOMParser().parseFromString(data.html, 'text/html')
  // Readability 依赖 baseURI 解析相对链接，这里给个假的
  const base = doc.createElement('base')
  base.href = url
  doc.head?.prepend(base)

  const article = new Readability(doc, { charThreshold: 200 }).parse()
  const text = htmlToText(article?.content || data.html)
  if (!text || text.length < 120) throw new Error('没能抽出正文，试试换一个页面或手动粘贴文本')

  return {
    title: (article?.title || doc.title || new URL(url).hostname).trim(),
    text,
  }
}

export function normalizeUrl(input: string): string {
  const s = input.trim()
  if (!s) throw new Error('请输入网址')
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`
  return new URL(withProto).toString()
}

export function youtubeId(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12)
    const v = u.searchParams.get('v')
    if (v) return v
    const m = u.pathname.match(/\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/)
    if (m) return m[2]
  } catch {
    return null
  }
  return null
}
