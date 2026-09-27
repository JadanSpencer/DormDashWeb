// components/NotificationBanner.tsx
// The cerulean in-app banner. Android will not let an app paint its own
// system notification banner — that surface belongs to the OS. What we CAN
// own is the in-app experience, so when a notification arrives while DormDash
// is open, the system banner is suppressed (see services/notifications.ts)
// and this renders instead: cerulean field, white text, DormDash mark.
//
// Mounted once in app/_layout.tsx. Exposes an imperative show() via ref.

import React, { useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CERULEAN = '#1F4E79'; // indigo (T.color.cerulean)
const CERULEAN_DEEP = '#193F63';
const AUTO_DISMISS_MS = 4200;

export type BannerPayload = {
  title: string;
  body: string;
  onPress?: () => void;
};

export type BannerHandle = {
  show: (payload: BannerPayload) => void;
};

export const NotificationBanner = forwardRef<BannerHandle>((_props, ref) => {
  const insets = useSafeAreaInsets();
  const [payload, setPayload] = useState<BannerPayload | null>(null);
  const slide = useRef(new Animated.Value(-160)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    Animated.timing(slide, {
      toValue: -160,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setPayload(null));
  }, [slide]);

  useImperativeHandle(ref, () => ({
    show: (next: BannerPayload) => {
      if (timer.current) clearTimeout(timer.current);
      setPayload(next);
      slide.setValue(-160);
      Animated.spring(slide, {
        toValue: 0,
        friction: 9,
        tension: 70,
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(hide, AUTO_DISMISS_MS);
    },
  }), [slide, hide]);

  if (!payload) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        { paddingTop: insets.top + 8, transform: [{ translateY: slide }] },
      ]}
    >
      <Pressable
        onPress={() => { payload.onPress?.(); hide(); }}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
      >
        <View style={styles.mark}>
          <Text style={styles.markText}>D</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{payload.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{payload.body}</Text>
        </View>
      </Pressable>
      <View style={styles.grabber} />
    </Animated.View>
  );
});

NotificationBanner.displayName = 'NotificationBanner';

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 9999,
    elevation: 1,
    backgroundColor: CERULEAN,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: CERULEAN_DEEP,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mark: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  markText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.5,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  body: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 17,
  },
  grabber: {
    alignSelf: 'center',
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginTop: 10,
    marginBottom: Platform.OS === 'ios' ? 0 : 2,
  },
});

export default NotificationBanner;
