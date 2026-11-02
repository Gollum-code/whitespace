import { useState } from 'react'

interface Props {
  note?: string
  onSave: (note: string) => void
  compact?: boolean
}

/** 词条笔记：可折叠的小编辑器，保存后显示摘要。 */
export function NoteEditor({ note, onSave, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState(note ?? '')
  const [dirty, setDirty] = useState(false)

  const begin = () => {
    setVal(note ?? '')
    setDirty(false)
    setOpen(true)
  }

  const save = () => {
    onSave(val.trim())
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        className={`note-toggle ${note ? 'has' : ''}`}
        onClick={begin}
        title="编辑笔记"
      >
        {note ? `📝 ${note.length > (compact ? 18 : 40) ? note.slice(0, compact ? 18 : 40) + '…' : note}` : '📝 笔记'}
      </button>
    )
  }

  return (
    <div className="note-editor">
      <textarea
        rows={2}
        value={val}
        autoFocus
        onChange={(e) => {
          setVal(e.target.value)
          setDirty(true)
        }}
        placeholder="写点搭配、易错点或你自己的例句…"
      />
      <div className="row">
        <button className="btn small primary" onClick={save} disabled={!dirty && val === (note ?? '')}>
          保存
        </button>
        <button className="btn small" onClick={() => setOpen(false)}>
          取消
        </button>
      </div>
    </div>
  )
}
