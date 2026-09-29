// components/CampusPicker.tsx
// Checkout's delivery location: no typing, a two-step dropdown instead.
// Step 1 is the umbrella (Halls, Faculties, Other places); choosing one
// swaps the list to every place under it (functions/src/campus.ts). Each
// place shows its delivery fee from this store, so students see what
// closer and farther places cost before choosing. Room, block or landmark
// go in the note to the dasher.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { T } from '../constants/theme';
import { CAMPUS_AREAS, DROP_POINTS, dropPoint, type CampusArea } from '../constants/campus';
import { Icon } from './TabIcon';

type Props = {
  value: string | null;
  onChange: (pointId: string) => void;
  /** The fee to show next to a place, e.g. "J$350". */
  feeFor: (pointId: string) => string;
};

export function CampusPicker({ value, onChange, feeFor }: Props) {
  const selected = dropPoint(value);
  const [open, setOpen] = useState(!selected);
  const [area, setArea] = useState<CampusArea | null>(selected?.area ?? null);
  const places = area ? DROP_POINTS.filter(x => x.area === area) : [];
  const areaLabel = CAMPUS_AREAS.find(a => a.id === area)?.label ?? '';

  return (
    <View style={styles.wrap}>
      {/* The field: the chosen place, or a prompt. Tap to open or close. */}
      <Pressable
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={selected ? `Delivering to ${selected.name}. Change` : 'Choose where to deliver'}
        style={[styles.field, open && styles.fieldOpen]}
      >
        <View style={{ flex: 1 }}>
          <Text style={selected ? styles.fieldValue : styles.fieldPrompt} numberOfLines={1}>
            {selected ? selected.name : 'Choose a hall, faculty or place'}
          </Text>
          {selected && <Text style={styles.fieldFee}>Delivery {feeFor(selected.id)}</Text>}
        </View>
        <View style={open ? { transform: [{ rotate: '180deg' }] } : null}>
          <Icon name="chevron-down" size={18} color={T.color.inkSoft} />
        </View>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          {!area ? (
            CAMPUS_AREAS.map(a => (
              <Pressable
                key={a.id}
                onPress={() => setArea(a.id)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Text style={styles.rowTitle}>{a.label}</Text>
                <Text style={styles.rowCount}>{DROP_POINTS.filter(x => x.area === a.id).length}</Text>
                <View style={{ transform: [{ rotate: '-90deg' }] }}>
                  <Icon name="chevron-down" size={16} color={T.color.inkFaint} />
                </View>
              </Pressable>
            ))
          ) : (
            <>
              <Pressable
                onPress={() => setArea(null)}
                accessibilityRole="button"
                accessibilityLabel={`Back from ${areaLabel}`}
                style={({ pressed }) => [styles.back, pressed && styles.rowPressed]}
              >
                <Icon name="chevron-back" size={16} color={T.color.ceruleanDeep} />
                <Text style={styles.backText}>{areaLabel}</Text>
              </Pressable>
              {places.map(pl => {
                const on = pl.id === value;
                return (
                  <Pressable
                    key={pl.id}
                    onPress={() => { onChange(pl.id); setOpen(false); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.rowPressed]}
                  >
                    <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                    <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={2}>{pl.name}</Text>
                    <Text style={styles.rowFee}>{feeFor(pl.id)}</Text>
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: T.space.sm },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: T.space.sm,
    borderWidth: 1.5, borderColor: T.color.line, borderRadius: T.radius.md,
    backgroundColor: T.color.cream, paddingHorizontal: T.space.md, paddingVertical: 12,
  },
  fieldOpen: { borderColor: T.color.cerulean, backgroundColor: T.color.card },
  fieldPrompt: { ...T.type.body, fontSize: 15, color: T.color.inkFaint },
  fieldValue: { ...T.type.body, fontSize: 15, fontWeight: '800', color: T.color.ink },
  fieldFee: { ...T.type.body, fontSize: 12, fontWeight: '700', color: T.color.teal, marginTop: 2 },
  panel: {
    borderWidth: 1.5, borderColor: T.color.line, borderRadius: T.radius.md,
    backgroundColor: T.color.card, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: T.space.sm,
    paddingHorizontal: T.space.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: T.color.line,
  },
  rowOn: { backgroundColor: T.color.ceruleanTint },
  rowPressed: { backgroundColor: T.color.creamDeep },
  rowTitle: { ...T.type.body, fontSize: 15, fontWeight: '700', color: T.color.ink },
  rowCount: { ...T.type.body, fontSize: 13, color: T.color.inkFaint, marginLeft: 'auto' },
  rowFee: { ...T.type.body, fontSize: 13, fontWeight: '800', color: T.color.teal },
  back: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: T.space.md, paddingVertical: 10,
    backgroundColor: T.color.cream, borderBottomWidth: 1, borderBottomColor: T.color.line,
  },
  backText: { ...T.type.body, fontSize: 14, fontWeight: '800', color: T.color.ceruleanDeep },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: T.color.inkFaint, alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: T.color.cerulean },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.color.cerulean },
});
