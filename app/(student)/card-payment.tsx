// app/(student)/card-payment.tsx  (native only — see services/payments.ts openCheckout)
//
// Android/iOS: Fygaro's hosted card page, shown inside Runner instead of
// handing off to the phone's browser. Fygaro itself only offers a hosted
// checkout page (no embeddable card-field API — checked their docs directly),
// so this can't be a truly native card form; wrapping it in a WebView is the
// closest Runner gets to "never leaves the app" without a different gateway.
//
// Web keeps the old full-page redirect (window.location.href) — this screen
// doesn't exist there and openCheckout never routes to it on web.
//
// When Fygaro finishes and redirects to {APP_URL}/payment-result?... (via
// fygaroReturn), that URL is intercepted here before the WebView ever loads
// it: the query string is lifted straight onto the real native
// /(student)/payment-result screen, so the result screen behaves exactly as
// it does on web, reading the payment doc from Firestore rather than
// trusting these params.

import React, { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, BackHandler } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../../constants/theme';
import { pressPlate } from '../../components/Tide';

export default function CardPaymentScreen() {
  const { url } = useLocalSearchParams<{ url?: string }>();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBackInPage, setCanGoBackInPage] = useState(false);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(student)/(tabs)/home' as any);
  }, []);

  // Hardware back: step back inside Fygaro's page first, then close.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackInPage) { webRef.current?.goBack(); return true; }
      close();
      return true;
    });
    return () => sub.remove();
  }, [canGoBackInPage, close]));

  // Fygaro redirects here on success/failure (fygaroReturn). Hand the same
  // query string to the real native result screen instead of letting the
  // WebView render that page, and stop this navigation.
  const handleShouldStart = useCallback((request: WebViewNavigation | { url: string }): boolean => {
    const target = request.url;
    if (!target.includes('/payment-result')) return true;
    const qIndex = target.indexOf('?');
    const query = qIndex >= 0 ? target.slice(qIndex + 1) : '';
    const params: Record<string, string> = {};
    new URLSearchParams(query).forEach((v, k) => { params[k] = v; });
    router.replace({ pathname: '/(student)/payment-result', params } as any);
    return false;
  }, []);

  if (typeof url !== 'string' || !/^https:\/\//.test(url)) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>This payment page didn't open properly.</Text>
        <Pressable onPress={close} style={({ pressed }) => [styles.closeBtnWide, pressPlate(pressed)]}>
          <Text style={styles.closeText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + T.space.sm }]}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={({ pressed }) => [styles.closeBtn, pressPlate(pressed, 2)]}>
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.lock}>🔒</Text>
          <Text style={styles.title} numberOfLines={1}>Secure checkout</Text>
        </View>
        <View style={styles.closeBtn} />
      </View>

      <WebView
        ref={webRef}
        source={{ uri: url }}
        style={styles.web}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(nav: WebViewNavigation) => setCanGoBackInPage(nav.canGoBack)}
        onShouldStartLoadWithRequest={handleShouldStart}
        startInLoadingState={false}
        originWhitelist={['https://*']}
      />

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={T.color.cerulean} size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.cream },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: T.space.md, paddingBottom: T.space.sm,
    backgroundColor: T.color.cream, borderBottomWidth: 1, borderBottomColor: T.color.line,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.color.card,
  },
  closeGlyph: { fontSize: 16, color: T.color.ink, fontWeight: '700' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lock: { fontSize: 13 },
  title: { ...T.type.button, fontSize: 15, color: T.color.ink },
  web: { flex: 1, backgroundColor: T.color.cream },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 56, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.color.cream,
  },
  errorText: { ...T.type.body, color: T.color.ink, textAlign: 'center', margin: T.space.lg },
  closeBtnWide: {
    marginHorizontal: T.space.lg, height: 52, borderRadius: T.radius.pill,
    backgroundColor: T.color.cerulean, alignItems: 'center', justifyContent: 'center',
  },
  closeText: { ...T.type.button, color: T.color.card },
});
