// components/CashToCollect.tsx
// Admin dashboard: cash from cash-on-delivery orders that dashers still owe
// DormDash. On each delivered cash order the dasher keeps their share of the
// delivery fee; the rest (the food, paid from the store's float, plus
// DormDash's share of the fee) is owed back. When a dasher hands it over
// (Lynk, transfer or cash), record it here with a note. The server keeps the
// running total and a ledger (cashTx; adminSettleCash in functions/src/payments.ts).

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { S } from '../constants/themeMid';
import { formatJMD } from '../constants';
import { useCashToCollect, CashOwed } from '../hooks/useUsers';
import { adminSettleCash } from '../services/payments';
import { AmountPrompt } from './AmountPrompt';

export function CashToCollect() {
  const rows = useCashToCollect();
  const [target, setTarget] = useState<CashOwed | null>(null);
  const total = rows.reduce((s, r) => s + r.cashOwedJmd, 0);

  return (
    <View>
      <Text style={styles.sectionTitle}>
        Cash to collect from dashers{rows.length ? ` (${formatJMD(total)})` : ''}
      </Text>
      <View style={styles.card}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>No dasher is holding DormDash cash.</Text>
        ) : rows.map((r, i) => (
          <View key={r.uid} style={[styles.row, i < rows.length - 1 && styles.divider]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.sub}>Owes from cash orders</Text>
            </View>
            <Text style={styles.amount}>{formatJMD(r.cashOwedJmd)}</Text>
            <Pressable onPress={() => setTarget(r)} style={styles.primary} accessibilityRole="button">
              <Text style={styles.primaryText}>Received</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <AmountPrompt
        visible={!!target}
        title={target ? `Cash received from ${target.name}` : ''}
        hint={target ? `J$ they handed over (up to ${formatJMD(target.cashOwedJmd)}). Add how, e.g. "Lynk ref 12345".` : ''}
        unitLabel="J$"
        onCancel={() => setTarget(null)}
        onSubmit={async (amount, note) => {
          if (!target) return;
          if (amount < 0) throw new Error('Enter the amount received, without a minus sign.');
          await adminSettleCash(target.uid, amount, note);
          setTarget(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...S.type.label, color: S.color.creamSoft, marginTop: S.space.md, marginBottom: S.space.sm },
  card: { backgroundColor: S.color.card, borderRadius: S.radius.lg, padding: S.space.md },
  empty: { fontSize: 13, color: S.color.inkSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: S.color.lineOnCard },
  name: { fontSize: 15, fontWeight: '800', color: S.color.ink },
  sub: { fontSize: 12, color: S.color.inkSoft },
  amount: { fontSize: 16, fontWeight: '900', color: S.color.ink },
  primary: { backgroundColor: S.color.cerulean, borderRadius: 999, paddingHorizontal: 16, height: 36, justifyContent: 'center', alignItems: 'center' },
  primaryText: { color: S.color.card, fontWeight: '800', fontSize: 13 },
});
