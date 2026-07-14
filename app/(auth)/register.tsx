// app/(auth)/register.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { registerUser } from '../../services/auth';
import { Button, Input } from '../../components/ui';
import { SPACING, RADIUS } from '../../constants';
import { UserRole } from '../../types';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

const ROLES: { role: UserRole; label: string; description: string; icon: string; iconSet: string; color: string }[] = [
  {
    role: 'student',
    label: 'Student',
    description: 'Order from stores on campus',
    icon: 'school-outline',
    iconSet: 'ionicons',
    color: '#00B4D8',
  },
  {
    role: 'dasher',
    label: 'Dasher',
    description: 'Deliver orders and earn money',
    icon: 'motorcycle',
    iconSet: 'material',
    color: '#FFD166',
  },
];

const renderIcon = (iconName: string, iconSet: string, color: string, size: number = 28) => {
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
          <View style={styles.waveDecoration} pointerEvents="none">
            <View style={styles.waveCircle1} />
            <View style={styles.waveCircle2} />
            <View style={styles.waveBlur1} />
          </View>

          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => step === 2 ? setStep(1) : router.back()}>
              <Text style={styles.backBtn}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.stepIndicator}>Step {step} of 2</Text>
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>
              {step === 1 ? 'Join DormDash' : 'Your details'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 1
                ? 'Choose how you want to use the app'
                : 'Fill in your information below'}
            </Text>
          </View>

          {step === 1 && (
            <View>
              {ROLES.map((item) => (
                <Pressable
                  key={item.role}
                  style={[
                    styles.roleCard,
                    selectedRole === item.role && {
                      borderColor: item.color,
                      backgroundColor: item.color + '10',
                    },
                  ]}
                  onPress={() => setSelectedRole(item.role)}
                  android_ripple={{ color: 'transparent' }}
                >
                  <View style={[
                    styles.roleIcon,
                    selectedRole === item.role && {
                      backgroundColor: item.color + '20',
                    },
                  ]}>
                    {renderIcon(item.icon, item.iconSet, selectedRole === item.role ? item.color : '#94A3B8', 28)}
                  </View>
                  <View style={styles.roleInfo}>
                    <Text style={[
                      styles.roleLabel,
                      selectedRole === item.role && { color: item.color }
                    ]}>
                      {item.label}
                    </Text>
                    <Text style={styles.roleDescription}>{item.description}</Text>
                  </View>
                  <View style={[
                    styles.roleCheck,
                    selectedRole === item.role && {
                      backgroundColor: item.color,
                      borderColor: item.color,
                    },
                  ]}>
                    {selectedRole === item.role && (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    )}
                  </View>
                </Pressable>
              ))}

              <View style={{ height: SPACING.xl }} />

              <TouchableOpacity
                style={[
                  styles.continueButton,
                  !selectedRole && styles.continueButtonDisabled,
                ]}
                onPress={() => {
                  if (!selectedRole) {
                    setError('Please select a role to continue.');
                    return;
                  }
                  setError('');
                  setStep(2);
                }}
                disabled={!selectedRole}
                activeOpacity={0.8}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
              </TouchableOpacity>

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>⚠ {error}</Text>
                </View>
              ) : null}
            </View>
          )}

          {step === 2 && (
            <View style={styles.glassCard}>
              <View style={[
                styles.selectedRoleBadge,
                {
                  backgroundColor: selectedRole === 'dasher' ? '#FFD16622' : '#00B4D822'
                }
              ]}>
                {selectedRole === 'student' ? (
                  <Ionicons name="school-outline" size={16} color="#00B4D8" />
                ) : (
                  <MaterialIcons name="motorcycle" size={16} color="#FFD166" />
                )}
                <Text style={[
                  styles.selectedRoleText,
                  { color: selectedRole === 'dasher' ? '#FFD166' : '#00B4D8' }
                ]}>
                  {selectedRole === 'student' ? ' Registering as Student' : ' Registering as Dasher'}
                </Text>
              </View>

              <View style={{ height: SPACING.lg }} />

              <Input
                label="Full Name"
                placeholder="John Brown"
                placeholderTextColor="#94A3B8"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                containerStyle={styles.inputContainer}
                style={styles.glassInput}
              />
              <Input
                label="Email"
                placeholder="your@dormdash.com"
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                containerStyle={styles.inputContainer}
                style={styles.glassInput}
              />
              <Input
                label="Phone Number"
                placeholder="+1 876 XXX XXXX"
                placeholderTextColor="#94A3B8"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                containerStyle={styles.inputContainer}
                style={styles.glassInput}
              />
              <Input
                label="University"
                placeholder="University of the West Indies"
                placeholderTextColor="#94A3B8"
                value={university}
                onChangeText={setUniversity}
                autoCapitalize="words"
                containerStyle={styles.inputContainer}
                style={styles.glassInput}
              />
              <Input
                label="Password"
                placeholder="Min. 8 characters + 1 number"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                containerStyle={styles.inputContainer}
                style={styles.glassInput}
              />
              <Input
                label="Confirm Password"
                placeholder="Repeat your password"
                placeholderTextColor="#94A3B8"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                containerStyle={styles.inputContainer}
                style={styles.glassInput}
              />

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>⚠ {error}</Text>
                </View>
              ) : null}

              <View style={{ height: SPACING.sm }} />

              <Button
                label="Create Account"
                onPress={handleRegister}
                loading={loading}
                style={styles.createButton}
              />

              <Text style={styles.terms}>
                By registering you agree to DormDash's Terms of Service and Privacy Policy
              </Text>
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFDF5',
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },

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
    borderRadius: 300,
    backgroundColor: '#FFD166',
    top: -120,
    right: -80,
    opacity: 0.12,
  },
  waveCircle2: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: '#00B4D8',
    bottom: 100,
    left: -100,
    opacity: 0.08,
  },
  waveBlur1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: '#FFE066',
    top: 300,
    right: -150,
    opacity: 0.06,
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  backBtn: {
    color: '#FFD166',
    fontSize: 15,
    fontWeight: '600',
  },
  stepIndicator: {
    color: '#00B4D8',
    fontSize: 13,
    fontWeight: '600',
  },

  header: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFC107',
    letterSpacing: -1,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#00B4D8',
  },

  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: SPACING.md,
  },
  roleIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  roleInfo: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333333',
    marginBottom: 3,
  },
  roleDescription: {
    fontSize: 13,
    color: '#666666',
  },
  roleCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  continueButton: {
    backgroundColor: '#00B4D8',
    borderRadius: 40,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  glassCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  inputContainer: {
    marginBottom: SPACING.md,
  },
  glassInput: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: '#333333',
    fontSize: 15,
    fontWeight: '500',
  },
  selectedRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 40,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    alignSelf: 'flex-start',
  },
  selectedRoleText: {
    fontSize: 13,
    fontWeight: '700',
  },

  errorBanner: {
    backgroundColor: 'rgba(255, 71, 87, 0.12)',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: '#FF4757',
    marginTop: SPACING.md,
  },
  errorBannerText: {
    color: '#FF8A92',
    fontSize: 13,
    fontWeight: '500',
  },

  createButton: {
    borderRadius: 20,
    height: 54,
    marginTop: SPACING.sm,
    backgroundColor: '#FFD166',
  },

  terms: {
    color: '#666666',
    fontSize: 11,
    textAlign: 'center',
    marginTop: SPACING.md,
    lineHeight: 16,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.lg,
  },
  footerText: {
    color: '#666666',
    fontSize: 14,
  },
  footerLink: {
    color: '#FFD166',
    fontSize: 14,
    fontWeight: '700',
  },
});