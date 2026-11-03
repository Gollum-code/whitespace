import { generateCloze, lookupWord } from './ai'
import { hashString, lemmaOf, normalizeAnswer, tokenize } from './text'
import type {
  ChoiceDrill,
  ClozeDrill,
  DefDrill,
  DefOption,
  DictateDrill,
  DrillData,
  DrillKind,
  FixDrill,
  Mark,
  ScrambleDrill,
} from '../types'

export const DRILL_LABEL: Record<DrillKind, string> = {
  cloze: '挖空填空',
  scramble: '连词成句',
  choice: '选词填空',
  dictate: '整句听写',
  fix: '改错',
  def: '释义选择',
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'this', 'that', 'these',
  'those', 'as', 'by', 'from', 'not', 'no', 'so', 'if', 'than', 'then', 'there',
  'here', 'you', 'he', 'she', 'we', 'they', 'i', 'me', 'him', 'her', 'us', 'them',
  'his', 'her', 'its', 'our', 'their', 'my', 'your',
])

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
  if (kind === 'dictate') {
    if (!data.sentence) return null
    return data as DictateDrill
  }
  if (kind === 'fix') {
    if (!data.sentence || !data.answer || !data.wrong || !Array.isArray(data.options) || data.options.length < 2) return null
    return data as FixDrill
  }
  if (kind === 'def') {
    if (!data.word || !Array.isArray(data.options) || data.options.length < 2) return null
    return data as DefDrill
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

function wordsOf(sentence: string): string[] {
  return sentence.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
}

export function buildScramble(mark: Mark, sentence: string): ScrambleDrill | null {
  const clean = sentence.replace(/\s+/g, ' ').trim()
  const tokens = wordsOf(clean)
  if (tokens.length < 4 || tokens.length > 28) return null
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

export function buildDictate(_mark: Mark, sentence: string): DictateDrill {
  const clean = sentence.replace(/\s+/g, ' ').trim()
  return {
    kind: 'dictate',
    promptVersion: 'dictate:v1',
    sentence: clean,
    answer: clean,
    glossZh: '',
    hintZh: '听整句，把它完整写下来。标点不必在意。',
  }
}

/** 改错：从原句挑一个实词换成近形干扰词，用户选出正确词。 */
export function buildFix(mark: Mark, sentence: string, pool: string[]): FixDrill | null {
  const tokens = tokenize(sentence)
  const content = tokens.filter(
    (t) => t.isWord && t.text.length >= 4 && !STOP.has(t.text.toLowerCase()) && WORD_RE.test(t.text),
  )
  if (!content.length) return null
  const rnd = seeded(`${mark.id}:${sentence}`)
  const target = content[Math.floor(rnd() * content.length)]
  const distractors = pickDistractors(target.text, pool, 3)
  if (distractors.length < 3) return null
  const wrong = distractors[Math.floor(rnd() * distractors.length)]
  const options = shuffle([target.text, ...distractors], `${sentence}:${wrong}`)
  const broken = sentence.slice(0, target.start) + wrong + sentence.slice(target.end)
  return {
    kind: 'fix',
    promptVersion: 'fix:v1',
    sentence: broken,
    answer: target.text,
    wrong,
    options,
    glossZh: '',
    hintZh: `句子里有个词用错了，选出正确的那个。`,
  }
}

/** 释义选择：目标词 + 3 个干扰词的中文释义，需要 AI（有缓存），查不到返回 null。 */
export async function buildDef(mark: Mark, context: string, pool: string[]): Promise<DefDrill | null> {
  const target = await lookupWord(mark.text, context)
  if (!target?.meaningZh) return null
  const distractorWords = pickDistractors(mark.text, pool, 3)
  if (distractorWords.length < 3) return null

  const options: DefOption[] = [{ text: mark.text, pos: target.pos, meaningZh: target.meaningZh }]
  for (const w of distractorWords) {
    const r = await lookupWord(w, context)
    if (!r?.meaningZh) return null
    options.push({ text: w, pos: r.pos, meaningZh: r.meaningZh })
  }
  if (new Set(options.map((o) => o.meaningZh)).size < options.length) return null

  const shuffled = shuffle(options, `${mark.lemma}:${mark.card.reps}`)
  return {
    kind: 'def',
    promptVersion: 'def:v1',
    word: mark.text,
    options: shuffled,
    glossZh: '',
    hintZh: `选出「${mark.text}」的意思。`,
  }
}

/**
 * 题型轮换：新词第一轮固定用 cloze（先建立语境），之后按 reps 轮换。
 * 短语/整句不走 cloze/def（那是按单词挖空/释义的），短语优先 scramble/dictate。
 * 调用方在 buildDrill 里对不可用题型自动回退。
 */
export function pickKind(mark: Mark): DrillKind {
  if (mark.kind === 'sentence') {
    // 整句：最适合整句听写和连词成句
    const sentenceOrder: DrillKind[] = ['scramble', 'dictate']
    return sentenceOrder[parseInt(hashString(`${mark.id}:${mark.card.reps}`), 36) % sentenceOrder.length]
  }
  const multi = mark.kind === 'phrase' || mark.text.includes(' ')
  if (mark.card.reps === 0) return multi ? 'scramble' : 'cloze'
  const order: DrillKind[] = multi
    ? ['scramble', 'choice', 'dictate', 'fix']
    : ['cloze', 'scramble', 'choice', 'dictate', 'fix', 'def']
  const idx = parseInt(hashString(`${mark.id}:${mark.card.reps}`), 36) % order.length
  return order[idx]
}

/**
 * 生成一张题。scramble / dictate / fix 基于原句和词池，不额外消耗 AI；
 * cloze 走 AI（有缓存和兜底）；def 需要查词（缓存，AI 不可用则回退）。
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
  if (kind === 'dictate') {
    return buildDictate(mark, sourceSentence)
  }
  if (kind === 'fix') {
    const f = buildFix(mark, sourceSentence, pool)
    if (f) return f
  }
  const cloze = await generateCloze(mark, sourceSentence)
  if (kind === 'choice') {
    const c = buildChoice(cloze, pool)
    if (c) return c
  }
  if (kind === 'def') {
    const d = await buildDef(mark, sourceSentence, pool)
    if (d) return d
  }
  return cloze
}

/** 判断填空/选择/听写/改错的输入是否正确（允许词形变化，忽略标点）。 */
export function answerMatches(input: string, answer: string): boolean {
  return normalizeAnswer(input) === normalizeAnswer(answer)
}

/** 连词成句的判分：忽略多余空白和首尾标点差异。 */
export function scrambleMatches(assembled: string[], sentence: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/g, '').toLowerCase()
  return norm(assembled.join(' ')) === norm(sentence)
}
