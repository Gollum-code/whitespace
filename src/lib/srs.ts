import { fsrs, generatorParameters, createEmptyCard, Rating, type Card, type Grade } from 'ts-fsrs'
import type { CardRec, RatingName } from '../types'

/** 目标记忆率：可设置，默认 0.9（Anki 常规）。改完调用 refreshScheduler 生效。 */
function retention(): number {
  const raw = Number(localStorage.getItem('whitespace:retention') ?? '')
  return Number.isFinite(raw) && raw >= 0.7 && raw <= 0.99 ? raw : 0.9
}

function makeScheduler() {
  return fsrs(
    generatorParameters({
      enable_fuzz: true,
      enable_short_term: true,
      request_retention: retention(),
    }),
  )
}

let scheduler = makeScheduler()

/** 设置页改了目标记忆率后调用，重建调度器。 */
export function refreshScheduler() {
  scheduler = makeScheduler()
}

const RATING: Record<RatingName, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

function toCard(rec: CardRec): Card {
  return {
    due: new Date(rec.due),
    stability: rec.stability,
    difficulty: rec.difficulty,
    elapsed_days: rec.elapsed_days,
    scheduled_days: rec.scheduled_days,
    reps: rec.reps,
    lapses: rec.lapses,
    learning_steps: rec.learning_steps,
    state: rec.state,
    last_review: rec.last_review ? new Date(rec.last_review) : undefined,
  } as Card
}

function fromCard(c: Card): CardRec {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    learning_steps: c.learning_steps,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : undefined,
  }
}

export function newCard(now = new Date()): CardRec {
  return fromCard(createEmptyCard(now))
}

/** 返回评分后的新卡片。 */
export function gradeCard(rec: CardRec, rating: RatingName, now = new Date()): CardRec {
  const res: any = scheduler.next(toCard(rec), now, RATING[rating])
  const card: Card = res?.card ?? res
  return fromCard(card)
}

export function previewIntervals(rec: CardRec, now = new Date()): Record<RatingName, string> {
  const names: RatingName[] = ['again', 'hard', 'good', 'easy']
  const out = {} as Record<RatingName, string>
  for (const n of names) {
    try {
      const next = gradeCard(rec, n, now)
      out[n] = humanize(new Date(next.due).getTime() - now.getTime())
    } catch {
      out[n] = '—'
    }
  }
  return out
}

function humanize(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min} 分钟`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} 小时`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} 天`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo} 个月`
  return `${(d / 365).toFixed(1)} 年`
}

export function isDue(rec: CardRec, now = new Date()): boolean {
  return new Date(rec.due).getTime() <= now.getTime()
}

export function isMastered(rec: CardRec): boolean {
  return rec.state === 2 && rec.scheduled_days >= 21
}
