import { useMemo, useRef, useState } from 'react'
import { db } from '../db'
import { fetchArticle, youtubeId } from '../lib/article'
import { setLocalMedia } from '../lib/media'
import { go } from '../lib/nav'
import { mergeCues, parseSubtitle, splitSentences } from '../lib/text'
import type { Material } from '../types'

type Tab = 'youtube' | 'article' | 'local'

const TABS: { key: Tab; label: string }[] = [
  { key: 'youtube', label: 'YouTube 视频' },
  { key: 'article', label: '网页文章' },
  { key: 'local', label: '本地视频 + 字幕' },
]

export function ImportPage() {
  const [tab, setTab] = useState<Tab>('youtube')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // youtube
  const [ytUrl, setYtUrl] = useState('')
  const [ytTitle, setYtTitle] = useState('')
  const [subRaw, setSubRaw] = useState('')
  const [subUrl, setSubUrl] = useState('')
  const subsFileRef = useRef<HTMLInputElement>(null)

  // article
  const [artUrl, setArtUrl] = useState('')
  const [artTitle, setArtTitle] = useState('')
  const [artText, setArtText] = useState('')

  // local
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [localSubs, setLocalSubs] = useState('')
  const [localSubUrl, setLocalSubUrl] = useState('')
  const [localTitle, setLocalTitle] = useState('')

  const grabSubtitle = async (url: string, set: (v: string) => void) => {
    setError('')
    setBusy(true)
    try {
      if (!/^https?:\/\//i.test(url.trim())) throw new Error('请输入 http(s) 开头的字幕链接')
      const res = await fetch(`/api/fetch?url=${encodeURIComponent(url.trim())}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `抓取失败（HTTP ${res.status}）`)
      if (!data.html) throw new Error('抓取失败：没有返回内容')
      set(String(data.html))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const ytCues = useMemo(() => (subRaw.trim() ? mergeCues(parseSubtitle(subRaw)) : []), [subRaw])
  const artCues = useMemo(() => (artText.trim() ? splitSentences(artText) : []), [artText])
  const localCues = useMemo(
    () => (localSubs.trim() ? mergeCues(parseSubtitle(localSubs)) : []),
    [localSubs],
  )

  const save = async (m: Material, video?: File) => {
    await db.putMaterial(m)
    if (video) setLocalMedia(m.id, video)
    go(`/m/${m.id}`)
  }

  const saveYouTube = async () => {
    setError('')
    const id = youtubeId(ytUrl)
    if (!id) return setError('没认出 YouTube 视频 ID，检查一下链接。')
    if (!ytCues.length) return setError('还没有字幕。把 VTT/SRT 贴进来或上传文件。')
    await save({
      id: crypto.randomUUID(),
      title: ytTitle.trim() || `YouTube · ${id}`,
      kind: 'youtube',
      url: `https://www.youtube.com/watch?v=${id}`,
      videoId: id,
      cues: ytCues,
      createdAt: Date.now(),
    })
  }

  const grabArticle = async () => {
    setError('')
    setBusy(true)
    try {
      const r = await fetchArticle(artUrl)
      setArtTitle(r.title)
      setArtText(r.text)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const saveArticle = async () => {
    setError('')
    if (!artCues.length) return setError('没有正文，先抓取或粘贴一段英文。')
    await save({
      id: crypto.randomUUID(),
      title: artTitle.trim() || '未命名文章',
      kind: 'article',
      url: artUrl.trim() || undefined,
      cues: artCues.map((text, i) => ({ index: i, text })),
      createdAt: Date.now(),
    })
  }

  const saveLocal = async () => {
    setError('')
    if (!localCues.length) return setError('还没有字幕，贴一段 SRT 或选一个 .srt 文件。')
    await save(
      {
        id: crypto.randomUUID(),
        title: localTitle.trim() || videoFile?.name || '本地视频',
        kind: 'local',
        cues: localCues,
        createdAt: Date.now(),
        sourceNote: videoFile?.name,
      },
      videoFile ?? undefined,
    )
  }

  return (
    <div className="page narrow">
      <button className="link" onClick={() => go('/')}>
        ← 返回素材库
      </button>
      <h1>导入素材</h1>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'tab active' : 'tab'}
            onClick={() => {
              setTab(t.key)
              setError('')
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {tab === 'youtube' && (
        <section className="panel">
          <label className="field">
            <span>YouTube 链接或视频 ID</span>
            <input
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </label>
          <label className="field">
            <span>标题（可选）</span>
            <input value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} placeholder="比如：How I learned English" />
          </label>

          <div className="hintbox">
            <b>字幕怎么来？</b>
            <p>
              浏览器拿不到 YouTube 的字幕接口（跨域 + 风控），所以用本机一条命令抓下来：
            </p>
            <pre>
              yt-dlp --write-auto-subs --sub-langs "en.*" --skip-download --write-subs
              --convert-subs srt "视频链接"
            </pre>
            <p className="muted small">
              生成同名 <code>.srt</code> 后，把文件拖进来，或直接打开复制全文粘贴。这是唯一需要命令行的一步。
            </p>
          </div>

          <label className="field">
            <span>
              字幕内容（VTT / SRT 均可）
              <button className="link small" onClick={() => subsFileRef.current?.click()}>
                选择字幕文件
              </button>
            </span>
            <textarea
              rows={8}
              value={subRaw}
              onChange={(e) => setSubRaw(e.target.value)}
              placeholder="00:00:01,000 --> 00:00:04,000&#10;Hello everyone..."
            />
            <input
              ref={subsFileRef}
              type="file"
              accept=".srt,.vtt,.txt"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) setSubRaw(await f.text())
              }}
            />
          </label>

          <label className="field">
            <span>或者填字幕链接</span>
            <div className="row">
              <input
                value={subUrl}
                onChange={(e) => setSubUrl(e.target.value)}
                placeholder="https://example.com/subtitle.vtt"
              />
              <button
                className="btn"
                onClick={() => grabSubtitle(subUrl, setSubRaw)}
                disabled={!subUrl || busy}
              >
                {busy ? '抓取中…' : '抓取字幕'}
              </button>
            </div>
          </label>

          <Preview cues={ytCues} />

          <button className="btn primary" onClick={saveYouTube} disabled={!ytUrl || !ytCues.length}>
            保存并开始学习
          </button>
        </section>
      )}

      {tab === 'article' && (
        <section className="panel">
          <label className="field">
            <span>文章链接</span>
            <div className="row">
              <input
                value={artUrl}
                onChange={(e) => setArtUrl(e.target.value)}
                placeholder="https://example.com/article"
              />
              <button className="btn" onClick={grabArticle} disabled={!artUrl || busy}>
                {busy ? '抓取中…' : '抓取正文'}
              </button>
            </div>
          </label>

          <label className="field">
            <span>标题</span>
            <input value={artTitle} onChange={(e) => setArtTitle(e.target.value)} />
          </label>

          <label className="field">
            <span>正文（可以直接粘贴或修改）</span>
            <textarea
              rows={10}
              value={artText}
              onChange={(e) => setArtText(e.target.value)}
              placeholder="抓取失败的话，把英文正文直接粘到这里。"
            />
          </label>

          <Preview cues={artCues.map((text) => ({ text }))} />

          <button className="btn primary" onClick={saveArticle} disabled={!artCues.length}>
            保存并开始学习
          </button>
        </section>
      )}

      {tab === 'local' && (
        <section className="panel">
          <label className="field">
            <span>视频 / 音频文件</span>
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setVideoFile(f)
                if (f && !localTitle) setLocalTitle(f.name.replace(/\.[^.]+$/, ''))
              }}
            />
            <small className="muted">只存在当前标签页，刷新后要重新选择；不会上传。</small>
          </label>

          <label className="field">
            <span>标题</span>
            <input value={localTitle} onChange={(e) => setLocalTitle(e.target.value)} />
          </label>

          <label className="field">
            <span>字幕（SRT）</span>
            <textarea
              rows={8}
              value={localSubs}
              onChange={(e) => setLocalSubs(e.target.value)}
              placeholder="1&#10;00:00:01,000 --> 00:00:04,000&#10;Hello..."
            />
            <input
              type="file"
              accept=".srt,.vtt,.txt"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) setLocalSubs(await f.text())
              }}
            />
          </label>

          <label className="field">
            <span>或者填字幕链接</span>
            <div className="row">
              <input
                value={localSubUrl}
                onChange={(e) => setLocalSubUrl(e.target.value)}
                placeholder="https://example.com/subtitle.srt"
              />
              <button
                className="btn"
                onClick={() => grabSubtitle(localSubUrl, setLocalSubs)}
                disabled={!localSubUrl || busy}
              >
                {busy ? '抓取中…' : '抓取字幕'}
              </button>
            </div>
          </label>

          <Preview cues={localCues} />

          <button className="btn primary" onClick={saveLocal} disabled={!localCues.length}>
            保存并开始学习
          </button>
        </section>
      )}
    </div>
  )
}

function Preview({ cues }: { cues: { text: string }[] }) {
  if (!cues.length) return null
  return (
    <div className="preview">
      <div className="muted small">
        已切出 <b>{cues.length}</b> 句，预览前 3 句：
      </div>
      <ul>
        {cues.slice(0, 3).map((c, i) => (
          <li key={i}>{c.text}</li>
        ))}
      </ul>
    </div>
  )
}
