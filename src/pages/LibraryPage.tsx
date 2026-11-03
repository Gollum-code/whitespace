import { useEffect, useState } from 'react'
import { db } from '../db'
import { Onboarding } from '../components/Onboarding'
import { go } from '../lib/nav'
import { isDue, isMastered } from '../lib/srs'
import { createSampleMaterial } from '../lib/sample'
import type { Mark, Material, MaterialKind } from '../types'

const KIND_LABEL: Record<Material['kind'], string> = {
  youtube: 'YouTube',
  article: '文章',
  local: '本地视频',
}

export function LibraryPage({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [marks, setMarks] = useState<Mark[]>([])
  const [loaded, setLoaded] = useState(false)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | MaterialKind>('all')
  const [backupDays, setBackupDays] = useState<number | null>(null)
  const [showOnboard, setShowOnboard] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const [ms, mk] = await Promise.all([db.allMaterials(), db.getAllMarks()])
      if (!alive) return
      setMaterials(ms)
      setMarks(mk as Mark[])
      setLoaded(true)
      const last = await db.getMeta<number>('lastBackupAt')
      if (!alive) return
      setBackupDays(last ? Math.floor((Date.now() - last) / 86_400_000) : null)
      const seen = await db.getMeta<boolean>('onboarded')
      if (!alive) return
      if (!seen && ms.length === 0) setShowOnboard(true)
    }
    load()
    return () => {
      alive = false
    }
  }, [])

  const due = new Set(marks.filter((m) => isDue(m.card)).map((m) => m.lemma)).size
  const mastered = new Set(marks.filter((m) => isMastered(m.card)).map((m) => m.lemma)).size
  const byMaterial = new Map<string, number>()
  for (const m of marks) byMaterial.set(m.materialId, (byMaterial.get(m.materialId) ?? 0) + 1)

  const needle = q.trim().toLowerCase()
  const filtered = materials.filter(
    (m) => (kind === 'all' || m.kind === kind) && (!needle || m.title.toLowerCase().includes(needle)),
  )

  const dismissOnboard = () => {
    db.putMeta('onboarded', true)
    setShowOnboard(false)
  }

  return (
    <div className="page">
      {showOnboard && <Onboarding onDone={dismissOnboard} />}
      <section className="hero">
        <div>
          <h1>素材库</h1>
          <p className="muted">
            导入你真正想看的视频和文章，点出不熟的词，系统按记忆规律把它们推回来。
          </p>
        </div>
        <button className="btn primary" onClick={() => go('/import')}>
          ＋ 导入素材
        </button>
      </section>

      <section className="stats">
        <div className="stat">
          <b>{materials.length}</b>
          <span>素材</span>
        </div>
        <div className="stat">
          <b>{marks.length}</b>
          <span>标记</span>
        </div>
        <div className="stat accent">
          <b>{due}</b>
          <span>今日到期</span>
        </div>
        <div className="stat">
          <b>{mastered}</b>
          <span>已掌握</span>
        </div>
      </section>

      {due > 0 && (
        <div className="banner">
          <span>有 {due} 个词到复习时间了。</span>
          <button className="btn small primary" onClick={() => go('/review')}>
            去复习 →
          </button>
        </div>
      )}

      {loaded && marks.length > 0 && (backupDays === null || backupDays >= 7) && (
        <div className="banner warn">
          <span>
            {backupDays === null
              ? '还没有导出过备份，清除浏览器数据会全部丢失。'
              : `上次备份是 ${backupDays} 天前。`}
          </span>
          <button className="btn small" onClick={() => onOpenSettings?.()}>
            去导出 →
          </button>
        </div>
      )}

      <div className="toolbar">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索素材…"
        />
        <div className="seg">
          {(['all', 'youtube', 'article', 'local'] as const).map((k) => (
            <button key={k} className={kind === k ? 'seg-btn active' : 'seg-btn'} onClick={() => setKind(k)}>
              {k === 'all' ? '全部' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      {loaded && materials.length === 0 && (
        <div className="empty">
          <h2>还没有素材</h2>
          <p className="muted">先导入一篇你本来就想读的文章，或一个带字幕的视频。</p>
          <div className="row center">
            <button
              className="btn"
              onClick={async () => {
                await db.putMaterial(createSampleMaterial())
                setMaterials(await db.allMaterials())
              }}
            >
              先试一篇示例文章
            </button>
            <button className="btn primary" onClick={() => go('/import')}>
              导入第一个素材
            </button>
          </div>
        </div>
      )}

      {loaded && materials.length > 0 && filtered.length === 0 && (
        <div className="empty">
          <h2>没有匹配的素材</h2>
          <p className="muted">换个关键词或清除筛选。</p>
        </div>
      )}

      <div className="cards">
        {filtered.map((m) => {
          const n = byMaterial.get(m.id) ?? 0
          return (
            <button key={m.id} className="card material" onClick={() => go(`/m/${m.id}`)}>
              <div className="card-top">
                <span className={`tag ${m.kind}`}>{KIND_LABEL[m.kind]}</span>
                <span className="muted small">{m.cues.length} 句</span>
              </div>
              <h3>{m.title}</h3>
              <div className="card-foot">
                <span className="muted small">{new Date(m.createdAt).toLocaleDateString()}</span>
                <span className="muted small">{n} 个标记</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
