// components/BrandIntro.tsx
// The two-act launch intro: "Jcommerce & Tech presents", then Runner.
//
// It is drawn ON TOP of the whole app by app/_layout.tsx, every time the app
// is loaded (a fresh open, a refresh, or the installed PWA being launched),
// whatever page it opens on. Routing happens underneath while it plays, so
// when it fades away the right screen is already there.
//
// ACT ONE (0.0s – 2.0s): the JC mark fades up, the company is named, a gold
//   rule draws, "presents".
// ACT TWO (from 2.0s): the Runner tile drops in, "Runner" writes on
//   letter by letter, a teal sweep runs under it, the tagline lands.
// The finished logo holds for a moment, then fades out (about 5–6s total).
//
// Web: the two images are small copies in public/brand/, preloaded by
// public/index.html and kept offline by public/sw.js, so the intro never
// starts with an empty box. The animation waits (up to 2.5s) for them.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Animated, Easing, Platform } from 'react-native';
import { T, useReducedMotion } from '../constants/theme';

const ACT_ONE_MS = 2000;   // Jcommerce holds this long
const TOTAL_MS = 4400;     // reduced-motion version: total length
const HOLD_MS = 900;       // full Runner logo stays up this long at the end
const SAFETY_MS = 9000;    // never keep the app covered longer than this
const FADE_OUT_MS = 320;
const IMAGE_WAIT_MS = 2500; // never wait longer than this for images

const IS_WEB = Platform.OS === 'web';
const JC_LOGO = IS_WEB ? { uri: '/brand/jc-logo.png' } : require('../assets/jc-logo.png');
const DD_TILE = IS_WEB ? { uri: '/brand/dormdash-tile.png' } : require('../assets/icon.png');

/** Web: resolve once both intro images are downloaded and decoded. */
function imagesReady(): Promise<void> {
  if (!IS_WEB || typeof window === 'undefined') return Promise.resolve();
  const load = (src: string) => new Promise<void>(resolve => {
    const img = new (window as any).Image();
    img.onload = () => {
      if (img.decode) img.decode().then(() => resolve(), () => resolve());
      else resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
  return Promise.race([
    Promise.all([load('/brand/jc-logo.png'), load('/brand/dormdash-tile.png')]).then(() => {}),
    new Promise<void>(r => setTimeout(r, IMAGE_WAIT_MS)),
  ]);
}

/** Web: pages that should open straight away, without the intro. */
export function shouldSkipIntro(): boolean {
  if (!IS_WEB || typeof window === 'undefined') return false;
  // Coming back from the WiPay card page: show the payment result at once.
  return window.location.pathname.startsWith('/payment-result');
}

const DORM = ['R', 'u', 'n', 'n', 'e', 'r'];

type Props = {
  /** False while the native splash screen is still covering the app. */
  canStart: boolean;
  onDone: () => void;
};

export function BrandIntro({ canStart, onDone }: Props) {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(!IS_WEB);
  const [act, setAct] = useState<1 | 2>(1);
  const started = useRef(false);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  // Timers live for the whole intro and are only cleared on unmount, so a
  // re-render can never cancel the fade-out and leave the app covered.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const overlay = useRef(new Animated.Value(1)).current;

  // Act one
  const jcFade = useRef(new Animated.Value(0)).current;
  const jcScale = useRef(new Animated.Value(0.86)).current;
  const jcLift = useRef(new Animated.Value(0)).current;
  const jcNameFade = useRef(new Animated.Value(0)).current;
  const ruleWidth = useRef(new Animated.Value(0)).current;
  const presentsFade = useRef(new Animated.Value(0)).current;

  // Act two
  const tileFade = useRef(new Animated.Value(0)).current;
  const tileScale = useRef(new Animated.Value(0.55)).current;
  const eyebrowFade = useRef(new Animated.Value(0)).current;
  const dormLetters = useRef(DORM.map(() => ({
    fade: new Animated.Value(0),
    rise: new Animated.Value(14),
  }))).current;
  const sweepX = useRef(new Animated.Value(-160)).current;
  const taglineFade = useRef(new Animated.Value(0)).current;
  const taglineRise = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    let alive = true;
    imagesReady().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready || !canStart || started.current) return;
    started.current = true;
    const timers = timersRef.current;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      Animated.timing(overlay, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true })
        .start(() => onDone());
    };

    if (reducedRef.current) {
      // Reduced motion: no movement, but both brands are still shown.
      jcFade.setValue(1); jcScale.setValue(1); jcNameFade.setValue(1);
      ruleWidth.setValue(1); presentsFade.setValue(1);
      timers.push(setTimeout(() => {
        tileFade.setValue(1); tileScale.setValue(1); eyebrowFade.setValue(1);
        dormLetters.forEach(l => { l.fade.setValue(1); l.rise.setValue(0); });
        sweepX.setValue(200);
        taglineFade.setValue(1); taglineRise.setValue(0);
        setAct(2);
      }, ACT_ONE_MS));
      timers.push(setTimeout(finish, TOTAL_MS));
      return;
    }

    // ── ACT ONE ────────────────────────────────────────────────────
    Animated.sequence([
      Animated.parallel([
        Animated.timing(jcFade, { toValue: 1, duration: 620, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(jcScale, { toValue: 1, friction: 7, tension: 46, useNativeDriver: true }),
      ]),
      Animated.timing(jcNameFade, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(ruleWidth, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.timing(presentsFade, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();

    // ── Hand off to ACT TWO ────────────────────────────────────────
    timers.push(setTimeout(() => {
      Animated.parallel([
        Animated.timing(jcFade, { toValue: 0, duration: 380, useNativeDriver: true }),
        Animated.timing(jcNameFade, { toValue: 0, duration: 320, useNativeDriver: true }),
        Animated.timing(presentsFade, { toValue: 0, duration: 320, useNativeDriver: true }),
        Animated.timing(jcLift, { toValue: -28, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => {
        setAct(2);
        Animated.sequence([
          Animated.parallel([
            Animated.spring(tileScale, { toValue: 1, friction: 6, tension: 70, restDisplacementThreshold: 0.01, restSpeedThreshold: 0.05, useNativeDriver: true }),
            Animated.timing(tileFade, { toValue: 1, duration: 360, useNativeDriver: true }),
          ]),
          Animated.timing(eyebrowFade, { toValue: 1, duration: 240, useNativeDriver: true }),
          Animated.stagger(80, dormLetters.map(l =>
            Animated.parallel([
              Animated.timing(l.fade, { toValue: 1, duration: 300, useNativeDriver: true }),
              Animated.timing(l.rise, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ])
          )),
          Animated.timing(sweepX, { toValue: 200, duration: 560, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(taglineFade, { toValue: 1, duration: 340, useNativeDriver: true }),
            Animated.timing(taglineRise, { toValue: 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]).start(() => {
          // Everything has landed: hold the finished logo, then fade.
          timers.push(setTimeout(finish, HOLD_MS));
        });
      });
    }, ACT_ONE_MS));

    // Safety net: a stalled animation can never leave the app covered.
    timers.push(setTimeout(finish, SAFETY_MS));
  }, [ready, canStart]);

  const ruleW = ruleWidth.interpolate({ inputRange: [0, 1], outputRange: [0, 120] });

  return (
    <Animated.View style={[styles.root, { opacity: overlay }]} accessibilityLabel="Runner, a Jcommerce and Tech venture">
      {act === 1 ? (
        <Animated.View style={[styles.stage, { opacity: jcFade, transform: [{ translateY: jcLift }] }]}>
          <Animated.View style={[styles.jcPlate, { transform: [{ scale: jcScale }] }]}>
            <Image source={JC_LOGO} style={styles.jcLogo} resizeMode="contain" />
          </Animated.View>
          <Animated.Text style={[styles.jcName, { opacity: jcNameFade }]}>
            JCOMMERCE <Text style={styles.jcAmp}>&</Text> TECH
          </Animated.Text>
          <Animated.View style={[styles.rule, { width: ruleW }]} />
          <Animated.Text style={[styles.presents, { opacity: presentsFade }]}>
            presents
          </Animated.Text>
        </Animated.View>
      ) : (
        <View style={styles.stage}>
          <Animated.View style={[styles.tile, { opacity: tileFade, transform: [{ scale: tileScale }] }]}>
            <Image source={DD_TILE} style={styles.tileImg} resizeMode="contain" />
          </Animated.View>
          <Animated.Text style={[styles.eyebrow, { opacity: eyebrowFade }]}>
            Campus delivery
          </Animated.Text>
          <View style={styles.wordRow}>
            <View style={styles.wordGroup}>
              {DORM.map((ch, i) => (
                <Animated.Text
                  key={i}
                  style={[styles.wordmark, {
                    opacity: dormLetters[i].fade,
                    transform: [{ translateY: dormLetters[i].rise }],
                  }]}
                >
                  {ch}
                </Animated.Text>
              ))}
            </View>
          </View>
          <View style={styles.sweepTrack} pointerEvents="none">
            <Animated.View style={[styles.sweep, { transform: [{ translateX: sweepX }] }]} />
          </View>
          <Animated.Text
            style={[styles.tagline, { opacity: taglineFade, transform: [{ translateY: taglineRise }] }]}
          >
            Strictly food runnings.
          </Animated.Text>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.footerDot} />
        <Text style={styles.footerText}>a </Text>
        <Text style={styles.footerBrand}>Jcommerce &amp; Tech</Text>
        <Text style={styles.footerText}> venture</Text>
      </View>
    </Animated.View>
  );
}

const JC_TEAL = '#A91F1D';
const JC_GOLD = '#C9A227';

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: T.color.cream,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: T.space.lg,
  },
  stage: { alignItems: 'center' },

  // Act one
  jcPlate: {
    width: 132, height: 132, borderRadius: 32,
    backgroundColor: T.color.card,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: T.space.lg,
    shadowColor: '#2B1514',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  jcLogo: { width: 96, height: 96 },
  jcName: { fontSize: 15, fontWeight: '800', letterSpacing: 3.4, color: JC_TEAL },
  jcAmp: { color: JC_GOLD },
  rule: { height: 2, backgroundColor: JC_GOLD, opacity: 0.5, borderRadius: 1, marginTop: T.space.md },
  presents: {
    marginTop: T.space.md, fontSize: 12, letterSpacing: 2.4,
    color: T.color.inkFaint, fontWeight: '600', textTransform: 'lowercase',
  },

  // Act two
  tile: {
    width: 104, height: 104, borderRadius: 28,
    backgroundColor: T.color.card,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: T.space.xl,
    shadowColor: '#2B1514',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  tileImg: { width: 76, height: 76, borderRadius: 20 },
  eyebrow: { ...T.type.label, color: T.color.teal, marginBottom: T.space.md },
  wordRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  wordGroup: { flexDirection: 'row' },
  wordmark: { fontSize: 52, fontWeight: '900', letterSpacing: -2, color: T.color.ink, lineHeight: 58 },
  sweepTrack: {
    marginTop: 4, width: 220, height: 4,
    overflow: 'hidden', borderRadius: 2, backgroundColor: T.color.line,
  },
  sweep: { width: 80, height: 4, borderRadius: 2, backgroundColor: T.color.teal },
  tagline: { ...T.type.body, color: T.color.inkSoft, marginTop: T.space.lg, letterSpacing: 0.2 },

  // Footer
  footer: { position: 'absolute', bottom: 54, flexDirection: 'row', alignItems: 'center' },
  footerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: JC_GOLD, marginRight: 8, opacity: 0.8 },
  footerText: { fontSize: 11, letterSpacing: 1.2, color: T.color.inkFaint, fontWeight: '600' },
  footerBrand: { fontSize: 11, letterSpacing: 1.2, color: JC_TEAL, fontWeight: '800' },
});
