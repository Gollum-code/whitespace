import { useEffect, useRef, useState, type RefObject } from 'react'
import { getLocalMedia, setLocalMedia } from '../lib/media'

interface Props {
  materialId: string
  seekTo?: { sec: number; nonce: number } | null
  onTime?: (sec: number) => void
}

/** 本地视频：文件只在本标签页内存里，刷新后要重新选择。 */
export function LocalVideoPlayer({ materialId, seekTo, onTime }: Props) {
  const mediaRef = useRef<HTMLMediaElement>(null)
  const [media, setMedia] = useState(() => getLocalMedia(materialId))
  const [, force] = useState(0)

  useEffect(() => setMedia(getLocalMedia(materialId)), [materialId])

  useEffect(() => {
    if (!seekTo || !mediaRef.current) return
    mediaRef.current.currentTime = seekTo.sec
    mediaRef.current.play().catch(() => {})
  }, [seekTo])

  if (!media) {
    return (
      <div className="dropzone">
        <div>
          <strong>需要重新绑定视频</strong>
          <p className="muted">视频不上传、不落盘，刷新页面后要重新选同一个文件。</p>
        </div>
        <label className="btn">
          选择视频文件
          <input
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setLocalMedia(materialId, f)
              setMedia(getLocalMedia(materialId))
              force((n) => n + 1)
            }}
          />
        </label>
      </div>
    )
  }

  const isAudio = /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus|webm)$/i.test(media.name)
  const onTimeUpdate = (e: React.SyntheticEvent<HTMLMediaElement>) =>
    onTime?.(e.currentTarget.currentTime)

  return (
    <>
      {isAudio ? (
        <audio
          ref={mediaRef as RefObject<HTMLAudioElement>}
          className="audio-player"
          src={media.url}
          controls
          onTimeUpdate={onTimeUpdate}
        />
      ) : (
        <video
          ref={mediaRef as RefObject<HTMLVideoElement>}
          className="video"
          src={media.url}
          controls
          onTimeUpdate={onTimeUpdate}
        />
      )}
    </>
  )
}
