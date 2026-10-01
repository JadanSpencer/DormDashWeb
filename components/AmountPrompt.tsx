// components/AmountPrompt.tsx
// Admin dialog: enter a signed amount (e.g. 5 or -2.5) and a note, then
// confirm. Used for token balances and floats. Works on web and native.

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { S } from '../constants/themeMid';

export type AmountPromptProps = {
  visible: boolean;
  title: string;
  hint: string;              // e.g. "Tokens to add. Use a minus sign to remove."
  unitLabel: string;         // e.g. "tokens" or "J$"
  onCancel: () => void;
  onSubmit: (amount: number, note: string) => Promise<void>;
};

export function AmountPrompt({ visible, title, hint, unitLabel, onCancel, onSubmit }: AmountPromptProps) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (visible) { setAmount(''); setNote(''); setError(''); setBusy(false); } }, [visible]);

  const submit = async () => {
    const n = Number(amount.replace(/,/g, '').trim());
    if (!Number.isFinite(n) || n === 0) { setError('Enter a number, e.g. 5 or -2.5.'); return; }
    if (!note.trim()) { setError('Add a short note (e.g. "Cash paid to Spencer").'); return; }
    setBusy(true); setError('');
    try {
      await onSubmit(n, note.trim());
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint}</Text>
          <View style={styles.amountRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="e.g. 5 or -2.5"
              placeholderTextColor={S.color.inkFaint}
              keyboardType="numbers-and-punctuation"
              autoFocus
            />
            <Text style={styles.unit}>{unitLabel}</Text>
          </View>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="Note (required), e.g. Cash paid 24 Sep"
            placeholderTextColor={S.color.inkFaint}
            maxLength={200}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Pressable onPress={onCancel} style={styles.secondary} disabled={busy}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} style={({ pressed }) => [styles.primary, (pressed || busy) && { opacity: 0.85 }]} disabled={busy}>
              {busy ? <ActivityIndicator color={S.color.card} /> : <Text style={styles.primaryText}>Confirm</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(43, 21, 20,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, backgroundColor: S.color.card, borderRadius: 16, padding: 18, gap: 10 },
  title: { fontSize: 18, fontWeight: '900', color: S.color.ink },
  hint: { fontSize: 13, color: S.color.inkSoft, lineHeight: 18 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unit: { fontSize: 14, fontWeight: '800', color: S.color.inkSoft },
  input: {
    borderWidth: 1.5, borderColor: S.color.lineOnCard, borderRadius: 12, height: 48,
    paddingHorizontal: 12, fontSize: 15, color: S.color.ink, backgroundColor: S.color.cardMuted,
  },
  error: { color: S.color.danger, fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  primary: { backgroundColor: S.color.cerulean, borderRadius: 999, paddingHorizontal: 20, height: 44, justifyContent: 'center', minWidth: 110, alignItems: 'center' },
  primaryText: { color: S.color.card, fontWeight: '800', fontSize: 14 },
  secondary: { paddingHorizontal: 16, height: 44, justifyContent: 'center' },
  secondaryText: { color: S.color.inkSoft, fontWeight: '800', fontSize: 14 },
});
