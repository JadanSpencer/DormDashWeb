// components/WalletCard.tsx
// Student Profile: Runner token balance, buy tokens by card (Fygaro), how to
// get tokens with cash, recent token activity, and the J$ / Tokens switch.
// Styled as the app's money section: gold coins (components/Coin), a
// banknote-style balance band, coin-stack packs and a ledger.
// Read-only view of data that only Cloud Functions can change.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { FONT, T } from '../constants/theme';
import { formatJMD } from '../constants';
import { useWallet, useWalletHistory } from '../hooks/useWallet';
import { buyTokens, formatTokens, jmdToTokens, TOKEN_JMD, TOKEN_PACKS, whenBackFromCheckout } from '../services/payments';
import { Coin, CoinStack } from './Coin';
import { PriceUnitToggle } from './PriceUnitToggle';

const TX_LABEL: Record<string, string> = {
  topup_card: 'Bought by card',
  admin_adjust: 'Added by Runner',
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
      await buyTokens(tokens); // leaves the app for Fygaro's secure page
      // Re-enable the packs when the student comes back (see whenBackFromCheckout).
      whenBackFromCheckout(() => setBusyPack(null));
    } catch (e: any) {
      Alert.alert('Buy tokens', e.message);
      setBusyPack(null);
    }
  };

  const balance = Math.round(jmdToTokens(wallet.availableJmd) * 100) / 100;

  return (
    <View style={styles.card}>
      {/* Balance, on a gold band like the strip on a banknote. */}
      <View style={styles.band}>
        <Coin size={60} />
        <View style={{ flex: 1 }}>
          <Text style={styles.bandLabel}>Token balance</Text>
          {wallet.loaded
            ? <Text style={styles.balance} accessibilityLabel={formatTokens(wallet.availableJmd)}>
                {balance.toLocaleString('en-JM', { maximumFractionDigits: 2 })}
                <Text style={styles.balanceUnit}>{balance === 1 ? ' token' : ' tokens'}</Text>
              </Text>
            : <ActivityIndicator color={T.color.goldDeep} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />}
          <Text style={styles.bandSub}>
            Worth {formatJMD(wallet.availableJmd)} · 1 token = {formatJMD(TOKEN_JMD)}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {wallet.reservedJmd > 0 && (
          <View style={styles.held}>
            <Coin size={16} />
            <Text style={styles.heldText}>{formatTokens(wallet.reservedJmd)} held for open orders</Text>
          </View>
        )}

        <Text style={styles.label}>Show prices in</Text>
        <PriceUnitToggle />

        <Text style={[styles.label, { marginTop: T.space.sm }]}>Buy tokens by card</Text>
        <View style={styles.packs}>
          {TOKEN_PACKS.map(p => (
            <Pressable
              key={p}
              onPress={() => buy(p)}
              disabled={!!busyPack}
              style={({ pressed }) => [styles.pack, (pressed || busyPack === p) && styles.packPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Buy ${p} tokens for ${formatJMD(p * TOKEN_JMD)}`}
            >
              {busyPack === p
                ? <ActivityIndicator color={T.color.goldDeep} />
                : <>
                    <CoinStack count={COINS_FOR_PACK[p] ?? 1} size={24} />
                    <Text style={styles.packTokens}>{p} tokens</Text>
                    <View style={styles.pricePill}>
                      <Text style={styles.priceText}>{formatJMD(p * TOKEN_JMD)}</Text>
                    </View>
                  </>}
            </Pressable>
          ))}
        </View>
        <Text style={styles.fine}>
          Paid on Fygaro's secure page (card fee may be added by Fygaro). Paying cash? A Runner admin can add tokens for you.
        </Text>

        {tx.length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: T.space.sm }]}>Recent activity</Text>
            <View style={styles.ledger}>
              {tx.map((r, i) => {
                const into = r.amountJmd > 0;
                return (
                  <View key={r.id} style={[styles.txRow, i < tx.length - 1 && styles.txDivider]}>
                    <View style={[styles.txIcon, !into && { opacity: 0.45 }]}><Coin size={18} /></View>
                    <Text style={styles.txText} numberOfLines={1}>{TX_LABEL[r.type] ?? 'Balance change'}</Text>
                    <Text style={[styles.txAmt, { color: into ? T.color.teal : T.color.inkSoft }]}>
                      {into ? '+' : r.amountJmd < 0 ? '−' : ''}{formatTokens(Math.abs(r.amountJmd))}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// How many coins each pack shows: a bigger pack, a bigger stack.
const COINS_FOR_PACK: Record<number, number> = { 5: 1, 10: 2, 20: 3, 50: 4 };

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.color.card, marginHorizontal: T.space.lg, borderRadius: T.radius.lg,
    borderWidth: 1.5, borderColor: 'rgba(122, 87, 16, 0.25)', overflow: 'hidden',
    ...T.plate.card, shadowColor: '#E2C878', // a gold print plate
  },
  band: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: T.color.goldTint, padding: T.space.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(122, 87, 16, 0.18)',
  },
  bandLabel: { ...T.type.label, color: T.color.goldDeep },
  balance: { fontFamily: FONT.heading, fontSize: 32, lineHeight: 40, color: T.color.ink },
  balanceUnit: { fontFamily: FONT.heading, fontSize: 17, color: T.color.inkSoft },
  bandSub: { fontSize: 12, color: T.color.inkSoft },
  body: { padding: T.space.md, gap: 8 },
  held: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: T.color.creamDeep, borderRadius: T.radius.pill, paddingHorizontal: 10, paddingVertical: 5,
  },
  heldText: { fontSize: 12, fontWeight: '700', color: T.color.inkSoft },
  label: { ...T.type.label, color: T.color.inkSoft },
  packs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pack: {
    flexGrow: 1, flexBasis: '45%', minHeight: 116, borderRadius: T.radius.md,
    backgroundColor: T.color.card, borderWidth: 1.5, borderColor: 'rgba(212, 165, 55, 0.6)',
    alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12,
    ...T.plate.card, shadowColor: '#EAD69A', shadowOffset: { width: 0, height: 3 },
  },
  packPressed: { backgroundColor: T.color.goldTint, transform: [{ translateY: 2 }], shadowOffset: { width: 0, height: 1 } },
  packTokens: { fontFamily: FONT.heading, fontSize: 18, color: T.color.ink },
  pricePill: {
    backgroundColor: T.color.cerulean, borderRadius: T.radius.pill, paddingHorizontal: 12, paddingVertical: 4,
  },
  priceText: { color: T.color.card, fontSize: 13, fontWeight: '800' },
  fine: { fontSize: 11, lineHeight: 16, color: T.color.inkFaint },
  ledger: {
    borderRadius: T.radius.md, borderWidth: 1, borderColor: T.color.line, paddingHorizontal: 12,
  },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  txDivider: { borderBottomWidth: 1, borderBottomColor: T.color.line, borderStyle: 'dashed' },
  txIcon: { width: 18, height: 18 },
  txText: { flex: 1, fontSize: 13, color: T.color.ink },
  txAmt: { fontSize: 13, fontWeight: '800' },
});
