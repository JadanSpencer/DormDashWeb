// components/WalletCard.tsx
// Student Profile: DormDash token balance, buy tokens by card (WiPay), how to
// get tokens with cash, recent token activity, and the J$ / Tokens switch.
// Read-only view of data that only Cloud Functions can change.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { T } from '../constants/theme';
import { formatJMD } from '../constants';
import { useWallet, useWalletHistory } from '../hooks/useWallet';
import { buyTokens, formatTokens, TOKEN_JMD, TOKEN_PACKS } from '../services/payments';
import { PriceUnitToggle } from './PriceUnitToggle';

const TX_LABEL: Record<string, string> = {
  topup_card: 'Bought by card',
  admin_adjust: 'Added by DormDash',
  order_reserve: 'Held for an order',
  order_release: 'Returned (order cancelled)',
  order_charge: 'Used for an order',
  order_payment: 'Paid for an order',
  order_refund: 'Refunded (order cancelled)',
  late_payment_credit: 'Card payment added as tokens',
};

export function WalletCard({ uid }: { uid: string }) {
  const wallet = useWallet(uid);
  const [busyPack, setBusyPack] = useState<number | null>(null);
  const tx = useWalletHistory(uid, 8);

  const buy = async (tokens: number) => {
    if (busyPack) return;
    setBusyPack(tokens);
    try {
      await buyTokens(tokens); // leaves the app for WiPay's secure page
    } catch (e: any) {
      Alert.alert('Buy tokens', e.message);
      setBusyPack(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.balanceRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Token balance</Text>
          {wallet.loaded
            ? <Text style={styles.balance}>{formatTokens(wallet.availableJmd)}</Text>
            : <ActivityIndicator color={T.color.cerulean} style={{ alignSelf: 'flex-start' }} />}
          <Text style={styles.sub}>
            1 token = {formatJMD(TOKEN_JMD)}
            {wallet.reservedJmd > 0 ? ` · ${formatTokens(wallet.reservedJmd)} held for open orders` : ''}
          </Text>
        </View>
      </View>

      <Text style={styles.label}>Show prices in</Text>
      <PriceUnitToggle />

      <Text style={[styles.label, { marginTop: T.space.sm }]}>Buy tokens by card</Text>
      <View style={styles.packs}>
        {TOKEN_PACKS.map(p => (
          <Pressable
            key={p}
            onPress={() => buy(p)}
            disabled={!!busyPack}
            style={({ pressed }) => [styles.pack, (pressed || busyPack === p) && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={`Buy ${p} tokens for ${formatJMD(p * TOKEN_JMD)}`}
          >
            {busyPack === p
              ? <ActivityIndicator color={T.color.card} />
              : <>
                  <Text style={styles.packTokens}>{p} tokens</Text>
                  <Text style={styles.packPrice}>{formatJMD(p * TOKEN_JMD)}</Text>
                </>}
          </Pressable>
        ))}
      </View>
      <Text style={styles.fine}>
        Paid on WiPay's secure page (card fee added by WiPay). Paying cash? A DormDash admin can add tokens for you.
      </Text>

      {tx.length > 0 && (
        <>
          <Text style={[styles.label, { marginTop: T.space.sm }]}>Recent activity</Text>
          {tx.map(r => (
            <View key={r.id} style={styles.txRow}>
              <Text style={styles.txText} numberOfLines={1}>{TX_LABEL[r.type] ?? 'Balance change'}</Text>
              <Text style={[styles.txAmt, { color: r.amountJmd < 0 ? T.color.inkSoft : T.color.teal }]}>
                {r.amountJmd > 0 ? '+' : r.amountJmd < 0 ? '−' : ''}{formatTokens(Math.abs(r.amountJmd))}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.color.card, marginHorizontal: T.space.lg, borderRadius: T.radius.lg,
    borderWidth: 1, borderColor: T.color.line, padding: T.space.md, gap: 8,
  },
  balanceRow: { flexDirection: 'row', alignItems: 'center' },
  label: { ...T.type.label, color: T.color.inkSoft },
  balance: { fontSize: 28, fontWeight: '900', color: T.color.cerulean, letterSpacing: -0.6 },
  sub: { fontSize: 12, color: T.color.inkSoft },
  packs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pack: {
    flexGrow: 1, flexBasis: '45%', minHeight: 56, borderRadius: T.radius.md,
    backgroundColor: T.color.cerulean, alignItems: 'center', justifyContent: 'center', paddingVertical: 8,
  },
  packTokens: { color: T.color.card, fontSize: 15, fontWeight: '900' },
  packPrice: { color: T.color.card, fontSize: 12, fontWeight: '700', opacity: 0.9 },
  fine: { fontSize: 11, lineHeight: 16, color: T.color.inkFaint },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4 },
  txText: { flex: 1, fontSize: 13, color: T.color.ink },
  txAmt: { fontSize: 13, fontWeight: '800' },
});
