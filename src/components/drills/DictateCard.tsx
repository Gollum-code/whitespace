import { useEffect, useRef, useState } from 'react'
import { answerMatches } from '../../lib/drills'
import { speak } from '../../lib/speech'
import { SpeakerButton } from '../SpeakerButton'
import type { DictateDrill } from '../../types'

interface Props {
  drill: DictateDrill
  locked: boolean
  onResult: (ok: boolean) => void
}

/** 整句听写：听音频，把整句写下来。 */
export function DictateCard({ drill, locked, onResult }: Props) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const check = () => {
    if (locked || !input.trim()) return
    onResult(answerMatches(input, drill.answer))
  }

  return (
    <div className="drill dictate-drill">
      <div className="listen-box">
        <SpeakerButton text={drill.sentence} label="播放整句" className="listen-play" />
        <span className="muted small">先听，再写下来。可以反复听。</span>
        <button className="btn small" onClick={() => speak(drill.sentence)}>
          再听一次
        </button>
      </div>
      <input
        ref={inputRef}
        className="answer-input"
        value={input}
        disabled={locked}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') check()
        }}
        placeholder="把听到的整句写下来，回车提交"
      />
      {!locked && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={check} disabled={!input.trim()}>
            检查
          </button>
        </div>
      )}
    </div>
  )
}
