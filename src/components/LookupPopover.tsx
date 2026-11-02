import { useEffect, useRef, useState } from 'react'
import { lookupWord } from '../lib/ai'
import { speak } from '../lib/speech'
import { SpeakerButton } from './SpeakerButton'

export interface PopoverState {
  word: string
  sentence: string
  x: number
  y: number
  marked: boolean
  onMark: (mark: boolean) => void
}

/** 查词气泡：点某个词后浮出，显示 AI 释义，可一键标记生词。 */
export function LookupPopover({ pop, onClose }: { pop: PopoverState; onClose: () => void }) {
  const [info, setInfo] = useState<{ meaningZh: string; pos: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    setInfo(null)
    lookupWord(pop.word, pop.sentence).then((r) => {
      if (!alive) return
      setLoading(false)
      if (r) setInfo(r)
      else setFailed(true)
    })
    return () => {
      alive = false
    }
  }, [pop.word, pop.sentence])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="lookup-pop"
      style={{ left: Math.min(pop.x, window.innerWidth - 300), top: Math.min(pop.y, window.innerHeight - 160) }}
    >
      <div className="lookup-head">
        <b>{pop.word}</b>
        {info?.pos && <em className="lookup-pos">{info.pos}</em>}
        <SpeakerButton text={pop.word} small />
      </div>
      <div className="lookup-body">
        {loading && <span className="muted small">查词中…</span>}
        {failed && <span className="muted small">AI 词典暂时不可用，稍后再试。</span>}
        {info && <span>{info.meaningZh}</span>}
      </div>
      <div className="lookup-foot">
        <button
          className={`btn small ${pop.marked ? 'danger' : 'primary'}`}
          onClick={() => {
            pop.onMark(!pop.marked)
            onClose()
          }}
        >
          {pop.marked ? '取消标记' : '＋ 标记生词'}
        </button>
        <button className="btn small" onClick={() => speak(pop.word)}>
          朗读
        </button>
      </div>
    </div>
  )
}
