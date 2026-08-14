export type StudyStage = 'extensive' | 'intensive' | 'review'

export type StudyStageDescriptor = {
  eyebrow: string
  title: string
  metric: string
}

export const stageCopy: Record<StudyStage, StudyStageDescriptor> = {
  extensive: {
    eyebrow: 'Level 1',
    title: '泛听热身',
    metric: '完整听一遍',
  },
  intensive: {
    eyebrow: 'Level 2',
    title: '逐句学习',
    metric: '听懂每一句',
  },
  review: {
    eyebrow: 'Level 3',
    title: '难点复习',
    metric: '只练难点句',
  },
}

export const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export const isDictationAccepted = (input: string, answers: string[]) => {
  const normalizedInput = normalizeText(input)
  if (!normalizedInput) {
    return false
  }

  return answers
    .map((answer) => normalizeText(answer))
    .filter(Boolean)
    .some((answer) => answer === normalizedInput)
}
