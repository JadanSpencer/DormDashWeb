// app/(auth)/login.tsx
// DormDash "Route" identity — cream canvas, teal-ink type, cerulean action.
// The signature: a delivery route rails the form — email and password are
// stops, the sign-in button is the destination. Motion is one orchestrated
// entrance + ambient drift; all transforms, native driver, reduce-motion safe.
// FUNCTIONALITY UNCHANGED: loginUser, resetPassword, show/hide, errors, nav.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Pressable,
  TextInput,
  Alert,
  Dimensions,
  Animated,
  Easing,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginUser, resetPassword, signInWithGoogle, takeGoogleRedirectError, googleSignInAvailable } from '../../services/auth';
import { GoogleButton, OrRule } from '../../components/GoogleButton';
import { requestPushPermissionFromGesture } from '../../services/notifications';
import { T, FONT } from '../../constants/theme';
import { Backdrop } from '../../components/Backdrop';
import { TideBand } from '../../components/Tide';
import { Swoosh } from '../../components/Swoosh';

// Small-screen handling: compact the hero + spacing under 700px tall
const SMALL = Dimensions.get('window').height < 700;

// The real app icon (the same tile as the home-screen icon and the launch
// intro). Web serves it from public/brand (the service worker precaches it).
const APP_ICON = Platform.OS === 'web' ? { uri: '/brand/dormdash-tile.png' } : require('../../assets/icon.png');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Coming back from a Google redirect that failed (e.g. the email already
  // has a password): say why. A success is picked up by the route guard.
  useEffect(() => {
    let alive = true;
    takeGoogleRedirectError().then(m => { if (alive && m) setError(m); });
    return () => { alive = false; };
  }, []);

  const continueWithGoogle = async () => {
    setError('');
    setGoogleBusy(true);
    const r = await signInWithGoogle();
    setGoogleBusy(false);
    if (!r.success && r.error) setError(r.error);
  };


  // ── Orchestrated entrance ────────────────────────────────────────────
  const heroFade = useRef(new Animated.Value(0)).current;
  const heroRise = useRef(new Animated.Value(16)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardRise = useRef(new Animated.Value(24)).current;
  const footFade = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const errorSlide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(110, [
      Animated.parallel([
        Animated.timing(heroFade, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(heroRise, { toValue: 0, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardFade, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(cardRise, { toValue: 0, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(footFade, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    Animated.timing(errorSlide, {
      toValue: error ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [error]);


  // ── Handlers (unchanged) ─────────────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email above first, then tap Forgot password.');
      return;
    }
    setError('');
    setResetting(true);
    const result = await resetPassword(email);
    setResetting(false);

    if (result.success) {
      Alert.alert(
        'Check Your Email',
        `If an account exists for ${email.trim().toLowerCase()}, a password reset link has been sent. Check spam too.`
      );
    } else {
      setError(result.error || 'Could not send reset email.');
    }
  };

  const handleLogin = async () => {
    // Must run before any await: browsers only allow the notification
    // prompt during the tap. No-op on native and once already answered.
    requestPushPermissionFromGesture();
    setError('');
    setLoading(true);

    const result = await loginUser(email, password);

    setLoading(false);

    if (!result.success) {
      setError(result.error || 'Login failed.');
      return;
    }
  };

  const emailDone = email.trim().length > 3;
  const passwordDone = password.length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <Backdrop tone="cream" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── HERO: the launch flyer ──────────────────────────────── */}
          <TideBand style={styles.band}>
            <Animated.View style={[styles.hero, { opacity: heroFade, transform: [{ translateY: heroRise }] }]}>
              {/* Brand: the app icon and the name, centred. The headline below stays left. */}
              <View style={styles.brandRow}>
                <Image
                  source={APP_ICON}
                  style={styles.appIcon}
                  resizeMode="contain"
                  accessible={false}
                />
                <Text style={styles.wordmark} numberOfLines={1} maxFontSizeMultiplier={1.1}>Runner</Text>
              </View>
              <Text style={styles.hungry} accessibilityRole="header">Hungry?</Text>
              <Text style={styles.dontMove}>Don't move.</Text>
              <Swoosh width={SMALL ? 170 : 210} />
              <Text style={styles.script}>sign in & di runner run it come!</Text>
            </Animated.View>
          </TideBand>

          {/* ── FORM — the route rails it ────────────────────────────── */}
          <Animated.View style={[styles.formRow, { opacity: cardFade, transform: [{ translateY: cardRise }] }]}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Welcome back</Text>
              <Text style={styles.cardSubtitle}>Sign in to keep ordering</Text>

              {/* Route stops sit inline with their own fields */}
              <View style={styles.labelRow}>
                <View style={[styles.stopDot, emailDone && styles.stopDotDone]} />
                <Text style={styles.inputLabel}>Email</Text>
              </View>
              <TextInput
                style={[styles.input, focused === 'email' && styles.inputFocused]}
                placeholder="you@campus.edu"
                placeholderTextColor={T.color.inkFaint}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
              />

              <View style={styles.labelRow}>
                <View style={[styles.stopDot, passwordDone && styles.stopDotDone]} />
                <Text style={styles.inputLabel}>Password</Text>
              </View>
              <TextInput
                style={[styles.input, focused === 'password' && styles.inputFocused]}
                placeholder="Your password"
                placeholderTextColor={T.color.inkFaint}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
              />

              <View style={styles.optionsRow}>
                <TouchableOpacity onPress={handleForgotPassword} disabled={resetting} hitSlop={8}>
                  <Text style={styles.linkQuiet}>
                    {resetting ? 'Sending…' : 'Forgot password?'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                  <Text style={styles.linkAccent}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>

              {error ? (
                <Animated.View
                  style={[
                    styles.errorBanner,
                    {
                      opacity: errorSlide,
                      transform: [{ translateY: errorSlide.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
                    },
                  ]}
                >
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              ) : null}

              <Pressable
                onPress={handleLogin}
                disabled={loading}
                onPressIn={() => Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true }).start()}
                onPressOut={() => Animated.spring(pressScale, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
              >
                <Animated.View style={[styles.cta, { transform: [{ scale: pressScale }] }, loading && styles.ctaBusy]}>
                  {loading ? (
                    <ActivityIndicator color={T.color.card} />
                  ) : (
                    <View style={styles.ctaRow}>
                      <View style={[styles.ctaPin, emailDone && passwordDone && styles.ctaPinReady]} />
                      <Text style={styles.ctaText}>Sign in</Text>
                    </View>
                  )}
                </Animated.View>
              </Pressable>

              {googleSignInAvailable && (
                <>
                  <OrRule />
                  <GoogleButton onPress={continueWithGoogle} busy={googleBusy} disabled={loading} />
                </>
              )}
            </View>
          </Animated.View>

          {/* ── FOOTER ───────────────────────────────────────────────── */}
          <Animated.View style={{ opacity: footFade }}>
            <View style={styles.footer}>
              <Text style={styles.footerText}>New to campus? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')} hitSlop={8}>
                <Text style={styles.footerLink}>Create an account</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.legal}>
              <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy' as any)} accessibilityRole="link">Privacy Policy</Text>
              <Text style={styles.legalLink} onPress={() => router.push('/legal/terms' as any)} accessibilityRole="link">Terms of Service</Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.color.cream },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: T.space.lg,
    paddingBottom: T.space.lg,
  },
  // The flyer header runs edge to edge above the card.
  band: { marginHorizontal: -T.space.lg, marginBottom: -T.space.xl },

  // Ambient canvas — two soft shapes, nothing louder
  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 },
  blobTeal: {
    position: 'absolute',
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: T.color.teal,
    opacity: 0.07,
    top: -70, right: -80,
  },
  blobCerulean: {
    position: 'absolute',
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: T.color.cerulean,
    opacity: 0.06,
    bottom: 40, left: -120,
  },

  // Hero (on the flyer header)
  hero: { paddingHorizontal: T.space.lg, paddingTop: SMALL ? T.space.lg : T.space.xl },
  brandRow: { alignItems: 'center', gap: SMALL ? 6 : 8, marginBottom: SMALL ? T.space.md : T.space.lg },
  appIcon: { width: SMALL ? 64 : 76, height: SMALL ? 64 : 76 },
  hungry: { ...T.type.display, fontSize: SMALL ? 50 : 60, lineHeight: SMALL ? 56 : 66, color: T.color.card },
  dontMove: { ...T.type.display, fontSize: SMALL ? 50 : 60, lineHeight: SMALL ? 56 : 66, color: T.color.mustard },
  script: { fontFamily: FONT.script, fontSize: SMALL ? 24 : 28, color: T.color.card, marginTop: T.space.sm, transform: [{ rotate: '-3deg' }] },
  eyebrow: { ...T.type.label, color: T.color.teal, marginBottom: 4 },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { ...T.type.display, fontSize: SMALL ? 30 : 34, color: T.color.card, textAlign: 'center' },
  tagline: { ...T.type.body, color: T.color.inkSoft, marginTop: 6 },

  // Form + route rail
  formRow: { marginBottom: T.space.lg },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: T.space.md, marginBottom: 6 },
  stopDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: T.color.card,
    borderWidth: 2, borderColor: T.color.lineStrong,
  },
  stopDotDone: { backgroundColor: T.color.teal, borderColor: T.color.teal },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ctaPin: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  ctaPinReady: { backgroundColor: T.color.card },
  rail: { display: 'none' },
  railStop: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: T.color.cream,
    borderWidth: 2, borderColor: T.color.lineStrong,
  },
  railStopDone: { backgroundColor: T.color.teal, borderColor: T.color.teal },
  railLine: { flex: 1, width: 2, backgroundColor: T.color.line, marginVertical: 6 },
  railPin: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: T.color.cream,
    borderWidth: 3, borderColor: T.color.lineStrong,
  },
  railPinReady: { borderColor: T.color.cerulean, backgroundColor: T.color.ceruleanTint },

  card: {
    flex: 1,
    backgroundColor: T.color.card,
    borderRadius: T.radius.xl,
    padding: SMALL ? T.space.md : T.space.lg,
    ...T.shadow.card,
  },
  cardTitle: { ...T.type.title, fontSize: 30, color: T.color.ink, textAlign: 'center' },
  cardSubtitle: { ...T.type.body, color: T.color.inkSoft, marginTop: 4, marginBottom: T.space.lg, textAlign: 'center' },

  inputLabel: { ...T.type.label, color: T.color.inkSoft },
  input: {
    backgroundColor: T.color.cream,
    borderWidth: 1.5,
    borderColor: T.color.line,
    borderRadius: T.radius.md,
    height: 52,
    paddingHorizontal: T.space.md,
    color: T.color.ink,
    ...T.type.body,
    marginBottom: T.space.md,
  },
  inputFocused: { borderColor: T.color.cerulean, backgroundColor: T.color.card },

  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -2,
    marginBottom: T.space.md,
  },
  linkQuiet: { ...T.type.body, fontSize: 13, color: T.color.inkSoft, fontWeight: '600' },
  linkAccent: { ...T.type.body, fontSize: 13, color: T.color.cerulean, fontWeight: '700' },

  errorBanner: {
    backgroundColor: T.color.dangerTint,
    borderRadius: T.radius.sm,
    padding: T.space.sm,
    marginBottom: T.space.md,
  },
  errorText: { ...T.type.body, fontSize: 13, color: T.color.danger, fontWeight: '600' },

  cta: {
    backgroundColor: T.color.cerulean,
    borderRadius: T.radius.pill,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.shadow.button,
  },
  ctaBusy: { opacity: 0.85 },
  ctaText: { ...T.type.button, color: T.color.card },

  // Footer
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: T.space.sm, marginBottom: T.space.md },
  footerText: { ...T.type.body, color: T.color.inkSoft },
  footerLink: { ...T.type.body, color: T.color.cerulean, fontWeight: '800' },

  legal: { flexDirection: 'row', justifyContent: 'center', gap: T.space.lg, marginTop: T.space.xs },
  legalLink: { fontSize: 13, color: T.color.inkSoft, textDecorationLine: 'underline' },
  roleHint: { flexDirection: 'row', justifyContent: 'center', gap: T.space.sm },
  roleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.color.card,
    borderRadius: T.radius.pill,
    paddingHorizontal: T.space.md, paddingVertical: 8,
    borderWidth: 1, borderColor: T.color.line,
  },
  roleDot: { width: 8, height: 8, borderRadius: 4 },
  roleChipText: { ...T.type.body, fontSize: 12, color: T.color.ink, fontWeight: '700' },
});
