// constants/themeDark.ts
// DormDash design system — "Route" identity, INVERTED for dashers.
// Same family as constants/theme.ts but flipped: deep teal-ink canvas,
// cream type, brighter cerulean/teal accents tuned for dark surfaces.
// Dasher screens import D; student screens keep importing T from theme.ts.

import { FONT } from './theme';

export const D = {
  color: {
    // Canvas (the flip: ink becomes the surface)
    bg: '#0E282F',            // app background — deep teal-ink
    card: '#16343C',          // elevated cards
    cardHigh: '#1D404A',      // pressed / higher elevation

    // Type (the flip: cream becomes the text)
    cream: '#FAF5EC',         // primary text
    creamSoft: '#B9C9C6',     // secondary text
    creamFaint: '#90A8A4',   // AA on cards (was #7E9793)    // placeholders, captions

    // Action — brightened for contrast on dark
    cerulean: '#8DB8E3',      // light indigo: 7.4:1 on bg, dark text on it 7.4:1
    ceruleanDeep: '#5B8FC6',
    ceruleanTint: 'rgba(141, 184, 227, 0.14)',

    // Support
    teal: '#2FC4AE',
    tealDeep: '#0FA893',
    tealTint: 'rgba(47, 196, 174, 0.14)',

    // Lines & feedback
    line: 'rgba(250, 245, 236, 0.10)',
    lineStrong: 'rgba(250, 245, 236, 0.22)',
    danger: '#E36B6B',
    dangerTint: 'rgba(227, 107, 107, 0.14)',
    warning: '#E5B04C',
    warningTint: 'rgba(229, 176, 76, 0.14)',
  },

  space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius: { sm: 8, md: 12, lg: 14, xl: 18, pill: 999 },

  type: {
display: { fontFamily: FONT.heading, fontSize: 40, letterSpacing: -0.6 },
title:   { fontFamily: FONT.heading, fontSize: 26, letterSpacing: -0.2 },
    body:    { fontSize: 15, fontWeight: '500' as const, letterSpacing: 0 },
    label:   { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.1, textTransform: 'none' as const },
    button:  { fontSize: 16, fontWeight: '700' as const, letterSpacing: 0.2 },
  },

  shadow: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
    button: {
      shadowColor: '#8DB8E3',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
  },
};
