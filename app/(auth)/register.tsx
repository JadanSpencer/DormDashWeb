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
import { registerUser, signInWithGoogle, completeGoogleProfile, googleSignInAvailable, logoutUser } from '../../services/auth';
import { useAuth } from '../../hooks/useAuth';
import { GoogleButton, OrRule } from '../../components/GoogleButton';
import { requestPushPermissionFromGesture } from '../../services/notifications';
import { T } from '../../constants/theme';
import { UserRole } from '../../types';
import { Backdrop } from '../../components/Backdrop';
import { Icon } from '../../components/TabIcon'; // SVG icons: no icon font to fail loading

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

// Student university choices. Add campuses here as DormDash expands.
const STUDENT_UNIVERSITIES = ['UWI Mona', 'Other'];

const renderIcon = (iconName: string, iconSet: string, color: string, size: number = 26) => {
  if (iconSet === 'ionicons') {
    return <Icon name={iconName as any} size={size} color={color} />;
  } else if (iconSet === 'material') {
    return <Icon name={iconName as any} size={size} color={color} />;
  }
  return <Icon name="person-outline" size={size} color={color} />;
};

export default function RegisterScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [university, setUniversity] = useState('');
  const [uniOpen, setUniOpen] = useState(false);
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
  // Clickwrap: an explicit tick is much stronger evidence of agreement than
  // "by creating an account you agree". registerUser records when.
  const [agreed, setAgreed] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Signed in with Google but no DormDash profile yet: finish signing up
  // here (Google already gave us the email; no password needed).
  const { pendingProfile, refreshUser } = useAuth();
  const viaGoogle = !!pendingProfile;
  useEffect(() => {
    if (pendingProfile?.name && !name) setName(pendingProfile.name);
  }, [pendingProfile]);

  const continueWithGoogle = async () => {
    setError('');
    setGoogleBusy(true);
    const r = await signInWithGoogle();
    setGoogleBusy(false);
    if (!r.success && r.error) setError(r.error);
  };

  const handleRegister = async () => {
    // Must run before any await: browsers only allow the notification
    // prompt during the tap. No-op on native and once already answered.
    requestPushPermissionFromGesture();
    setError('');

    if (!selectedRole) {
      setError('Please select a role.');
      return;
    }
    if (selectedRole === 'student' && !STUDENT_UNIVERSITIES.includes(university)) {
      setError('Please choose your university.');
      return;
    }
    if (!agreed) {
      setError('Please confirm you are 18 or older and agree to the Terms and Privacy Policy.');
      return;
    }
    if (viaGoogle) {
      setLoading(true);
      const done = await completeGoogleProfile(name, phone, university, selectedRole);
      if (done.success) await refreshUser(); // the route guard takes it from here
      setLoading(false);
      if (!done.success) setError(done.error || 'Could not finish signing up.');
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

  // Google sign-ups: Google holds the email and password.
  const shownFields = viaGoogle ? fields.filter(f => !['email', 'password', 'confirm'].includes(f.key)) : fields;
  const selectedMeta = ROLES.find(r => r.role === selectedRole);

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
          {/* ── TOP BAR ──────────────────────────────────────────────── */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={() => step === 2 ? setStep(1) : viaGoogle ? logoutUser() : router.back()}
              hitSlop={8}
              style={styles.backBtn}
            >
              <Icon name="arrow-back" size={18} color={T.color.ink} />
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
            <Text style={styles.eyebrow}>{step === 1 ? 'Step 1 of 2' : 'Step 2 of 2'}</Text>
            <View style={styles.titleRow}>
              <Text style={styles.title}>
                {step === 1 ? 'Join DormDash' : 'Almost there'}
              </Text>
            </View>
            <Text style={styles.subtitle}>
              {viaGoogle
                ? `Signed in with Google as ${pendingProfile?.email}. ${step === 1 ? 'How will you use the app?' : 'A few more details.'}`
                : step === 1
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
                          {selected && <Icon name="checkmark" size={13} color={T.color.card} />}
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
                    <Icon name="arrow-forward" size={18} color={!selectedRole ? T.color.inkFaint : T.color.card} />
                  </Animated.View>
                </Pressable>

                {googleSignInAvailable && !viaGoogle && (
                  <>
                    <OrRule />
                    <GoogleButton onPress={continueWithGoogle} busy={googleBusy} />
                  </>
                )}
                {viaGoogle && (
                  <TouchableOpacity onPress={() => logoutUser()} style={styles.otherAccount} hitSlop={8}>
                    <Text style={styles.otherAccountText}>Use a different account</Text>
                  </TouchableOpacity>
                )}
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

                {shownFields.map(f => f.key === 'university' && selectedRole === 'student' ? (
                  // Students pick from a fixed list (for now UWI Mona or Other),
                  // so every student at the same campus is recorded the same way.
                  <View key={f.key}>
                    <Text style={styles.inputLabel}>{f.label}</Text>
                    <Pressable
                      onPress={() => setUniOpen(o => !o)}
                      style={[styles.input, styles.select, uniOpen && styles.inputFocused]}
                      accessibilityRole="button"
                      accessibilityLabel={`University: ${university || 'not chosen'}`}
                      accessibilityState={{ expanded: uniOpen }}
                    >
                      <Text style={[styles.selectText, !university && { color: T.color.inkFaint }]}>
                        {university || 'Choose your university'}
                      </Text>
                      <Icon name="chevron-down" size={18} color={T.color.inkSoft} />
                    </Pressable>
                    {uniOpen && (
                      <View style={styles.selectMenu} accessibilityRole="menu">
                        {STUDENT_UNIVERSITIES.map(u => (
                          <Pressable
                            key={u}
                            onPress={() => { setUniversity(u); setUniOpen(false); }}
                            style={({ pressed }) => [styles.selectOption, (pressed || university === u) && styles.selectOptionOn]}
                            accessibilityRole="menuitem"
                            accessibilityState={{ selected: university === u }}
                          >
                            <Text style={styles.selectText}>{u}</Text>
                            {university === u && <Icon name="checkmark" size={16} color={T.color.ceruleanDeep} />}
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                ) : (
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
                  onPress={() => setAgreed(a => !a)}
                  style={styles.consentRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreed }}
                  hitSlop={6}
                >
                  <Icon
                    name={agreed ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={agreed ? T.color.ceruleanDeep : T.color.inkSoft}
                  />
                  <Text style={styles.consentText}>
                    I am 18 or older and I agree to the{' '}
                    <Text style={styles.termsLink} onPress={() => router.push('/legal/terms' as any)}>Terms of Service</Text>
                    {' '}and{' '}
                    <Text style={styles.termsLink} onPress={() => router.push('/legal/privacy' as any)}>Privacy Policy</Text>.
                  </Text>
                </Pressable>

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
                      <Text style={styles.ctaText}>{viaGoogle ? 'Finish signing up' : 'Create account'}</Text>
                    )}
                  </Animated.View>
                </Pressable>

              </View>
            )}
          </Animated.View>

          {/* ── FOOTER ───────────────────────────────────────────────── */}
          {!viaGoogle && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
                <Text style={styles.footerLink}>Sign in</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  otherAccount: { alignSelf: 'center', paddingVertical: 12 },
  otherAccountText: { color: T.color.inkSoft, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { ...T.type.display, fontSize: 34, color: T.color.ink, flexShrink: 1 },
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
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { ...T.type.body, color: T.color.ink },
  selectMenu: {
    marginTop: -T.space.sm,
    marginBottom: T.space.md,
    borderWidth: 1.5,
    borderColor: T.color.line,
    borderRadius: T.radius.md,
    backgroundColor: T.color.card,
    overflow: 'hidden',
  },
  selectOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: T.space.md, height: 48,
  },
  selectOptionOn: { backgroundColor: T.color.cream },

  errorBanner: {
    backgroundColor: T.color.dangerTint,
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
    fontSize: 13,
    color: T.color.inkSoft,
    textAlign: 'center',
    marginTop: T.space.md,
    lineHeight: 19,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: T.space.md,
  },
  consentText: { ...T.type.body, flex: 1, fontSize: 14, color: T.color.ink, lineHeight: 20 },
  termsLink: { color: T.color.ceruleanDeep, fontWeight: '700', textDecorationLine: 'underline' },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: T.space.lg },
  footerText: { ...T.type.body, color: T.color.inkSoft },
  footerLink: { ...T.type.body, color: T.color.cerulean, fontWeight: '800' },
});
