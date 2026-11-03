import { memo, useRef } from 'react'
import { tokenize } from '../lib/text'
import type { Mark } from '../types'

interface Props {
  text: string
  marks: Mark[]
  onWord?: (word: string, e: React.MouseEvent) => void
  /** 选中 2-6 个词时回调，用于短语标记。 */
  onPhrase?: (phrase: string) => void
  dense?: boolean
}

function phraseWords(text: string): string[] {
  return text.toLowerCase().split(/[^A-Za-z'-]+/).filter(Boolean)
}

/** 把一句话渲染成可点击的单词；已标记的词加下划线高亮。短语标记会高亮其组成词。 */
export const Sentence = memo(function Sentence({ text, marks, onWord, onPhrase, dense }: Props) {
  const tokens = tokenize(text)
  const ref = useRef<HTMLSpanElement>(null)

  const marked = new Set<string>()
  let wholeSentence = false
  for (const m of marks) {
    if (m.kind === 'sentence') {
      wholeSentence = true
    } else if (m.text.includes(' ')) {
      for (const w of phraseWords(m.text)) marked.add(w)
    } else {
      marked.add(m.text.toLowerCase())
    }
  }

  const handleUp = () => {
    if (!onPhrase) return
    const sel = window.getSelection()
    const raw = sel?.toString() ?? ''
    const words = raw.replace(/\s+/g, ' ').trim()
    if (!words || words.includes('\n')) return
    const count = words.split(' ').length
    if (count < 2 || count > 6) return
    if (!ref.current) return
    const anchor = sel?.anchorNode
    const focus = sel?.focusNode
    if (!anchor || !focus) return
    if (!ref.current.contains(anchor) || !ref.current.contains(focus)) return
    onPhrase(words.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
  }

  return (
    <span
      ref={ref}
      className={
        dense
          ? `sentence dense${wholeSentence ? ' sentence-marked' : ''}`
          : `sentence${wholeSentence ? ' sentence-marked' : ''}`
      }
      onMouseUp={handleUp}
    >
      {tokens.map((t, i) => {
        if (!t.isWord || !onWord) {
          return <span key={i}>{t.text}</span>
        }
        const isMarked = marked.has(t.text.toLowerCase())
        return (
          <button
            key={i}
            type="button"
            className={isMarked ? 'word marked' : 'word'}
            onClick={(e) => {
              e.stopPropagation()
              onWord(t.text, e)
            }}
            title={isMarked ? '已标记，点击取消' : '标记为生词'}
          >
            {t.text}
          </button>
        )
      })}
    </span>
  )
})
