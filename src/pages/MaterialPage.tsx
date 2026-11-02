import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { LocalVideoPlayer } from '../components/LocalVideoPlayer'
import { LookupPopover, type PopoverState } from '../components/LookupPopover'
import { Sentence } from '../components/Sentence'
import { SpeakerButton } from '../components/SpeakerButton'
import { YouTubePlayer } from '../components/YouTubePlayer'
import { go } from '../lib/nav'
import { newCard } from '../lib/srs'
import { fmtSec, lemmaOf } from '../lib/text'
import type { Cue, Mark, Material } from '../types'

export function MaterialPage({ id }: { id: string }) {
  const [material, setMaterial] = useState<Material | null>(null)
  const [marks, setMarks] = useState<Mark[]>([])
  const [sec, setSec] = useState(0)
  const [seek, setSeek] = useState<{ sec: number; nonce: number } | null>(null)
  const [toast, setToast] = useState('')
  const [lookupMode, setLookupMode] = useState(false)
  const [pop, setPop] = useState<PopoverState | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [m, mk] = await Promise.all([db.getMaterial(id), db.getMarksByMaterial(id)])
      if (!alive) return
      setMaterial(m ?? null)
      setMarks((mk as Mark[]) ?? [])
    })()
    return () => {
      alive = false
    }
  }, [id])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  const marksByCue = useMemo(() => {
    const map = new Map<number, Mark[]>()
    for (const m of marks) {
      const arr = map.get(m.cueIndex) ?? []
      arr.push(m)
      map.set(m.cueIndex, arr)
    }
    return map
  }, [marks])

  const activeCue = useMemo(() => {
    if (!material || material.kind === 'article') return -1
    return material.cues.findIndex(
      (c) => c.startSec != null && c.endSec != null && sec >= c.startSec && sec < c.endSec,
    )
  }, [material, sec])

  if (!material) {
    return (
      <div className="page narrow">
        <button className="link" onClick={() => go('/')}>
          ← 返回素材库
        </button>
        <div className="empty">
          <h2>素材不存在或已被删除</h2>
        </div>
      </div>
    )
  }

  const isMarked = (cue: Cue, word: string) =>
    marks.some((m) => m.cueIndex === cue.index && m.text.toLowerCase() === word.toLowerCase())

  const toggleWord = async (cue: Cue, word: string, force?: boolean) => {
    const existing = marks.find(
      (m) => m.cueIndex === cue.index && m.text.toLowerCase() === word.toLowerCase(),
    )
    const shouldMark = force ?? !existing
    if (!shouldMark) {
      if (!existing) return
      await db.delMark(existing.id)
      setMarks((prev) => prev.filter((m) => m.id !== existing.id))
      setToast(`已取消「${word}」`)
      return
    }
    if (existing) return
    const mark: Mark = {
      id: crypto.randomUUID(),
      materialId: material.id,
      cueIndex: cue.index,
      kind: 'word',
      text: word,
      lemma: lemmaOf(word),
      startSec: cue.startSec,
      endSec: cue.endSec,
      createdAt: Date.now(),
      card: newCard(),
    }
    await db.putMark(mark)
    setMarks((prev) => [...prev, mark])
    setToast(`已标记「${word}」· 加入今日复习`)
  }

  const onWord = (cue: Cue) => (word: string, e: React.MouseEvent) => {
    if (lookupMode) {
      setPop({
        word,
        sentence: cue.text,
        x: e.clientX,
        y: e.clientY + 8,
        marked: isMarked(cue, word),
        onMark: (mk) => toggleWord(cue, word, mk),
      })
      return
    }
    toggleWord(cue, word)
  }

  const seekCue = (cue: Cue) => {
    if (cue.startSec == null) return
    setSeek({ sec: cue.startSec, nonce: Date.now() })
  }

  const deleteMaterial = async () => {
    if (!confirm(`删除「${material.title}」及其 ${marks.length} 个标记？不可恢复。`)) return
    await Promise.all(marks.map((m) => db.delMark(m.id)))
    await db.delMaterial(material.id)
    go('/')
  }

  const dueHere = marks.filter((m) => new Date(m.card.due).getTime() <= Date.now()).length

  return (
    <div className="page material-page">
      <div className="material-head">
        <button className="link" onClick={() => go('/')}>
          ← 素材库
        </button>
        <div className="material-title">
          <h1>{material.title}</h1>
          <p className="muted small">
            {material.kind === 'article' ? '文章' : material.kind === 'youtube' ? 'YouTube' : '本地视频'} ·{' '}
            {material.cues.length} 句 · {marks.length} 个标记
            {material.url && (
              <>
                {' · '}
                <a href={material.url} target="_blank" rel="noreferrer">
                  原链接
                </a>
              </>
            )}
          </p>
        </div>
        <div className="row">
          {dueHere > 0 && (
            <button className="btn small primary" onClick={() => go('/review')}>
              复习 {dueHere}
            </button>
          )}
          <button
            className={`btn small ${lookupMode ? 'primary' : ''}`}
            onClick={() => {
              setLookupMode((v) => !v)
              setPop(null)
            }}
            title={lookupMode ? '点击词查释义' : '点击词直接标记'}
          >
            {lookupMode ? '🔍 查词中' : '🔍 查词模式'}
          </button>
          <button className="btn small danger" onClick={deleteMaterial}>
            删除
          </button>
        </div>
      </div>

      <div className="material-body">
        <aside className="stage">
          {material.kind === 'youtube' && material.videoId && (
            <div className="player-shell">
              <YouTubePlayer videoId={material.videoId} seekTo={seek} onTime={setSec} />
            </div>
          )}
          {material.kind === 'local' && (
            <div className="player-shell">
              <LocalVideoPlayer materialId={material.id} seekTo={seek} onTime={setSec} />
            </div>
          )}
          {material.kind === 'article' && (
            <div className="article-note">
              <b>阅读模式</b>
              <p className="muted small">
                {lookupMode
                  ? '点单词查释义；气泡里可以一键标记生词。'
                  : '点单词直接标记；右侧可以切到查词模式。'}
              </p>
            </div>
          )}

          <div className="mark-panel">
            <div className="mark-head">
              <b>已标记</b>
              <span className="muted small">{marks.length}</span>
            </div>
            {marks.length === 0 && <p className="muted small">还没有标记。看到不熟的词就点它。</p>}
            <ul className="mark-list">
              {[...marks]
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((m) => {
                  const due = new Date(m.card.due).getTime() <= Date.now()
                  return (
                    <li key={m.id}>
                      <div>
                        <b>{m.text}</b>
                        <em className={due ? 'due' : 'cooled'}>{due ? '待复习' : `${new Date(m.card.due).toLocaleDateString()} 复习`}</em>
                      </div>
                      <button
                        className="link small"
                        onClick={async () => {
                          await db.delMark(m.id)
                          setMarks((prev) => prev.filter((x) => x.id !== m.id))
                        }}
                      >
                        删除
                      </button>
                    </li>
                  )
                })}
            </ul>
          </div>
        </aside>

        <section className="transcript">
          {material.cues.map((cue) => {
            const active = cue.index === activeCue
            return (
              <div
                key={cue.index}
                className={active ? 'cue active' : 'cue'}
                onClick={() => seekCue(cue)}
                role={cue.startSec != null ? 'button' : undefined}
              >
                <div className="cue-meta">
                  <span>{String(cue.index + 1).padStart(2, '0')}</span>
                  {cue.startSec != null && <span className="time">{fmtSec(cue.startSec)}</span>}
                  <SpeakerButton text={cue.text} label="朗读这句" small />
                </div>
                <Sentence
                  text={cue.text}
                  marks={marksByCue.get(cue.index) ?? []}
                  onWord={onWord(cue)}
                />
              </div>
            )
          })}
        </section>
      </div>

      {pop && <LookupPopover key={`${pop.word}:${pop.x}:${pop.y}`} pop={pop} onClose={() => setPop(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
