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

/** 从视频页 HTML 的 ytInitialPlayerResponse 里摘出 captionTracks 数组。 */
function captionTracks(html: string): any[] {
  const key = '"captionTracks":'
  const i = html.indexOf(key)
  if (i < 0) return []
  const start = html.indexOf('[', i)
  if (start < 0) return []
  let depth = 0
  let inStr = false
  let esc = false
  for (let j = start; j < html.length; j += 1) {
    const c = html[j]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '[' || c === '{') depth += 1
    else if (c === ']' || c === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, j + 1))
        } catch {
          return []
        }
      }
    }
  }
  return []
}

function stamp(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

/** YouTube timedtext 的 XML 转成 SRT，统一交给 parseSubtitle。 */
function xmlTranscriptToSrt(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const nodes = Array.from(doc.querySelectorAll('text'))
  if (!nodes.length) return ''
  return nodes
    .map((el, i) => {
      const start = Number(el.getAttribute('start') ?? 0)
      const dur = Number(el.getAttribute('dur') ?? 2)
      return `${i + 1}\n${stamp(start)} --> ${stamp(start + dur)}\n${(el.textContent ?? '').trim()}\n`
    })
    .join('\n')
}

/**
 * 尽力从 YouTube 抓英文字幕：解析 watch 页 → captionTracks → timedtext。
 * 数据中心的 IP 可能被 YouTube 风控，失败时调用方应提示用 yt-dlp。
 */
export async function fetchYouTubeCaptions(videoId: string): Promise<string> {
  const watch = `https://www.youtube.com/watch?v=${videoId}`
  const pageRes = await fetch(`/api/fetch?url=${encodeURIComponent(watch)}`)
  const page = await pageRes.json().catch(() => ({}))
  if (!pageRes.ok) throw new Error(page.error || `抓视频页失败（HTTP ${pageRes.status}）`)
  const tracks = captionTracks(String(page.html ?? ''))
  if (!tracks.length) throw new Error('这个视频没有可抓的字幕轨，用 yt-dlp 抓吧')

  const track =
    tracks.find((t) => /^en/i.test(String(t.languageCode ?? ''))) ??
    tracks.find((t) => String(t.kind ?? '') === 'asr') ??
    tracks[0]
  let url = String(track.baseUrl ?? '')
  if (!url) throw new Error('字幕地址为空')
  if (!/[?&]fmt=/.test(url)) url += '&fmt=vtt'

  const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `抓字幕失败（HTTP ${res.status}）`)
  const raw = String(data.html ?? '')
  if (!raw) throw new Error('字幕内容为空')
  if (raw.includes('<transcript')) {
    const srt = xmlTranscriptToSrt(raw)
    if (!srt) throw new Error('字幕格式无法解析')
    return srt
  }
  return raw
}
