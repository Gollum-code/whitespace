import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db'
import { fetchArticle, fetchYouTubeCaptions, youtubeId } from '../lib/article'
import { bookmarkletJs, wantsClipboard } from '../lib/bookmarklet'
import { extractEpubText, extractPdfText } from '../lib/documents'
import { setLocalMedia } from '../lib/media'
import { go } from '../lib/nav'
import { parseRss, type PodcastEpisode } from '../lib/rss'
import { mergeCues, parseSubtitle, splitSentences } from '../lib/text'
import type { Material } from '../types'

type Tab = 'youtube' | 'article' | 'local' | 'doc' | 'podcast'

const TABS: { key: Tab; label: string }[] = [
  { key: 'youtube', label: 'YouTube 视频' },
  { key: 'article', label: '网页文章' },
  { key: 'local', label: '本地视频 + 字幕' },
  { key: 'doc', label: 'PDF / EPUB / TXT' },
  { key: 'podcast', label: '播客 RSS' },
]

export function ImportPage() {
  const [tab, setTab] = useState<Tab>('youtube')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [clipHint, setClipHint] = useState(false)

  // 书签小工具跳转过来（?clip=1）：切到文章页，提示点「从剪贴板读取」
  useEffect(() => {
    if (wantsClipboard()) {
      setTab('article')
      setClipHint(true)
      setArtUrl('')
    }
  }, [])

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

  // doc (pdf / epub / txt)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docTitle, setDocTitle] = useState('')
  const [docText, setDocText] = useState('')
  const [docType, setDocType] = useState('')

  // podcast
  const [podUrl, setPodUrl] = useState('')
  const [podFeedTitle, setPodFeedTitle] = useState('')
  const [podEpisodes, setPodEpisodes] = useState<PodcastEpisode[]>([])
  const [podSelected, setPodSelected] = useState<PodcastEpisode | null>(null)
  const [podText, setPodText] = useState('')

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

  /** 用 oEmbed 自动填 YouTube 标题（走抓取代理，避免 CORS）。 */
  const fillYtTitle = async () => {
    setError('')
    const id = youtubeId(ytUrl)
    if (!id) return setError('先填一个有效的 YouTube 链接')
    setBusy(true)
    try {
      const watch = `https://www.youtube.com/watch?v=${id}`
      const oembed = `https://noembed.com/embed?url=${encodeURIComponent(watch)}`
      const res = await fetch(`/api/fetch?url=${encodeURIComponent(oembed)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `获取失败（HTTP ${res.status}）`)
      const meta = JSON.parse(String(data.html || '{}'))
      if (!meta.title) throw new Error('没拿到标题，手动填一下吧')
      setYtTitle(String(meta.title))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const autoYtSubs = async () => {
    setError('')
    const id = youtubeId(ytUrl)
    if (!id) return setError('先填一个有效的 YouTube 链接')
    setBusy(true)
    try {
      setSubRaw(await fetchYouTubeCaptions(id))
    } catch (e) {
      setError(`${e instanceof Error ? e.message : String(e)}（可以继续用下面的 yt-dlp 命令）`)
    } finally {
      setBusy(false)
    }
  }

  /** 从剪贴板读取正文（配合书签小工具使用）。 */
  const pasteClipboard = async () => {
    setError('')
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) throw new Error('剪贴板是空的')
      setArtText(text.slice(0, 2_000_000))
      setTab('article')
    } catch (e) {
      setError(`读不到剪贴板：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const bookmarklet = useMemo(() => bookmarkletJs(location.origin), [])

  const ytCues = useMemo(() => (subRaw.trim() ? mergeCues(parseSubtitle(subRaw)) : []), [subRaw])
  const artCues = useMemo(() => (artText.trim() ? splitSentences(artText) : []), [artText])
  const localCues = useMemo(
    () => (localSubs.trim() ? mergeCues(parseSubtitle(localSubs)) : []),
    [localSubs],
  )
  const docCues = useMemo(() => (docText.trim() ? splitSentences(docText) : []), [docText])
  const podCues = useMemo(() => (podText.trim() ? splitSentences(podText) : []), [podText])

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

  const loadDocFile = async (f: File) => {
    setError('')
    setBusy(true)
    setDocFile(f)
    setDocText('')
    setDocTitle(f.name.replace(/\.[^.]+$/, ''))
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    setDocType(ext)
    try {
      if (ext === 'pdf') setDocText(await extractPdfText(f))
      else if (ext === 'epub') setDocText(await extractEpubText(f))
      else setDocText((await f.text()).slice(0, 2_000_000))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const saveDoc = async () => {
    setError('')
    if (!docCues.length) return setError('还没有正文。')
    await save({
      id: crypto.randomUUID(),
      title: docTitle.trim() || docFile?.name || '文档',
      kind: 'article',
      cues: docCues.map((text, i) => ({ index: i, text })),
      createdAt: Date.now(),
      sourceNote: docType ? `${docType.toUpperCase()} 导入` : undefined,
    })
  }

  const loadPodcast = async () => {
    setError('')
    setBusy(true)
    setPodEpisodes([])
    setPodSelected(null)
    setPodText('')
    try {
      const res = await fetch(`/api/fetch?url=${encodeURIComponent(podUrl.trim())}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `抓取失败（HTTP ${res.status}）`)
      const feed = parseRss(String(data.html ?? ''))
      setPodFeedTitle(feed.title)
      setPodEpisodes(feed.episodes)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const pickEpisode = async (ep: PodcastEpisode) => {
    setError('')
    setBusy(true)
    setPodSelected(ep)
    setPodText('')
    try {
      let text = ''
      if (ep.transcriptUrl) {
        const res = await fetch(`/api/fetch?url=${encodeURIComponent(ep.transcriptUrl)}`)
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.html) {
          const raw = String(data.html)
          const cues = parseSubtitle(raw)
          text = cues.length ? cues.map((c) => c.text).join(' ') : raw
        }
      }
      if (!text) text = ep.description
      setPodText(text)
      if (!text) setError('这一集没有文字稿或简介，换个单集试试。')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const savePodcast = async () => {
    setError('')
    if (!podCues.length || !podSelected) return setError('还没有正文。')
    await save({
      id: crypto.randomUUID(),
      title: `${podFeedTitle} · ${podSelected.title}`.trim(),
      kind: 'article',
      url: podUrl.trim() || undefined,
      cues: podCues.map((text, i) => ({ index: i, text })),
      createdAt: Date.now(),
      sourceNote: '播客文字稿',
    })
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
            <span>
              标题（可选）
              <button className="link small" onClick={fillYtTitle} disabled={!ytUrl || busy}>
                {busy ? '获取中…' : '自动填标题'}
              </button>
            </span>
            <input value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} placeholder="比如：How I learned English" />
          </label>

          <div className="hintbox">
            <b>字幕怎么来？</b>
            <p>优先点「自动抓英文字幕」；抓不到（视频没字幕 / 数据中心被风控）再手动抓：</p>
            <pre>
              yt-dlp --write-auto-subs --sub-langs "en.*" --skip-download --write-subs
              --convert-subs srt "视频链接"
            </pre>
            <p className="muted small">
              生成同名 <code>.srt</code> 后，把文件拖进来，或直接打开复制全文粘贴。这是唯一需要命令行的一步。
            </p>
          </div>

          <div className="row">
            <button className="btn" onClick={autoYtSubs} disabled={!ytUrl || busy}>
              {busy ? '抓取中…' : '🤖 自动抓英文字幕'}
            </button>
            <span className="muted small">先填链接，点这里试试，多数视频都能直接拿到。</span>
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
          {clipHint && (
            <div className="banner warn">
              <span>已复制正文到剪贴板，点下面按钮读取。</span>
              <button className="btn small primary" onClick={pasteClipboard}>
                📋 从剪贴板读取
              </button>
            </div>
          )}
          <label className="field">
            <span>
              文章链接
              <button className="link small" onClick={pasteClipboard}>
                从剪贴板读取
              </button>
            </span>
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

      {tab === 'doc' && (
        <section className="panel">
          <label className="field">
            <span>选择 PDF / EPUB / TXT</span>
            <input
              type="file"
              accept=".pdf,.epub,.txt,.md"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) loadDocFile(f)
              }}
            />
            <small className="muted">PDF / EPUB 在浏览器里本地解析，不上传。扫描件 PDF 抽不出文字。</small>
          </label>

          <label className="field">
            <span>标题</span>
            <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
          </label>

          {docText && (
            <>
              <label className="field">
                <span>正文（可修改）</span>
                <textarea rows={10} value={docText} onChange={(e) => setDocText(e.target.value)} />
              </label>
              <Preview cues={docCues.map((text) => ({ text }))} />
            </>
          )}

          <button className="btn primary" onClick={saveDoc} disabled={!docCues.length || busy}>
            {busy ? '解析中…' : '保存并开始学习'}
          </button>
        </section>
      )}

      {tab === 'podcast' && (
        <section className="panel">
          <label className="field">
            <span>播客 / 博客 RSS 地址</span>
            <div className="row">
              <input
                value={podUrl}
                onChange={(e) => setPodUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
              />
              <button className="btn" onClick={loadPodcast} disabled={!podUrl || busy}>
                {busy ? '加载中…' : '解析订阅'}
              </button>
            </div>
            <small className="muted">优先读 podcast:transcript 文字稿；没有就用简介。</small>
          </label>

          {podEpisodes.length > 0 && (
            <>
              <div className="podcast-head">
                <b>{podFeedTitle}</b>
                <span className="muted small">{podEpisodes.length} 集</span>
              </div>
              <div className="podcast-list">
                {podEpisodes.slice(0, 60).map((ep) => (
                  <button
                    key={`${ep.title}-${ep.date}`}
                    className={podSelected === ep ? 'episode active' : 'episode'}
                    onClick={() => pickEpisode(ep)}
                  >
                    <span className="ep-title">{ep.title}</span>
                    <small className="muted">{ep.date ? new Date(ep.date).toLocaleDateString() : ''}</small>
                  </button>
                ))}
              </div>

              {podText && (
                <>
                  <label className="field">
                    <span>正文（可修改）</span>
                    <textarea rows={10} value={podText} onChange={(e) => setPodText(e.target.value)} />
                  </label>
                  <Preview cues={podCues.map((text) => ({ text }))} />
                </>
              )}

              <button className="btn primary" onClick={savePodcast} disabled={!podCues.length || busy}>
                保存为文章素材
              </button>
            </>
          )}
        </section>
      )}

      <section className="panel bookmarklet-panel">
        <h3>书签小工具</h3>
        <p className="muted small">
          把下面这个按钮拖到浏览器书签栏。以后在任意英文网页点它，正文会复制到剪贴板，并打开「留白」的导入页。
        </p>
        <a className="btn" href={bookmarklet} onClick={(e) => e.preventDefault()} draggable>
          📎 抓到留白
        </a>
        <p className="muted small">
          手机浏览器不支持拖拽书签，复制下面这段地址手动加书签即可：
        </p>
        <textarea className="bookmarklet-code" readOnly rows={3} value={bookmarklet} />
        <button
          className="btn small"
          onClick={() => {
            navigator.clipboard?.writeText(bookmarklet).catch(() => {})
          }}
        >
          复制书签代码
        </button>
      </section>
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
