import { useState } from 'react'

interface Props {
  note?: string
  example?: string
  onSave: (note: string, example: string) => void
  compact?: boolean
}

/**
 * 词条笔记 + 个人例句：可折叠的小编辑器，保存后显示摘要。
 * note = 搭配/易错点/用法；example = 自己造的句子。
 */
export function NoteEditor({ note, example, onSave, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [noteVal, setNoteVal] = useState(note ?? '')
  const [exVal, setExVal] = useState(example ?? '')
  const [dirty, setDirty] = useState(false)

  const begin = () => {
    setNoteVal(note ?? '')
    setExVal(example ?? '')
    setDirty(false)
    setOpen(true)
  }

  const save = () => {
    onSave(noteVal.trim(), exVal.trim())
    setOpen(false)
  }

  const label = example
    ? `📝 ${example.length > (compact ? 18 : 40) ? example.slice(0, compact ? 18 : 40) + '…' : example}`
    : note
      ? `📝 ${note.length > (compact ? 18 : 40) ? note.slice(0, compact ? 18 : 40) + '…' : note}`
      : '📝 笔记'

  if (!open) {
    return (
      <button
        className={`note-toggle ${note || example ? 'has' : ''}`}
        onClick={begin}
        title="编辑笔记"
      >
        {label}
      </button>
    )
  }

  return (
    <div className="note-editor">
      <textarea
        rows={2}
        value={noteVal}
        autoFocus
        onChange={(e) => {
          setNoteVal(e.target.value)
          setDirty(true)
        }}
        placeholder="笔记：搭配、易错点、用法总结…"
      />
      <textarea
        rows={2}
        value={exVal}
        onChange={(e) => {
          setExVal(e.target.value)
          setDirty(true)
        }}
        placeholder="个人例句：自己造一句，记得最牢…"
      />
      <div className="row">
        <button className="btn small primary" onClick={save} disabled={!dirty && noteVal === (note ?? '') && exVal === (example ?? '')}>
          保存
        </button>
        <button className="btn small" onClick={() => setOpen(false)}>
          取消
        </button>
      </div>
    </div>
  )
}
