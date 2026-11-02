import { SpeakerButton } from '../SpeakerButton'
import type { ChoiceDrill } from '../../types'

interface Props {
  drill: ChoiceDrill
  locked: boolean
  onResult: (ok: boolean) => void
}

/** 选词填空：四个选项点一个。 */
export function ChoiceCard({ drill, locked, onResult }: Props) {
  return (
    <div className="drill choice-drill">
      <p className="drill-sentence">
        {drill.sentence}
        <SpeakerButton text={drill.sentence} gap label="朗读（空格处停顿）" small />
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
