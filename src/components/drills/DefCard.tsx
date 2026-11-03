import { SpeakerButton } from '../SpeakerButton'
import type { DefDrill } from '../../types'

interface Props {
  drill: DefDrill
  locked: boolean
  onResult: (ok: boolean) => void
}

/** 释义选择：给一个词，从四个中文释义里选。 */
export function DefCard({ drill, locked, onResult }: Props) {
  const correct = drill.options.find((o) => o.text === drill.word)

  return (
    <div className="drill def-drill">
      <div className="def-word">
        <b>{drill.word}</b>
        <SpeakerButton text={drill.word} label="朗读" small />
      </div>
      <p className="muted small">选出它在这个语境里的意思：</p>
      <div className="def-options">
        {drill.options.map((o, i) => (
          <button
            key={`${o.text}-${i}`}
            className={`def-btn ${locked ? (o === correct ? 'correct' : '') : ''}`}
            disabled={locked}
            onClick={() => onResult(o === correct)}
          >
            <span className="def-text">{o.meaningZh}</span>
            {o.pos && <em>{o.pos}</em>}
          </button>
        ))}
      </div>
    </div>
  )
}
