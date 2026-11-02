import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { Sentence } from '../components/Sentence'
import { SpeakerButton } from '../components/SpeakerButton'
import { go } from '../lib/nav'
import { isDue, isMastered } from '../lib/srs'
import type { Mark, Material } from '../types'

export function WordPage({ lemma }: { lemma: string }) {
  const [query, setQuery] = useState(lemma)
  const [marks, setMarks] = useState<Mark[]>([])
  const [mats, setMats] = useState<Map<string, Material>>(new Map())
  const [searched, setSearched] = useState(lemma)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [ms] = await Promise.all([db.allMaterials()])
      if (!alive) return
      setMats(new Map(ms.map((m) => [m.id, m])))
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!searched.trim()) {
      setMarks([])
      return
    }
    let alive = true
    db.marksByLemma(searched.trim().toLowerCase()).then((mk) => {
      if (alive) setMarks(mk)
    })
    return () => {
      alive = false
    }
  }, [searched])

  const groups = useMemo(() => {
    const map = new Map<string, Mark[]>()
    for (const m of marks) {
      const arr = map.get(m.materialId) ?? []
      arr.push(m)
      map.set(m.materialId, arr)
    }
    return [...map.entries()]
  }, [marks])

  const search = () => {
    const q = query.trim().toLowerCase()
    if (!q) return
    go(`/word/${encodeURIComponent(q)}`)
    setSearched(q)
  }

  return (
    <div className="page narrow">
      <button className="link" onClick={() => go('/')}>
        ← 素材库
      </button>
      <h1>按词复习</h1>
      <p className="muted">输入一个词，看它在你所有素材里的每次出现，词形变化也会一起召回。</p>

      <div className="row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="例如 develop"
        />
        <button className="btn primary" onClick={search}>
          搜索
        </button>
        <SpeakerButton text={searched} label="朗读这个词" />
      </div>

      {marks.length === 0 && searched && (
        <div className="empty">
          <h2>没有标记过这个词</h2>
          <p className="muted">在素材里点词后，它就会出现在这里。</p>
        </div>
      )}

      {groups.map(([materialId, group]) => {
        const mat = mats.get(materialId)
        return (
          <section key={materialId} className="word-group">
            <div className="word-group-head">
              <b>{mat?.title ?? '已删除的素材'}</b>
              <span className="muted small">{group.length} 处</span>
              {mat && (
                <button className="link small" onClick={() => go(`/m/${materialId}`)}>
                  打开素材 →
                </button>
              )}
            </div>
            {group.map((m) => {
              const sentence = mat?.cues[m.cueIndex]?.text ?? m.text
              return (
                <div key={m.id} className="word-row">
                  <Sentence text={sentence} marks={[m]} />
                  <div className="word-status">
                    <em className={isDue(m.card) ? 'due' : 'cooled'}>
                      {isDue(m.card) ? '待复习' : new Date(m.card.due).toLocaleDateString()}
                    </em>
                    {isMastered(m.card) && <em className="mastered">已掌握</em>}
                    {mat?.kind === 'youtube' && mat.videoId && m.startSec != null && (
                      <a
                        className="link small"
                        href={`https://youtu.be/${mat.videoId}?t=${Math.floor(m.startSec)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ▶ 原片
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
