import { Brain, CircleHelp, Headphones } from 'lucide-react'
import type { StageRailItem } from '../components/StageRail'
import {
  isDictationAccepted,
  normalizeText,
  stageCopy as sharedStageCopy,
  type StudyStage,
} from '@duolinting/domain'

export type { StudyStage }

export const stageCopy: Record<
  StudyStage,
  Omit<StageRailItem<StudyStage>, 'id'>
> = {
  extensive: {
    ...sharedStageCopy.extensive,
    Icon: Headphones,
  },
  intensive: {
    ...sharedStageCopy.intensive,
    Icon: Brain,
  },
  review: {
    ...sharedStageCopy.review,
    Icon: CircleHelp,
  },
}

export { isDictationAccepted, normalizeText }
