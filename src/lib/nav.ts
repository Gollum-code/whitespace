export function go(path: string) {
  location.hash = `#${path.startsWith('/') ? path : `/${path}`}`
}

export interface Route {
  name: 'library' | 'import' | 'material' | 'review' | 'word' | 'words' | 'stats' | 'unknown'
  param?: string
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] || '/'
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'library' }
  if (parts[0] === 'import') return { name: 'import' }
  if (parts[0] === 'review') return { name: 'review' }
  if (parts[0] === 'words') return { name: 'words' }
  if (parts[0] === 'stats') return { name: 'stats' }
  if (parts[0] === 'm' && parts[1]) return { name: 'material', param: decodeURIComponent(parts[1]) }
  if (parts[0] === 'word' && parts[1]) return { name: 'word', param: decodeURIComponent(parts[1]) }
  return { name: 'unknown' }
}

export function useHashRoute(): string {
  return location.hash || '#/'
}
