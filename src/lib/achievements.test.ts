import { describe, expect, it } from 'vitest'
import { computeAchievements } from './achievements'
import { newCard } from './srs'
import type { DrillKind, Mark, Material, ReviewLog } from '../types'

function mark(lemma: string, over: Partial<Mark> = {}): Mark {
  return {
    id: `m-${lemma}`,
    materialId: 'mat1',
    cueIndex: 0,
    kind: 'word',
    text: lemma,
    lemma,
    createdAt: 0,
    card: newCard(new Date('2026-01-01')),
    ...over,
  }
}

function review(ts: number): ReviewLog {
  return {
    id: `r-${ts}`,
    ts,
    markId: 'm1',
    lemma: 'develop',
    text: 'develop',
    rating: 'good',
    drillKind: 'cloze',
    wasNew: false,
  }
}

describe('computeAchievements', () => {
  it('unlocks first-mark after one mark', () => {
    const a = computeAchievements([mark('develop')], [], [], new Set())
    const first = a.list.find((x) => x.id === 'first-mark')!
    expect(first.progress).toBe(1)
    expect(first.progress).toBeGreaterThanOrEqual(first.target)
  })

  it('counts streak from consecutive days', () => {
    const now = new Date()
    now.setHours(12, 0, 0, 0)
    const day = 86_400_000
    const reviews = [review(now.getTime()), review(now.getTime() - day), review(now.getTime() - 2 * day)]
    const a = computeAchievements([mark('develop')], reviews, [], new Set())
    expect(a.streak).toBe(3)
    expect(a.streakReward).not.toBeNull()
  })

  it('tracks drill variety', () => {
    const a = computeAchievements([], [], [], new Set<DrillKind>(['cloze', 'scramble']))
    const all = a.list.find((x) => x.id === 'all-drills')!
    expect(all.progress).toBe(2)
    expect(all.target).toBe(6)
  })

  it('counts materials', () => {
    const mats = [{ id: 'a' }, { id: 'b' }] as Material[]
    const a = computeAchievements([], [], mats, new Set())
    expect(a.list.find((x) => x.id === 'first-material')!.progress).toBe(1)
  })
})
