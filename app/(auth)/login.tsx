// app/(auth)/login.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginUser, resetPassword } from '../../services/auth';
import { Button, Input, Card } from '../../components/ui';
import { COLORS, SPACING, RADIUS } from '../../constants';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

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
    setError('');
    setLoading(true);

    const result = await loginUser(email, password);

    setLoading(false);

    if (!result.success) {
      setError(result.error || 'Login failed.');
      return;
    }
  };

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
          {/* Enhanced wave decoration - Cerulean & Yellow */}
          <View style={styles.waveDecoration} pointerEvents="none">
            <View style={styles.waveCircle1} />
            <View style={styles.waveCircle2} />
            <View style={styles.waveCircle3} />
            <View style={styles.waveBlur1} />
            <View style={styles.waveBlur2} />
          </View>

          {/* ── HEADER with App Icon ─────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <View style={styles.logoOuter}>
                <Image 
                  source={require('../../assets/icon.png')} 
                  style={styles.appIcon}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.logoDot} />
            </View>

            <Text style={styles.brandName}>DormDash</Text>
            <Text style={styles.tagline}>Campus delivery, powered by students</Text>
          </View>

          {/* ── FORM CARD with premium glassmorphism ──────────────── */}
          <View style={styles.glassCard}>
            <Text style={styles.cardTitle}>Welcome back</Text>
            <Text style={styles.cardSubtitle}>Sign in to your account</Text>

            <View style={styles.formGap} />

            <Input
              label="Email"
              placeholder="email@dormdash.com"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              containerStyle={styles.inputContainer}
              style={styles.glassInput}
            />

            <Input
              label="Password"
              placeholder="password"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              containerStyle={styles.inputContainer}
              style={styles.glassInput}
            />

            {/* Password options row - Forgot left, Show right */}
            <View style={styles.passwordOptionsRow}>
            <TouchableOpacity onPress={handleForgotPassword} disabled={resetting}>
              <Text style={styles.forgotPasswordText}>
                {resetting ? 'Sending...' : 'Forgot password?'}
              </Text>
            </TouchableOpacity>
              
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.showPasswordText}>
                  {showPassword ? 'Hide password' : 'Show password'}
                </Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>⚠ {error}</Text>
              </View>
            ) : null}

            <View style={styles.formGap} />

            <Button
              label="Sign In"
              onPress={handleLogin}
              loading={loading}
              variant="primary"
              style={styles.signInButton}
            />
          </View>

          {/* ── FOOTER ─────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.footerLink}>Create one</Text>
            </TouchableOpacity>
          </View>

          {/* ── ROLE HINT (enhanced) ───────────────────────── */}
          <View style={styles.roleHint}>
            <View style={styles.roleChip}>
              <LinearGradient
                colors={['#00B4D8', '#0096C7']}
                style={styles.roleDotGradient}
              />
              <Text style={styles.roleChipText}>Student</Text>
            </View>
            <View style={styles.roleChip}>
              <LinearGradient
                colors={['#FFD166', '#FFC107']}
                style={styles.roleDotGradient}
              />
              <Text style={styles.roleChipText}>Dasher</Text>
            </View>
            <View style={styles.roleChip}>
              <LinearGradient
                colors={['#8892A4', '#6B7280']}
                style={styles.roleDotGradient}
              />
              <Text style={styles.roleChipText}>Admin</Text>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#E8F4F8', // Soft cerulean tint background
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
  },

  // Enhanced wave decoration - Cerulean & Yellow
  waveDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: -1,
  },
  waveCircle1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#00B4D8', // Cerulean
    top: -100,
    left: -120,
    opacity: 0.15,
  },
  waveCircle2: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#FFD166', // Yellow
    bottom: 80,
    right: -80,
    opacity: 0.12,
  },
  waveCircle3: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#00D9A3',
    top: '40%',
    left: -60,
    opacity: 0.05,
  },
  waveBlur1: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: '#48CAE4', // Light cerulean
    top: 150,
    right: -150,
    opacity: 0.08,
  },
  waveBlur2: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#FFE066', // Light yellow
    bottom: 150,
    left: -100,
    opacity: 0.07,
  },

  // Header with App Icon
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    marginTop: SPACING.md,
  },
  logoContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  logoOuter: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFD166',
    shadowColor: '#00B4D8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  appIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
  },
  logoDot: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#023E8A', // Yellow
    borderWidth: 2.5,
    borderColor: '#E8F4F8', // Matches new background
  },
  brandName: {
    fontSize: 34,
    fontWeight: '900',
    color: '#023E8A', // Deep cerulean for text
    letterSpacing: -1,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: '#0077B6', // Medium cerulean
    letterSpacing: 0.3,
  },

  // Premium glass card
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    borderRadius: 32,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(0, 180, 216, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 15,
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#023E8A', // Deep cerulean
    letterSpacing: -0.5,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#0077B6', // Medium cerulean
    marginTop: 4,
  },
  formGap: {
    height: SPACING.md,
  },

  // Input styling - Clean white
  inputContainer: {
    marginBottom: SPACING.md,
  },
  glassInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CAF0F8',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: '#023E8A',
    fontSize: 15,
    fontWeight: '500',
  },

  // Password options row
  passwordOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    marginTop: -SPACING.sm,
  },
  forgotPasswordText: {
    color: '#0077B6',
    fontSize: 13,
    fontWeight: '500',
  },
  showPasswordText: {
    color: '#FFD166', // Yellow
    fontSize: 13,
    fontWeight: '600',
  },

  // Error banner
  errorBanner: {
    backgroundColor: 'rgba(255, 71, 87, 0.15)',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: '#FF4757',
  },
  errorBannerText: {
    color: '#FF8A92',
    fontSize: 13,
    fontWeight: '500',
  },

  // Sign In button - Cerulean
  signInButton: {
    borderRadius: 16,
    height: 54,
    marginTop: SPACING.sm,
    backgroundColor: '#00B4D8',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    marginTop: SPACING.sm,
  },
  footerText: {
    color: '#0077B6',
    fontSize: 14,
  },
  footerLink: {
    color: '#FFD166', // Yellow
    fontSize: 14,
    fontWeight: '700',
  },

  // Enhanced role hint chips
  roleHint: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 40,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 180, 216, 0.2)',
  },
  roleDotGradient: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  roleChipText: {
    color: '#023E8A',
    fontSize: 12,
    fontWeight: '600',
  },
});