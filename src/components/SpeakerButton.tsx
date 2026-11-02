import { useEffect, useState } from 'react'
import { canSpeak, speak, speakWithGap, stopSpeak } from '../lib/speech'

interface Props {
  text?: string
  /** 传了就把 ____ 当停顿朗读，适合挖空句。 */
  gap?: boolean
  label?: string
  className?: string
  small?: boolean
}

/** 统一的小喇叭按钮。浏览器不支持 TTS 时自动隐藏。 */
export function SpeakerButton({ text, gap, label = '朗读', className = '', small }: Props) {
  const [ok, setOk] = useState(canSpeak)

  useEffect(() => {
    if (ok) return
    const t = window.setInterval(() => {
      if (canSpeak()) {
        setOk(true)
        window.clearInterval(t)
      }
    }, 500)
    return () => window.clearInterval(t)
  }, [ok])

  if (!ok) return null

  return (
    <button
      type="button"
      className={`speaker ${small ? 'small' : ''} ${className}`}
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        if (!text) return stopSpeak()
        if (gap) speakWithGap(text)
        else speak(text)
      }}
    >
      🔊
    </button>
  )
}
