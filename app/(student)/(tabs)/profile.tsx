// app/(student)/(tabs)/profile.tsx
// DormDash — Profile (Route identity).
// FUNCTIONALITY UNCHANGED. Same handlers: loadUserProfile, updateProfileField,
// handleChangePassword (reauth + updatePassword), handleLogout.
// Same two modals (field edit + password change), same isValidPassword gate.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '../../../services/firebase';
import { useAuth } from '../../../hooks/useAuth';
import { logoutUser } from '../../../services/auth';
import { isValidPassword } from '../../../services/sanitize';
import { T } from '../../../constants/theme';
import { AccountActions } from '../../../components/AccountActions';

interface UserProfile {
  name: string; email: string; phone: string;
  university: string; major?: string; graduationYear?: string;
  createdAt?: number;
}

export default function StudentProfile() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    name: '', email: '', phone: '',
    university: '', major: '', graduationYear: '',
    createdAt: undefined,
  });

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editField, setEditField] = useState<keyof UserProfile | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');

  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => { if (user) loadUserProfile(); }, [user]);

  const loadUserProfile = async () => {
    if (!user) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setProfile({
          name: data.name || '',
          email: user.email || '',
          phone: data.phone || '',
          university: data.university || '',
          major: data.major || '',
          graduationYear: data.graduationYear || '',
          createdAt: data.createdAt,
        });
      } else {
        console.warn('User profile document missing for uid: ', user.uid);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const updateProfileField = async (field: keyof UserProfile, value: string) => {
    if (!user) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { [field]: value });
      setProfile(prev => ({ ...prev, [field]: value }));
      Alert.alert('Saved', `${field.replace(/([A-Z])/g, ' $1').trim()} updated.`);
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
      setEditModalVisible(false);
    }
  };

  const handleChangePassword = async () => {
    if (!auth.currentUser) return;
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    if (!isValidPassword(newPassword)) {
      setPasswordError('Password must be at least 8 characters with a letter and a number.');
      return;
    }
    setLoading(true);
    setPasswordError('');
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email!, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      Alert.alert('Success', 'Password updated successfully');
      setPasswordModalVisible(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (error: any) {
      if (error.code === 'auth/wrong-password') setPasswordError('Current password is incorrect');
      else if (error.code === 'auth/weak-password') setPasswordError('Password should be at least 8 characters');
      else setPasswordError('Failed to update password');
    } finally { setLoading(false); }
  };

  const openEditModal = (field: keyof UserProfile, label: string, currentValue: string) => {
    setEditField(field); setEditLabel(label); setEditValue(currentValue);
    setEditModalVisible(true);
  };

  const getInitials = () => {
    if (!profile.name) return 'U';
    return profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getJoinDate = () => {
    if (profile.createdAt) {
      return new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return 'Recently';
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => { setLoggingOut(true); await logoutUser(); },
      },
    ]);
  };

  if (!user) {
    return (
      <View style={styles.root}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={T.color.cerulean} />
          <Text style={styles.loadingText}>Loading profile…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      >
        <View style={[styles.header, { paddingTop: insets.top + T.space.md }]}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* Avatar block */}
        <View style={styles.avatarBlock}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing} />
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials()}</Text>
            </View>
          </View>
          <Text style={styles.userName}>{profile.name || 'Add your name'}</Text>
          <Text style={styles.userEmail}>{profile.email}</Text>
          <View style={styles.roleBadge}>
            <View style={styles.roleDot} />
            <Text style={styles.roleText}>Student</Text>
          </View>
        </View>

        {/* Personal */}
        <Text style={styles.sectionLabel}>Personal information</Text>
        <View style={styles.card}>
          <InfoRow label="Full name" value={profile.name} onPress={() => openEditModal('name', 'Full Name', profile.name)} />
          <Divider />
          <InfoRow label="Email address" value={profile.email} />
          <Divider />
          <InfoRow label="Phone number" value={profile.phone} onPress={() => openEditModal('phone', 'Phone Number', profile.phone)} />
        </View>

        {/* Academic */}
        <Text style={styles.sectionLabel}>Academic</Text>
        <View style={styles.card}>
          <InfoRow label="University" value={profile.university} onPress={() => openEditModal('university', 'University', profile.university)} />
          <Divider />
          <InfoRow label="Major" value={profile.major || ''} onPress={() => openEditModal('major', 'Major', profile.major || '')} />
          <Divider />
          <InfoRow label="Expected graduation" value={profile.graduationYear || ''} onPress={() => openEditModal('graduationYear', 'Graduation Year', profile.graduationYear || '')} />
        </View>

        {/* Account */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <InfoRow label="Member since" value={getJoinDate()} />
          <Divider />
          <InfoRow label="Password" value="••••••••" onPress={() => setPasswordModalVisible(true)} />
        </View>

        {/* Deactivate / delete — required by Google Play for apps with accounts */}
        <AccountActions />

        {/* Sign out */}
        <Pressable
          onPress={handleLogout}
          disabled={loggingOut}
          style={({ pressed }) => [
            styles.signOutBtn,
            pressed && { transform: [{ scale: 0.98 }] },
            loggingOut && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.signOutText}>
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Edit modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setEditModalVisible(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>Editing</Text>
            <Text style={styles.modalTitle}>{editLabel}</Text>
            <TextInput
              style={styles.modalInput}
              value={editValue}
              onChangeText={setEditValue}
              placeholder={editLabel}
              placeholderTextColor={T.color.inkFaint}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setEditModalVisible(false)}
                style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => editField && updateProfileField(editField, editValue)}
                disabled={loading}
                style={({ pressed }) => [styles.modalSave, pressed && { transform: [{ scale: 0.97 }] }]}
              >
                {loading ? (
                  <ActivityIndicator color={T.color.card} />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Password modal */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setPasswordModalVisible(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>Security</Text>
            <Text style={styles.modalTitle}>Change password</Text>

            <TextInput
              style={styles.modalInput}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current password"
              placeholderTextColor={T.color.inkFaint}
              secureTextEntry
            />
            <TextInput
              style={styles.modalInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              placeholderTextColor={T.color.inkFaint}
              secureTextEntry
            />
            <TextInput
              style={styles.modalInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor={T.color.inkFaint}
              secureTextEntry
            />

            {passwordError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{passwordError}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setPasswordModalVisible(false);
                  setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
                  setPasswordError('');
                }}
                style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleChangePassword}
                disabled={loading}
                style={({ pressed }) => [styles.modalSave, pressed && { transform: [{ scale: 0.97 }] }]}
              >
                {loading ? (
                  <ActivityIndicator color={T.color.card} />
                ) : (
                  <Text style={styles.modalSaveText}>Update</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Row + Divider ─────────────────────────────────────────────────
const InfoRow: React.FC<{ label: string; value: string; onPress?: () => void }> = ({ label, value, onPress }) => {
  const content = (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value || <Text style={styles.rowValueMuted}>Not specified</Text>}</Text>
      </View>
      {onPress && <Text style={styles.editIcon}>✎</Text>}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && { backgroundColor: T.color.creamDeep }]}
    >
      {content}
    </Pressable>
  );
};

const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.cream },

  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 },
  blobTeal: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: T.color.teal, opacity: 0.06,
    top: -80, right: -100,
  },
  blobCerulean: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: T.color.cerulean, opacity: 0.05,
    top: 260, left: -110,
  },

  header: { paddingHorizontal: T.space.lg, paddingBottom: T.space.md },
  eyebrow: { ...T.type.label, color: T.color.teal, marginBottom: 4 },
  title: { ...T.type.display, color: T.color.ink },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: T.space.md },
  loadingText: { ...T.type.body, color: T.color.inkSoft },

  // Avatar
  avatarBlock: {
    alignItems: 'center',
    marginBottom: T.space.xl,
    marginTop: T.space.md,
    paddingHorizontal: T.space.lg,
  },
  avatarWrap: { position: 'relative', marginBottom: T.space.md },
  avatarRing: {
    position: 'absolute',
    width: 108, height: 108, borderRadius: 54,
    borderWidth: 2,
    borderColor: T.color.cerulean,
    top: -6, left: -6,
    opacity: 0.4,
  },
  avatar: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: T.color.ceruleanTint,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: T.color.cerulean,
  },
  avatarText: { fontSize: 38, fontWeight: '900', color: T.color.cerulean, letterSpacing: -1 },
  userName: { ...T.type.title, fontSize: 22, color: T.color.ink, marginTop: T.space.sm },
  userEmail: { ...T.type.body, fontSize: 13, color: T.color.inkSoft, marginTop: 2 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: T.space.sm,
    backgroundColor: T.color.tealTint,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: T.radius.pill,
  },
  roleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.color.teal },
  roleText: { fontSize: 11, fontWeight: '800', color: T.color.teal, letterSpacing: 0.8 },

  // Section
  sectionLabel: {
    ...T.type.label,
    color: T.color.teal,
    paddingHorizontal: T.space.lg,
    paddingTop: T.space.md,
    paddingBottom: T.space.sm,
  },
  card: {
    backgroundColor: T.color.card,
    marginHorizontal: T.space.lg,
    borderRadius: T.radius.lg,
    borderWidth: 1, borderColor: T.color.line,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: T.space.md, paddingVertical: T.space.md,
    gap: T.space.sm,
  },
  rowLabel: { ...T.type.label, color: T.color.inkFaint, fontSize: 10 },
  rowValue: { ...T.type.body, fontSize: 14, fontWeight: '700', color: T.color.ink },
  rowValueMuted: { color: T.color.inkFaint, fontWeight: '600' },
  editIcon: { fontSize: 16, color: T.color.cerulean, fontWeight: '700' },
  divider: { height: 1, backgroundColor: T.color.line, marginHorizontal: T.space.md },

  // Sign out
  signOutBtn: {
    marginHorizontal: T.space.lg,
    marginTop: T.space.xl,
    backgroundColor: T.color.dangerTint,
    borderRadius: T.radius.pill,
    height: 52,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201, 79, 79, 0.25)',
  },
  signOutText: { color: T.color.danger, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(18, 51, 59, 0.5)',
  },
  modalCard: {
    width: '86%',
    backgroundColor: T.color.card,
    borderRadius: T.radius.xl,
    padding: T.space.lg,
    ...T.shadow.card,
    shadowOpacity: 0.06,
    gap: T.space.sm,
  },
  modalEyebrow: { ...T.type.label, color: T.color.teal, marginBottom: -2 },
  modalTitle: { ...T.type.title, fontSize: 22, color: T.color.ink, marginBottom: T.space.sm },
  modalInput: {
    backgroundColor: T.color.cream,
    borderWidth: 1.5, borderColor: T.color.line,
    borderRadius: T.radius.md,
    height: 50, paddingHorizontal: T.space.md,
    color: T.color.ink,
    ...T.type.body,
    marginBottom: T.space.sm,
  },
  modalActions: {
    flexDirection: 'row', gap: T.space.sm, marginTop: T.space.sm,
  },
  modalCancel: {
    flex: 1,
    backgroundColor: T.color.creamDeep,
    borderRadius: T.radius.pill,
    height: 48,
    justifyContent: 'center', alignItems: 'center',
  },
  modalCancelText: { color: T.color.ink, fontSize: 14, fontWeight: '800' },
  modalSave: {
    flex: 1,
    backgroundColor: T.color.cerulean,
    borderRadius: T.radius.pill,
    height: 48,
    justifyContent: 'center', alignItems: 'center',
    ...T.shadow.button,
    shadowOpacity: 0.06,
  },
  modalSaveText: { color: T.color.card, fontSize: 14, fontWeight: '800' },

  errorBanner: {
    backgroundColor: T.color.dangerTint,
    borderRadius: T.radius.sm,
    padding: T.space.sm,
    marginBottom: T.space.sm,
  },
  errorText: { ...T.type.body, fontSize: 13, color: T.color.danger, fontWeight: '600' },
});
