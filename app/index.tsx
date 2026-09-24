// app/index.tsx
// DormDash launch sequence — two acts.
//
// ACT ONE (0.0s – 2.0s): Jcommerce. The JC mark fades up and settles, the
//   parent company is named, a hairline rule draws underneath. This is the
//   "a Jcommerce & Tech venture" moment, given room to breathe instead of
//   being a footnote.
// ACT TWO (2.0s – 4.4s): DormDash. The JC mark lifts away, the app icon tile
//   drops in, "Dorm" writes on letter by letter, "Dash" arrives from the
//   right, a teal sweep runs beneath, tagline lands.
// Then, and only then, this screen decides where to send you.
//
// IMPORTANT: this screen owns post-splash routing. RouteGuard in _layout.tsx
// deliberately does not redirect while we are on the index route — previously
// it fired the moment auth resolved and cut the animation off after a few
// frames, which is why the splash appeared to "glitch by".

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Animated, Easing, Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { T, useReducedMotion } from '../constants/theme';

const ACT_ONE_MS = 2000;   // Jcommerce holds this long
const TOTAL_MS  = 4400;    // then DormDash, then route
const QUICK_MS  = 800;     // returning web visitors: brand flash, then route

// Web/PWA: the full two-act intro plays on the first visit only. After that
// the app shows the DormDash mark briefly and gets out of the way, because
// people open a delivery app to order, not to watch the intro again.
const SEEN_KEY = 'dd_seen_intro';
function isReturningWebVisitor(): boolean {
  if (Platform.OS !== 'web') return false;
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
function markIntroSeen() {
  if (Platform.OS !== 'web') return;
  try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
}

const DORM = ['D', 'o', 'r', 'm'];

export default function Index() {
  const { user, loading } = useAuth();
  const reduced = useReducedMotion();
  const [act, setAct] = useState<1 | 2>(1);
  const routed = useRef(false);
  const returning = useRef(isReturningWebVisitor()).current;

  // ── Act one: Jcommerce ────────────────────────────────────────────
  const jcFade  = useRef(new Animated.Value(0)).current;
  const jcScale = useRef(new Animated.Value(0.86)).current;
  const jcLift  = useRef(new Animated.Value(0)).current;
  const jcNameFade = useRef(new Animated.Value(0)).current;
  const ruleWidth  = useRef(new Animated.Value(0)).current;
  const presentsFade = useRef(new Animated.Value(0)).current;

  // ── Act two: DormDash ─────────────────────────────────────────────
  const tileFade  = useRef(new Animated.Value(0)).current;
  const tileScale = useRef(new Animated.Value(0.55)).current;
  const eyebrowFade = useRef(new Animated.Value(0)).current;
  const dormLetters = useRef(DORM.map(() => ({
    fade: new Animated.Value(0),
    rise: new Animated.Value(14),
  }))).current;
  const dashX = useRef(new Animated.Value(220)).current;
  const dashFade = useRef(new Animated.Value(0)).current;
  const sweepX = useRef(new Animated.Value(-160)).current;
  const taglineFade = useRef(new Animated.Value(0)).current;
  const taglineRise = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    markIntroSeen();
    if (reduced || returning) {
      // Reduced motion: show act two, still hold so the brand is seen.
      setAct(2);
      tileFade.setValue(1); tileScale.setValue(1); eyebrowFade.setValue(1);
      dormLetters.forEach(l => { l.fade.setValue(1); l.rise.setValue(0); });
      dashX.setValue(0); dashFade.setValue(1); sweepX.setValue(200);
      taglineFade.setValue(1); taglineRise.setValue(0);
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

    // Hand off to act two
    const toAct2 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(jcFade, { toValue: 0, duration: 380, useNativeDriver: true }),
        Animated.timing(jcNameFade, { toValue: 0, duration: 320, useNativeDriver: true }),
        Animated.timing(presentsFade, { toValue: 0, duration: 320, useNativeDriver: true }),
        Animated.timing(jcLift, { toValue: -28, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => {
        setAct(2);

        // ── ACT TWO ────────────────────────────────────────────────
        Animated.sequence([
          Animated.parallel([
            Animated.spring(tileScale, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
            Animated.timing(tileFade, { toValue: 1, duration: 360, useNativeDriver: true }),
          ]),
          Animated.timing(eyebrowFade, { toValue: 1, duration: 240, useNativeDriver: true }),
          Animated.stagger(80, dormLetters.map(l =>
            Animated.parallel([
              Animated.timing(l.fade, { toValue: 1, duration: 300, useNativeDriver: true }),
              Animated.timing(l.rise, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ])
          )),
          Animated.parallel([
            Animated.timing(dashFade, { toValue: 1, duration: 170, useNativeDriver: true }),
            Animated.spring(dashX, { toValue: 0, friction: 7, tension: 48, useNativeDriver: true }),
          ]),
          Animated.timing(sweepX, { toValue: 200, duration: 560, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(taglineFade, { toValue: 1, duration: 340, useNativeDriver: true }),
            Animated.timing(taglineRise, { toValue: 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]).start();
      });
    }, ACT_ONE_MS);

    return () => clearTimeout(toAct2);
  }, [reduced]);

  // ── Routing: this screen decides, once, after the full sequence ────
  useEffect(() => {
    const t = setTimeout(() => {
      if (routed.current) return;
      if (loading) return;            // auth still resolving; the effect re-runs
      routed.current = true;

      if (!user) {
        router.replace('/(auth)/login');
      } else if (user.role === 'dasher') {
        router.replace('/(dasher)/dash');
      } else if (user.role === 'admin') {
        router.replace('/(admin)/(tabs)/dashboard');
      } else {
        router.replace('/(student)/(tabs)/home');
      }
    }, returning ? QUICK_MS : TOTAL_MS);

    return () => clearTimeout(t);
  }, [loading, user]);

  const ruleW = ruleWidth.interpolate({ inputRange: [0, 1], outputRange: [0, 120] });

  return (
    <View style={styles.root}>
      {act === 1 ? (
        /* ─── ACT ONE — JCOMMERCE ─────────────────────────────── */
        <Animated.View style={[styles.stage, { opacity: jcFade, transform: [{ translateY: jcLift }] }]}>
          <Animated.View style={[styles.jcPlate, { transform: [{ scale: jcScale }] }]}>
            <Image
              source={require('../assets/jc-logo.png')}
              style={styles.jcLogo}
              resizeMode="contain"
            />
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
        /* ─── ACT TWO — DORMDASH ──────────────────────────────── */
        <View style={styles.stage}>
          <Animated.View style={[styles.tile, { opacity: tileFade, transform: [{ scale: tileScale }] }]}>
            <Image source={require('../assets/icon.png')} style={styles.tileImg} resizeMode="contain" />
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
            <Animated.Text
              style={[styles.wordmark, styles.dashWord, {
                opacity: dashFade, transform: [{ translateX: dashX }],
              }]}
            >
              Dash
            </Animated.Text>
          </View>

          <View style={styles.sweepTrack} pointerEvents="none">
            <Animated.View style={[styles.sweep, { transform: [{ translateX: sweepX }] }]} />
          </View>

          <Animated.Text
            style={[styles.tagline, { opacity: taglineFade, transform: [{ translateY: taglineRise }] }]}
          >
            From the gate to your door.
          </Animated.Text>
        </View>
      )}

      {/* Persistent footer credit across both acts */}
      <View style={styles.footer}>
        <View style={styles.footerDot} />
        <Text style={styles.footerText}>a </Text>
        <Text style={styles.footerBrand}>Jcommerce &amp; Tech</Text>
        <Text style={styles.footerText}> venture</Text>
      </View>
    </View>
  );
}

const JC_TEAL = '#0F8F84';
const JC_GOLD = '#C9A227';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.color.cream,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: T.space.lg,
  },
  stage: { alignItems: 'center' },

  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  blobTeal: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: JC_TEAL, opacity: 0.06, top: -100, right: -100,
  },
  blobGold: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: JC_GOLD, opacity: 0.05, bottom: -90, left: -100,
  },

  // Act one
  jcPlate: {
    width: 132, height: 132, borderRadius: 32,
    backgroundColor: T.color.card,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: T.space.lg,
    shadowColor: '#12333B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  jcLogo: { width: 96, height: 96 },
  jcName: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 3.4,
    color: JC_TEAL,
  },
  jcAmp: { color: JC_GOLD },
  rule: {
    height: 2,
    backgroundColor: JC_GOLD,
    opacity: 0.5,
    borderRadius: 1,
    marginTop: T.space.md,
  },
  presents: {
    marginTop: T.space.md,
    fontSize: 12,
    letterSpacing: 2.4,
    color: T.color.inkFaint,
    fontWeight: '600',
    textTransform: 'lowercase',
  },

  // Act two
  tile: {
    width: 104, height: 104, borderRadius: 28,
    backgroundColor: T.color.card,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: T.space.xl,
    shadowColor: '#12333B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  tileImg: { width: 76, height: 76, borderRadius: 20 },
  eyebrow: { ...T.type.label, color: T.color.teal, marginBottom: T.space.md },
  wordRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  wordGroup: { flexDirection: 'row' },
  wordmark: {
    fontSize: 52, fontWeight: '900', letterSpacing: -2,
    color: T.color.ink, lineHeight: 58,
  },
  dashWord: { color: T.color.cerulean },
  sweepTrack: {
    marginTop: 4, width: 220, height: 4,
    overflow: 'hidden', borderRadius: 2,
    backgroundColor: T.color.line,
  },
  sweep: { width: 80, height: 4, borderRadius: 2, backgroundColor: T.color.teal },
  tagline: {
    ...T.type.body, color: T.color.inkSoft,
    marginTop: T.space.lg, letterSpacing: 0.2,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 54,
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: JC_GOLD, marginRight: 8, opacity: 0.8,
  },
  footerText: {
    fontSize: 11, letterSpacing: 1.2,
    color: T.color.inkFaint, fontWeight: '600',
  },
  footerBrand: {
    fontSize: 11, letterSpacing: 1.2,
    color: JC_TEAL, fontWeight: '800',
  },
});
