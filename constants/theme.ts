// constants/theme.ts
// DormDash design system — "Route" identity.
// Warm cream canvas · teal-ink type · cerulean action · teal support.
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

export const T = {
  color: {
    // Canvas
    cream: '#FAF5EC',
    creamDeep: '#F1E9DB',
    card: '#FFFFFF',

    // Ink (never pure black — deep teal-ink ties text to palette)
    ink: '#12333B',
    inkSoft: '#4E6B72',
    inkFaint: '#8AA0A5',

    // Action
    cerulean: '#0E8FB5',
    ceruleanDeep: '#0A6E8C',
    ceruleanTint: '#E3F2F7',

    // Support
    teal: '#0FA893',
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

  radius: { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 },

  type: {
    display: { fontSize: 40, fontWeight: '900' as const, letterSpacing: -1.4 },
    title:   { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.6 },
    body:    { fontSize: 15, fontWeight: '500' as const, letterSpacing: 0 },
    label:   { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.4, textTransform: 'uppercase' as const },
    button:  { fontSize: 16, fontWeight: '700' as const, letterSpacing: 0.2 },
  },

  shadow: {
    card: {
      shadowColor: '#12333B',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.08,
      shadowRadius: 24,
      elevation: 6,
    },
    button: {
      shadowColor: '#0E8FB5',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
      elevation: 5,
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
