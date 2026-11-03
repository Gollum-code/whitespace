import { db } from '../db'
import type { Mark, Material } from '../types'

function cell(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, ' ')
    .replace(/\r?\n/g, ' ')
}

export interface ExportSource {
  marks: Mark[]
  mats: Map<string, Material>
}

async function loadSource(): Promise<ExportSource> {
  const [marks, materials] = await Promise.all([db.getAllMarks(), db.allMaterials()])
  return { marks: marks as Mark[], mats: new Map((materials as Material[]).map((m) => [m.id, m])) }
}

/** 导出所有标记为 CSV（Excel / Anki / 其他工具都能导入）。 */
export async function exportMarksCsv(): Promise<number> {
  const { marks, mats } = await loadSource()
  const header = ['word', 'lemma', 'kind', 'note', 'example', 'sentence', 'material', 'source', 'due', 'reps', 'lapses']
  const rows = marks.map((m) => {
    const mat = mats.get(m.materialId)
    const sentence = mat?.cues[m.cueIndex]?.text ?? ''
    return [
      m.text,
      m.lemma,
      m.kind,
      m.note ?? '',
      m.example ?? '',
      sentence,
      mat?.title ?? '',
      mat?.url ?? '',
      m.card.due,
      m.card.reps,
      m.card.lapses,
    ]
  })

  const csv = '\ufeff' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
  download(csv, 'text/csv;charset=utf-8', `whitespace-words-${new Date().toISOString().slice(0, 10)}.csv`)
  return rows.length
}

/**
 * 导出 Anki 可导入的制表符文件。
 * 正面：词 + 语境句（挖空）；背面：释义/笔记/个人例句 + 出处。
 * Anki 导入时选「Tab 分隔」即可。
 */
export async function exportAnkiTsv(): Promise<number> {
  const { marks, mats } = await loadSource()
  const rows = marks.map((m) => {
    const mat = mats.get(m.materialId)
    const sentence = mat?.cues[m.cueIndex]?.text ?? ''
    // 用 Anki 的 {{c1::}} 挖空语法，方便直接做填空
    const front = sentence
      ? esc(sentence).replace(new RegExp(`\\b${escapeRe(esc(m.text))}\\b`, 'i'), `{{c1::${esc(m.text)}}}`)
      : esc(m.text)
    const back = [
      `<b>${esc(m.text)}</b>`,
      m.note ? `<div>${esc(m.note)}</div>` : '',
      m.example ? `<div><i>${esc(m.example)}</i></div>` : '',
      mat?.title ? `<div class="src">— ${esc(mat.title)}</div>` : '',
    ]
      .filter(Boolean)
      .join('')
    return [front, back]
  })
  const tsv = rows.map((r) => r.join('\t')).join('\n')
  download(tsv, 'text/tab-separated-values;charset=utf-8', `whitespace-anki-${new Date().toISOString().slice(0, 10)}.txt`)
  return rows.length
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function download(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

