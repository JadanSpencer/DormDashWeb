// constants/theme.ts
// DormDash design system for STUDENTS (and sign-in): "Tide Print".
// Seigaiha waves printed in two inks, teal and cerulean, on sea-foam paper:
//   • Tide band: every student screen opens under a deep cerulean "sea"
//     band with the wave pattern etched in and a scalloped wave edge where
//     it meets the page (components/Tide.tsx).
//   • Print plates: cards and buttons sit on a solid offset layer (a second
//     ink plate), never a blurred glow. Pressing a button sinks it onto its
//     plate. Use T.plate.* rather than shadows.
//   • Store marks: each store has its own sea-coloured tile with the wave
//     pattern and its initial (components/Tide.tsx StoreMark).
// Headings are set in Shippori Mincho B1 (assets/fonts, OFL); body text stays
// in the system font. Vermilion (shu) is the rare accent: the seal, alerts.
// Dasher (themeDark) and admin (themeMid) have their own palettes.
// Import as: `import { T } from '../constants/theme'`. No hex in screens.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Font family names registered in app/_layout.tsx (useFonts).
export const FONT = {
  heading: 'ShipporiMinchoB1',   // headings only: single ExtraBold weight
  seal: 'YujiSyukuSeal',         // only 寮 配 走, for components/Seal
};

export const T = {
  color: {
    // Paper (token names are historical: "cream" is now sea-foam)
    cream: '#EEF5F3',       // page
    creamDeep: '#DEEBE8',   // sunken areas, dividers between sections
    card: '#FAFCFB',        // cards: near-white foam, never pure #FFF

    // Ink (never pure black: deep sea ink)
    ink: '#0E2F3A',
    inkSoft: '#43616A',      // 6.0:1 on page
    inkFaint: '#557079',     // 4.8:1 on page, 5.1:1 on cards

    // Sea: the tide band and deep surfaces (cream text on it: 11:1)
    sea: '#0B3C5A',
    seaSoft: '#A9D3E6',      // secondary text on sea (7.3:1)
    seaFoam: '#7FD6C8',      // teal highlights on sea (6.8:1)

    // Cerulean: the action colour
    cerulean: '#0A6694',     // 5.7:1 on page; card-coloured text on it 6.1:1
    ceruleanDeep: '#08557B', // pressed / plate under cerulean buttons
    ceruleanBright: '#2E9FD3', // graphic only (pattern, marks), never text
    ceruleanTint: '#E4F1F7',

    // Teal: the second ink
    teal: '#08705F',         // text-safe: 5.4:1 on page, 5.0:1 on tealTint
    tealDeep: '#065547',     // plate under teal fills
    tealBright: '#22B3A0',   // graphic only
    tealTint: '#D6EFE9',

    // Seal accent
    shu: '#B7412E',          // vermilion: 5.0:1 on page
    shuTint: '#F6E4DF',

    // Money (DormDash tokens): coin graphics and the wallet's banknote band
    gold: '#D4A537',         // coin face (graphic only, never text)
    goldDeep: '#7A5710',     // coin rim and stamp; 5.9:1 as text on goldTint
    goldLight: '#F0D27A',    // coin highlight
    goldShade: '#B8871F',    // coin face, shadowed side (graphic only)
    goldTint: '#FBF3DC',     // wallet header band

    // Lines & feedback
    line: 'rgba(14, 47, 58, 0.12)',
    lineStrong: 'rgba(14, 47, 58, 0.22)',
    danger: '#B23E3A',
    dangerTint: '#F8E6E4',
    warning: '#D9963A',
  },

  space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 },

  radius: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },

  type: {
    display: { fontFamily: FONT.heading, fontSize: 40, letterSpacing: -0.6 },
    title:   { fontFamily: FONT.heading, fontSize: 26, letterSpacing: -0.2 },
    body:    { fontSize: 15, fontWeight: '500' as const, letterSpacing: 0 },
    label:   { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.1, textTransform: 'none' as const },
    button:  { fontSize: 16, fontWeight: '700' as const, letterSpacing: 0.2 },
  },

  // Print plates: a solid layer offset below, like a second ink plate.
  // No blur, so it reads as depth, not glow.
  plate: {
    card: plate('#C9DFDA', 4),          // foam-deep plate under cards
    teal: plate('#065547', 4),          // under teal fills
    cerulean: plate('#08557B', 4),      // under cerulean buttons
    sea: plate('#072A40', 5),           // under sea surfaces
    pressed: plate('#C9DFDA', 1),       // a pressed card or button
  },

  // Kept for screens that haven't moved to plates; same values as plates.
  shadow: {
    card: plate('#C9DFDA', 4),
    button: plate('#08557B', 4),
  },
};

function plate(color: string, y: number) {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: y },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: y > 1 ? 3 : 1,
  };
}

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
