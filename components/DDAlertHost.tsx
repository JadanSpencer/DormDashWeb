// components/DDAlertHost.tsx
// DormDash's own pop-up for messages and confirmations. Mounted once in
// app/_layout.tsx. Shows one message at a time from services/ddAlert.ts.
//   1 button   → a single blue button
//   2 buttons  → side by side: the "cancel" one quiet, the other blue
//                (red when it's destructive, e.g. Sign out, Delete)
//   3+ buttons → stacked
// Tapping outside, or Escape on a keyboard, counts as the cancel button
// (only when there is one).

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Animated, Easing, Platform } from 'react-native';
import { T, useReducedMotion } from '../constants/theme';
import { DDAlertItem, DDAlertButton, subscribeDDAlert, closeDDAlert } from '../services/ddAlert';

export function DDAlertHost() {
  const [queue, setQueue] = useState<DDAlertItem[]>([]);
  useEffect(() => subscribeDDAlert(setQueue), []);
  const current = queue[0];
  if (!current) return null;
  return <AlertCard key={current.id} item={current} />;
}

function AlertCard({ item }: { item: DDAlertItem }) {
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(12)).current;
  const done = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: reduced ? 0 : 160, useNativeDriver: true }),
      Animated.timing(lift, { toValue: 0, duration: reduced ? 0 : 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const cancelBtn = item.buttons.find(b => b.style === 'cancel');
  const press = (b?: DDAlertButton) => {
    if (done.current) return;
    done.current = true;
    closeDDAlert(item.id);
    // Run the action after the pop-up is gone, so a follow-up message can show.
    setTimeout(() => b?.onPress?.(), 0);
  };

  // Escape = cancel (web keyboards).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !cancelBtn) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') press(cancelBtn); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Two buttons sit side by side with cancel first; otherwise stack in order.
  const two = item.buttons.length === 2;
  const ordered = two && cancelBtn
    ? [cancelBtn, item.buttons.find(b => b !== cancelBtn)!]
    : item.buttons;

  return (
    <Modal transparent visible animationType="none" onRequestClose={() => cancelBtn && press(cancelBtn)}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => cancelBtn && press(cancelBtn)} accessibilityLabel="Close" />
        <Animated.View
          style={[styles.card, { transform: [{ translateY: lift }] }]}
          accessibilityRole="alert"
          accessibilityViewIsModal
        >
          <Text style={styles.title}>{item.title}</Text>
          {!!item.message && <Text style={styles.message}>{item.message}</Text>}
          <View style={[styles.actions, two ? styles.row : styles.stack]}>
            {ordered.map((b, i) => {
              const isCancel = b.style === 'cancel';
              const isDanger = b.style === 'destructive';
              return (
                <Pressable
                  key={i}
                  onPress={() => press(b)}
                  style={({ pressed }) => [
                    styles.btn,
                    two && { flex: 1 },
                    isCancel ? styles.btnQuiet : isDanger ? styles.btnDanger : styles.btnPrimary,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.btnText, isCancel ? styles.btnTextQuiet : styles.btnTextSolid]}>
                    {b.text || 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: T.space.lg, backgroundColor: 'rgba(18, 51, 59, 0.38)',
  },
  card: {
    width: '100%', maxWidth: 360, backgroundColor: T.color.card,
    borderRadius: T.radius.xl, padding: T.space.lg, gap: T.space.sm,
    borderWidth: 1, borderColor: T.color.line,
  },
  title: { fontSize: 18, fontWeight: '900', color: T.color.ink },
  message: { fontSize: 14, lineHeight: 21, color: T.color.inkSoft },
  actions: { marginTop: T.space.sm, gap: T.space.sm },
  row: { flexDirection: 'row' },
  stack: { flexDirection: 'column' },
  btn: { height: 48, borderRadius: T.radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: T.space.md },
  btnPrimary: { backgroundColor: T.color.cerulean },
  btnDanger: { backgroundColor: T.color.danger },
  btnQuiet: { backgroundColor: T.color.cream, borderWidth: 1, borderColor: T.color.line },
  btnText: { fontSize: 15, fontWeight: '800' },
  btnTextSolid: { color: T.color.card },
  btnTextQuiet: { color: T.color.ink },
});
