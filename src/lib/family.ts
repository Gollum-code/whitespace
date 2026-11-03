/**
 * 词族（word family）：把一个词和它词形变化/派生词归到一起。
 * 没有词典，就用规则法：枚举常见词缀，看两个词是否共享同一个词干。
 * 只用来给「词条详情页」列出你标过的相关词，不用于判分，粗糙没关系。
 */

// 常见后缀。顺序很重要：长的先匹配（比如 -tion 在 -t 之前）。
const SUFFIXES = [
  'ization', 'ational', 'ation', 'ition', 'ment', 'ness', 'fully', 'hood',
  'ship', 'ability', 'ibility', 'ously', 'eously', 'fully', 'less', 'able',
  'ible', 'ical', 'ally', 'ative', 'itive', 'ious', 'eous', 'ance', 'ence',
  'ancy', 'ency', 'ous', 'ity', 'ive', 'ist', 'ism', 'ise', 'ize', 'ful',
  'ing', 'ed', 'es', 's', 'er', 'est', 'ly', 'y', 'al', 'ic', 'tion', 't',
]

const PREFIXES = ['inter', 'over', 'under', 'anti', 'counter', 'pre', 'post', 'sub', 'super', 'un', 're', 'in', 'im', 'dis', 'mis', 'non', 'de', 'ex', 'en', 'em', 'out', 'up']

/** 去掉双写尾字母：running → runn → run；bigger → bigg → big。 */
function dedouble(w: string): string {
  return /([^aeiou])\1$/.test(w) && w.length >= 4 ? w.slice(0, -1) : w
}

/** 候选词干：词本身 + 去词缀 + 去词缀后的双写/补 e 变体。 */
function stemsOf(word: string): Set<string> {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  const out = new Set<string>([w])
  if (w.length < 3) return out
  for (const p of PREFIXES) {
    if (w.startsWith(p) && w.length - p.length >= 3) out.add(w.slice(p.length))
  }
  for (const s of SUFFIXES) {
    if (w.endsWith(s) && w.length - s.length >= 3) {
      const base = w.slice(0, w.length - s.length)
      out.add(base)
      out.add(dedouble(base))
      // make → mak + e；use → us + e（ing/ed 去掉后常要补回 e）
      if (/[^aeiou]$/.test(base) && base.length >= 3) out.add(base + 'e')
    }
  }
  return out
}

/**
 * 在给定的「已标记词」集合里，找和 target 同词族的词。
 * 返回按相关度排序的词条（含 target 自身，词形还原后的）。
 */
export function wordFamily(target: string, known: Iterable<string>): { word: string; related: boolean }[] {
  const t = target.toLowerCase().replace(/[^a-z]/g, '')
  if (!t) return []
  const tStems = stemsOf(t)
  const seen = new Set<string>()
  const out: { word: string; related: boolean }[] = []
  for (const raw of known) {
    const w = raw.toLowerCase().replace(/[^a-z]/g, '')
    if (!w || w === t) continue
    if (seen.has(w)) continue
    const s = stemsOf(w)
    let shared = false
    for (const st of s) if (tStems.has(st)) { shared = true; break }
    if (!shared) continue
    seen.add(w)
    out.push({ word: raw, related: true })
  }
  // 按长度升序（越像的词越靠前）
  return out.sort((a, b) => a.word.length - b.word.length).slice(0, 12)
}
