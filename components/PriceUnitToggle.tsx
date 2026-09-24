// components/PriceUnitToggle.tsx
// Small "J$ | Tokens" switch. Flips every price in the student app.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { T } from '../constants/theme';
import { usePriceUnit } from '../hooks/usePriceUnit';

export function PriceUnitToggle() {
  const { unit, setUnit } = usePriceUnit();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Show prices in">
      {(['jmd', 'tokens'] as const).map(u => {
        const on = unit === u;
        return (
          <Pressable
            key={u}
            onPress={() => setUnit(u)}
            style={[styles.opt, on && styles.optOn]}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            hitSlop={4}
          >
            <Text style={[styles.text, on && styles.textOn]}>{u === 'jmd' ? 'J$' : 'Tokens'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignSelf: 'flex-start',
    backgroundColor: T.color.card, borderRadius: 999, padding: 3,
    borderWidth: 1, borderColor: T.color.line,
  },
  opt: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  optOn: { backgroundColor: T.color.cerulean },
  text: { fontSize: 13, fontWeight: '800', color: T.color.inkSoft },
  textOn: { color: '#FFFDF8' },
});
