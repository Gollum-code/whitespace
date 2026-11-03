/**
 * 云同步（跨设备）。
 *
 * 设计：客户端用「同步口令」派生 AES-GCM 密钥，把整个备份加密后再上传。
 * 服务端（Cloudflare KV，见 worker/handler.js）只存密文，看不到任何明文。
 * 没有账号、没有数据库，口令就是你自己的钥匙 —— 忘记口令 = 数据找不回。
 *
 * 流程：设置里填同一个口令 → 推送（加密上传）/ 拉取（解密合并）。
 */
import { db } from '../db'
import { hashString } from './text'

/** 从口令派生 AES-GCM 密钥（PBKDF2）。salt 用固定前缀，保证跨设备一致。 */
async function deriveKey(pass: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const salt = enc.encode('whitespace-sync-salt-v1')
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function unb64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

/** 推送：导出全部数据 → 加密 → 上传到 /api/sync。 */
export async function syncPush(pass: string): Promise<number> {
  const key = await deriveKey(pass)
  const data = await db.exportAll()
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)))
  const room = hashString(pass)
  const res = await fetch(`/api/sync?room=${encodeURIComponent(room)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ iv: b64(iv.buffer), ct: b64(ct), ts: Date.now() }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `上传失败（HTTP ${res.status}）`)
  return data.marks?.length ?? 0
}

/** 拉取：下载密文 → 解密 → 合并到本地。返回导入计数。 */
export async function syncPull(pass: string): Promise<{ materials: number; marks: number; reviews: number }> {
  const room = hashString(pass)
  const res = await fetch(`/api/sync?room=${encodeURIComponent(room)}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `拉取失败（HTTP ${res.status}）`)
  if (!body.ct) throw new Error('云端还没有数据。先在其他设备上推送一次。')
  const key = await deriveKey(pass)
  const iv = unb64(String(body.iv))
  const ct = unb64(String(body.ct))
  let raw: string
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource)
    raw = new TextDecoder().decode(plain)
  } catch {
    throw new Error('解密失败：口令不对，或云端数据已损坏。')
  }
  const parsed = JSON.parse(raw)
  if (!parsed || parsed.app !== 'whitespace') throw new Error('云端数据不是「留白」的备份。')
  return db.importAll(parsed, 'merge')
}

/** 是否配置了同步服务端（用于设置页提示）。 */
export async function syncAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/sync?room=__ping__')
    if (!res.ok) return res.status === 200
    return true
  } catch {
    return false
  }
}
