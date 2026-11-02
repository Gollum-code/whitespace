import { useEffect, useRef, useState } from 'react'
import { SpeakerButton } from '../SpeakerButton'
import { answerMatches } from '../../lib/drills'
import type { ClozeDrill } from '../../types'

interface Props {
  drill: ClozeDrill
  locked: boolean
  listenOnly: boolean
  onResult: (ok: boolean) => void
}

/** 挖空填空。listenOnly = 听写：隐藏句子，只听音频填词。 */
export function ClozeCard({ drill, locked, listenOnly, onResult }: Props) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!listenOnly) inputRef.current?.focus()
  }, [listenOnly])

  const check = () => {
    if (locked || !input.trim()) return
    onResult(answerMatches(input, drill.answer))
  }

  return (
    <div className="drill cloze-drill">
      {listenOnly ? (
        <div className="listen-box">
          <SpeakerButton
            text={drill.sentence}
            gap
            label="播放句子（空格处会停顿）"
            className="listen-play"
          />
          <span className="muted small">听句子，把空格处的词写下来。</span>
        </div>
      ) : (
        <p className="drill-sentence">
          {drill.sentence}
          <SpeakerButton text={drill.sentence} gap label="朗读（空格处停顿）" small />
        </p>
      )}

      <div className="row">
        <input
          ref={inputRef}
          className="answer-input"
          value={input}
          disabled={locked}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') check()
          }}
          placeholder={listenOnly ? '写下你听到的词' : '填入空格处的词，回车提交'}
        />
        {!locked && (
          <button className="btn primary" onClick={check} disabled={!input.trim()}>
            检查
          </button>
        )}
      </div>
    </div>
  )
}
