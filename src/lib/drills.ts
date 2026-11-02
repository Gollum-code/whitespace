import { generateCloze } from './ai'
import { hashString, lemmaOf, normalizeAnswer } from './text'
import type { ChoiceDrill, ClozeDrill, DrillData, DrillKind, Mark, ScrambleDrill } from '../types'

export const DRILL_LABEL: Record<DrillKind, string> = {
  cloze: '挖空填空',
  scramble: '连词成句',
  choice: '选词填空',
}

/** 旧缓存（没有 kind 字段）按 cloze 兼容；结构损坏则返回 null。 */
export function normalizeDrillData(data: any): DrillData | null {
  if (!data) return null
  const kind: DrillKind = data.kind ?? 'cloze'
  if (kind === 'cloze') {
    if (!data.sentence || !data.answer) return null
    return {
      kind: 'cloze',
      promptVersion: String(data.promptVersion ?? ''),
      sentence: String(data.sentence),
      answer: String(data.answer),
      glossZh: String(data.glossZh ?? ''),
      hintZh: String(data.hintZh ?? ''),
    }
  }
  if (kind === 'scramble') {
    if (!data.sentence || !Array.isArray(data.tokens) || data.tokens.length < 2) return null
    return data as ScrambleDrill
  }
  if (kind === 'choice') {
    if (!data.sentence || !data.answer || !Array.isArray(data.options) || data.options.length < 2) return null
    return data as ChoiceDrill
  }
  return null
}

/** 由字符串派生一个稳定的伪随机数，保证同一个词每次看到的题一样。 */
function seeded(seed: string): () => number {
  let h = parseInt(hashString(seed), 36) || 1
  return () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 10000) / 10000
  }
}

function shuffle<T>(items: T[], seed: string): T[] {
  const rnd = seeded(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function buildScramble(mark: Mark, sentence: string): ScrambleDrill | null {
  const clean = sentence.replace(/\s+/g, ' ').trim()
  const tokens = clean.split(' ').filter(Boolean)
  if (tokens.length < 4 || tokens.length > 28) return null
  // 打乱后不能和原句一样，否则没意义
  let shuffled = shuffle(tokens, `${mark.id}:${clean}`)
  if (shuffled.join(' ') === tokens.join(' ')) {
    shuffled = [...tokens.slice(1), tokens[0]]
  }
  return {
    kind: 'scramble',
    promptVersion: 'scramble:v1',
    sentence: clean,
    answer: clean,
    tokens: shuffled,
    glossZh: '',
    hintZh: '把下面的词块按正确顺序排成一句话。标点跟着词块走。',
  }
}

const WORD_RE = /^[A-Za-z][A-Za-z'-]*$/

function pickDistractors(answer: string, pool: string[], count: number): string[] {
  const ansLemma = lemmaOf(answer)
  const ansLen = answer.length
  const seen = new Set<string>([ansLemma])
  const candidates: string[] = []
  for (const raw of pool) {
    const w = raw.trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
    if (!w || !WORD_RE.test(w)) continue
    const l = lemmaOf(w)
    if (!l || seen.has(l)) continue
    if (Math.abs(w.length - ansLen) > 4) continue
    if (w.toLowerCase() === answer.toLowerCase()) continue
    seen.add(l)
    candidates.push(w.toLowerCase())
  }
  if (!candidates.length) return []
  return shuffle(candidates, `${answer}:${candidates.length}`).slice(0, count)
}

export function buildChoice(cloze: ClozeDrill, pool: string[]): ChoiceDrill | null {
  const distractors = pickDistractors(cloze.answer, pool, 3)
  if (distractors.length < 3) return null
  const options = shuffle([cloze.answer, ...distractors], `${cloze.sentence}:${cloze.answer}`)
  return {
    kind: 'choice',
    promptVersion: cloze.promptVersion,
    sentence: cloze.sentence,
    answer: cloze.answer,
    options,
    glossZh: cloze.glossZh,
    hintZh: cloze.hintZh,
  }
}

/**
 * 题型轮换：新词第一轮固定用 cloze（先建立语境），之后按 reps 轮换。
 * 调用方在 buildDrill 里对不可用题型自动回退。
 */
export function pickKind(mark: Mark): DrillKind {
  if (mark.card.reps === 0) return 'cloze'
  const order: DrillKind[] = ['cloze', 'scramble', 'choice']
  const idx = parseInt(hashString(`${mark.id}:${mark.card.reps}`), 36) % order.length
  return order[idx]
}

/**
 * 生成一张题。scramble / choice 都基于原句和词池，不额外消耗 AI；
 * 只有 cloze 走 AI（有缓存和兜底）。
 */
export async function buildDrill(
  kind: DrillKind,
  mark: Mark,
  sourceSentence: string,
  pool: string[],
): Promise<DrillData> {
  if (kind === 'scramble') {
    const s = buildScramble(mark, sourceSentence)
    if (s) return s
  }
  const cloze = await generateCloze(mark, sourceSentence)
  if (kind === 'choice') {
    const c = buildChoice(cloze, pool)
    if (c) return c
  }
  return cloze
}

/** 判断填空/选择题的输入是否正确（允许词形变化）。 */
export function answerMatches(input: string, answer: string): boolean {
  return normalizeAnswer(input) === normalizeAnswer(answer)
}

/** 连词成句的判分：忽略多余空白和首尾标点差异。 */
export function scrambleMatches(assembled: string[], sentence: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/g, '').toLowerCase()
  return norm(assembled.join(' ')) === norm(sentence)
}
