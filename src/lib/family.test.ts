import { describe, expect, it } from 'vitest'
import { wordFamily } from './family'

describe('wordFamily', () => {
  it('finds same-stem derivatives in a known set', () => {
    const known = ['development', 'developer', 'developing', 'cat', 'dog']
    const fam = wordFamily('develop', known).map((f) => f.word)
    expect(fam).toContain('development')
    expect(fam).toContain('developer')
    expect(fam).toContain('developing')
    expect(fam).not.toContain('cat')
    expect(fam).not.toContain('dog')
  })

  it('ignores the target itself and non-words', () => {
    const fam = wordFamily('run', ['running', 'run', '!'])
    expect(fam.map((f) => f.word)).toEqual(['running'])
  })

  it('returns empty for empty input', () => {
    expect(wordFamily('', ['x'])).toEqual([])
  })
})
