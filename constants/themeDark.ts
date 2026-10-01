// constants/themeDark.ts
// Runner design system, INVERTED for runners: a deep wine canvas, cream
// type, gold for payouts and "online" (token name teal, 10:1 on cards) and
// a rose red for actions (token name cerulean, 7.7:1; dark text on it 8.4:1).
// Dasher screens import D; student screens keep importing T from theme.ts.

import { FONT } from './theme';

export const D = {
  color: {
    // Canvas (the flip: ink becomes the surface)
    bg: '#1C0E10',            // app background — deep teal-ink
    card: '#2B1519',          // elevated cards
    cardHigh: '#371C21',      // pressed / higher elevation

    // Type (the flip: cream becomes the text)
    cream: '#FAF1E6',         // primary text
    creamSoft: '#DCC5BE',     // secondary text
    creamFaint: '#B89E97',   // AA on cards (was #7E9793)    // placeholders, captions

    // Action — brightened for contrast on dark
    cerulean: '#F2958B',      // light indigo: 7.4:1 on bg, dark text on it 7.4:1
    ceruleanDeep: '#D9665B',
    ceruleanTint: 'rgba(242, 149, 139, 0.14)',

    // Support
    teal: '#F0C24F',
    tealDeep: '#C9982A',
    tealTint: 'rgba(240, 194, 79, 0.14)',

    // Lines & feedback
    line: 'rgba(250, 241, 230, 0.10)',
    lineStrong: 'rgba(250, 241, 230, 0.22)',
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
      shadowColor: '#F2958B',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
  },
};
