import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { generateCloze, pool as runPool, AiError } from '../lib/ai'
import { buildDrill, DRILL_LABEL, pickKind } from '../lib/drills'
import { go } from '../lib/nav'
import { gradeCard, isDue, previewIntervals } from '../lib/srs'
import { speak, speakWithGap } from '../lib/speech'
import { tokenize } from '../lib/text'
import { ClozeCard } from '../components/drills/ClozeCard'
import { ChoiceCard } from '../components/drills/ChoiceCard'
import { ScrambleCard } from '../components/drills/ScrambleCard'
import { SpeakerButton } from '../components/SpeakerButton'
import type { DrillData, DrillKind, Mark, Material, RatingName } from '../types'

const RATING_LABEL: Record<RatingName, string> = {
  again: '忘了',
  hard: '勉强',
  good: '记得',
  easy: '太简单',
}

const RATING_KEYS: Record<string, RatingName> = {
  '1': 'again',
  '2': 'hard',
  '3': 'good',
  '4': 'easy',
}

function isNew(m: Mark): boolean {
  return m.card.reps === 0 && m.card.state === 0
}

function newLimit(): number {
  const stored = localStorage.getItem('whitespace:newLimit')
  if (stored == null || stored.trim() === '') return 20
  const raw = Number(stored)
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 20
}

/** 从所有素材里收集一个候选词池，给选择题造干扰项用。 */
function collectPool(materials: Material[]): string[] {
  const set = new Set<string>()
  for (const m of materials) {
    for (const c of m.cues) {
      for (const t of tokenize(c.text)) {
        if (t.isWord && t.text.length >= 3 && /^[A-Za-z][A-Za-z'-]*$/.test(t.text)) {
          set.add(t.text)
        }
        if (set.size >= 4000) return [...set]
      }
    }
  }
  return [...set]
}

export function ReviewPage() {
  const [items, setItems] = useState<Mark[] | null>(null)
  const [mats, setMats] = useState<Map<string, Material>>(new Map())
  const [wordPool, setWordPool] = useState<string[]>([])
  const [i, setI] = useState(0)
  const [kind, setKind] = useState<DrillKind>('cloze')
  const [drill, setDrill] = useState<DrillData | null>(null)
  const [gen, setGen] = useState<'idle' | 'loading' | 'error'>('idle')
  const [genErr, setGenErr] = useState('')
  const [result, setResult] = useState<boolean | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [listenOnly, setListenOnly] = useState(false)
  const [stats, setStats] = useState({ right: 0, wrong: 0 })
  const [prewarm, setPrewarm] = useState<{ done: number; total: number } | null>(null)
  const [nextDue, setNextDue] = useState<number | null>(null)
  const [deferred, setDeferred] = useState(0)
  const [grading, setGrading] = useState(false)

  const load = useCallback(async () => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const [ms, due, all, reviews] = await Promise.all([
      db.allMaterials(),
      db.dueMarks(),
      db.getAllMarks(),
      db.reviewsSince(startOfDay.getTime()),
    ])
    setMats(new Map((ms as Material[]).map((m) => [m.id, m])))
    setWordPool(collectPool(ms as Material[]))

    // 每日新词上限：新词过了上限就顺延，避免一打开就是 200 个
    const limit = newLimit()
    const introducedToday = (reviews as { wasNew: boolean }[]).filter((r) => r.wasNew).length
    const allowed = Math.max(0, limit - introducedToday)
    const keepNew = new Set(
      (due as Mark[]).filter(isNew).slice(0, allowed).map((m) => m.id),
    )
    const filtered = (due as Mark[]).filter((m) => !isNew(m) || keepNew.has(m.id))
    setDeferred((due as Mark[]).length - filtered.length)

    setItems(filtered)
    setI(0)
    const future = (all as Mark[])
      .filter((m) => !isDue(m.card))
      .map((m) => new Date(m.card.due).getTime())
      .sort((a, b) => a - b)
    setNextDue(future[0] ?? null)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const current = items?.[i] ?? null

  const sourceSentence = useMemo(() => {
    if (!current) return ''
    const mat = mats.get(current.materialId)
    return mat?.cues[current.cueIndex]?.text ?? current.text
  }, [current, mats])

  const intervals = useMemo(() => (current ? previewIntervals(current.card) : null), [current])

  // 生成当前题
  useEffect(() => {
    setDrill(null)
    setResult(null)
    setRevealed(false)
    setGenErr('')
    if (!current) {
      setGen('idle')
      setKind('cloze')
      return
    }
    const k = pickKind(current)
    setKind(k)
    let alive = true
    setGen('loading')
    buildDrill(k, current, sourceSentence, wordPool)
      .then((d) => {
        if (!alive) return
        setDrill(d)
        setGen('idle')
      })
      .catch((e) => {
        if (!alive) return
        setGen('error')
        setGenErr(e instanceof AiError ? e.message : String(e))
      })
    return () => {
      alive = false
    }
  }, [current?.id, sourceSentence, wordPool])

  // 换卡时把听写模式重置
  useEffect(() => {
    setListenOnly(false)
  }, [current?.id])

  const onResult = (ok: boolean) => {
    if (result !== null || revealed) return
    setResult(ok)
    setStats((s) => (ok ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }))
    if (!ok) setRevealed(true)
  }

  const grade = useCallback(
    async (rating: RatingName) => {
      if (!current || grading) return
      setGrading(true)
      try {
        const wasNew = isNew(current)
        const updated: Mark = { ...current, card: gradeCard(current.card, rating) }
        await db.putMark(updated)
        await db.putReview({
          id: crypto.randomUUID(),
          ts: Date.now(),
          markId: current.id,
          lemma: current.lemma,
          text: current.text,
          rating,
          drillKind: listenOnly ? 'listen' : (drill?.kind ?? kind),
          wasNew,
        })
        setItems((prev) => (prev ? prev.map((m) => (m.id === updated.id ? updated : m)) : prev))
        setI((n) => n + 1)
      } finally {
        setGrading(false)
      }
    },
    [current, drill, kind, listenOnly, grading],
  )

  // 键盘：1-4 评分；空格重听
  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const rated = result !== null || revealed
      if (rated && RATING_KEYS[e.key]) {
        e.preventDefault()
        grade(RATING_KEYS[e.key])
        return
      }
      if (e.key === ' ' && drill) {
        e.preventDefault()
        if (drill.kind === 'cloze') {
          if (listenOnly) {
            speakWithGap(drill.sentence)
          } else {
            speak(drill.sentence)
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, result, revealed, drill, listenOnly, grade])

  const doPrewarm = async () => {
    if (!items || prewarm) return
    const rest = items.slice(i + 1)
    setPrewarm({ done: 0, total: rest.length })
    await runPool(
      rest,
      3,
      (m) =>
        buildDrill(
          pickKind(m),
          m,
          mats.get(m.materialId)?.cues[m.cueIndex]?.text ?? m.text,
          wordPool,
        ),
      () => setPrewarm((p) => (p ? { ...p, done: p.done + 1 } : p)),
    )
    setPrewarm(null)
  }

  if (!items) return <div className="page narrow muted">加载中…</div>

  if (items.length === 0) {
    return (
      <div className="page narrow">
        <div className="empty">
          <h2>今天没有到期的词</h2>
          <p className="muted">
            {deferred > 0
              ? `还有 ${deferred} 个新词留到明天 —— 每日新词上限是 ${newLimit()} 个（可在设置里改）。`
              : nextDue
                ? `下一次复习在 ${new Date(nextDue).toLocaleString()}。`
                : '先去素材里点几个不熟的词吧。'}
          </p>
          <div className="row center">
            <button className="btn" onClick={() => go('/')}>
              回到素材库
            </button>
            <button className="btn primary" onClick={() => go('/import')}>
              导入新素材
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (i >= items.length) {
    return (
      <div className="page narrow">
        <div className="empty">
          <h2>这一轮做完了 🎉</h2>
          <p className="muted">
            完成 {stats.right + stats.wrong} 题 · 答对 {stats.right} · 答错 {stats.wrong}
            {deferred > 0 && ` · ${deferred} 个新词顺延到明天`}
          </p>
          <div className="row center">
            <button className="btn" onClick={() => go('/')}>
              回到素材库
            </button>
            <button
              className="btn primary"
              onClick={() => {
                setStats({ right: 0, wrong: 0 })
                load()
              }}
            >
              再查一次到期
            </button>
          </div>
        </div>
      </div>
    )
  }

  const mat = current ? mats.get(current.materialId) : undefined
  const locked = result !== null || revealed
  const answered = result !== null
  const leech = current && current.card.lapses >= 4

  return (
    <div className="page narrow review-page">
      <div className="review-head">
        <div>
          <h1>今日复习</h1>
          <p className="muted small">
            {i + 1} / {items.length} · {DRILL_LABEL[drill?.kind ?? kind]} · 答对 {stats.right} · 答错{' '}
            {stats.wrong}
          </p>
        </div>
        <div className="row">
          {kind === 'cloze' && !locked && (
            <button
              className={`btn small ${listenOnly ? 'primary' : ''}`}
              onClick={() => setListenOnly((v) => !v)}
            >
              {listenOnly ? '👂 听写中' : '👂 听写模式'}
            </button>
          )}
          <button className="btn small" onClick={doPrewarm} disabled={!!prewarm}>
            {prewarm ? `预生成 ${prewarm.done}/${prewarm.total}` : '预生成剩余题目'}
          </button>
        </div>
      </div>

      <div className="review-card">
        <div className="review-word">
          <div>
            <b>{current!.text}</b>
            <SpeakerButton text={current!.text} label="朗读这个单词" small />
          </div>
          <span className="muted small">来自《{mat?.title ?? '已删除的素材'}》</span>
        </div>

        {leech && (
          <div className="leech">
            这个词你已经忘了 {current!.card.lapses} 次。建议换个记法：拆词根、配例句，或者回到原句多听几遍。
          </div>
        )}

        {gen === 'loading' && (
          <div className="skeleton">正在准备题目…（挖空题首次约 5–15 秒）</div>
        )}

        {gen === 'error' && (
          <div className="error">
            AI 暂时不可用：{genErr}
            <button
              className="btn small"
              onClick={async () => {
                if (!current) return
                setGen('loading')
                try {
                  setDrill(await generateCloze(current, sourceSentence))
                  setKind('cloze')
                  setGen('idle')
                } catch (e) {
                  setGen('error')
                  setGenErr(String(e))
                }
              }}
            >
              换回挖空题重试
            </button>
          </div>
        )}

        {drill?.kind === 'cloze' && (
          <ClozeCard
            key={`${current!.id}:${drill.answer}`}
            drill={drill}
            locked={locked}
            listenOnly={listenOnly}
            onResult={onResult}
          />
        )}
        {drill?.kind === 'choice' && (
          <ChoiceCard key={current!.id} drill={drill} locked={locked} onResult={onResult} />
        )}
        {drill?.kind === 'scramble' && (
          <ScrambleCard key={current!.id} drill={drill} locked={locked} onResult={onResult} />
        )}

        {locked && drill && (
          <div className={answered ? (result ? 'feedback ok' : 'feedback bad') : 'feedback neutral'}>
            <b>{answered ? (result ? '✅ 答对了' : '❌ 不对') : '答案'}</b>
            <span>
              正确答案：<b>{drill.answer}</b>
            </span>
            {drill.glossZh && <span className="muted"> · {drill.glossZh}</span>}
            <SpeakerButton text={drill.kind === 'scramble' ? drill.sentence : drill.answer} small />
          </div>
        )}

        {revealed && drill?.hintZh && <p className="muted small">提示：{drill.hintZh}</p>}

        {!locked && (
          <button className="link small" onClick={() => setRevealed(true)}>
            想不起来，看答案
          </button>
        )}

        {locked && (
          <div className="source-line">
            <span className="muted small">原句：</span>
            <span>{sourceSentence}</span>
            <SpeakerButton text={sourceSentence} label="朗读原句" small />
            {mat?.kind === 'youtube' && current?.startSec != null && (
              <a
                className="link small"
                href={`https://youtu.be/${mat.videoId}?t=${Math.floor(current.startSec)}`}
                target="_blank"
                rel="noreferrer"
              >
                ▶ 听原句
              </a>
            )}
          </div>
        )}

        {locked && (
          <div className="rating-row">
            <span className="muted small">这次记得怎么样？</span>
            <div className="ratings">
              {(Object.keys(RATING_LABEL) as RatingName[]).map((r) => (
                <button
                  key={r}
                  className={`btn rating ${r}`}
                  onClick={() => grade(r)}
                  disabled={grading}
                  title={intervals ? `下次：${intervals[r]} 后（快捷键 ${Object.entries(RATING_KEYS).find(([, v]) => v === r)?.[0]}）` : undefined}
                >
                  <span>{RATING_LABEL[r]}</span>
                  <em>{intervals?.[r]}</em>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="review-foot">
          <button className="link small" onClick={() => grade('again')} disabled={grading}>
            跳过这个（记不住）
          </button>
          <button className="link small" onClick={() => grade('good')} disabled={grading}>
            直接下一题 →
          </button>
        </div>
      </div>
    </div>
  )
}
