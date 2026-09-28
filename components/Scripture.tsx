// components/Scripture.tsx
// A Bible verse on the student home screen (constants/scriptures.ts). The
// same verse for everyone at the same time; a new one every
// SCRIPTURE_ROTATE_MS, cross-faded (just swapped with reduced motion).

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { T, FONT, useReducedMotion } from '../constants/theme';
import { scriptureAt, SCRIPTURE_VERSION } from '../constants/scriptures';
import { serverNow } from '../services/serverClock';

export function Scripture() {
  const reduced = useReducedMotion();
  const [{ verse, nextAt }, setNow] = useState(() => scriptureAt(serverNow()));
  const fade = useRef(new Animated.Value(1)).current;

  // Wake at the next change (plus a moment), not on a fast timer.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = scriptureAt(serverNow());
      if (reduced) { setNow(next); return; }
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setNow(next);
        Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      });
    }, Math.max(1000, nextAt - serverNow() + 500));
    return () => clearTimeout(t);
  }, [nextAt, reduced]);

  return (
    <View style={styles.card} accessibilityRole="text" accessibilityLabel={`Verse: ${verse.text} ${verse.ref}, ${SCRIPTURE_VERSION}`}>
      <Animated.View style={{ opacity: fade }}>
        <Text style={styles.label}>Word for the moment</Text>
        <Text style={styles.text}>{'“'}{verse.text}{'”'}</Text>
        <Text style={styles.ref}>{verse.ref} <Text style={styles.version}>{SCRIPTURE_VERSION}</Text></Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: T.space.lg,
    marginTop: T.space.xs,
    marginBottom: T.space.sm,
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.md,
    borderRadius: T.radius.lg,
    backgroundColor: T.color.card,
    borderWidth: 1.5,
    borderColor: T.color.tealTint,
    ...T.plate.card,
  },
  label: { fontFamily: FONT.script, fontSize: 20, color: T.color.teal, marginBottom: 2 },
  text: { ...T.type.body, fontSize: 15, lineHeight: 22, fontStyle: 'italic', color: T.color.ink },
  ref: { ...T.type.body, fontSize: 13, fontWeight: '800', color: T.color.teal, marginTop: 6 },
  version: { fontWeight: '600', color: T.color.inkFaint },
});
