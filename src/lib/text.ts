import type { Cue } from '../types'

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, '') // <c>, <00:00:01.000>, <i> 等
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

function toSec(stamp: string): number {
  const parts = stamp.trim().replace(',', '.').split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

const TIME_LINE = /^(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/

/** 解析 SRT 或 WebVTT（含 YouTube 自动字幕的两行滚动格式）。 */
export function parseSubtitle(raw: string): Cue[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const cues: Cue[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const m = line.match(TIME_LINE)
    if (m) {
      const startSec = toSec(m[1])
      const endSec = toSec(m[2])
      i += 1
      const buf: string[] = []
      while (i < lines.length && lines[i].trim() !== '' && !TIME_LINE.test(lines[i])) {
        buf.push(lines[i])
        i += 1
      }
      const text = cleanText(buf.join(' '))
      if (text) cues.push({ index: 0, text, startSec, endSec })
      continue
    }
    i += 1
  }

  // 去掉 YouTube 自动字幕的滚动重复：后一条是前一条的尾巴时合并
  const dedup: Cue[] = []
  for (const c of cues) {
    const prev = dedup[dedup.length - 1]
    if (prev && (prev.text === c.text || prev.text.endsWith(c.text))) continue
    if (prev && c.text.includes(prev.text) && (c.startSec ?? 0) - (prev.startSec ?? 0) < 1.5) {
      dedup[dedup.length - 1] = { ...c, startSec: prev.startSec }
      continue
    }
    dedup.push(c)
  }

  return dedup.map((c, idx) => ({ ...c, index: idx }))
}

const SENT_END = /[.!?。！？]["'”’)\]]?\s*$/

/**
 * 把碎句合并成适合学习的句子。
 * 自动字幕经常没有标点，所以除了标点，还按长度和停顿兜底。
 */
export function mergeCues(cues: Cue[], opts: { maxChars?: number; maxGapSec?: number } = {}): Cue[] {
  const maxChars = opts.maxChars ?? 160
  const maxGapSec = opts.maxGapSec ?? 1.2
  const out: Cue[] = []
  let cur: { text: string; startSec?: number; endSec?: number } | null = null

  const flush = () => {
    if (!cur) return
    const text = cur.text.replace(/\s+/g, ' ').trim()
    if (text) out.push({ index: 0, text, startSec: cur.startSec, endSec: cur.endSec })
    cur = null
  }

  for (const c of cues) {
    const text = c.text.trim()
    if (!text) continue
    if (!cur) {
      cur = { text, startSec: c.startSec, endSec: c.endSec }
    } else {
      const gap = (c.startSec ?? 0) - (cur.endSec ?? c.startSec ?? 0)
      const joined = `${cur.text} ${text}`.replace(/\s+/g, ' ')
      const tooLong = joined.length > maxChars
      const longPause = gap > maxGapSec
      const prevEnded = SENT_END.test(cur.text)
      if (prevEnded || tooLong || longPause) {
        flush()
        cur = { text, startSec: c.startSec, endSec: c.endSec }
      } else {
        cur.text = joined
        cur.endSec = c.endSec
      }
    }
    if (cur && SENT_END.test(cur.text) && cur.text.length > 30) flush()
  }
  flush()
  return out.map((c, idx) => ({ ...c, index: idx }))
}

/** 文章正文断句（无时间码）。 */
export function splitSentences(text: string, maxChars = 220): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const rough = normalized
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|U\.S|U\.K)\./g, (m) => m.replace(/\./g, '†'))
    .split(/(?<=[.!?。！？])\s+/)
  const out: string[] = []
  for (const piece of rough) {
    const s = piece.replace(/†/g, '.').trim()
    if (!s) continue
    if (s.length <= maxChars) {
      out.push(s)
    } else {
      // 太长就按逗号/分号再切
      let buf = ''
      for (const part of s.split(/(?<=[,;:])\s+/)) {
        if ((buf + ' ' + part).trim().length > maxChars && buf) {
          out.push(buf.trim())
          buf = part
        } else {
          buf = (buf + ' ' + part).trim()
        }
      }
      if (buf) out.push(buf.trim())
    }
  }
  return out
}

export interface Token {
  text: string
  start: number
  end: number
  isWord: boolean
}

const wordRe = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu

/** 英文分词：优先 Intl.Segmenter，退化到正则。返回带偏移的 token，便于点击定位。 */
export function tokenize(text: string): Token[] {
  const out: Token[] = []
  const Seg = (Intl as any).Segmenter
  if (Seg) {
    const seg = new Seg('en', { granularity: 'word' })
    for (const s of seg.segment(text) as Iterable<{ segment: string; index: number; isWordLike?: boolean }>) {
      if (!s.segment) continue
      const isWord = !!s.isWordLike
      if (!isWord && /^\s+$/.test(s.segment)) {
        out.push({ text: s.segment, start: s.index, end: s.index + s.segment.length, isWord: false })
      } else {
        out.push({
          text: s.segment,
          start: s.index,
          end: s.index + s.segment.length,
          isWord,
        })
      }
    }
    return out
  }
  let last = 0
  for (const m of text.matchAll(wordRe)) {
    const start = m.index ?? 0
    if (start > last) out.push({ text: text.slice(last, start), start: last, end: start, isWord: false })
    out.push({ text: m[0], start, end: start + m[0].length, isWord: true })
    last = start + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), start: last, end: text.length, isWord: false })
  return out
}

const IRREGULAR: Record<string, string> = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', having: 'have',
  does: 'do', did: 'do', done: 'do', doing: 'do',
  went: 'go', gone: 'go', goes: 'go',
  said: 'say', made: 'make', took: 'take', taken: 'take',
  came: 'come', saw: 'see', seen: 'see', knew: 'know', known: 'know',
  got: 'get', gotten: 'get', gave: 'give', given: 'give',
  found: 'find', thought: 'think', told: 'tell', became: 'become',
  left: 'leave', felt: 'feel', put: 'put', brought: 'bring', began: 'begin',
  begun: 'begin', kept: 'keep', held: 'hold', wrote: 'write', written: 'write',
  stood: 'stand', heard: 'hear', let: 'let', meant: 'mean', met: 'meet',
  ran: 'run', paid: 'pay', sat: 'sit', spoke: 'speak', spoken: 'speak',
  lay: 'lie', led: 'lead', grew: 'grow', grown: 'grow', lost: 'lose',
  fell: 'fall', fallen: 'fall', sent: 'send', built: 'build', understood: 'understand',
  drew: 'draw', drawn: 'draw', broke: 'break', broken: 'break', spent: 'spend',
  cut: 'cut', rose: 'rise', risen: 'rise', drove: 'drive', driven: 'drive',
  bought: 'buy', wore: 'wear', worn: 'wear', chose: 'choose', chosen: 'choose',
  ate: 'eat', eaten: 'eat', threw: 'throw', thrown: 'throw', caught: 'catch',
  taught: 'teach', fought: 'fight', sought: 'seek', sold: 'sell', won: 'win',
  forgot: 'forget', forgotten: 'forget', hit: 'hit', read: 'read',
  better: 'good', best: 'good', worse: 'bad', worst: 'bad',
}

/** 粗糙但够用的词形还原：不规则表 → 规则后缀。 */
export function lemmaOf(raw: string): string {
  const w = raw.toLowerCase().replace(/[’']s$/, '').replace(/[^a-z'-]/g, '')
  if (!w) return raw.toLowerCase()
  if (IRREGULAR[w]) return IRREGULAR[w]

  const rules: [RegExp, (s: string) => string][] = [
    [/ies$/, (s) => s.slice(0, -3) + 'y'],
    [/ves$/, (s) => s.slice(0, -3) + 'f'],
    [/(ches|shes|sses|xes|zes)$/, (s) => s.slice(0, -2)],
    [/([^s])s$/, (s) => s.slice(0, -1)],
    [/ying$/, (s) => s.slice(0, -4) + 'ie'],
    [/ing$/, (s) => {
      const b = s.slice(0, -3)
      return /([^aeiou])\1$/.test(b) ? b.slice(0, -1) : /[^aeiou]e$/.test(b) ? b : b + 'e'
    }],
    [/ied$/, (s) => s.slice(0, -3) + 'y'],
    [/ed$/, (s) => {
      const b = s.slice(0, -2)
      if (/([^aeiou])\1$/.test(b)) return b.slice(0, -1)
      return /e$/.test(b) ? b : b + 'e'
    }],
    [/est$/, (s) => s.slice(0, -3)],
    [/er$/, (s) => s.slice(0, -2)],
    [/ly$/, (s) => s.slice(0, -2)],
  ]
  for (const [re, fn] of rules) {
    if (re.test(w) && w.length > 3) {
      const cand = fn(w)
      if (cand.length >= 2) return cand
    }
  }
  return w
}

export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function fmtSec(sec?: number): string {
  if (sec == null) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
