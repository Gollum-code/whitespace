import { splitSentences } from './text'
import type { Material } from '../types'

const TITLE = 'Why We Forget the Words We “Learned”'

const TEXT = `Most people assume that learning a word is a single event. You look it up, you understand it, and it is yours. A week later you cannot recall it at all. Nothing has gone wrong. Forgetting is not the opposite of learning; it is part of the process.

The problem with looking a word up is that you meet it in isolation. Your brain has no reason to keep it. A word becomes memorable when it is attached to a moment: a scene in a film, an argument you had, a sentence you struggled to understand. The context is the hook, not the definition.

This is why reading real material beats memorising lists. When you mark an unknown word inside a story you are actually enjoying, you give it somewhere to live. Later, when the word returns in a new context, it does not feel like a stranger. It feels like a friend you met somewhere unexpected.

Spaced repetition works for the same reason. By asking you to recall a word just before you would have forgotten it, it forces your brain to rebuild the memory. Each successful recall makes the memory a little stronger and the next interval a little longer. The goal is not to review often. The goal is to review rarely, and still remember.

So the next time a word slips away, do not panic. Follow it back to the sentence where you found it, listen to the sentence again, and let the blank space do its work.`

/** 内置示例素材，让新用户不用先去找内容就能走一遍闭环。 */
export function createSampleMaterial(): Material {
  const cues = splitSentences(TEXT).map((text, index) => ({ index, text }))
  return {
    id: `sample-${Date.now()}`,
    title: `${TITLE}（示例）`,
    kind: 'article',
    cues,
    createdAt: Date.now(),
    sourceNote: '内置示例',
  }
}
