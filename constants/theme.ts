// constants/theme.ts
// Runner design system for STUDENTS (and sign-in): RED AND GOLD. A crimson
// header sweeping to deep wine, with gold contour lines and a big faint R,
// chunky italic serif headlines (Fraunces Black Italic) with gold
// highlights, ivory cards, gold stamps and coins, and one hand-written line
// (Caveat). Token names are kept from the earlier blue-teal look so screens
// didn't change: `sea` = crimson header, `cerulean` = red (actions),
// `teal` = deep gold (the second ink), `mustard` = bright gold. Every text
// pair is checked to WCAG AA (see the ratios beside each token). Pieces: components/Tide.tsx (header, store
// marks), components/Flow.tsx (contour lines), components/Seal.tsx (gold
// stamp). Cards and buttons sit on solid offset "plates" (T.plate), never
// a blurred glow.
// Dasher (themeDark) and admin (themeMid) keep their own palettes.
// Import as: `import { T } from '../constants/theme'`. No hex in screens.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Font family names registered in app/_layout.tsx (useFonts).
export const FONT = {
  heading: 'FrauncesBlackItalic', // headings: Fraunces Black Italic (OFL), as on the flyer
  script: 'CaveatBold',            // the one hand-written line ("… yuh food a come!")
}

export const T = {
  color: {
    // Paper
    cream: '#F4EEE3',       // page
    creamDeep: '#E8DCCB',   // sunken areas, dividers between sections
    card: '#FBF7F0',        // cards: warm near-white, never pure #FFF

    // Ink
    ink: '#2B1514',          // 14.9:1 on page
    inkSoft: '#6B4B45',      // 6.7:1
    inkFaint: '#735650',     // 5.7:1 on page

    // The header: crimson sweeping to deep wine (cream text 7.6:1 on crimson, 12.9:1 on wine)
    sea: '#9B1B22',
    seaTeal: '#5C0D16',
    seaSoft: '#F5D8CE',      // secondary text on the header (6.1:1 / 10.2:1)
    seaFoam: '#F6D27E',      // gold highlights on the header (5.6:1)

    // Red: the action colour (token name kept: cerulean)
    cerulean: '#A91F1D',     // 6.3:1 on page; card-coloured text on it 6.8:1
    ceruleanDeep: '#7A1414', // pressed / plate under cerulean buttons
    ceruleanBright: '#E2493F', // graphic only
    ceruleanTint: '#F8E2DC',

    // Deep gold: the second ink (token name kept: teal)
    teal: '#845F0E',         // text-safe: 4.9:1 on page, 4.7:1 on tealTint; card text on it 5.3:1
    tealDeep: '#5C420A',     // plate under teal fills
    tealBright: '#D9A62E',   // graphic only
    tealTint: '#F6EACB',

    // Bright gold: big headline words on the header (4.8:1 on crimson, large
    // text only), stamps, the active chip and tab (ink text on it: 10:1).
    mustard: '#F2BE45',
    mustardDeep: '#C28D1E',  // plate under mustard fills

    // Rare alarm red (the install warning)
    shu: '#B7412E',
    shuTint: '#F6E4DF',

    // Money (Runner tokens): coin graphics and the wallet's banknote band
    gold: '#D4A537',         // coin face (graphic only, never text)
    goldDeep: '#7A5710',     // coin rim and stamp; 5.9:1 as text on goldTint
    goldLight: '#F0D27A',    // coin highlight
    goldShade: '#B8871F',    // coin face, shadowed side (graphic only)
    goldTint: '#FBF3DC',     // wallet header band

    // Lines & feedback
    line: 'rgba(43, 21, 20, 0.12)',
    lineStrong: 'rgba(43, 21, 20, 0.22)',
    danger: '#B23E3A',
    dangerTint: '#F8E6E4',
    warning: '#D9963A',
  },

  space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 },

  radius: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },

  type: {
    display: { fontFamily: FONT.heading, fontSize: 40, letterSpacing: -0.2 },
    title:   { fontFamily: FONT.heading, fontSize: 26, letterSpacing: 0 },
    body:    { fontSize: 15, fontWeight: '500' as const, letterSpacing: 0 },
    label:   { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.1, textTransform: 'none' as const },
    button:  { fontSize: 16, fontWeight: '700' as const, letterSpacing: 0.2 },
  },

  // Print plates: a solid layer offset below, like a second ink plate.
  // No blur, so it reads as depth, not glow.
  plate: {
    card: plate('#E0CFB8', 4),          // cream-deep plate under cards
    teal: plate('#5C420A', 4),          // under gold (teal) fills
    cerulean: plate('#7A1414', 4),      // under red (cerulean) buttons
    sea: plate('#4A0A10', 5),           // under header surfaces
    mustard: plate('#C48F22', 4),       // under mustard fills
    pressed: plate('#E0CFB8', 1),       // a pressed card or button
  },

  // Kept for screens that haven't moved to plates; same values as plates.
  shadow: {
    card: plate('#E0CFB8', 4),
    button: plate('#7A1414', 4),
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
