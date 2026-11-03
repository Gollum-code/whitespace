import { useState } from 'react'
import { go } from '../lib/nav'

const STEPS = [
  {
    icon: '📥',
    title: '导入你真正想看的素材',
    desc: '一篇文章、一个带字幕的视频、一段播客。用真实语境学，词才有地方住。',
  },
  {
    icon: '📌',
    title: '点出不熟的词',
    desc: '点单词标记；选中 2–6 个词标记短语；点「整句」记下整句。每个都能写笔记和个人例句。',
  },
  {
    icon: '🎯',
    title: '到时间它会回来找你',
    desc: '系统按记忆规律出题：挖空、连词成句、听写、改错……你自评，它安排下次复习。',
  },
]

/** 首次引导：用三步把「导入 → 点词 → 复习」的最小闭环讲清楚。 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  return (
    <div className="modal-mask">
      <div className="modal onboard">
        <h2>把不熟的词「留白」</h2>
        <p className="muted small">用真实素材学英语的最小闭环：导入 → 点词 → 出题 → 复习。</p>

        <div className="onboard-step">
          <div className="onboard-icon">{s.icon}</div>
          <b>{s.title}</b>
          <p className="muted">{s.desc}</p>
        </div>

        <div className="onboard-dots">
          {STEPS.map((_, i) => (
            <i key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>

        <div className="row center">
          {!last ? (
            <button className="btn primary" onClick={() => setStep((x) => x + 1)}>
              下一步 →
            </button>
          ) : (
            <button className="btn primary" onClick={() => go('/import')}>
              导入第一个素材
            </button>
          )}
          <button className="btn" onClick={onDone}>
            先随便看看
          </button>
        </div>
      </div>
    </div>
  )
}
