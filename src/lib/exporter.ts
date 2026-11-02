import { db } from '../db'
import type { Mark, Material } from '../types'

function cell(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`
}

/** 导出所有标记为 CSV（Excel / Anki / 其他工具都能导入）。 */
export async function exportMarksCsv(): Promise<number> {
  const [marks, materials] = await Promise.all([db.getAllMarks(), db.allMaterials()])
  const mats = new Map((materials as Material[]).map((m) => [m.id, m]))

  const header = ['word', 'lemma', 'kind', 'note', 'sentence', 'material', 'source', 'due', 'reps', 'lapses']
  const rows = (marks as Mark[]).map((m) => {
    const mat = mats.get(m.materialId)
    const sentence = mat?.cues[m.cueIndex]?.text ?? ''
    return [
      m.text,
      m.lemma,
      m.kind,
      m.note ?? '',
      sentence,
      mat?.title ?? '',
      mat?.url ?? '',
      m.card.due,
      m.card.reps,
      m.card.lapses,
    ]
  })

  const csv = '\ufeff' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `whitespace-words-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  return rows.length
}
