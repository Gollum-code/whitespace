/**
 * 成就 / 连续打卡奖励。
 * 纯函数：从已有数据推导，不额外存状态，换设备也能原样恢复。
 * 每项有 target（目标值）和 progress（当前值），解锁与否由 target 决定。
 */
import type { DrillKind, Mark, Material, ReviewLog } from '../types'
import { isMastered } from './srs'

export interface Achievement {
  id: string
  icon: string
  title: string
  desc: string
  target: number
  progress: number
}

export interface AchievementState {
  list: Achievement[]
  unlocked: number
  streak: number
  /** 连续打卡奖励文案（里程碑时非空）。 */
  streakReward: string | null
}

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function calcStreak(reviews: ReviewLog[]): number {
  const days = new Set(reviews.map((r) => dayKey(new Date(r.ts))))
  let streak = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  // 从今天或昨天开始数
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

const STREAK_REWARD: [number, string][] = [
  [30, '坚持一个月，把「学英语」变成了习惯。奖励自己一顿好的！'],
  [14, '两周连续打卡，间隔开始变长了，记住率也在涨。'],
  [7, '连续一周，最难的第一周已经过去了。'],
  [3, '连续三天，节奏已经建立起来，别断。'],
]

export function computeAchievements(
  marks: Mark[],
  reviews: ReviewLog[],
  materials: Material[],
  drillKindsSeen: Set<DrillKind>,
): AchievementState {
  const streak = calcStreak(reviews)
  const masteredWords = new Set(marks.filter((m) => isMastered(m.card)).map((m) => m.lemma)).size
  const leechTurned = marks.filter((m) => m.card.lapses >= 4 && isMastered(m.card)).length

  const at = (id: string, icon: string, title: string, desc: string, progress: number, target: number): Achievement => ({
    id, icon, title, desc, progress: Math.min(progress, target), target,
  })

  const list: Achievement[] = [
    at('first-mark', '📌', '第一次标记', '在素材里点下第一个不熟的词。', marks.length, 1),
    at('marks-50', '🗂️', '词库 50', '累计标记 50 个词。', marks.length, 50),
    at('marks-200', '📚', '词库 200', '累计标记 200 个词。', marks.length, 200),
    at('first-review', '🎯', '第一次复习', '完成第一次自评。', reviews.length, 1),
    at('reviews-100', '⚡', '复习 100 次', '累计复习 100 次。', reviews.length, 100),
    at('reviews-500', '🔥', '复习 500 次', '累计复习 500 次。', reviews.length, 500),
    at('reviews-1000', '🌟', '复习 1000 次', '累计复习 1000 次。', reviews.length, 1000),
    at('streak-3', '📅', '连续 3 天', '连续三天有复习记录。', streak, 3),
    at('streak-7', '🏅', '连续 7 天', '连续一周打卡。', streak, 7),
    at('streak-30', '🏆', '连续 30 天', '坚持一个月。', streak, 30),
    at('mastered-10', '✅', '掌握 10 词', '10 个词达到「已掌握」（间隔≥21天）。', masteredWords, 10),
    at('mastered-50', '💪', '掌握 50 词', '50 个词达到「已掌握」。', masteredWords, 50),
    at('first-material', '📥', '第一个素材', '导入第一篇素材。', materials.length, 1),
    at('materials-5', '🧺', '素材 5 个', '导入 5 个素材。', materials.length, 5),
    at('all-drills', '🧩', '全题型体验', '见过全部 6 种题型。', drillKindsSeen.size, 6),
    at('leech-turn', '🧠', '难词逆袭', '一个忘了≥4次的词被你彻底掌握。', leechTurned, 1),
  ]

  const unlocked = list.filter((a) => a.progress >= a.target).length
  const reward = STREAK_REWARD.find(([n]) => streak >= n)?.[1] ?? null
  return { list, unlocked, streak, streakReward: reward }
}
