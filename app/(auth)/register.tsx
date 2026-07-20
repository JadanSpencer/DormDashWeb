// app/(auth)/register.tsx
// DormDash "Route" identity. The signup IS a journey, so the route rail is
// the honest progress indicator: Role → Details → account. Step changes
// crossfade-and-slide; role tiles select with a spring. Native driver only.
// FUNCTIONALITY UNCHANGED: registerUser, validations, step flow, navigation.

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
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { registerUser } from '../../services/auth';
import { T } from '../../constants/theme';
import { UserRole } from '../../types';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

const ROLES: { role: UserRole; label: string; description: string; icon: string; iconSet: string; color: string }[] = [
  {
    role: 'student',
    label: 'Student',
    description: 'Order from stores on campus',
    icon: 'school-outline',
    iconSet: 'ionicons',
    color: T.color.cerulean,
  },
  {
    role: 'dasher',
    label: 'Dasher',
    description: 'Deliver orders and earn money',
    icon: 'motorcycle',
    iconSet: 'material',
    color: T.color.teal,
  },
];

const renderIcon = (iconName: string, iconSet: string, color: string, size: number = 26) => {
  if (iconSet === 'ionicons') {
    return <Ionicons name={iconName as any} size={size} color={color} />;
  } else if (iconSet === 'material') {
    return <MaterialIcons name={iconName as any} size={size} color={color} />;
  }
  return <Ionicons name="person-outline" size={size} color={color} />;
};

export default function RegisterScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [university, setUniversity] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // ── Motion ───────────────────────────────────────────────────────────
  const stepFade = useRef(new Animated.Value(1)).current;
  const stepSlide = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const roleScales = useRef({
    student: new Animated.Value(1),
    dasher: new Animated.Value(1),
    admin: new Animated.Value(1),
  }).current;

  // Crossfade + slide whenever the step changes
  useEffect(() => {
    stepFade.setValue(0);
    stepSlide.setValue(step === 2 ? 28 : -28);
    Animated.parallel([
      Animated.timing(stepFade, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(stepSlide, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [step]);

  const springRole = (role: UserRole) => {
    const v = roleScales[role as 'student' | 'dasher'];
    if (!v) return;
    Animated.sequence([
      Animated.spring(v, { toValue: 0.97, useNativeDriver: true, speed: 40 }),
      Animated.spring(v, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  };

  // ── Handler (unchanged) ──────────────────────────────────────────────
  const handleRegister = async () => {
    setError('');

    if (!selectedRole) {
      setError('Please select a role.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const result = await registerUser(email, password, name, phone, university, selectedRole);
    setLoading(false);

    if (!result.success) {
      setError(result.error || 'Registration failed.');
      return;
    }
  };

  const fields: {
    key: string; label: string; value: string; set: (v: string) => void;
    placeholder: string; props?: object;
  }[] = [
    { key: 'name', label: 'Full name', value: name, set: setName, placeholder: 'John Brown', props: { autoCapitalize: 'words' } },
    { key: 'email', label: 'Email', value: email, set: setEmail, placeholder: 'you@campus.edu', props: { keyboardType: 'email-address', autoCapitalize: 'none' } },
    { key: 'phone', label: 'Phone number', value: phone, set: setPhone, placeholder: '+1 876 XXX XXXX', props: { keyboardType: 'phone-pad' } },
    { key: 'university', label: 'University', value: university, set: setUniversity, placeholder: 'University of the West Indies', props: { autoCapitalize: 'words' } },
    { key: 'password', label: 'Password', value: password, set: setPassword, placeholder: 'Min. 8 characters + 1 number', props: { secureTextEntry: true } },
    { key: 'confirm', label: 'Confirm password', value: confirmPassword, set: setConfirmPassword, placeholder: 'Repeat your password', props: { secureTextEntry: true } },
  ];

  const selectedMeta = ROLES.find(r => r.role === selectedRole);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Ambient canvas */}
          <View style={styles.canvas} pointerEvents="none">
            <View style={styles.blobTeal} />
            <View style={styles.blobCerulean} />
          </View>

          {/* ── TOP BAR ──────────────────────────────────────────────── */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={() => step === 2 ? setStep(1) : router.back()}
              hitSlop={8}
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={18} color={T.color.ink} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>

            {/* Route progress — the honest 2-stop journey */}
            <View style={styles.progress}>
              <View style={[styles.progressStop, styles.progressStopDone]} />
              <View style={[styles.progressLine, step === 2 && styles.progressLineDone]} />
              <View style={[styles.progressStop, step === 2 && styles.progressStopDone]} />
            </View>
          </View>

          {/* ── HEADER ───────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.eyebrow}>{step === 1 ? 'Step 1 · Choose your role' : 'Step 2 · Your details'}</Text>
            <Text style={styles.title}>
              {step === 1 ? 'Join DormDash' : 'Almost there'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 1
                ? 'How will you use the app?'
                : 'Fill in your information below'}
            </Text>
          </View>

          {/* ── STEP CONTENT (crossfade + slide) ─────────────────────── */}
          <Animated.View style={{ opacity: stepFade, transform: [{ translateX: stepSlide }] }}>
            {step === 1 && (
              <View>
                {ROLES.map((item) => {
                  const selected = selectedRole === item.role;
                  return (
                    <Animated.View key={item.role} style={{ transform: [{ scale: roleScales[item.role as 'student' | 'dasher'] }] }}>
                      <Pressable
                        style={[styles.roleCard, selected && { borderColor: item.color, backgroundColor: T.color.card }]}
                        onPress={() => { setSelectedRole(item.role); springRole(item.role); }}
                      >
                        <View style={[styles.roleIcon, selected && { backgroundColor: item.color + '1A' }]}>
                          {renderIcon(item.icon, item.iconSet, selected ? item.color : T.color.inkFaint, 26)}
                        </View>
                        <View style={styles.roleInfo}>
                          <Text style={[styles.roleLabel, selected && { color: item.color }]}>
                            {item.label}
                          </Text>
                          <Text style={styles.roleDescription}>{item.description}</Text>
                        </View>
                        <View style={[styles.roleCheck, selected && { backgroundColor: item.color, borderColor: item.color }]}>
                          {selected && <Ionicons name="checkmark" size={13} color={T.color.card} />}
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })}

                {error ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={() => {
                    if (!selectedRole) {
                      setError('Please select a role to continue.');
                      return;
                    }
                    setError('');
                    setStep(2);
                  }}
                  disabled={!selectedRole}
                  onPressIn={() => Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true }).start()}
                  onPressOut={() => Animated.spring(pressScale, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
                >
                  <Animated.View
                    style={[
                      styles.cta,
                      { transform: [{ scale: pressScale }] },
                      !selectedRole && styles.ctaDisabled,
                    ]}
                  >
                    <Text style={[styles.ctaText, !selectedRole && styles.ctaTextDisabled]}>Continue</Text>
                    <Ionicons name="arrow-forward" size={18} color={!selectedRole ? T.color.inkFaint : T.color.card} />
                  </Animated.View>
                </Pressable>
              </View>
            )}

            {step === 2 && (
              <View style={styles.card}>
                {selectedMeta && (
                  <View style={[styles.selectedBadge, { backgroundColor: selectedMeta.color + '14' }]}>
                    {renderIcon(selectedMeta.icon, selectedMeta.iconSet, selectedMeta.color, 15)}
                    <Text style={[styles.selectedBadgeText, { color: selectedMeta.color }]}>
                      Registering as {selectedMeta.label}
                    </Text>
                  </View>
                )}

                {fields.map(f => (
                  <View key={f.key}>
                    <Text style={styles.inputLabel}>{f.label}</Text>
                    <TextInput
                      style={[styles.input, focusedField === f.key && styles.inputFocused]}
                      placeholder={f.placeholder}
                      placeholderTextColor={T.color.inkFaint}
                      value={f.value}
                      onChangeText={f.set}
                      onFocus={() => setFocusedField(f.key)}
                      onBlur={() => setFocusedField(null)}
                      {...f.props}
                    />
                  </View>
                ))}

                {error ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={handleRegister}
                  disabled={loading}
                  onPressIn={() => Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true }).start()}
                  onPressOut={() => Animated.spring(pressScale, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
                >
                  <Animated.View style={[styles.cta, { transform: [{ scale: pressScale }] }, loading && styles.ctaBusy]}>
                    {loading ? (
                      <ActivityIndicator color={T.color.card} />
                    ) : (
                      <Text style={styles.ctaText}>Create account</Text>
                    )}
                  </Animated.View>
                </Pressable>

                <Text style={styles.terms}>
                  By registering you agree to DormDash's Terms of Service and Privacy Policy
                </Text>
              </View>
            )}
          </Animated.View>

          {/* ── FOOTER ───────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
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
    paddingTop: T.space.lg,
    paddingBottom: T.space.xl,
  },

  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 },
  blobTeal: {
    position: 'absolute',
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: T.color.teal, opacity: 0.06,
    top: -90, right: -90,
  },
  blobCerulean: {
    position: 'absolute',
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: T.color.cerulean, opacity: 0.05,
    bottom: 60, left: -110,
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: T.space.xl,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { ...T.type.body, color: T.color.ink, fontWeight: '700' },

  progress: { flexDirection: 'row', alignItems: 'center', width: 92 },
  progressStop: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: T.color.cream,
    borderWidth: 2, borderColor: T.color.lineStrong,
  },
  progressStopDone: { backgroundColor: T.color.teal, borderColor: T.color.teal },
  progressLine: { flex: 1, height: 2, backgroundColor: T.color.line, marginHorizontal: 4 },
  progressLineDone: { backgroundColor: T.color.teal },

  header: { marginBottom: T.space.lg },
  eyebrow: { ...T.type.label, color: T.color.teal, marginBottom: 6 },
  title: { ...T.type.display, fontSize: 34, color: T.color.ink, marginBottom: 6 },
  subtitle: { ...T.type.body, color: T.color.inkSoft },

  // Role tiles
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.color.card,
    borderRadius: T.radius.lg,
    padding: T.space.lg,
    marginBottom: T.space.md,
    borderWidth: 2,
    borderColor: T.color.line,
    gap: T.space.md,
    ...T.shadow.card,
  },
  roleIcon: {
    width: 54, height: 54, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: T.color.creamDeep,
  },
  roleInfo: { flex: 1 },
  roleLabel: { ...T.type.body, fontSize: 17, fontWeight: '800', color: T.color.ink, marginBottom: 3 },
  roleDescription: { ...T.type.body, fontSize: 13, color: T.color.inkSoft },
  roleCheck: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: T.color.lineStrong,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'transparent',
  },

  // Details card
  card: {
    backgroundColor: T.color.card,
    borderRadius: T.radius.xl,
    padding: T.space.lg,
    ...T.shadow.card,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: T.radius.pill,
    paddingVertical: 7,
    paddingHorizontal: T.space.md,
    alignSelf: 'flex-start',
    marginBottom: T.space.lg,
  },
  selectedBadgeText: { ...T.type.body, fontSize: 13, fontWeight: '800' },

  inputLabel: { ...T.type.label, color: T.color.inkSoft, marginBottom: 8 },
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

  errorBanner: {
    backgroundColor: T.color.dangerTint,
    borderLeftWidth: 3,
    borderLeftColor: T.color.danger,
    borderRadius: T.radius.sm,
    padding: T.space.sm,
    marginBottom: T.space.md,
    marginTop: 2,
  },
  errorText: { ...T.type.body, fontSize: 13, color: T.color.danger, fontWeight: '600' },

  cta: {
    backgroundColor: T.color.cerulean,
    borderRadius: T.radius.pill,
    height: 56,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: T.space.sm,
    ...T.shadow.button,
  },
  ctaBusy: { opacity: 0.85 },
  ctaDisabled: { backgroundColor: T.color.creamDeep, shadowOpacity: 0, elevation: 0 },
  ctaText: { ...T.type.button, color: T.color.card },
  ctaTextDisabled: { color: T.color.inkFaint },

  terms: {
    ...T.type.body,
    fontSize: 11,
    color: T.color.inkFaint,
    textAlign: 'center',
    marginTop: T.space.md,
    lineHeight: 16,
  },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: T.space.lg },
  footerText: { ...T.type.body, color: T.color.inkSoft },
  footerLink: { ...T.type.body, color: T.color.cerulean, fontWeight: '800' },
});
