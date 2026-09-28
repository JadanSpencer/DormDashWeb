// constants/theme.ts
// DormDash design system — "Route" identity, in a Japanese print style.
// Washi-cream canvas · teal-ink type · indigo (ai-iro) action · teal
// support · vermilion (shu-iro) seal accent. Headings are set in
// Shippori Mincho B1 (assets/fonts, OFL); body text stays in the system font
// for readability. Token names are historical: `cerulean` now holds indigo.
// Artwork (seigaiha, etched wave, petals, seal): components/Backdrop.tsx
// and components/Seal.tsx. See PWA_HANDOFF.md "Japanese print style".
//
// Sits SEPARATELY from constants/index.ts on purpose:
//   - constants/index.ts holds functional constants (CAMPUS_CENTER, limits,
//     intervals, formatJMD) and the ORIGINAL dark-navy COLORS used by screens
//     that haven't been restyled yet.
//   - constants/theme.ts (this file) holds the NEW design tokens used only
//     by restyled screens. Import as: `import { T } from '../constants/theme'`.
//
// Screens migrate one at a time. Old and new coexist during migration.
// Do not hardcode hex in screens.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Font family names registered in app/_layout.tsx (useFonts).
export const FONT = {
  heading: 'ShipporiMinchoB1',   // headings only: single ExtraBold weight
  seal: 'YujiSyukuSeal',         // only 寮 配 走, for components/Seal
};

export const T = {
  color: {
    // Canvas
    cream: '#FAF5EC',
    creamDeep: '#F1E9DB',
    card: '#FFFDF9',        // warm white, never pure #FFF

    // Ink (never pure black — deep teal-ink ties text to palette)
    ink: '#12333B',
    inkSoft: '#4E6B72',
    inkFaint: '#5C7379',     // AA 4.6:1 on cream (was #8AA0A5, 2.5:1)

    // Action
    cerulean: '#1F4E79',     // indigo (ai-iro): 8.0:1 on cream, with cream text
    ceruleanDeep: '#193F63',
    ceruleanTint: '#E4ECF4',

    // Seal accent
    shu: '#B7412E',          // vermilion (shu-iro): 5.1:1 on cream
    shuTint: '#F6E4DF',

    // Money (DormDash tokens): coin graphics and the wallet's banknote band
    gold: '#D4A537',         // coin face (graphic only, never text)
    goldDeep: '#7A5710',     // coin rim and stamp; 5.9:1 as text on goldTint
    goldLight: '#F0D27A',    // coin highlight
    goldTint: '#FBF3DC',     // wallet header band

    // Support
    teal: '#0A7D6E',         // AA as small text on cream (was #0FA893, 2.8:1)
    tealDeep: '#0B8676',
    tealTint: '#E2F4F1',

    // Lines & feedback
    line: 'rgba(18, 51, 59, 0.12)',
    lineStrong: 'rgba(18, 51, 59, 0.22)',
    danger: '#C94F4F',
    dangerTint: '#F9E9E9',
    warning: '#D9963A',
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
      shadowColor: '#12333B',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
    button: {
      shadowColor: '#1F4E79',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
  },
};

// Respect the user's reduce-motion setting: looping/ambient animation
// should check this and stay still when true. One-shot entrances may run.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduced(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; sub.remove(); };
  }, []);
  return reduced;
}
