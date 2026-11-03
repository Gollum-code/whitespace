import { tokenize } from '../../lib/text'
import { SpeakerButton } from '../SpeakerButton'
import type { FixDrill } from '../../types'

interface Props {
  drill: FixDrill
  locked: boolean
  onResult: (ok: boolean) => void
}

/** 改错：句子里有个错词，选出正确的那个。 */
export function FixCard({ drill, locked, onResult }: Props) {
  const tokens = tokenize(drill.sentence)
  let marked = false

  return (
    <div className="drill fix-drill">
      <p className="drill-sentence">
        {tokens.map((t, i) => {
          if (t.isWord && !marked && t.text.toLowerCase() === drill.wrong.toLowerCase()) {
            marked = true
            return (
              <mark key={i} className="wrong-word">
                {t.text}
              </mark>
            )
          }
          return <span key={i}>{t.text}</span>
        })}
        <SpeakerButton text={drill.sentence} label="朗读句子" small />
      </p>
      <div className="choice-grid">
        {drill.options.map((opt) => (
          <button
            key={opt}
            className={`choice-btn ${locked ? (opt === drill.answer ? 'correct' : '') : ''}`}
            disabled={locked}
            onClick={() => onResult(opt === drill.answer)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}
