import { describe, expect, it } from 'vitest'
import { answerMatches, buildFix, buildScramble, pickKind, scrambleMatches } from './drills'
import { newCard } from './srs'
import type { Mark } from '../types'

function mark(over: Partial<Mark> = {}): Mark {
  return {
    id: 'm1',
    materialId: 'mat1',
    cueIndex: 0,
    kind: 'word',
    text: 'develop',
    lemma: 'develop',
    createdAt: 0,
    card: newCard(new Date('2026-01-01')),
    ...over,
  }
}

const SENT = 'The company plans to develop a new product this year.'

describe('pickKind', () => {
  it('new words always start with cloze', () => {
    expect(pickKind(mark())).toBe('cloze')
  })
  it('reviewed words rotate among kinds', () => {
    const kinds = new Set<unknown>()
    for (let i = 0; i < 20; i += 1) {
      const m = mark({ id: `m${i}` })
      m.card = { ...m.card, reps: 1 + i }
      kinds.add(pickKind(m))
    }
    expect(kinds.size).toBeGreaterThan(1)
  })
  it('sentence marks only use whole-sentence drills', () => {
    const m = mark({ kind: 'sentence', text: SENT })
    for (let i = 0; i < 10; i += 1) {
      const c = mark({ kind: 'sentence', text: SENT, id: `s${i}` })
      c.card = { ...c.card, reps: i }
      const k = pickKind(c)
      expect(['scramble', 'dictate']).toContain(k)
    }
    expect(['scramble', 'dictate']).toContain(pickKind(m))
  })
  it('phrases avoid cloze on first pass', () => {
    const m = mark({ kind: 'phrase', text: 'take off' })
    expect(pickKind(m)).toBe('scramble')
  })
})

describe('buildScramble', () => {
  it('shuffles tokens and keeps the original order checkable', () => {
    const d = buildScramble(mark(), SENT)
    expect(d).not.toBeNull()
    expect(d!.tokens.join(' ')).not.toBe(SENT)
    expect(scrambleMatches(d!.tokens, d!.sentence)).toBe(false)
    // 用原句顺序排回去就对
    const order = SENT.split(' ')
    expect(scrambleMatches(order, SENT)).toBe(true)
  })
  it('returns null for too-short sentences', () => {
    expect(buildScramble(mark(), 'Go home.')).toBeNull()
  })
})

describe('buildFix', () => {
  it('replaces a content word with a confusable and offers the answer', () => {
    const pool = ['product', 'project', 'process', 'program', 'system']
    const d = buildFix(mark({ text: 'develop' }), SENT, pool)
    expect(d).not.toBeNull()
    expect(d!.answer).not.toBe(d!.wrong)
    expect(d!.options).toContain(d!.answer)
    expect(d!.sentence).toContain(d!.wrong)
  })
})

describe('answerMatches', () => {
  it('ignores case and punctuation', () => {
    expect(answerMatches('Develop.', 'develop')).toBe(true)
    expect(answerMatches('develops', 'develop')).toBe(false)
  })
})
