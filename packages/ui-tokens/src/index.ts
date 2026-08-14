export const colors = {
  brand: '#1cb0f6',
  brandStrong: '#0d8fcb',
  accentGreen: '#58cc02',
  textPrimary: '#172033',
  textSecondary: '#5b6577',
  textMuted: '#8191a6',
  surface: '#ffffff',
  surfaceSubtle: '#f7fafc',
  surfaceRaised: '#eef5fb',
  border: '#d7e2ee',
  success: '#58cc02',
  warning: '#ffb020',
  danger: '#ff4b4b',
  info: '#1cb0f6',
} as const

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const

export const typography = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  '2xl': 32,
} as const

export const elevations = {
  card: {
    shadowColor: '#16324f',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const

export const motion = {
  fast: 120,
  normal: 220,
  slow: 320,
} as const
