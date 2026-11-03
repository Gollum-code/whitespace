import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { LocalVideoPlayer } from '../components/LocalVideoPlayer'
import { LookupPopover, type PopoverState } from '../components/LookupPopover'
import { NoteEditor } from '../components/NoteEditor'
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
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

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
    const lemma = lemmaOf(word)
    // 同一个词已标记过就沿用它的卡片，做到一词一卡、进度同步
    const same = marks.find((m) => m.lemma === lemma)
    const mark: Mark = {
      id: crypto.randomUUID(),
      materialId: material.id,
      cueIndex: cue.index,
      kind: 'word',
      text: word,
      lemma,
      startSec: cue.startSec,
      endSec: cue.endSec,
      createdAt: Date.now(),
      card: same ? same.card : newCard(),
    }
    await db.putMark(mark)
    setMarks((prev) => [...prev, mark])
    setToast(`已标记「${word}」· 加入今日复习`)
  }

  const togglePhrase = async (cue: Cue, phrase: string) => {
    const norm = phrase.replace(/\s+/g, ' ').trim()
    if (!norm) return
    const existing = marks.find(
      (m) => m.cueIndex === cue.index && m.text.toLowerCase() === norm.toLowerCase(),
    )
    if (existing) {
      await db.delMark(existing.id)
      setMarks((prev) => prev.filter((m) => m.id !== existing.id))
      setToast(`已取消短语「${norm}」`)
      return
    }
    const lemma = norm.toLowerCase()
    const same = marks.find((m) => m.lemma === lemma)
    const mark: Mark = {
      id: crypto.randomUUID(),
      materialId: material.id,
      cueIndex: cue.index,
      kind: 'phrase',
      text: norm,
      lemma,
      startSec: cue.startSec,
      endSec: cue.endSec,
      createdAt: Date.now(),
      card: same ? same.card : newCard(),
    }
    await db.putMark(mark)
    setMarks((prev) => [...prev, mark])
    setToast(`已标记短语「${norm}」`)
  }

  const toggleSentence = async (cue: Cue) => {
    const text = cue.text.replace(/\s+/g, ' ').trim()
    if (!text) return
    const existing = marks.find((m) => m.cueIndex === cue.index && m.kind === 'sentence')
    if (existing) {
      await db.delMark(existing.id)
      setMarks((prev) => prev.filter((m) => m.id !== existing.id))
      setToast('已取消整句标记')
      return
    }
    const lemma = `sentence:${text.toLowerCase()}`
    const mark: Mark = {
      id: crypto.randomUUID(),
      materialId: material.id,
      cueIndex: cue.index,
      kind: 'sentence',
      text,
      lemma,
      startSec: cue.startSec,
      endSec: cue.endSec,
      createdAt: Date.now(),
      card: newCard(),
    }
    await db.putMark(mark)
    setMarks((prev) => [...prev, mark])
    setToast('已标记整句 · 加入今日复习')
  }

  const saveNote = async (mark: Mark, note: string, example: string) => {
    const updated: Mark = { ...mark, note: note || undefined, example: example || undefined }
    await db.putMark(updated)
    setMarks((prev) => prev.map((m) => (m.id === mark.id ? updated : m)))
  }

  const startRename = () => {
    setTitleDraft(material.title)
    setEditingTitle(true)
  }

  const saveTitle = async () => {
    const t = titleDraft.trim()
    setEditingTitle(false)
    if (!t || t === material.title) return
    const updated: Material = { ...material, title: t }
    await db.putMaterial(updated)
    setMaterial(updated)
    setToast('标题已更新')
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
          {editingTitle ? (
            <div className="title-edit">
              <input
                value={titleDraft}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
              />
              <div className="row">
                <button className="btn small primary" onClick={saveTitle}>
                  保存
                </button>
                <button className="btn small" onClick={() => setEditingTitle(false)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1>{material.title}</h1>
              <button className="link small" onClick={startRename}>
                重命名
              </button>
            </>
          )}
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
                  : '点单词标记；选中 2–6 个词标记短语；点「整句」标记整句。'}
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
                      <div className="mark-main">
                        <div>
                          <b>{m.text}</b>
                          {m.kind === 'phrase' && <em className="phrase-tag">短语</em>}
                          {m.kind === 'sentence' && <em className="phrase-tag">整句</em>}
                          <em className={due ? 'due' : 'cooled'}>{due ? '待复习' : `${new Date(m.card.due).toLocaleDateString()} 复习`}</em>
                        </div>
                        <NoteEditor
                          note={m.note}
                          example={m.example}
                          compact
                          onSave={(note, example) => saveNote(m, note, example)}
                        />
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
                  <button
                    className="link small"
                    title="标记整句为复习卡片"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSentence(cue)
                    }}
                  >
                    整句
                  </button>
                </div>
                <Sentence
                  text={cue.text}
                  marks={marksByCue.get(cue.index) ?? []}
                  onWord={onWord(cue)}
                  onPhrase={(p) => togglePhrase(cue, p)}
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
