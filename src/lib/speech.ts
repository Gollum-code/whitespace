/**
 * 浏览器原生 TTS 封装。零成本、零网络、无 key。
 * 复习卡片、查词、素材句子的 🔊 都走这里。
 * 注意：Chrome 要求用户手势后才能 speak，所以所有入口都是点击触发的。
 */

let voices: SpeechSynthesisVoice[] = []
let loaded = false

function loadVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const v = window.speechSynthesis.getVoices()
  if (v.length) voices = v
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices()
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
  loaded = true
}

export function canSpeak(): boolean {
  return loaded && voices.length > 0 && 'speechSynthesis' in window
}

/** 挑一个英语嗓音：优先自然音色 / 本地语音，其次任何 en。 */
function pickVoice(): SpeechSynthesisVoice | undefined {
  if (!voices.length) loadVoices()
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
  if (!en.length) return voices[0]
  return (
    en.find((v) => /natural|online|premium/i.test(v.name)) ||
    en.find((v) => v.localService) ||
    en.find((v) => v.lang.toLowerCase().startsWith('en-us')) ||
    en[0]
  )
}

function rate(): number {
  const r = Number(localStorage.getItem('whitespace:speechRate') ?? '')
  return r > 0 ? r : 0.95
}

export function stopSpeak() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* ignore */
  }
}

function say(text: string) {
  const u = new SpeechSynthesisUtterance(text)
  const v = pickVoice()
  if (v) {
    u.voice = v
    u.lang = v.lang
  } else {
    u.lang = 'en-US'
  }
  u.rate = rate()
  u.pitch = 1
  window.speechSynthesis.speak(u)
}

/** 朗读一整段。 */
export function speak(text: string) {
  if (!canSpeak()) return
  stopSpeak()
  say(text)
}

/**
 * 朗读挖空句：把 ____ 换成一个逗号停顿，先读前半句再读后半句。
 * 这样用户能听到语境，但听不到答案。
 */
export function speakWithGap(sentence: string) {
  const parts = sentence.split(/_+/).map((s) => s.trim()).filter(Boolean)
  if (parts.length <= 1) {
    speak(sentence)
    return
  }
  speak(parts.join(', '))
}
