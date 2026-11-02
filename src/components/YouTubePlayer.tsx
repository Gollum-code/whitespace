import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<any> | null = null

function loadYT(timeoutMs = 7000): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (!window.YT) reject(new Error('YT API timeout'))
    }, timeoutMs)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer)
      prev?.()
      if (window.YT) resolve(window.YT)
      else reject(new Error('YT not ready'))
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('YT script failed'))
    }
    document.head.appendChild(tag)
  })
  return apiPromise
}

interface Props {
  videoId: string
  seekTo?: { sec: number; nonce: number } | null
  onTime?: (sec: number) => void
}

const EMBED = (id: string) =>
  `https://www.youtube.com/embed/${id}?enablejsapi=1&rel=0&playsinline=1&modestbranding=1`

/**
 * 播放器两段式：
 *  - 先渲染 enablejsapi=1 的 iframe（postMessage 即可跳转，零外部脚本依赖，YouTube 挂了也能看到界面）
 *  - IFrame API 就绪后升级成完整播放器（getCurrentTime 驱动"当前句"高亮）
 */
export function YouTubePlayer({ videoId, seekTo, onTime }: Props) {
  const [upgraded, setUpgraded] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const apiHostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const timerRef = useRef<number | null>(null)
  const seekRef = useRef(seekTo)

  useEffect(() => {
    seekRef.current = seekTo
  }, [seekTo])

  // 尝试升级
  useEffect(() => {
    let cancelled = false
    loadYT()
      .then(() => {
        if (!cancelled) setUpgraded(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [videoId])

  // 升级后初始化 API 播放器
  useEffect(() => {
    if (!upgraded) return
    let cancelled = false
    loadYT().then((YT) => {
      if (cancelled || !apiHostRef.current) return
      const div = document.createElement('div')
      apiHostRef.current.innerHTML = ''
      apiHostRef.current.appendChild(div)
      playerRef.current = new YT.Player(div, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            if (seekRef.current) {
              try {
                playerRef.current.seekTo(seekRef.current.sec, true)
                playerRef.current.playVideo()
              } catch {
                /* ignore */
              }
            }
            timerRef.current = window.setInterval(() => {
              try {
                onTime?.(playerRef.current?.getCurrentTime?.() ?? 0)
              } catch {
                /* ignore */
              }
            }, 500)
          },
        },
      })
    })
    return () => {
      cancelled = true
      if (timerRef.current) window.clearInterval(timerRef.current)
      try {
        playerRef.current?.destroy?.()
      } catch {
        /* ignore */
      }
      playerRef.current = null
    }
  }, [upgraded, videoId])

  const seekNow = (sec: number) => {
    if (playerRef.current) {
      try {
        playerRef.current.seekTo(sec, true)
        playerRef.current.playVideo()
        return
      } catch {
        /* fall through */
      }
    }
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [sec, true] }),
      '*',
    )
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
      '*',
    )
  }

  useEffect(() => {
    if (!seekTo) return
    seekNow(seekTo.sec)
  }, [seekTo?.nonce])

  return (
    <div className="yt-host">
      {!upgraded && (
        <iframe
          ref={iframeRef}
          className="yt-iframe"
          src={EMBED(videoId)}
          title="YouTube"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}
      {upgraded && <div ref={apiHostRef} className="yt-api" />}
    </div>
  )
}
