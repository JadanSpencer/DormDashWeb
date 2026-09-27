// constants/themeMid.ts
// DormDash design system — "Route" identity, MID-TONE for admin.
// Between the student's cream and the dasher's ink: a muted teal-slate
// canvas with CREAM cards floating on it. Admin screens import S.

import { FONT } from './theme';

export const S = {
  color: {
    // Canvas — the in-between
    bg: '#2E4A52',
    bgDeep: '#263F46',

    // Surfaces — cream cards on slate
    card: '#FAF5EC',
    cardMuted: '#F1E9DB',

    // Type on cards (ink family)
    ink: '#12333B',
    inkSoft: '#4E6B72',
    inkFaint: '#5C7379',

    // Type on the slate canvas
    cream: '#F2EFE6',
    creamSoft: '#B8C8C5',
    creamFaint: '#A3B5B6',

    // Accents — standard depth on cream, brightened on slate
    cerulean: '#1F4E79',        // indigo on cream cards (8.0:1)
    ceruleanBright: '#8DB8E3',  // light indigo on the slate canvas (4.6:1)
    ceruleanTint: '#E4ECF4',
    teal: '#0A7D6E',
    tealBright: '#3ECDB4',
    tealTint: '#E2F4F1',

    // Lines
    lineOnCard: 'rgba(18, 51, 59, 0.12)',
    lineOnBg: 'rgba(242, 239, 230, 0.14)',
    lineOnBgStrong: 'rgba(242, 239, 230, 0.28)',

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
      shadowColor: '#0B1F24',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
  },
};
