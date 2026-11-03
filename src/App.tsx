import { useEffect, useRef, useState } from 'react'
import { db } from './db'
import { go, parseRoute } from './lib/nav'
import { isDue, refreshScheduler } from './lib/srs'
import { exportAnkiTsv, exportMarksCsv } from './lib/exporter'
import { syncPull, syncPush } from './lib/sync'
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
    const t = localStorage.getItem('whitespace:theme')
    document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light'
  }, [])

  useEffect(() => {
    const refresh = async () => {
      const marks = (await db.getAllMarks()) as Mark[]
      const due = marks.filter((m) => isDue(m.card))
      setDueCount(new Set(due.map((m) => m.lemma)).size)
    }
    refresh()
    const t = window.setInterval(refresh, 5000)
    return () => window.clearInterval(t)
  }, [hash])

  useEffect(() => {
    return () => stopSpeak()
  }, [])

  // 自动备份：每天最多一次，把快照存进 IndexedDB（离线可恢复，防止误删）
  useEffect(() => {
    const autoBackup = async () => {
      const last = await db.getMeta<number>('lastAutoBackupAt')
      if (last && Date.now() - last < 86_400_000) return
      const marks = await db.getAllMarks()
      if (!marks.length) return
      await db.saveSnapshot(await db.exportAll())
      await db.putMeta('lastAutoBackupAt', Date.now())
    }
    autoBackup().catch(() => {})
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
        {route.name === 'library' && <LibraryPage onOpenSettings={() => setShowSettings(true)} />}
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
  const [retention, setRetention] = useState(() => readSetting('whitespace:retention', '0.9'))
  const [maxInterval, setMaxInterval] = useState(() => readSetting('whitespace:maxInterval', '365'))
  const [theme, setTheme] = useState(() => readSetting('whitespace:theme', 'light'))
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [syncPass, setSyncPass] = useState(() => readSetting('whitespace:syncPass', ''))
  const [syncMsg, setSyncMsg] = useState('')
  const [snapshots, setSnapshots] = useState<{ id: string; at: number }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const save = () => {
    if (appKey.trim()) localStorage.setItem('whitespace:appKey', appKey.trim())
    else localStorage.removeItem('whitespace:appKey')
    const r = Number(speechRate)
    localStorage.setItem('whitespace:speechRate', String(Number.isFinite(r) && r > 0 ? r : 0.95))
    const n = Math.max(0, Math.floor(Number(limit) || 0))
    localStorage.setItem('whitespace:newLimit', String(n))
    const ret = Number(retention)
    localStorage.setItem('whitespace:retention', String(Number.isFinite(ret) ? ret : 0.9))
    const mi = Number(maxInterval)
    localStorage.setItem('whitespace:maxInterval', String(Number.isFinite(mi) ? mi : 365))
    localStorage.setItem('whitespace:theme', theme === 'dark' ? 'dark' : 'light')
    if (syncPass.trim()) localStorage.setItem('whitespace:syncPass', syncPass.trim())
    else localStorage.removeItem('whitespace:syncPass')
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light'
    refreshScheduler()
    onClose()
  }

  const loadSnapshots = async () => {
    const all = await db.listSnapshots()
    setSnapshots(all.sort((a, b) => b.at - a.at).map((s) => ({ id: s.id, at: s.at })))
  }

  useEffect(() => {
    loadSnapshots()
  }, [])

  const makeSnapshot = async () => {
    setBusy(true)
    setMsg('')
    try {
      const snap = await db.saveSnapshot(await db.exportAll())
      await db.putMeta('lastAutoBackupAt', Date.now())
      await db.putMeta('lastBackupAt', Date.now())
      await loadSnapshots()
      setMsg(`已保存快照（${new Date(snap.at).toLocaleString()}）。`)
    } catch (e) {
      setMsg(`快照失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const restoreSnapshot = async (id: string) => {
    if (!confirm('从快照恢复会覆盖当前数据，确定吗？')) return
    setBusy(true)
    setMsg('')
    try {
      const snap = await db.getSnapshot(id)
      if (!snap) throw new Error('快照不存在')
      await db.importAll(snap.data, 'replace')
      setMsg('已从快照恢复，页面即将刷新。')
      setTimeout(() => location.reload(), 900)
    } catch (e) {
      setMsg(`恢复失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const doSyncPush = async () => {
    const pass = syncPass.trim()
    if (!pass) return setSyncMsg('先填一个同步口令')
    setBusy(true)
    setSyncMsg('')
    try {
      const n = await syncPush(pass)
      setSyncMsg(`已上传 ${n} 个标记到云端。`)
    } catch (e) {
      setSyncMsg(`上传失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const doSyncPull = async () => {
    const pass = syncPass.trim()
    if (!pass) return setSyncMsg('先填一个同步口令')
    setBusy(true)
    setSyncMsg('')
    try {
      const c = await syncPull(pass)
      setSyncMsg(`已合并云端数据：${c.marks} 个标记、${c.materials} 个素材、${c.reviews} 条复习。`)
    } catch (e) {
      setSyncMsg(`拉取失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
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
      await db.putMeta('lastBackupAt', Date.now())
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
          <label className="field">
            <span>目标记忆率</span>
            <select value={retention} onChange={(e) => setRetention(e.target.value)}>
              <option value="0.8">80% · 间隔更短</option>
              <option value="0.85">85%</option>
              <option value="0.9">90% · 默认</option>
              <option value="0.95">95% · 复习更勤</option>
            </select>
          </label>
          <label className="field">
            <span>最大间隔（天）</span>
            <select value={maxInterval} onChange={(e) => setMaxInterval(e.target.value)}>
              <option value="90">90 · 更频繁</option>
              <option value="180">180</option>
              <option value="365">365 · 默认</option>
              <option value="730">730</option>
              <option value="1825">1825 · 更久</option>
            </select>
          </label>
          <label className="field">
            <span>主题</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
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
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setMsg('')
              try {
                const n = await exportMarksCsv()
                setMsg(`已导出 ${n} 个标记到 CSV。`)
              } catch (e) {
                setMsg(`导出失败：${e instanceof Error ? e.message : String(e)}`)
              } finally {
                setBusy(false)
              }
            }}
          >
            ⬇ 导出 CSV
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setMsg('')
              try {
                const n = await exportAnkiTsv()
                setMsg(`已导出 ${n} 个标记到 Anki TSV（正面挖空 / 背面释义）。`)
              } catch (e) {
                setMsg(`导出失败：${e instanceof Error ? e.message : String(e)}`)
              } finally {
                setBusy(false)
              }
            }}
          >
            🗂 导出 Anki
          </button>
        </div>
        {msg && <p className="backup-msg small">{msg}</p>}

        <hr />

        <h3>自动备份（本地快照）</h3>
        <p className="muted small">
          每天自动存一份快照到浏览器里（保留最近 10 份），防止误删、改坏数据。清浏览器数据前仍需手动导出。
        </p>
        <div className="row">
          <button className="btn small" onClick={makeSnapshot} disabled={busy}>
            立即备份快照
          </button>
        </div>
        {snapshots.length > 0 && (
          <div className="snapshot-list">
            {snapshots.map((s) => (
              <div key={s.id} className="snapshot-row">
                <span className="muted small">{new Date(s.at).toLocaleString()}</span>
                <button className="link small" onClick={() => restoreSnapshot(s.id)} disabled={busy}>
                  恢复
                </button>
              </div>
            ))}
          </div>
        )}

        <hr />

        <h3>云同步（跨设备）</h3>
        <p className="muted small">
          填一个只有你会的「同步口令」，在这台设备推送、那台设备拉取。数据用口令加密后才上传，服务端看不到内容；
          忘记口令数据就找不回。部署时需给 Pages 项目绑定名为 <code>SYNC</code> 的 KV namespace（见 README）。
        </p>
        <label className="field">
          <span>同步口令</span>
          <input
            value={syncPass}
            onChange={(e) => setSyncPass(e.target.value)}
            placeholder="至少 6 位，两台设备填一样的"
          />
        </label>
        <div className="row">
          <button className="btn small" onClick={doSyncPush} disabled={busy || !syncPass.trim()}>
            ⬆ 推送到云端
          </button>
          <button className="btn small" onClick={doSyncPull} disabled={busy || !syncPass.trim()}>
            ⬇ 从云端拉取
          </button>
        </div>
        {syncMsg && <p className="backup-msg small">{syncMsg}</p>}

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
