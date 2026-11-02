import type { Drill, LookupRec, Mark, Material, ReviewLog } from './types'

const DB_NAME = 'whitespace'
const DB_VER = 2
const STORES = ['materials', 'marks', 'drills', 'meta', 'reviews', 'lookups'] as const

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('materials')) {
        const s = db.createObjectStore('materials', { keyPath: 'id' })
        s.createIndex('createdAt', 'createdAt')
      }
      if (!db.objectStoreNames.contains('marks')) {
        const s = db.createObjectStore('marks', { keyPath: 'id' })
        s.createIndex('lemma', 'lemma')
        s.createIndex('materialId', 'materialId')
        s.createIndex('due', 'card.due')
        s.createIndex('createdAt', 'createdAt')
      }
      if (!db.objectStoreNames.contains('drills')) {
        db.createObjectStore('drills', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('reviews')) {
        const s = db.createObjectStore('reviews', { keyPath: 'id' })
        s.createIndex('ts', 'ts')
        s.createIndex('lemma', 'lemma')
      }
      if (!db.objectStoreNames.contains('lookups')) {
        db.createObjectStore('lookups', { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return opening
}

function pget<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

/** 在一个 store 上跑一次请求；写操作也会等 transaction 提交。 */
async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode)
    const out = fn(t.objectStore(store))
    let result: T
    if (out) {
      out.onsuccess = () => {
        result = out.result
      }
    }
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

/** 按索引查询，返回数组。 */
async function byIndex<T>(store: string, index: string, query: IDBValidKey | IDBKeyRange): Promise<T[]> {
  const db = await open()
  const s = db.transaction(store, 'readonly').objectStore(store)
  return pget<T[]>(s.index(index).getAll(query) as IDBRequest<T[]>)
}

/** 批量写同一个 store，放在一个事务里，比逐条快很多。 */
async function putMany<T>(store: string, rows: T[]): Promise<void> {
  if (!rows.length) return
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, 'readwrite')
    const s = t.objectStore(store)
    for (const row of rows) s.put(row)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

async function all<T>(store: string): Promise<T[]> {
  const out = await run<T[]>(store, 'readonly', (s) => s.getAll())
  return out ?? []
}

export const db = {
  // ---- materials ----
  putMaterial: (m: Material) => run('materials', 'readwrite', (s) => s.put(m)),
  getMaterial: (id: string) => run<Material>('materials', 'readonly', (s) => s.get(id)),
  delMaterial: (id: string) => run('materials', 'readwrite', (s) => s.delete(id)),
  async allMaterials(): Promise<Material[]> {
    const out = await run<Material[]>('materials', 'readonly', (s) => s.getAll())
    return (out ?? []).sort((a, b) => b.createdAt - a.createdAt)
  },

  // ---- marks ----
  putMark: (m: Mark) => run('marks', 'readwrite', (s) => s.put(m)),
  delMark: (id: string) => run('marks', 'readwrite', (s) => s.delete(id)),
  getMarksByMaterial: (materialId: string) => byIndex<Mark>('marks', 'materialId', materialId),
  async getAllMarks(): Promise<Mark[]> {
    const out = await run<Mark[]>('marks', 'readonly', (s) => s.getAll())
    return out ?? []
  },
  marksByLemma: (lemma: string) => byIndex<Mark>('marks', 'lemma', lemma),
  async dueMarks(now = new Date()): Promise<Mark[]> {
    const all = await run<Mark[]>('marks', 'readonly', (s) => s.getAll())
    return (all ?? [])
      .filter((m) => new Date(m.card.due).getTime() <= now.getTime())
      .sort((a, b) => a.card.due.localeCompare(b.card.due))
  },

  // ---- drills ----
  putDrill: (d: Drill) => run('drills', 'readwrite', (s) => s.put(d)),
  getDrill: (key: string) => run<Drill>('drills', 'readonly', (s) => s.get(key)),

  // ---- reviews ----
  putReview: (r: ReviewLog) => run('reviews', 'readwrite', (s) => s.put(r)),
  allReviews: () => all<ReviewLog>('reviews'),
  async reviewsSince(ts: number): Promise<ReviewLog[]> {
    const out = await byIndex<ReviewLog>('reviews', 'ts', IDBKeyRange.lowerBound(ts))
    return out.sort((a, b) => a.ts - b.ts)
  },

  // ---- lookups ----
  putLookup: (l: LookupRec) => run('lookups', 'readwrite', (s) => s.put(l)),
  getLookup: (key: string) => run<LookupRec>('lookups', 'readonly', (s) => s.get(key)),
  allLookups: () => all<LookupRec>('lookups'),

  // ---- meta ----
  putMeta: (key: string, value: unknown) => run('meta', 'readwrite', (s) => s.put({ key, value })),
  async getMeta<T = unknown>(key: string): Promise<T | undefined> {
    const row = await run<any>('meta', 'readonly', (s) => s.get(key))
    return row ? (row.value as T) : undefined
  },

  // ---- backup ----
  async exportAll() {
    const [materials, marks, drills, meta, reviews, lookups] = await Promise.all([
      all<Material>('materials'),
      all<Mark>('marks'),
      all<Drill>('drills'),
      all<{ key: string; value: unknown }>('meta'),
      all<ReviewLog>('reviews'),
      all<LookupRec>('lookups'),
    ])
    return {
      app: 'whitespace',
      version: DB_VER,
      exportedAt: new Date().toISOString(),
      materials,
      marks,
      drills,
      meta,
      reviews,
      lookups,
    }
  },

  /** merge = 合并，保留现有数据；replace = 清空后覆盖。 */
  async importAll(raw: any, mode: 'merge' | 'replace' = 'merge') {
    if (!raw || raw.app !== 'whitespace') throw new Error('不是「留白」的备份文件')
    if (mode === 'replace') {
      const db = await open()
      await Promise.all(
        STORES.map(
          (name) =>
            new Promise<void>((resolve, reject) => {
              const t = db.transaction(name, 'readwrite')
              t.objectStore(name).clear()
              t.oncomplete = () => resolve()
              t.onerror = () => reject(t.error)
            }),
        ),
      )
    }
    const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
    await putMany('materials', asArray<Material>(raw.materials))
    await putMany('marks', asArray<Mark>(raw.marks))
    await putMany('drills', asArray<Drill>(raw.drills))
    await putMany('meta', asArray<{ key: string; value: unknown }>(raw.meta))
    await putMany('reviews', asArray<ReviewLog>(raw.reviews))
    await putMany('lookups', asArray<LookupRec>(raw.lookups))
    return {
      materials: asArray(raw.materials).length,
      marks: asArray(raw.marks).length,
      reviews: asArray(raw.reviews).length,
    }
  },
}
