import { useEffect, useRef, useState } from 'react'
import { db } from './db'
import { go, parseRoute } from './lib/nav'
import { isDue } from './lib/srs'
import { LibraryPage } from './pages/LibraryPage'
import { ImportPage } from './pages/ImportPage'
import { MaterialPage } from './pages/MaterialPage'
import { ReviewPage } from './pages/ReviewPage'
import { WordPage } from './pages/WordPage'
import { WordBookPage } from './pages/WordBookPage'
import { StatsPage } from './pages/StatsPage'
import { stopSpeak } from './lib/speech'
import type { Mark } from './types'

function readSetting(key: string, fallback: string): string {
  return localStorage.getItem(key) ?? fallback
}

export function App() {
  const [hash, setHash] = useState(location.hash || '#/')
  const [dueCount, setDueCount] = useState(0)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const onHash = () => setHash(location.hash || '#/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const refresh = async () => {
      const marks = (await db.getAllMarks()) as Mark[]
      setDueCount(marks.filter((m) => isDue(m.card)).length)
    }
    refresh()
    const t = window.setInterval(refresh, 5000)
    return () => window.clearInterval(t)
  }, [hash])

  useEffect(() => {
    return () => stopSpeak()
  }, [])

  const route = parseRoute(hash)

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go('/')} title="回到素材库">
          <Logo />
          <span>
            <b>留白</b>
            <small>Whitespace · 用素材学英语</small>
          </span>
        </button>
        <nav>
          <a className={route.name === 'library' ? 'active' : ''} href="#/">
            素材库
          </a>
          <a className={route.name === 'words' ? 'active' : ''} href="#/words">
            单词本
          </a>
          <a className={route.name === 'review' ? 'active' : ''} href="#/review">
            今日复习 {dueCount > 0 && <em className="pill">{dueCount}</em>}
          </a>
          <a className={route.name === 'stats' ? 'active' : ''} href="#/stats">
            统计
          </a>
          <button className="link" onClick={() => setShowSettings(true)}>
            设置
          </button>
        </nav>
      </header>

      <main>
        {route.name === 'library' && <LibraryPage />}
        {route.name === 'import' && <ImportPage />}
        {route.name === 'material' && route.param && <MaterialPage id={route.param} />}
        {route.name === 'review' && <ReviewPage />}
        {route.name === 'word' && <WordPage lemma={route.param ?? ''} />}
        {route.name === 'words' && <WordBookPage />}
        {route.name === 'stats' && <StatsPage />}
        {route.name === 'unknown' && (
          <div className="empty">
            <h2>页面不存在</h2>
            <button className="btn" onClick={() => go('/')}>
              回到素材库
            </button>
          </div>
        )}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [appKey, setAppKey] = useState(() => readSetting('whitespace:appKey', ''))
  const [speechRate, setSpeechRate] = useState(() => readSetting('whitespace:speechRate', '0.95'))
  const [limit, setLimit] = useState(() => readSetting('whitespace:newLimit', '20'))
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const save = () => {
    if (appKey.trim()) localStorage.setItem('whitespace:appKey', appKey.trim())
    else localStorage.removeItem('whitespace:appKey')
    const r = Number(speechRate)
    localStorage.setItem('whitespace:speechRate', String(Number.isFinite(r) && r > 0 ? r : 0.95))
    const n = Math.max(0, Math.floor(Number(limit) || 0))
    localStorage.setItem('whitespace:newLimit', String(n))
    onClose()
  }

  const exportBackup = async () => {
    setBusy(true)
    setMsg('')
    try {
      const data = await db.exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `whitespace-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMsg(`已导出 ${data.materials.length} 个素材、${data.marks.length} 个标记。`)
    } catch (e) {
      setMsg(`导出失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const importBackup = async (file: File) => {
    setBusy(true)
    setMsg('')
    try {
      const raw = JSON.parse(await file.text())
      if (mode === 'replace' && !confirm('覆盖导入会清空当前所有素材、标记和复习记录，确定吗？')) {
        setBusy(false)
        return
      }
      const counts = await db.importAll(raw, mode)
      setMsg(
        `已导入 ${counts.materials} 个素材、${counts.marks} 个标记、${counts.reviews} 条复习记录。页面即将刷新。`,
      )
      setTimeout(() => location.reload(), 900)
    } catch (e) {
      setMsg(`导入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>设置</h2>
        <p className="muted small">数据只存在你自己的浏览器里。换设备或清缓存前记得导出备份。</p>

        <label className="field">
          <span>访问口令</span>
          <input
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            placeholder="站点没开口令保护就留空"
          />
        </label>

        <div className="field-grid">
          <label className="field">
            <span>语音速度</span>
            <select value={speechRate} onChange={(e) => setSpeechRate(e.target.value)}>
              <option value="0.7">0.7× 慢</option>
              <option value="0.85">0.85×</option>
              <option value="0.95">0.95× 默认</option>
              <option value="1.1">1.1×</option>
              <option value="1.3">1.3× 快</option>
            </select>
          </label>
          <label className="field">
            <span>每日新词上限</span>
            <input
              type="number"
              min={0}
              max={200}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </label>
        </div>

        <div className="row">
          <button className="btn primary" onClick={save}>
            保存
          </button>
          <button className="btn" onClick={onClose}>
            取消
          </button>
        </div>

        <hr />

        <h3>备份</h3>
        <p className="muted small">导出是一个 JSON 文件，包含素材、标记、复习记录和 AI 题目缓存。</p>
        <div className="row">
          <button className="btn" onClick={exportBackup} disabled={busy}>
            ⬇ 导出备份
          </button>
          <select value={mode} onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}>
            <option value="merge">合并导入</option>
            <option value="replace">覆盖导入</option>
          </select>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            ⬆ 导入备份
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importBackup(f)
              e.target.value = ''
            }}
          />
        </div>
        {msg && <p className="backup-msg small">{msg}</p>}

        <hr />
        <p className="muted small">
          AI 出题走 <code>/api/llm</code> 代理，key 只在服务端。本地开发时读 <code>.env.local</code>。
        </p>
      </div>
    </div>
  )
}

/** 图标：一页纸，中间空出一行 —— 留白。 */
function Logo() {
  return (
    <svg className="logo" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="4.2"
        y="2.8"
        width="15.6"
        height="18.4"
        rx="2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 7.4h8M8 16.6h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity=".4"
      />
      <rect
        x="8"
        y="10.7"
        width="8"
        height="2.6"
        rx="1.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
    </svg>
  )
}
