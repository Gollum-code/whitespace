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

export type MarkKind = 'word' | 'phrase' | 'sentence'

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
  /** 用户笔记：搭配、易错点、用法总结等。 */
  note?: string
  /** 个人例句：自己造的、想记牢的句子。 */
  example?: string
}

/** 本地自动备份快照（存在 IndexedDB，防止误删/损坏，离线可恢复）。 */
export interface Snapshot {
  id: string
  at: number
  data: unknown
}

/**
 * 题型。cloze = 挖空填空；scramble = 连词成句；choice = 选词填空；
 * dictate = 整句听写；fix = 改错（句子有个错词）；def = 释义选择。
 * 听力也是闭卡的一种呈现方式（隐藏句子只听音频）。
 */
export type DrillKind = 'cloze' | 'scramble' | 'choice' | 'dictate' | 'fix' | 'def'

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

export interface DictateDrill extends DrillBase {
  kind: 'dictate'
  sentence: string // 要听的完整句子
  answer: string // 与 sentence 相同
}

export interface FixDrill extends DrillBase {
  kind: 'fix'
  sentence: string // 含一个错词的句子
  answer: string // 正确的词
  wrong: string // 错的词
  options: string[] // 四个选项，含正确答案
}

export interface DefOption {
  text: string
  pos: string
  meaningZh: string
}

export interface DefDrill extends DrillBase {
  kind: 'def'
  word: string
  options: DefOption[] // 四个中文释义，含正确一个
}

export type DrillData =
  | ClozeDrill
  | ScrambleDrill
  | ChoiceDrill
  | DictateDrill
  | FixDrill
  | DefDrill

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
