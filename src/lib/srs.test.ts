import { describe, expect, it } from 'vitest'
import { gradeCard, isDue, isMastered, newCard, previewIntervals } from './srs'

const NOW = new Date('2026-01-01T00:00:00Z')

describe('newCard', () => {
  it('is due immediately', () => {
    const c = newCard(NOW)
    expect(isDue(c, NOW)).toBe(true)
    expect(c.reps).toBe(0)
    expect(c.state).toBe(0)
  })
})

describe('gradeCard', () => {
  it('moves due time into the future after good', () => {
    const c = newCard(NOW)
    const next = gradeCard(c, 'good', NOW)
    expect(new Date(next.due).getTime()).toBeGreaterThanOrEqual(NOW.getTime())
    expect(next.reps).toBeGreaterThan(c.reps)
  })

  it('again keeps the card close', () => {
    const c = newCard(NOW)
    const next = gradeCard(c, 'again', NOW)
    expect(new Date(next.due).getTime()).toBeLessThanOrEqual(NOW.getTime() + 15 * 60_000)
  })

  it('easy schedules further than good', () => {
    const c = newCard(NOW)
    const good = gradeCard(c, 'good', NOW)
    const easy = gradeCard(c, 'easy', NOW)
    expect(new Date(easy.due).getTime()).toBeGreaterThan(new Date(good.due).getTime())
  })
})

describe('previewIntervals', () => {
  it('returns a label for every rating', () => {
    const out = previewIntervals(newCard(NOW), NOW)
    expect(Object.keys(out).sort()).toEqual(['again', 'easy', 'good', 'hard'])
    for (const v of Object.values(out)) expect(v).not.toBe('')
  })
})

describe('isMastered', () => {
  it('is false for a new card', () => {
    expect(isMastered(newCard(NOW))).toBe(false)
  })
})
