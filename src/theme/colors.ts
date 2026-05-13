export const colors = {
  // Brand
  navy: '#0A1628',
  navyLight: '#1E3A5F',
  blue: '#2563EB',
  blueLight: '#3B82F6',
  cyan: '#00B4D8',
  cyanLight: '#48CAE4',

  // Neutrals
  white: '#FFFFFF',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',

  // Text
  text: '#1A2332',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Semantic
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Role accents
  technician: '#00B4D8',
  company: '#2563EB',
  admin: '#7C3AED',
} as const;

export type Color = keyof typeof colors;
