import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { NoteEditor } from '../components/NoteEditor'
import { Sentence } from '../components/Sentence'
import { SpeakerButton } from '../components/SpeakerButton'
import { lookupWord } from '../lib/ai'
import { wordFamily } from '../lib/family'
import { go } from '../lib/nav'
import { isDue, isMastered } from '../lib/srs'
import type { Mark, Material } from '../types'

interface Dict {
  meaningZh: string
  pos: string
}

export function WordPage({ lemma }: { lemma: string }) {
  const [query, setQuery] = useState(lemma)
  const [marks, setMarks] = useState<Mark[]>([])
  const [allMarks, setAllMarks] = useState<Mark[]>([])
  const [mats, setMats] = useState<Map<string, Material>>(new Map())
  const [searched, setSearched] = useState(lemma)
  const [dict, setDict] = useState<Dict | null>(null)
  const [dictLoading, setDictLoading] = useState(false)
  const [dictFail, setDictFail] = useState(false)

  useEffect(() => {
    setQuery(lemma)
    setSearched(lemma)
  }, [lemma])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [ms, mk] = await Promise.all([db.allMaterials(), db.getAllMarks()])
      if (!alive) return
      setMats(new Map(ms.map((m) => [m.id, m])))
      setAllMarks(mk as Mark[])
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

  // 词条释义（AI 词典，缓存；查不到静默）
  useEffect(() => {
    if (!searched.trim()) return
    let alive = true
    setDict(null)
    setDictFail(false)
    setDictLoading(true)
    const sample = sampleSentence()
    lookupWord(searched.trim().toLowerCase(), sample || searched)
      .then((r) => {
        if (!alive) return
        setDictLoading(false)
        if (r) setDict(r)
        else setDictFail(true)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const family = useMemo(() => {
    if (!searched.trim()) return []
    const known = new Set<string>()
    for (const m of allMarks) {
      known.add(m.text)
      known.add(m.lemma)
    }
    return wordFamily(searched, known)
  }, [searched, allMarks])

  const sampleSentence = (): string => {
    if (!marks.length) return ''
    const first = marks[0]
    const mat = mats.get(first.materialId)
    return mat?.cues[first.cueIndex]?.text ?? first.text
  }

  const saveNote = async (mark: Mark, note: string, example: string) => {
    const updated: Mark = { ...mark, note: note || undefined, example: example || undefined }
    await db.putMark(updated)
    setMarks((prev) => prev.map((m) => (m.id === mark.id ? updated : m)))
  }

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

      {searched && (
        <div className="word-dict">
          <div className="wd-head">
            <b>{searched}</b>
            {dict?.pos && <em className="lookup-pos">{dict.pos}</em>}
            <SpeakerButton text={searched} label="朗读" small />
          </div>
          <div className="wd-body">
            {dictLoading && <span className="muted small">查词中…</span>}
            {dictFail && <span className="muted small">AI 词典暂时不可用。</span>}
            {dict && <span>{dict.meaningZh}</span>}
          </div>
          {family.length > 0 && (
            <div className="wd-family">
              <span className="muted small">词族：</span>
              {family.map((f) => (
                <button
                  key={f.word}
                  className={`form-chip${f.word.toLowerCase() === searched.toLowerCase() ? ' self' : ''}`}
                  onClick={() => go(`/word/${encodeURIComponent(f.word)}`)}
                >
                  {f.word}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
                    {m.kind === 'phrase' && <em className="phrase-tag">短语</em>}
                    {m.kind === 'sentence' && <em className="phrase-tag">整句</em>}
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
                  <NoteEditor
                    note={m.note}
                    example={m.example}
                    onSave={(note, example) => saveNote(m, note, example)}
                  />
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
