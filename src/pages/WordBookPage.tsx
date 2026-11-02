import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { go } from '../lib/nav'
import { isDue, isMastered } from '../lib/srs'
import { SpeakerButton } from '../components/SpeakerButton'
import type { Mark, Material } from '../types'

type Filter = 'all' | 'due' | 'mastered' | 'leech'
type Sort = 'recent' | 'due' | 'lapses'

interface Agg {
  lemma: string
  forms: Map<string, number>
  count: number
  materialIds: Set<string>
  due: number
  mastered: boolean
  lapses: number
  nextDue: number
  lastSeen: number
  sample: { text: string; sentence: string; materialId: string }
}

const FILTER_LABEL: Record<Filter, string> = {
  all: '全部',
  due: '待复习',
  mastered: '已掌握',
  leech: '难词',
}

export function WordBookPage() {
  const [marks, setMarks] = useState<Mark[]>([])
  const [mats, setMats] = useState<Map<string, Material>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('due')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [mk, ms] = await Promise.all([db.getAllMarks(), db.allMaterials()])
      if (!alive) return
      setMarks(mk as Mark[])
      setMats(new Map((ms as Material[]).map((m) => [m.id, m])))
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  const aggs = useMemo(() => {
    const map = new Map<string, Agg>()
    for (const m of marks) {
      const mat = mats.get(m.materialId)
      const sentence = mat?.cues[m.cueIndex]?.text ?? m.text
      let a = map.get(m.lemma)
      if (!a) {
        a = {
          lemma: m.lemma,
          forms: new Map(),
          count: 0,
          materialIds: new Set(),
          due: 0,
          mastered: true,
          lapses: 0,
          nextDue: Number.MAX_SAFE_INTEGER,
          lastSeen: 0,
          sample: { text: m.text, sentence, materialId: m.materialId },
        }
        map.set(m.lemma, a)
      }
      a.count += 1
      a.forms.set(m.text.toLowerCase(), (a.forms.get(m.text.toLowerCase()) ?? 0) + 1)
      a.materialIds.add(m.materialId)
      if (isDue(m.card)) a.due += 1
      if (!isMastered(m.card)) a.mastered = false
      a.lapses += m.card.lapses
      a.nextDue = Math.min(a.nextDue, new Date(m.card.due).getTime())
      if (m.createdAt > a.lastSeen) {
        a.lastSeen = m.createdAt
        a.sample = { text: m.text, sentence, materialId: m.materialId }
      }
    }
    return [...map.values()]
  }, [marks, mats])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = aggs.filter((a) => {
      if (needle && !a.lemma.includes(needle) && ![...a.forms.keys()].some((f) => f.includes(needle))) {
        return false
      }
      if (filter === 'due') return a.due > 0
      if (filter === 'mastered') return a.mastered
      if (filter === 'leech') return a.lapses >= 4
      return true
    })
    list = [...list].sort((a, b) => {
      if (sort === 'due') {
        if (a.due > 0 && b.due === 0) return -1
        if (b.due > 0 && a.due === 0) return 1
        return a.nextDue - b.nextDue
      }
      if (sort === 'lapses') return b.lapses - a.lapses || b.count - a.count
      return b.lastSeen - a.lastSeen
    })
    return list
  }, [aggs, q, filter, sort])

  const total = aggs.length
  const dueCount = aggs.filter((a) => a.due > 0).length
  const masteredCount = aggs.filter((a) => a.mastered).length
  const leechCount = aggs.filter((a) => a.lapses >= 4).length

  if (!loaded) return <div className="page muted">加载中…</div>

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>单词本</h1>
          <p className="muted">按词形归并你在所有素材里标记过的词，看它们出现几次、掌握到什么程度。</p>
        </div>
        <div className="row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索单词…"
            className="search"
          />
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <b>{total}</b>
          <span>个词</span>
        </div>
        <div className="stat accent">
          <b>{dueCount}</b>
          <span>待复习</span>
        </div>
        <div className="stat">
          <b>{masteredCount}</b>
          <span>已掌握</span>
        </div>
        <div className="stat">
          <b>{leechCount}</b>
          <span>难词</span>
        </div>
      </section>

      <div className="toolbar">
        <div className="seg">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
            <button
              key={f}
              className={filter === f ? 'seg-btn active' : 'seg-btn'}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABEL[f]}
              {f === 'due' && dueCount > 0 ? ` ${dueCount}` : ''}
              {f === 'leech' && leechCount > 0 ? ` ${leechCount}` : ''}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="sort">
          <option value="due">按到期排序</option>
          <option value="lapses">按遗忘次数排序</option>
          <option value="recent">按最近标记排序</option>
        </select>
      </div>

      {shown.length === 0 && (
        <div className="empty">
          <h2>{total === 0 ? '还没有标记任何词' : '没有符合条件的词'}</h2>
          <p className="muted">
            {total === 0
              ? '去素材里点几个不熟的词，它们会自动进到单词本和复习队列。'
              : '换个筛选条件或搜索词试试。'}
          </p>
          {total === 0 && (
            <button className="btn primary" onClick={() => go('/import')}>
              导入素材
            </button>
          )}
        </div>
      )}

      <div className="wordbook">
        {shown.map((a) => (
          <div key={a.lemma} className="wordbook-row">
            <div className="wb-main">
              <div className="wb-word">
                <b>{a.lemma}</b>
                <SpeakerButton text={a.lemma} small />
                {a.mastered && <em className="mastered">已掌握</em>}
                {a.due > 0 && <em className="due">{a.due} 待复习</em>}
                {a.lapses >= 4 && <em className="leech-tag">难词</em>}
              </div>
              <div className="wb-forms">
                {[...a.forms.entries()].map(([f, n]) => (
                  <span key={f} className="form-chip">
                    {f}
                    {n > 1 && <small>×{n}</small>}
                  </span>
                ))}
              </div>
              <div className="muted small wb-sample">“{a.sample.sentence.slice(0, 90)}{a.sample.sentence.length > 90 ? '…' : ''}”</div>
            </div>
            <div className="wb-side">
              <span className="muted small">{a.count} 次 · {a.materialIds.size} 个素材</span>
              <span className="muted small">
                {a.due > 0 ? '现在' : a.nextDue === Number.MAX_SAFE_INTEGER ? '' : new Date(a.nextDue).toLocaleDateString()}
              </span>
              <div className="row">
                <button className="link small" onClick={() => go(`/word/${encodeURIComponent(a.lemma)}`)}>
                  出处 →
                </button>
                <button className="link small" onClick={() => go(`/m/${a.sample.materialId}`)}>
                  打开素材
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
