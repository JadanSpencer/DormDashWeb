// app/(student)/payment-result.tsx  (URL: /payment-result)
// Where WiPay sends the student back after a card payment. The server
// (functions/src/payments.ts → wipayReturn) has already verified and applied
// the payment before redirecting here; this screen shows the result, reading
// the payment record itself from Firestore rather than trusting the URL.

import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePayment } from '../../hooks/useWallet';
import { T, useReducedMotion } from '../../constants/theme';
import { formatTokens } from '../../services/payments';
import { formatJMD } from '../../constants';
import { Backdrop } from '../../components/Backdrop';
import { pressPlate } from '../../components/Tide';

type Pay = { status: string; purpose: 'order' | 'tokens'; amountJmd: number; tokens?: number; orderId?: string | null };

const CONFETTI_COLORS = [T.color.cerulean, T.color.teal, T.color.warning, T.color.ceruleanTint, T.color.tealDeep];

function Confetti() {
  const { width, height } = Dimensions.get('window');
  const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    x: Math.random() * width,
    size: 6 + Math.random() * 7,
    delay: Math.random() * 700,
    duration: 2200 + Math.random() * 1600,
    drift: (Math.random() - 0.5) * 120,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    round: Math.random() > 0.6,
  })), [width]);
  const anims = useRef(pieces.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.parallel(anims.map((a, i) => Animated.timing(a, {
      toValue: 1, duration: pieces[i].duration, delay: pieces[i].delay,
      easing: Easing.out(Easing.quad), useNativeDriver: true,
    }))).start();
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', left: p.x, top: -20,
            width: p.size, height: p.round ? p.size : p.size * 0.45,
            borderRadius: p.round ? p.size / 2 : 2, backgroundColor: p.color,
            opacity: anims[i].interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
              { translateX: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: anims[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 + Math.random() * 360}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

export default function PaymentResult() {
  const { pid, status: urlStatus } = useLocalSearchParams<{ pid?: string; status?: string }>();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // Live until the server has applied the payment (hooks/useWallet.ts).
  const { pay, loaded } = usePayment<Pay>(pid ? String(pid) : undefined);

  if (!loaded) {
    return <View style={styles.center}><Backdrop tone="cream" /><ActivityIndicator color={T.color.cerulean} size="large" /></View>;
  }

  const ok = pay?.status === 'paid' || pay?.status === 'credited';
  const isTokens = pay?.purpose === 'tokens';
  const credited = pay?.status === 'credited';
  // The server applies the payment before sending the student here, so a
  // "pending" record with a success URL just means Firestore hasn't caught up.
  // "verified" = applying it is being retried (every few minutes);
  // "review" = DormDash is confirming it with WiPay (see PaymentsToCheck).
  const stillChecking =
    (pay?.status === 'pending' && (urlStatus === 'success' || urlStatus === 'credited' || urlStatus === 'processing')) ||
    pay?.status === 'verified';
  const inReview = pay?.status === 'review';

  let title = 'Payment didn\'t go through';
  let text = 'You were not charged. You can try again.';
  if (ok && isTokens) {
    title = 'Payment successful';
    text = `${formatTokens(pay!.amountJmd)} added to your balance.`;
  } else if (ok && credited) {
    title = 'Payment received';
    text = `This order was already paid or cancelled before your card payment finished, so ${formatJMD(pay!.amountJmd)} was added to your balance as ${formatTokens(pay!.amountJmd)}. Use them on your next order.`;
  } else if (ok) {
    title = 'Payment successful';
    text = 'Your runner has been told to go ahead with your order.';
  } else if (stillChecking) {
    title = 'Confirming your payment…';
    text = 'This usually takes a few seconds. You can leave this page: your balance or order updates on its own.';
  } else if (inReview) {
    title = 'We\'re confirming your payment';
    text = `WiPay reported your payment in an unusual way, so Runner is checking it by hand. You won't be charged twice. Reference: ${pid ?? 'unknown'}.`;
  } else if (urlStatus === 'error' || !pay) {
    title = 'We couldn\'t confirm this payment';
    text = `If money was taken from your card, contact Runner support with this reference: ${pid ?? 'unknown'}.`;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + T.space.xl, paddingBottom: insets.bottom + T.space.lg }]}>
      <Backdrop tone="cream" />
      {ok && !reduced && <Confetti />}
      <View style={styles.body}>
        <View style={[styles.mark, ok ? styles.markOk : styles.markBad]}>
          {stillChecking
            ? <ActivityIndicator color={T.color.cerulean} />
            : <Text style={[styles.markText, { color: ok ? T.color.teal : T.color.danger }]}>{ok ? '✓' : '!'}</Text>}
        </View>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        <Text style={styles.text}>{text}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => router.replace('/(student)/(tabs)/home' as any)}
          style={({ pressed }) => [styles.primary, pressPlate(pressed)]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Back to shopping</Text>
        </Pressable>
        {pay?.purpose === 'order' && pay.orderId && !credited && (
          <Pressable
            onPress={() => router.replace({ pathname: '/(student)/order/[id]', params: { id: String(pay.orderId) } } as any)}
            style={styles.secondary}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>{ok ? 'Track my order' : 'Back to my order'}</Text>
          </Pressable>
        )}
        {isTokens && (
          <Pressable onPress={() => router.replace('/(student)/(tabs)/profile' as any)} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryText}>{ok ? 'See my tokens' : 'Try again'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.cream, paddingHorizontal: T.space.lg, justifyContent: 'space-between' },
  center: { flex: 1, backgroundColor: T.color.cream, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.space.md },
  mark: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: T.color.card },
  markOk: { backgroundColor: T.color.tealTint, ...T.plate.teal },
  markBad: { backgroundColor: T.color.dangerTint, ...T.plate.card, shadowColor: '#E6BDB9' },
  markText: { fontSize: 40, fontWeight: '900' },
  title: { ...T.type.title, fontSize: 28, color: T.color.ink, textAlign: 'center' },
  text: { ...T.type.body, color: T.color.inkSoft, textAlign: 'center', lineHeight: 22, maxWidth: 360 },
  actions: { gap: T.space.sm },
  primary: {
    backgroundColor: T.color.cerulean, borderRadius: 999, height: 56,
    alignItems: 'center', justifyContent: 'center',
    ...T.plate.cerulean, shadowColor: '#063E5B',
  },
  primaryText: { ...T.type.button, color: T.color.card },
  secondary: { height: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...T.type.button, color: T.color.ceruleanDeep },
});
