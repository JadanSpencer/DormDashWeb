// components/JcBadge.tsx
// The Jcommerce & Tech mark in the top right of the student home header.
// Two thin gold rings ripple out from it to invite a tap (line work, no
// glow). Tapping opens a dropdown card under it about Jcommerce: who built
// DormDash and what the studio does (from j-commerce.online), with links to
// the website and WhatsApp.
//
// The rings stop once the student has opened the card (remembered on the
// device), so the invitation doesn't nag. Reduced motion: no rings, and the
// card appears without the scale-in.

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Image, Linking, Modal, Platform, Pressable, StyleSheet, Text, View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T, FONT, useReducedMotion } from '../constants/theme';

const JC_LOGO = Platform.OS === 'web' ? { uri: '/brand/jc-logo.png' } : require('../assets/jc-logo.png');
const SEEN_KEY = 'dd_jc_seen';
const SITE = 'https://j-commerce.online';
const WHATSAPP = 'https://wa.me/18768170095';

const TILE = 52;
const RING_MS = 2600;

const SERVICES = ['Online ordering', 'Delivery tracking', 'Point of sale & inventory', 'Admin dashboards', 'Custom web apps'];

function Ring({ delay }: { delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(t, { toValue: 1, duration: RING_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(RING_MS - delay),
    ]));
    loop.start();
    return () => loop.stop();
  }, [delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, {
        opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.85, 0] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
      }]}
    />
  );
}

export function JcBadge() {
  const reduced = useReducedMotion();
  const { width: winW } = useWindowDimensions();
  const tileRef = useRef<View>(null);
  const [invite, setInvite] = useState(false);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, right: 0 });
  const show = useRef(new Animated.Value(0)).current;

  // Invite until they've opened it once on this device.
  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then(v => setInvite(v !== '1')).catch(() => setInvite(true));
  }, []);

  const openCard = () => {
    const place = (x: number, y: number, w: number, h: number) => {
      setAnchor({ top: y + h + 12, right: Math.max(T.space.md, winW - (x + w)) });
      setOpen(true);
      show.setValue(0);
      Animated.timing(show, {
        toValue: 1, duration: reduced ? 1 : 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    };
    if (tileRef.current?.measureInWindow) tileRef.current.measureInWindow(place);
    else place(winW - T.space.lg - TILE, 60, TILE, TILE);
    if (invite) {
      setInvite(false);
      AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
    }
  };

  const closeCard = () => {
    Animated.timing(show, { toValue: 0, duration: reduced ? 1 : 180, useNativeDriver: true })
      .start(() => setOpen(false));
  };

  const panelW = Math.min(340, winW - 2 * T.space.md);

  return (
    <>
      <View style={styles.wrap}>
        {invite && !reduced && <><Ring delay={0} /><Ring delay={RING_MS / 2} /></>}
        <Pressable
          ref={tileRef}
          onPress={openCard}
          accessibilityRole="button"
          accessibilityLabel="About Jcommerce and Tech, who made Runner"
          hitSlop={8}
          style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <Image source={JC_LOGO} style={styles.logo} resizeMode="contain" accessible={false} />
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="none" onRequestClose={closeCard} statusBarTranslucent>
        <Pressable style={styles.scrim} onPress={closeCard} accessibilityLabel="Close" accessibilityRole="button">
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrimTint, { opacity: show }]} />
        </Pressable>
        <Animated.View
          accessibilityViewIsModal
          style={[styles.panel, {
            top: anchor.top, right: anchor.right, width: panelW,
            opacity: show,
            transform: [
              { translateY: show.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
              { scale: show.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 1 : 0.92, 1] }) },
            ],
            transformOrigin: 'top right',
          }]}
        >
          {/* Caret pointing up at the logo */}
          <View style={[styles.caret, { right: TILE / 2 - 8 }]} />

          <View style={styles.headRow}>
            <View style={styles.headLogo}>
              <Image source={JC_LOGO} style={styles.headLogoImg} resizeMode="contain" accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>A Jcommerce project</Text>
              <Text style={styles.title} accessibilityRole="header">Jcommerce & Tech</Text>
            </View>
            <Pressable onPress={closeCard} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <Text style={styles.body}>
            Runner is designed, built and run by Jcommerce & Tech, a web and software studio in Kingston, Jamaica, on a mission to put Jamaican businesses online.
          </Text>

          <Text style={styles.section}>What we build</Text>
          <View style={styles.chips}>
            {SERVICES.map(s => <View key={s} style={styles.chip}><Text style={styles.chipText}>{s}</Text></View>)}
          </View>

          <Text style={styles.section}>Who we build for</Text>
          <Text style={styles.body}>
            Restaurants, shops, clinics, schools, salons, property managers, recruiters, fashion brands and more.
          </Text>
          <Text style={styles.fine}>Ready-made systems go live in 7 to 14 days; custom builds in 3 to 6 weeks.</Text>

          <View style={styles.actions}>
            <Pressable
              onPress={() => Linking.openURL(SITE).catch(() => {})}
              accessibilityRole="link"
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>Visit j-commerce.online</Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL(WHATSAPP).catch(() => {})}
              accessibilityRole="link"
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryText}>WhatsApp us</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { width: TILE, height: TILE, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute', width: TILE, height: TILE, borderRadius: TILE / 2,
    borderWidth: 2, borderColor: T.color.mustard,
  },
  tile: {
    width: TILE, height: TILE, borderRadius: TILE / 2,
    backgroundColor: T.color.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: T.color.mustard,
    ...T.plate.sea, shadowOffset: { width: 0, height: 3 },
  },
  logo: { width: TILE - 14, height: TILE - 14 },

  scrim: { ...StyleSheet.absoluteFillObject },
  scrimTint: { backgroundColor: 'rgba(22, 56, 69, 0.32)' },
  panel: {
    position: 'absolute',
    backgroundColor: T.color.card,
    borderRadius: T.radius.xl,
    padding: T.space.md,
    paddingTop: T.space.md + 2,
    borderWidth: 1.5, borderColor: T.color.creamDeep,
    gap: T.space.sm,
    ...T.plate.card,
  },
  caret: {
    position: 'absolute', top: -8, width: 16, height: 16,
    backgroundColor: T.color.card,
    borderLeftWidth: 1.5, borderTopWidth: 1.5, borderColor: T.color.creamDeep,
    transform: [{ rotate: '45deg' }],
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm },
  headLogo: {
    width: 48, height: 48, borderRadius: T.radius.md, backgroundColor: T.color.cream,
    alignItems: 'center', justifyContent: 'center',
  },
  headLogoImg: { width: 38, height: 38 },
  kicker: { fontFamily: FONT.script, fontSize: 19, color: T.color.teal, marginBottom: -2 },
  title: { ...T.type.title, fontSize: 22, color: T.color.ink },
  close: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.color.creamDeep, alignSelf: 'flex-start',
  },
  closeText: { fontSize: 14, fontWeight: '800', color: T.color.inkSoft },
  body: { ...T.type.body, fontSize: 14, lineHeight: 20, color: T.color.ink },
  section: { ...T.type.label, fontSize: 13, color: T.color.inkSoft, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: T.color.tealTint, borderRadius: T.radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '700', color: T.color.teal },
  fine: { ...T.type.body, fontSize: 12, lineHeight: 17, color: T.color.inkFaint },
  actions: { flexDirection: 'row', gap: T.space.sm, marginTop: T.space.xs },
  primary: {
    flex: 1, height: 44, borderRadius: T.radius.pill, backgroundColor: T.color.cerulean,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, ...T.plate.cerulean,
  },
  primaryText: { color: T.color.card, fontSize: 13, fontWeight: '800' },
  secondary: {
    height: 44, borderRadius: T.radius.pill, borderWidth: 1.5, borderColor: T.color.teal,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
  },
  secondaryText: { color: T.color.teal, fontSize: 13, fontWeight: '800' },
  pressed: { transform: [{ translateY: 2 }] },
});
