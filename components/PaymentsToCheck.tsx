// components/PaymentsToCheck.tsx
// Admin dashboard: card payments WiPay never confirmed to us.
//
// WiPay only reports a result by redirecting the student's browser back to
// DormDash (its API has no webhook or status lookup). If the student closed
// the tab or lost signal on WiPay's page, their card may have been charged
// while the payment here still says "pending". Each row shows the payment
// reference, which is the order_id in WiPay's merchant dashboard: look it
// up there, then mark it Paid (with WiPay's transaction ID) or Not paid.
// Resolving runs the same exactly-once money logic as a normal return
// (functions/src/payments.ts adminResolvePayment) and records who did it.

import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { S } from '../constants/themeMid';
import { formatJMD } from '../constants';
import { usePaymentsToCheck, PaymentToCheck } from '../hooks/useWallet';
import { adminResolvePayment } from '../services/payments';

const when = (ts: number) =>
  new Date(ts).toLocaleString('en-JM', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function PaymentsToCheck() {
  const rows = usePaymentsToCheck();
  const [target, setTarget] = useState<{ row: PaymentToCheck; paid: boolean } | null>(null);

  return (
    <View>
      <Text style={styles.sectionTitle}>Card payments to check{rows.length ? ` (${rows.length})` : ''}</Text>
      <View style={styles.card}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>All card payments are confirmed.</Text>
        ) : rows.map((r, i) => (
          <View key={r.id} style={[styles.row, i < rows.length - 1 && styles.divider]}>
            <View style={styles.rowHead}>
              <Text style={styles.amount}>{formatJMD(r.amountJmd)}</Text>
              <Text style={styles.what}>{r.purpose === 'tokens' ? `${r.tokens ?? ''} tokens` : 'order payment'}</Text>
              <Text style={styles.when}>{when(r.createdAt)}</Text>
            </View>
            {r.status === 'review' && (
              <Text style={styles.review}>
                WiPay returned a different transaction ID ({r.returnTransactionId}). Confirm it in WiPay first.
              </Text>
            )}
            <Text style={styles.ref} selectable>WiPay order ID: {r.id}</Text>
            <View style={styles.actions}>
              <Pressable onPress={() => setTarget({ row: r, paid: false })} style={styles.secondary} accessibilityRole="button">
                <Text style={styles.secondaryText}>Not paid</Text>
              </Pressable>
              <Pressable onPress={() => setTarget({ row: r, paid: true })} style={styles.primary} accessibilityRole="button">
                <Text style={styles.primaryText}>Paid</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
      <ResolvePrompt target={target} onClose={() => setTarget(null)} />
    </View>
  );
}

function ResolvePrompt({ target, onClose }: {
  target: { row: PaymentToCheck; paid: boolean } | null; onClose: () => void;
}) {
  const [txId, setTxId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Fresh form each time it opens.
  React.useEffect(() => {
    if (!target) return;
    setTxId(target.row.returnTransactionId ?? '');
    setNote(''); setError(''); setBusy(false);
  }, [target]);

  const submit = async () => {
    if (!target) return;
    if (target.paid && !txId.trim()) { setError('Enter the WiPay transaction ID.'); return; }
    if (!note.trim()) { setError('Add a short note, e.g. "Checked WiPay dashboard".'); return; }
    setBusy(true); setError('');
    try {
      await adminResolvePayment(target.row.id, target.paid, txId.trim(), note.trim());
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const paid = !!target?.paid;
  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{paid ? 'Mark as paid' : 'Mark as not paid'}</Text>
          <Text style={styles.hint}>
            {paid
              ? `Only if WiPay's dashboard shows a successful payment for order ID ${target?.row.id}. The student gets ${target?.row.purpose === 'tokens' ? 'their tokens' : 'their order paid (or tokens, if it was already cancelled)'} straight away.`
              : `Use this when WiPay's dashboard has no successful payment for order ID ${target?.row.id}. Nothing is charged or credited.`}
          </Text>
          {paid && (
            <TextInput
              style={styles.input} value={txId} onChangeText={setTxId}
              placeholder="WiPay transaction ID" placeholderTextColor={S.color.inkFaint}
              autoCapitalize="characters" maxLength={100}
            />
          )}
          <TextInput
            style={styles.input} value={note} onChangeText={setNote}
            placeholder="Note (required)" placeholderTextColor={S.color.inkFaint} maxLength={200}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.modalRow}>
            <Pressable onPress={onClose} style={styles.secondary} disabled={busy}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} style={({ pressed }) => [styles.primary, (pressed || busy) && { opacity: 0.85 }]} disabled={busy}>
              {busy ? <ActivityIndicator color={S.color.card} /> : <Text style={styles.primaryText}>{paid ? 'Mark paid' : 'Mark not paid'}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...S.type.label, color: S.color.creamSoft, marginTop: S.space.md, marginBottom: S.space.sm },
  card: { backgroundColor: S.color.card, borderRadius: S.radius.lg, padding: S.space.md },
  empty: { fontSize: 13, color: S.color.inkSoft },
  row: { paddingVertical: 10, gap: 4 },
  divider: { borderBottomWidth: 1, borderBottomColor: S.color.lineOnCard },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  amount: { fontSize: 16, fontWeight: '900', color: S.color.ink },
  what: { fontSize: 13, fontWeight: '700', color: S.color.inkSoft },
  when: { fontSize: 12, color: S.color.inkSoft, marginLeft: 'auto' },
  review: { fontSize: 12, color: S.color.danger, fontWeight: '700' },
  ref: { fontSize: 12, color: S.color.inkSoft },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  primary: { backgroundColor: S.color.cerulean, borderRadius: 999, paddingHorizontal: 18, height: 38, justifyContent: 'center', alignItems: 'center', minWidth: 90 },
  primaryText: { color: S.color.card, fontWeight: '800', fontSize: 13 },
  secondary: { paddingHorizontal: 14, height: 38, justifyContent: 'center' },
  secondaryText: { color: S.color.inkSoft, fontWeight: '800', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(43, 21, 20,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 420, backgroundColor: S.color.card, borderRadius: 16, padding: 18, gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: S.color.ink },
  hint: { fontSize: 13, color: S.color.inkSoft, lineHeight: 18 },
  input: {
    borderWidth: 1.5, borderColor: S.color.lineOnCard, borderRadius: 12, height: 48,
    paddingHorizontal: 12, fontSize: 15, color: S.color.ink, backgroundColor: S.color.cardMuted,
  },
  error: { color: S.color.danger, fontSize: 13, fontWeight: '700' },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
});
