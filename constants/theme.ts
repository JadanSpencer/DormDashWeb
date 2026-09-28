// constants/theme.ts
// DormDash design system for STUDENTS (and sign-in), matching the UWI Mona
// launch flyer: a deep blue-to-teal header with flowing contour lines and a
// big faint D, chunky italic serif headlines (Fraunces Black Italic) with
// mustard-gold highlights, cream cards, gold stamp badges, and one
// hand-written line (Caveat). Pieces: components/Tide.tsx (header, store
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
    cream: '#F3EEE4',       // page
    creamDeep: '#E7E0D2',   // sunken areas, dividers between sections
    card: '#FBF8F2',        // cards: warm near-white, never pure #FFF

    // Ink
    ink: '#163845',          // 10.8:1 on page
    inkSoft: '#46606A',      // 5.8:1
    inkFaint: '#526A73',     // 5.0:1 on page

    // The header: deep blue fading to teal (cream text 7.1:1 on blue, 5.3:1 on teal)
    sea: '#0E5A80',
    seaTeal: '#0E7466',
    seaSoft: '#CFE6EE',      // secondary text on the header (5.8:1 / 4.4:1)
    seaFoam: '#9FE0D2',      // small highlights on the header

    // Cerulean: the action colour
    cerulean: '#0E6690',     // 5.5:1 on page; card-coloured text on it 6.0:1
    ceruleanDeep: '#0A5073', // pressed / plate under cerulean buttons
    ceruleanBright: '#3AA6D6', // graphic only
    ceruleanTint: '#E1EEF3',

    // Teal
    teal: '#0B7766',         // text-safe: 4.7:1 on page, 4.6:1 on tealTint
    tealDeep: '#075A4D',     // plate under teal fills
    tealBright: '#22B3A0',   // graphic only
    tealTint: '#DDEFEA',

    // Mustard: the flyer's gold. Large headline words on the header, stamps,
    // the active chip and tab (ink text on it: 6.7:1).
    mustard: '#EDB443',
    mustardDeep: '#C48F22',  // plate under mustard fills

    // Rare alarm red (the install warning)
    shu: '#B7412E',
    shuTint: '#F6E4DF',

    // Money (DormDash tokens): coin graphics and the wallet's banknote band
    gold: '#D4A537',         // coin face (graphic only, never text)
    goldDeep: '#7A5710',     // coin rim and stamp; 5.9:1 as text on goldTint
    goldLight: '#F0D27A',    // coin highlight
    goldShade: '#B8871F',    // coin face, shadowed side (graphic only)
    goldTint: '#FBF3DC',     // wallet header band

    // Lines & feedback
    line: 'rgba(22, 56, 69, 0.12)',
    lineStrong: 'rgba(22, 56, 69, 0.22)',
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
    card: plate('#DCD3C1', 4),          // cream-deep plate under cards
    teal: plate('#065547', 4),          // under teal fills
    cerulean: plate('#0A5073', 4),      // under cerulean buttons
    sea: plate('#083A55', 5),           // under header surfaces
    mustard: plate('#C48F22', 4),       // under mustard fills
    pressed: plate('#DCD3C1', 1),       // a pressed card or button
  },

  // Kept for screens that haven't moved to plates; same values as plates.
  shadow: {
    card: plate('#DCD3C1', 4),
    button: plate('#0A5073', 4),
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
