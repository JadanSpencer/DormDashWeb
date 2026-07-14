// app/(student)/(tabs)/profile.tsx
// Student profile screen — complete account management with CRUD operations.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, TextInput,
  Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '../../../services/firebase';
import { useAuth } from '../../../hooks/useAuth';
import { logoutUser } from '../../../services/auth';
import { COLORS, SPACING, RADIUS } from '../../../constants';
import { isValidPassword } from '../../../services/sanitize';

interface UserProfile {
  name: string;
  email: string;
  phone: string;
  university: string;
  major?: string;
  graduationYear?: string;
  createdAt?: number;
}

export default function StudentProfile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    email: '',
    phone: '',
    university: '',
    major: '',
    graduationYear: '',
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

  useEffect(() => {
    if (user) {
      loadUserProfile();
    }
  }, [user]);

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
      Alert.alert('Success', `${field.replace(/([A-Z])/g, ' $1').trim()} updated successfully`);
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
      setEditModalVisible(false);
    }
  };

  const handleChangePassword = async () => {
    if (!auth.currentUser) return;
    
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    if (!isValidPassword(newPassword)) {
      setPasswordError('Password must be at least 8 characters with a letter and a number.');
      return;
    }
    
    setLoading(true);
    setPasswordError('');
    
    try {
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email!,
        currentPassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      
      Alert.alert('Success', 'Password updated successfully');
      setPasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      if (error.code === 'auth/wrong-password') {
        setPasswordError('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        setPasswordError('Password should be at least 8 characters');
      } else {
        setPasswordError('Failed to update password');
      }
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (field: keyof UserProfile, label: string, currentValue: string) => {
    setEditField(field);
    setEditLabel(label);
    setEditValue(currentValue);
    setEditModalVisible(true);
  };

  const getInitials = () => {
    if (!profile.name) return 'U';
    return profile.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getJoinDate = () => {
    if (profile.createdAt) {
      return new Date(profile.createdAt).toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      });
    }
    return 'Recently';
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            await logoutUser();
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00B4D8" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.waveDecoration} pointerEvents="none">
        <View style={styles.waveCircle1} />
        <View style={styles.waveCircle2} />
        <View style={styles.waveCircle3} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scroll} 
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarRing} />
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials()}</Text>
            </View>
          </View>
          <Text style={styles.userName}>{profile.name || 'Add your name'}</Text>
          <Text style={styles.userEmail}>{profile.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>Student</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
        </View>

        <View style={styles.infoCard}>
          <TouchableOpacity 
            style={styles.infoItem} 
            onPress={() => openEditModal('name', 'Full Name', profile.name)}
            activeOpacity={0.7}
          >
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Full Name</Text>
              <Text style={styles.infoValue}>{profile.name || 'Not specified'}</Text>
            </View>
            <Text style={styles.editIcon}>✎</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.infoItem}>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Email Address</Text>
              <Text style={styles.infoValue}>{profile.email}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <TouchableOpacity 
            style={styles.infoItem} 
            onPress={() => openEditModal('phone', 'Phone Number', profile.phone)}
            activeOpacity={0.7}
          >
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Phone Number</Text>
              <Text style={styles.infoValue}>{profile.phone || 'Not specified'}</Text>
            </View>
            <Text style={styles.editIcon}>✎</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Academic Information</Text>
        </View>

        <View style={styles.infoCard}>
          <TouchableOpacity 
            style={styles.infoItem} 
            onPress={() => openEditModal('university', 'University', profile.university)}
            activeOpacity={0.7}
          >
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>University</Text>
              <Text style={styles.infoValue}>{profile.university || 'Not specified'}</Text>
            </View>
            <Text style={styles.editIcon}>✎</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity 
            style={styles.infoItem} 
            onPress={() => openEditModal('major', 'Major', profile.major || '')}
            activeOpacity={0.7}
          >
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Major / Field of Study</Text>
              <Text style={styles.infoValue}>{profile.major || 'Not specified'}</Text>
            </View>
            <Text style={styles.editIcon}>✎</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity 
            style={styles.infoItem} 
            onPress={() => openEditModal('graduationYear', 'Graduation Year', profile.graduationYear || '')}
            activeOpacity={0.7}
          >
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Expected Graduation</Text>
              <Text style={styles.infoValue}>{profile.graduationYear || 'Not specified'}</Text>
            </View>
            <Text style={styles.editIcon}>✎</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoItem}>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Member Since</Text>
              <Text style={styles.infoValue}>{getJoinDate()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <TouchableOpacity 
            style={styles.infoItem} 
            onPress={() => setPasswordModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Password</Text>
              <Text style={styles.infoValue}>••••••••</Text>
            </View>
            <Text style={styles.editIcon}>✎</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.85}
        >
          <Text style={styles.logoutText}>
            {loggingOut ? 'Signing out...' : 'Sign Out'}
          </Text>
        </TouchableOpacity>

      </ScrollView>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit {editLabel}</Text>
            <TextInput
              style={styles.modalInput}
              value={editValue}
              onChangeText={setEditValue}
              placeholder={editLabel}
              placeholderTextColor="#94A3B8"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalSave]}
                onPress={() => editField && updateProfileField(editField, editValue)}
                disabled={loading}
              >
                <Text style={[styles.modalButtonText, styles.modalSaveText]}>
                  {loading ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            
            <TextInput
              style={styles.modalInput}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current Password"
              placeholderTextColor="#94A3B8"
              secureTextEntry
            />
            
            <TextInput
              style={styles.modalInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New Password"
              placeholderTextColor="#94A3B8"
              secureTextEntry
            />
            
            <TextInput
              style={styles.modalInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm New Password"
              placeholderTextColor="#94A3B8"
              secureTextEntry
            />
            
            {passwordError ? (
              <Text style={styles.errorText}>{passwordError}</Text>
            ) : null}
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => {
                  setPasswordModalVisible(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setPasswordError('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalSave]}
                onPress={handleChangePassword}
                disabled={loading}
              >
                <Text style={[styles.modalButtonText, styles.modalSaveText]}>
                  {loading ? 'Updating...' : 'Update'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F0F9FF',
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
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#00B4D8',
    top: -80,
    right: -60,
    opacity: 0.08,
  },
  waveCircle2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#FFD166',
    bottom: 50,
    left: -80,
    opacity: 0.06,
  },
  waveCircle3: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#0096C7',
    top: '40%',
    right: -50,
    opacity: 0.05,
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    color: '#64748B',
    fontSize: 14,
  },
  header: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#023E8A',
    letterSpacing: -0.5,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  avatarRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(0, 180, 216, 0.15)',
    top: -6,
    left: -6,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(0, 180, 216, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#00B4D8',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#00B4D8',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#023E8A',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: SPACING.sm,
  },
  roleBadge: {
    backgroundColor: 'rgba(0, 180, 216, 0.1)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 180, 216, 0.3)',
  },
  roleText: {
    color: '#00B4D8',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionHeader: {
    marginBottom: SPACING.sm,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 180, 216, 0.15)',
    marginBottom: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#023E8A',
  },
  editIcon: {
    fontSize: 16,
    color: '#FFD166',
    paddingHorizontal: SPACING.sm,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  logoutButton: {
    backgroundColor: 'rgba(255, 71, 87, 0.12)',
    borderRadius: 40,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 71, 87, 0.3)',
    marginTop: SPACING.lg,
  },
  logoutText: {
    color: '#FF8A92',
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: SPACING.lg,
    width: '85%',
    borderWidth: 1,
    borderColor: 'rgba(0, 180, 216, 0.2)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#023E8A',
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: SPACING.md,
    color: '#023E8A',
    fontSize: 15,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancel: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalSave: {
    backgroundColor: '#FFD166',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  modalSaveText: {
    color: '#023E8A',
  },
  errorText: {
    color: '#FF8A92',
    fontSize: 12,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
});