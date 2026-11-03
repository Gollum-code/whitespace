import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { computeAchievements } from '../lib/achievements'
import { go } from '../lib/nav'
import type { DrillKind, Mark, Material, ReviewLog, RatingName } from '../types'

const RATING: RatingName[] = ['again', 'hard', 'good', 'easy']
const RATING_LABEL: Record<RatingName, string> = {
  again: '忘了',
  hard: '勉强',
  good: '记得',
  easy: '太简单',
}

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

export function StatsPage() {
  const [reviews, setReviews] = useState<ReviewLog[]>([])
  const [marks, setMarks] = useState<Mark[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [r, mk, ms] = await Promise.all([db.allReviews(), db.getAllMarks(), db.allMaterials()])
      if (!alive) return
      setReviews(r as ReviewLog[])
      setMarks(mk as Mark[])
      setMaterials(ms as Material[])
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  const achievements = useMemo(() => {
    const kinds = new Set<DrillKind>()
    for (const r of reviews) if (r.drillKind !== 'listen') kinds.add(r.drillKind)
    return computeAchievements(marks, reviews, materials, kinds)
  }, [marks, reviews, materials])

  const s = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const counts = new Map<string, number>()
    const byRating = { again: 0, hard: 0, good: 0, easy: 0 } as Record<RatingName, number>
    let total = 0
    let notAgain = 0
    for (const r of reviews) {
      const d = new Date(r.ts)
      const k = dayKey(d)
      counts.set(k, (counts.get(k) ?? 0) + 1)
      byRating[r.rating] += 1
      total += 1
      if (r.rating !== 'again') notAgain += 1
    }

    // 最近 16 周的热力图
    const start = addDays(today, -(today.getDay()) - 15 * 7)
    const weeks: { key: string; count: number; inFuture: boolean }[][] = []
    let cur = new Date(start)
    while (cur.getTime() <= today.getTime()) {
      const week: { key: string; count: number; inFuture: boolean }[] = []
      for (let d = 0; d < 7; d += 1) {
        const k = dayKey(cur)
        week.push({ key: k, count: counts.get(k) ?? 0, inFuture: cur.getTime() > today.getTime() })
        cur = addDays(cur, 1)
      }
      weeks.push(week)
    }

    // 连续打卡：从今天（或昨天）往回数
    let streak = 0
    let cursor = counts.has(dayKey(today)) ? today : addDays(today, -1)
    while (counts.has(dayKey(cursor))) {
      streak += 1
      cursor = addDays(cursor, -1)
    }

    const lemmas = new Set(reviews.map((r) => r.lemma)).size
    const days = new Set(reviews.map((r) => dayKey(new Date(r.ts)))).size
    const todayCount = counts.get(dayKey(today)) ?? 0
    const todayNew = reviews.filter((r) => r.wasNew && dayKey(new Date(r.ts)) === dayKey(today)).length
    const maxDay = Math.max(1, ...counts.values())

    return {
      weeks,
      total,
      notAgain,
      byRating,
      streak,
      lemmas,
      days,
      todayCount,
      todayNew,
      maxDay,
    }
  }, [reviews])

  if (!loaded) return <div className="page muted">加载中…</div>

  const accuracy = s.total ? Math.round((s.notAgain / s.total) * 100) : 0

  return (
    <div className="page narrow">
      <div className="hero">
        <div>
          <h1>统计</h1>
          <p className="muted">每天的复习量、连续打卡和你最常忘的词。数据只存本地。</p>
        </div>
      </div>

      <section className="stats">
        <div className="stat">
          <b>{s.total}</b>
          <span>总复习</span>
        </div>
        <div className="stat accent">
          <b>{s.streak}</b>
          <span>连续打卡</span>
        </div>
        <div className="stat">
          <b>{s.lemmas}</b>
          <span>涉及词数</span>
        </div>
        <div className="stat">
          <b>{accuracy}%</b>
          <span>记住率</span>
        </div>
      </section>

      <div className="panel stats-panel">
        <div className="stat-head">
          <b>过去 16 周</b>
          <span className="muted small">
            今日 {s.todayCount} 次 · 新词 {s.todayNew}
          </span>
        </div>
        <div className="heatmap">
          {s.weeks.map((week, wi) => (
            <div key={wi} className="heat-col">
              {week.map((d) => (
                <div
                  key={d.key}
                  className={`heat-cell ${d.count === 0 ? 'zero' : ''} ${d.inFuture ? 'future' : ''}`}
                  style={{ opacity: d.count ? 0.25 + 0.75 * (d.count / s.maxDay) : undefined }}
                  title={`${d.key}：${d.count} 次`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="muted small heat-legend">
          少 <span className="heat-cell zero" /> <span className="heat-cell" />{' '}
          <span className="heat-cell" /> <span className="heat-cell" /> <span className="heat-cell" /> 多
        </div>
      </div>

      <div className="panel stats-panel">
        <div className="stat-head">
          <b>评分分布</b>
          <span className="muted small">{s.days} 个活跃日</span>
        </div>
        <div className="rating-bars">
          {RATING.map((r) => {
            const c = s.byRating[r]
            const pct = s.total ? (c / s.total) * 100 : 0
            return (
              <div key={r} className="rating-bar">
                <span className={`rb-label ${r}`}>{RATING_LABEL[r]}</span>
                <div className="rb-track">
                  <div className={`rb-fill ${r}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="rb-count">{c}</span>
              </div>
            )
          })}
        </div>
      </div>

      {achievements.streakReward && (
        <div className="banner">
          <span>🏆 {achievements.streakReward}</span>
        </div>
      )}

      <div className="panel stats-panel">
        <div className="stat-head">
          <b>成就</b>
          <span className="muted small">
            {achievements.unlocked}/{achievements.list.length} 已解锁
          </span>
        </div>
        <div className="badge-grid">
          {achievements.list.map((a) => {
            const done = a.progress >= a.target
            const pct = Math.min(100, Math.round((a.progress / a.target) * 100))
            return (
              <div key={a.id} className={`badge ${done ? 'unlocked' : 'locked'}`} title={a.desc}>
                <span className="badge-icon">{done ? a.icon : '🔒'}</span>
                <span className="badge-title">{a.title}</span>
                <span className="badge-bar">
                  <i style={{ width: `${pct}%` }} />
                </span>
                <span className="muted small">
                  {a.progress}/{a.target}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="empty">
        <h2>继续学，别断</h2>
        <p className="muted">复习得越多，间隔越长。坚持每天刷一遍，很快就能看到曲线往下走。</p>
        <button className="btn primary" onClick={() => go('/review')}>
          去复习 →
        </button>
      </div>
    </div>
  )
}
