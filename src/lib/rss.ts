export interface PodcastEpisode {
  title: string
  description: string
  audioUrl: string
  transcriptUrl: string
  date: string
}

export interface PodcastFeed {
  title: string
  episodes: PodcastEpisode[]
}

function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** 解析播客/博客 RSS。优先取 podcast:transcript，其次 description / itunes:summary。 */
export function parseRss(xml: string): PodcastFeed {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const channel = doc.querySelector('channel')
  const title = textOf(channel?.querySelector('title'))

  const episodes: PodcastEpisode[] = []
  for (const item of Array.from(doc.querySelectorAll('item'))) {
    const epTitle = textOf(item.querySelector('title'))
    if (!epTitle) continue

    let transcriptUrl = ''
    for (const tag of ['podcast:transcript', 'transcript']) {
      const el = item.getElementsByTagName(tag)[0] ?? item.querySelector(tag)
      const url = el?.getAttribute('url')
      if (url) {
        transcriptUrl = url
        break
      }
    }

    const summary =
      textOf(item.querySelector('itunes\\:summary')) ||
      textOf(item.getElementsByTagName('itunes:summary')[0])
    const description = stripHtml(
      item.querySelector('description')?.textContent ||
        item.querySelector('content\\:encoded')?.textContent ||
        summary ||
        '',
    )
    const audioUrl = item.querySelector('enclosure')?.getAttribute('url') ?? ''
    const date = textOf(item.querySelector('pubDate'))

    episodes.push({ title: epTitle, description, audioUrl, transcriptUrl, date })
  }

  if (!episodes.length) throw new Error('没解析到单集，确认这是一个 RSS / Atom 订阅地址')
  return { title: title || '播客', episodes }
}
