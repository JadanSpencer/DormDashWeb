// components/AccountActions.tsx
// Self-service account deactivation and deletion.
//
// Google Play requires any app with account creation to offer in-app account
// deletion (deactivation alone does not satisfy the policy), plus a web page
// for the same request. This component is the in-app half.
//
// Flow: choose action → read exactly what happens → confirm with password
// (Firebase requires a recent login before destructive auth operations) →
// server does the work → signed out.
//
// Works on both palettes: pass `dark` on the dasher screens.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, Pressable,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../services/firebase';
import { deactivateMyAccount, deleteMyAccount } from '../services/users';
import { logoutUser } from '../services/auth';
import { clearPushToken } from '../services/notifications';
import { router } from 'expo-router';

type Action = 'deactivate' | 'delete';

const LIGHT = {
  sheet: '#FFFDF9',
  text: '#2B1514',
  soft: '#6B4B45',
  faint: '#9E847D',
  field: '#FAF5EC',
  line: 'rgba(43, 21, 20, 0.12)',
  danger: '#C94F4F',
  dangerTint: '#F9E9E9',
  warning: '#D9963A',
  warningTint: '#FBF1E1',
};

const DARK = {
  sheet: '#2B1519',
  text: '#FAF5EC',
  soft: '#DCC5BE',
  faint: '#B89E97',
  field: '#1C0E10',
  line: 'rgba(250, 245, 236, 0.12)',
  danger: '#E36B6B',
  dangerTint: 'rgba(227, 107, 107, 0.14)',
  warning: '#E5B04C',
  warningTint: 'rgba(229, 176, 76, 0.14)',
};

export const AccountActions: React.FC<{ dark?: boolean }> = ({ dark }) => {
  const C = dark ? DARK : LIGHT;

  const [action, setAction] = useState<Action | null>(null);
  const [stage, setStage] = useState<'explain' | 'confirm'>('explain');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = (a: Action) => {
    setAction(a); setStage('explain'); setPassword(''); setError('');
  };

  const close = () => {
    if (busy) return;
    setAction(null); setPassword(''); setError('');
  };

  const run = async () => {
    if (!auth.currentUser?.email) return;
    if (!password) { setError('Enter your password to confirm.'); return; }

    setBusy(true);
    setError('');

    try {
      // Firebase refuses destructive operations on a stale session.
      const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
      await reauthenticateWithCredential(auth.currentUser, credential);

      const uid = auth.currentUser.uid;

      // Detach alerts only once the server has agreed: a refused delete
      // (tokens left, order in progress) must leave this device's alerts on.
      if (action === 'delete') {
        await deleteMyAccount();
        await clearPushToken(uid);
        Alert.alert(
          'Account deleted',
          'Your account and personal information have been removed. Thanks for using Runner.'
        );
      } else {
        await deactivateMyAccount();
        await clearPushToken(uid);
        Alert.alert(
          'Account deactivated',
          'You will not be able to sign in until it is restored. Message support to come back.'
        );
      }

      await logoutUser();
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code.includes('wrong-password') || code.includes('invalid-credential')) {
        setError('That password is not correct.');
      } else if (code.includes('too-many-requests')) {
        setError('Too many attempts. Try again in a few minutes.');
      } else if (e?.message?.includes('order in progress')) {
        setError('You have an order in progress. Finish it first.');
      } else {
        setError(e?.message ?? 'Something went wrong. Try again.');
      }
      setBusy(false);
    }
  };

  const isDelete = action === 'delete';

  return (
    <>
      {/* Entry points */}
      <Text style={[styles.sectionLabel, { color: C.faint }]}>Account controls</Text>

      <Pressable
        onPress={() => open('deactivate')}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: C.warningTint, borderColor: C.warning + '55' },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: C.warning }]}>Deactivate account</Text>
          <Text style={[styles.rowSub, { color: C.soft }]}>
            Pause your account. Nothing is deleted, and you can come back.
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={() => open('delete')}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: C.dangerTint, borderColor: C.danger + '55' },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: C.danger }]}>Delete account</Text>
          <Text style={[styles.rowSub, { color: C.soft }]}>
            Permanently remove your account and personal information.
          </Text>
        </View>
      </Pressable>

      {/* Modal */}
      {/* Legal */}
      <View style={styles.legalRow}>
        <Text accessibilityRole="link" onPress={() => router.push('/legal/privacy' as any)} style={[styles.legalLink, { color: C.soft }]}>
          Privacy Policy
        </Text>
        <Text accessibilityRole="link" onPress={() => router.push('/legal/terms' as any)} style={[styles.legalLink, { color: C.soft }]}>
          Terms of Service
        </Text>
      </View>

      <Modal visible={action !== null} transparent animationType="fade" onRequestClose={close}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <Pressable style={styles.backdrop} onPress={close} />

          <View style={[styles.sheet, { backgroundColor: C.sheet }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.sheetEyebrow, { color: isDelete ? C.danger : C.warning }]}>
                {isDelete ? 'Permanent' : 'Reversible'}
              </Text>
              <Text style={[styles.sheetTitle, { color: C.text }]}>
                {isDelete ? 'Delete your account' : 'Deactivate your account'}
              </Text>

              {stage === 'explain' ? (
                <>
                  {isDelete ? (
                    <>
                      <Text style={[styles.body, { color: C.soft }]}>Here is exactly what happens:</Text>
                      <Bullet C={C} text="Your profile, contact details and login are deleted." />
                      <Bullet C={C} text="Your name, delivery addresses and order notes are removed from every past order." />
                      <Bullet C={C} text="If you were a runner, your earnings history and runner profile are deleted." />
                      <Bullet C={C} text="Past orders stay in our records as anonymous transactions, with no name or address, because merchants and tax records require them." />
                      <Bullet C={C} text="This cannot be undone. You would need to register again from scratch." />
                    </>
                  ) : (
                    <>
                      <Text style={[styles.body, { color: C.soft }]}>Here is exactly what happens:</Text>
                      <Bullet C={C} text="You are signed out and cannot sign in again until the account is restored." />
                      <Bullet C={C} text="If you dash, you go offline and stop receiving orders." />
                      <Bullet C={C} text="Nothing is deleted. Your history and earnings are kept." />
                      <Bullet C={C} text="Message Runner support to reactivate." />
                    </>
                  )}

                  <View style={styles.actions}>
                    <Pressable
                      onPress={close}
                      style={({ pressed }) => [styles.btn, { backgroundColor: C.field }, pressed && { opacity: 0.8 }]}
                    >
                      <Text style={[styles.btnText, { color: C.text }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setStage('confirm')}
                      style={({ pressed }) => [
                        styles.btn,
                        { backgroundColor: isDelete ? C.danger : C.warning },
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <Text style={[styles.btnText, { color: '#FFFFFF' }]}>Continue</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.body, { color: C.soft }]}>
                    Enter your password to confirm you are the account owner.
                  </Text>

                  <TextInput
                    style={[styles.input, { backgroundColor: C.field, color: C.text, borderColor: C.line }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Your password"
                    placeholderTextColor={C.faint}
                    secureTextEntry
                    autoFocus
                    editable={!busy}
                  />

                  {error ? (
                    <View style={[styles.errorBox, { backgroundColor: C.dangerTint, borderLeftColor: C.danger }]}>
                      <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
                    </View>
                  ) : null}

                  <View style={styles.actions}>
                    <Pressable
                      onPress={close}
                      disabled={busy}
                      style={({ pressed }) => [styles.btn, { backgroundColor: C.field }, (pressed || busy) && { opacity: 0.7 }]}
                    >
                      <Text style={[styles.btnText, { color: C.text }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={run}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.btn,
                        { backgroundColor: isDelete ? C.danger : C.warning },
                        (pressed || busy) && { opacity: 0.9 },
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={[styles.btnText, { color: '#FFFFFF' }]}>
                          {isDelete ? 'Delete forever' : 'Deactivate'}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const Bullet: React.FC<{ C: typeof LIGHT; text: string }> = ({ C, text }) => (
  <View style={styles.bulletRow}>
    <View style={[styles.bulletDot, { backgroundColor: C.faint }]} />
    <Text style={[styles.bulletText, { color: C.soft }]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  legalRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 20, marginBottom: 8 },
  legalLink: { fontSize: 13, textDecorationLine: 'underline' },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.2,
    paddingHorizontal: 24, paddingTop: 24, paddingBottom: 10,
  },
  row: {
    marginHorizontal: 24, marginBottom: 10,
    borderRadius: 20, padding: 16,
    borderWidth: 1,
  },
  rowTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  rowSub: { fontSize: 12, fontWeight: '500', marginTop: 3, lineHeight: 17 },

  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(43, 21, 20, 0.55)' },
  sheet: {
    width: '100%', maxHeight: '82%',
    borderRadius: 28, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  sheetEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  sheetTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginTop: 4, marginBottom: 14 },
  body: { fontSize: 14, fontWeight: '500', lineHeight: 20, marginBottom: 12 },

  bulletRow: { flexDirection: 'row', gap: 10, marginBottom: 9, paddingRight: 4 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 19 },

  input: {
    height: 50, borderRadius: 16, paddingHorizontal: 16,
    borderWidth: 1.5, fontSize: 15, fontWeight: '500',
    marginTop: 4, marginBottom: 12,
  },
  errorBox: { borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, height: 50, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  btnText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
});

export default AccountActions;
