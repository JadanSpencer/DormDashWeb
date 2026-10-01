// constants/themeMid.ts
// Runner design system, MID-TONE for admin: a muted burgundy canvas with
// ivory cards floating on it; crimson on cards, gold on the canvas.
// Admin screens import S.

import { FONT } from './theme';

export const S = {
  color: {
    // Canvas — the in-between
    bg: '#4B1E24',
    bgDeep: '#3E1A1F',

    // Surfaces — cream cards on slate
    card: '#FAF5EC',
    cardMuted: '#F2E7D8',

    // Type on cards (ink family)
    ink: '#2B1514',
    inkSoft: '#6B4B45',
    inkFaint: '#735650',

    // Type on the slate canvas
    cream: '#FAF1E6',
    creamSoft: '#E2C9C3',
    creamFaint: '#D0B3AC',

    // Accents — standard depth on cream, brightened on slate
    cerulean: '#A91F1D',        // indigo on cream cards (8.0:1)
    ceruleanBright: '#F0C24F',  // light indigo on the slate canvas (4.6:1)
    ceruleanTint: '#F8E2DC',
    teal: '#845F0E',
    tealBright: '#F0C24F',
    tealTint: '#F6EACB',

    // Lines
    lineOnCard: 'rgba(43, 21, 20, 0.12)',
    lineOnBg: 'rgba(250, 241, 230, 0.14)',
    lineOnBgStrong: 'rgba(250, 241, 230, 0.28)',

    danger: '#C94F4F',
    dangerBright: '#E36B6B',
    dangerTint: '#F9E9E9',
    warning: '#D9963A',
  },

  space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius: { sm: 8, md: 12, lg: 14, xl: 18, pill: 999 },

  type: {
    display: { fontFamily: FONT.heading, fontSize: 34, letterSpacing: -0.5 },
    title:   { fontFamily: FONT.heading, fontSize: 24, letterSpacing: -0.2 },
    body:    { fontSize: 14, fontWeight: '500' as const, letterSpacing: 0 },
    label:   { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.1, textTransform: 'none' as const },
    number:  { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1 },
  },

  shadow: {
    card: {
      shadowColor: '#1F0A0D',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
  },
};
