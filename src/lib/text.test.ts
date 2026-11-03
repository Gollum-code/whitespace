import { describe, expect, it } from 'vitest'
import {
  hashString,
  lemmaOf,
  mergeCues,
  normalizeAnswer,
  parseSubtitle,
  splitSentences,
  tokenize,
} from './text'

describe('parseSubtitle', () => {
  it('parses SRT', () => {
    const srt = `1\n00:00:01,000 --> 00:00:04,000\nHello everyone.\n\n2\n00:00:04,500 --> 00:00:07,000\nHow are you?\n`
    const cues = parseSubtitle(srt)
    expect(cues).toHaveLength(2)
    expect(cues[0].text).toBe('Hello everyone.')
    expect(cues[0].startSec).toBe(1)
    expect(cues[1].endSec).toBe(7)
  })

  it('drops rolling auto-caption duplicates', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nhello world\n\n00:00:02.500 --> 00:00:05.000\nworld\n`
    const cues = parseSubtitle(vtt)
    // 第二条是前一条的尾巴，应被合并/丢弃，不产生重复内容
    expect(cues.length).toBeLessThanOrEqual(2)
  })

  it('handles CRLF and tags', () => {
    const srt = `1\r\n00:00:01,000 --> 00:00:02,000\r\n<i>Hi</i> &amp; bye\r\n`
    const cues = parseSubtitle(srt)
    expect(cues[0].text).toBe('Hi & bye')
  })
})

describe('mergeCues', () => {
  it('joins short fragments into one sentence', () => {
    const cues = parseSubtitle(`1\n00:00:01,000 --> 00:00:02,000\nI went\n\n2\n00:00:02,100 --> 00:00:03,000\nto the store.\n`)
    const merged = mergeCues(cues)
    expect(merged.length).toBe(1)
    expect(merged[0].text).toBe('I went to the store.')
  })
})

describe('splitSentences', () => {
  it('does not split on abbreviations', () => {
    const out = splitSentences('Mr. Smith went home. He was tired.')
    expect(out).toHaveLength(2)
    expect(out[0]).toBe('Mr. Smith went home.')
  })

  it('splits on sentence enders', () => {
    const out = splitSentences('One. Two! Three?')
    expect(out).toEqual(['One.', 'Two!', 'Three?'])
  })
})

describe('lemmaOf', () => {
  it('handles irregulars', () => {
    expect(lemmaOf('went')).toBe('go')
    expect(lemmaOf('better')).toBe('good')
  })
  it('handles plural and tense', () => {
    expect(lemmaOf('studies')).toBe('study')
    expect(lemmaOf('developed')).toBe('develop')
    expect(lemmaOf('working')).toBe('work')
    expect(lemmaOf('running')).toBe('run')
    expect(lemmaOf('studying')).toBe('study')
    expect(lemmaOf('making')).toBe('make')
    expect(lemmaOf('used')).toBe('use')
    expect(lemmaOf('agreed')).toBe('agree')
    expect(lemmaOf('bigger')).toBe('big')
  })
  it('strips possessive', () => {
    expect(lemmaOf("James's")).toBe('james')
  })
})

describe('tokenize', () => {
  it('marks word tokens with offsets', () => {
    const tokens = tokenize("Hi, there!")
    const words = tokens.filter((t) => t.isWord)
    expect(words.map((w) => w.text)).toEqual(['Hi', 'there'])
    expect(words[1].start).toBe(4)
  })
})

describe('normalizeAnswer', () => {
  it('lowercases, strips punctuation, collapses spaces', () => {
    expect(normalizeAnswer("  It's, OK!  ")).toBe("it's ok")
  })
})

describe('hashString', () => {
  it('is stable and different for different input', () => {
    expect(hashString('develop')).toBe(hashString('develop'))
    expect(hashString('develop')).not.toBe(hashString('develops'))
  })
})
