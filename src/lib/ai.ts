import { db } from '../db'
import { hashString, normalizeAnswer } from './text'
import type { ClozeDrill, Drill, LookupRec, Mark } from '../types'

const PROMPT_VERSION = 'cloze:v1'
const AI_TIMEOUT = 45_000

export class AiError extends Error {}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' }
  const key = localStorage.getItem('whitespace:appKey')
  if (key) h['x-app-key'] = key
  return h
}

interface ChatResp {
  choices?: { message?: { content?: string } }[]
  error?: string | { message?: string }
}

async function chatJSON(messages: { role: string; content: string }[], temperature = 0.8): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT)
  try {
    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ messages, temperature }),
      signal: ctrl.signal,
    })
    const raw = await res.text()
    let data: ChatResp
    try {
      data = JSON.parse(raw)
    } catch {
      throw new AiError(`AI 返回了非 JSON（HTTP ${res.status}）`)
    }
    if (!res.ok) {
      const msg = typeof data.error === 'string' ? data.error : data.error?.message || `HTTP ${res.status}`
      throw new AiError(msg)
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new AiError('AI 没有返回内容')
    try {
      return JSON.parse(content)
    } catch {
      const m = content.match(/\{[\s\S]*\}/)
      if (m) return JSON.parse(m[0])
      throw new AiError('AI 返回内容不是合法 JSON')
    }
  } finally {
    clearTimeout(timer)
  }
}

function blankOut(sentence: string, word: string): string | null {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  if (!re.test(sentence)) return null
  return sentence.replace(re, '____')
}

/** 从原句兜底生成挖空，保证 AI 挂了也有题做。 */
function fallbackDrill(mark: Mark, sentence: string): ClozeDrill {
  const blanked = blankOut(sentence, mark.text)
  if (blanked) {
    return {
      promptVersion: PROMPT_VERSION,
      kind: 'cloze',
      sentence: blanked,
      answer: mark.text,
      glossZh: '',
      hintZh: 'AI 暂不可用，这是原句挖空。',
    }
  }
  return {
    promptVersion: PROMPT_VERSION,
    kind: 'cloze',
    sentence: `____（原句：${sentence}）`,
    answer: mark.text,
    glossZh: '',
    hintZh: 'AI 暂不可用，看括号里的原句回想这个词。',
  }
}

export function drillKey(mark: Mark, sentence: string): string {
  return `${PROMPT_VERSION}:${mark.lemma}:${hashString(sentence)}`
}

const SYSTEM = `你是一个英语学习出题助手。用户会给你一个单词/短语，以及它出现过的原句。
你的任务：造一个全新的英文句子（不要复用原句，情境要变），让目标词或它的自然变形出现在句中，然后把它挖空。
要求：
1. 句子长度 8-22 个词，地道、具体、有画面感，不要鸡汤。
2. 挖空处必须只有一个正确答案，且必须是目标词本身或它的变形（词形变化也算对）。
3. 挖空用四个下划线 ____ 表示。
4. 中文只用于解释，不要出现在英文句子里。
5. 只输出 JSON，不要 markdown 代码块。
JSON 格式：{"sentence":"含 ____ 的新句子","answer":"填进去的那个词","glossZh":"该词在此句中的中文意思","hintZh":"一句中文提示，例如搭配/词性/易错点"}`

/** 同一个 key 的并发请求只打一次 API（React StrictMode 下 effect 会跑两遍）。 */
const inflight = new Map<string, Promise<ClozeDrill>>()

export function generateCloze(mark: Mark, sentence: string): Promise<ClozeDrill> {
  const key = drillKey(mark, sentence)
  const existing = inflight.get(key)
  if (existing) return existing
  const p = runGenerate(key, mark, sentence).finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

async function runGenerate(key: string, mark: Mark, sentence: string): Promise<ClozeDrill> {
  const cached = (await db.getDrill(key)) as Drill | undefined
  if (cached?.data) return { ...cached.data, kind: 'cloze' } as ClozeDrill

  let drill: ClozeDrill | null = null
  for (let attempt = 0; attempt < 2 && !drill; attempt += 1) {
    try {
      const out = await chatJSON([
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `目标词：${mark.text}\n词形还原：${mark.lemma}\n原句：${sentence}`,
        },
      ])
      const s = String(out.sentence ?? '').trim()
      const a = String(out.answer ?? '').trim()
      if (!s || !a) continue
      const hasBlank = /_{2,}|＿{2,}/.test(s)
      const sentenceWithBlank = hasBlank ? s.replace(/_{2,}|＿{2,}/g, '____') : blankOut(s, a)
      if (!sentenceWithBlank) continue
      const answerInSentence = normalizeAnswer(s.replace(/_{2,}|＿{2,}/g, '')).includes(normalizeAnswer(a))
      if (!answerInSentence) continue
      drill = {
        promptVersion: PROMPT_VERSION,
        kind: 'cloze',
        sentence: sentenceWithBlank,
        answer: a,
        glossZh: String(out.glossZh ?? '').trim(),
        hintZh: String(out.hintZh ?? '').trim(),
      }
    } catch (e) {
      if (attempt === 1) {
        drill = fallbackDrill(mark, sentence)
        break
      }
    }
  }
  if (!drill) drill = fallbackDrill(mark, sentence)

  await db.putDrill({ key, kind: 'cloze', data: drill, createdAt: Date.now() })
  return drill
}

/** 简单并发池：边跑边回调，避免一次打爆 API。 */
export async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  onEach?: (item: T, result: R | null, err: unknown) => void,
): Promise<void> {
  let cursor = 0
  const run = async () => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      try {
        const r = await worker(item)
        onEach?.(item, r, null)
      } catch (e) {
        onEach?.(item, null, e)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
}

const lookupInflight = new Map<string, Promise<{ meaningZh: string; pos: string } | null>>()

/** 阅读辅助：查词释义（可选功能，AI 不可用时静默失败）。结果按词+语境缓存。 */
export function lookupWord(word: string, context: string): Promise<{ meaningZh: string; pos: string } | null> {
  const key = `lookup:${word.toLowerCase()}:${hashString(context)}`
  const existing = lookupInflight.get(key)
  if (existing) return existing
  const p = runLookup(key, word, context).finally(() => lookupInflight.delete(key))
  lookupInflight.set(key, p)
  return p
}

async function runLookup(
  key: string,
  word: string,
  context: string,
): Promise<{ meaningZh: string; pos: string } | null> {
  try {
    const cached = (await db.getLookup(key)) as LookupRec | undefined
    if (cached?.meaningZh) return { meaningZh: cached.meaningZh, pos: cached.pos ?? '' }
    const out = await chatJSON(
      [
        { role: 'system', content: '你是英汉词典。只输出 JSON：{"meaningZh":"简短中文释义","pos":"词性缩写"}' },
        { role: 'user', content: `单词：${word}\n语境：${context}` },
      ],
      0.2,
    )
    if (!out?.meaningZh) return null
    const rec: LookupRec = {
      key,
      word,
      context,
      meaningZh: String(out.meaningZh),
      pos: String(out.pos ?? ''),
      createdAt: Date.now(),
    }
    await db.putLookup(rec)
    return { meaningZh: rec.meaningZh, pos: rec.pos }
  } catch {
    return null
  }
}
