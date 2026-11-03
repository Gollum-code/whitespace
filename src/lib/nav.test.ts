import { describe, expect, it } from 'vitest'
import { parseRoute } from './nav'

describe('parseRoute', () => {
  it('parses the basic routes', () => {
    expect(parseRoute('#/').name).toBe('library')
    expect(parseRoute('#/import').name).toBe('import')
    expect(parseRoute('#/review').name).toBe('review')
    expect(parseRoute('#/words').name).toBe('words')
    expect(parseRoute('#/stats').name).toBe('stats')
  })
  it('keeps params, including decoded ones', () => {
    expect(parseRoute('#/m/abc').param).toBe('abc')
    expect(parseRoute('#/word/develop').param).toBe('develop')
    expect(parseRoute('#/word/take%20off').param).toBe('take off')
  })
  it('ignores query strings (bookmarklet ?clip=1)', () => {
    expect(parseRoute('#/import?clip=1').name).toBe('import')
  })
  it('falls back to unknown', () => {
    expect(parseRoute('#/nope').name).toBe('unknown')
  })
})
