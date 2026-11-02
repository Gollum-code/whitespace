export type MaterialKind = 'youtube' | 'article' | 'local'

export interface Cue {
  index: number
  text: string
  startSec?: number
  endSec?: number
}

export interface Material {
  id: string
  title: string
  kind: MaterialKind
  url?: string
  videoId?: string
  sourceNote?: string
  cues: Cue[]
  createdAt: number
}

/** ts-fsrs Card 的可序列化形式 */
export interface CardRec {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  learning_steps: number
  state: number
  last_review?: string
}

export type MarkKind = 'word' | 'phrase'

export interface Mark {
  id: string
  materialId: string
  cueIndex: number
  kind: MarkKind
  text: string
  lemma: string
  startSec?: number
  endSec?: number
  createdAt: number
  card: CardRec
  /** 用户笔记，比如搭配、易错点、个人例句。 */
  note?: string
}

/**
 * 题型。cloze = 挖空填空；scramble = 连词成句；choice = 选词填空。
 * 听力不是独立题型，而是 cloze 的一种呈现方式（隐藏句子只听音频）。
 */
export type DrillKind = 'cloze' | 'scramble' | 'choice'

export interface DrillBase {
  promptVersion: string
  glossZh: string // 中文释义
  hintZh: string // 中文提示/讲解
}

export interface ClozeDrill extends DrillBase {
  kind: 'cloze'
  sentence: string // 含 ____ 的句子
  answer: string
}

export interface ScrambleDrill extends DrillBase {
  kind: 'scramble'
  sentence: string // 正确的完整句子
  answer: string // 与 sentence 相同，便于统一判分
  tokens: string[] // 打乱后的词块
}

export interface ChoiceDrill extends DrillBase {
  kind: 'choice'
  sentence: string // 含 ____ 的句子
  answer: string
  options: string[] // 四个选项，含正确答案
}

export type DrillData = ClozeDrill | ScrambleDrill | ChoiceDrill

/** 旧版缓存里 data 没有 kind 字段，读取时按 cloze 兼容。 */
export interface Drill {
  key: string
  kind: DrillKind
  data: DrillData
  createdAt: number
}

export type RatingName = 'again' | 'hard' | 'good' | 'easy'

/** 每次评分的流水，用于统计、连续打卡和每日新词上限。 */
export interface ReviewLog {
  id: string
  ts: number
  markId: string
  lemma: string
  text: string
  rating: RatingName
  drillKind: DrillKind | 'listen'
  wasNew: boolean
}

/** AI 查词缓存：同一个词在同一语境下只查一次。 */
export interface LookupRec {
  key: string
  word: string
  context: string
  meaningZh: string
  pos: string
  createdAt: number
}
