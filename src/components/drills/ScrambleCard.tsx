import { useMemo, useState } from 'react'
import { scrambleMatches } from '../../lib/drills'
import type { ScrambleDrill } from '../../types'

interface Props {
  drill: ScrambleDrill
  locked: boolean
  onResult: (ok: boolean) => void
}

/** 连词成句：点词块按顺序拼回原句。 */
export function ScrambleCard({ drill, locked, onResult }: Props) {
  const [chosen, setChosen] = useState<number[]>([])

  const used = useMemo(() => new Set(chosen), [chosen])
  const complete = chosen.length === drill.tokens.length

  const check = () => {
    if (locked || !complete) return
    onResult(scrambleMatches(chosen.map((i) => drill.tokens[i]), drill.sentence))
  }

  return (
    <div className="drill scramble-drill">
      <div className={locked ? 'scramble-answer locked' : 'scramble-answer'}>
        {chosen.length === 0 && <span className="muted small">按顺序点击下面的词块…</span>}
        {chosen.map((idx, pos) => (
          <button
            key={`${idx}-${pos}`}
            className="word-chip chosen"
            disabled={locked}
            onClick={() => setChosen((prev) => prev.filter((_, p) => p !== pos))}
          >
            {drill.tokens[idx]}
          </button>
        ))}
      </div>

      <div className="scramble-pool">
        {drill.tokens.map((token, idx) => (
          <button
            key={idx}
            className={`word-chip ${used.has(idx) ? 'used' : ''}`}
            disabled={locked || used.has(idx)}
            onClick={() => setChosen((prev) => [...prev, idx])}
          >
            {token}
          </button>
        ))}
      </div>

      {!locked && (
        <div className="row">
          <button className="btn primary" onClick={check} disabled={!complete}>
            检查
          </button>
          <button className="btn" onClick={() => setChosen([])} disabled={!chosen.length}>
            重排
          </button>
        </div>
      )}
    </div>
  )
}
