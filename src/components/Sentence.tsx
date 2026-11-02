import { memo } from 'react'
import { tokenize } from '../lib/text'
import type { Mark } from '../types'

interface Props {
  text: string
  marks: Mark[]
  onWord?: (word: string, e: React.MouseEvent) => void
  dense?: boolean
}

/** 把一句话渲染成可点击的单词；已标记的词加下划线高亮。 */
export const Sentence = memo(function Sentence({ text, marks, onWord, dense }: Props) {
  const tokens = tokenize(text)
  const marked = new Set(marks.map((m) => m.text.toLowerCase()))
  return (
    <span className={dense ? 'sentence dense' : 'sentence'}>
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
