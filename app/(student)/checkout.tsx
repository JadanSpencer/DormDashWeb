// app/(student)/checkout.tsx
// Student reviews cart, enters delivery location, places order.
// Professional liquid glassmorphism design.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { collection, addDoc, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';
import { CartItem, Order } from '../../types';
import { COLORS, SPACING, RADIUS, formatJMD, CAMPUS_CENTER } from '../../constants';
import { sanitizeText, sanitizeAddress, sanitizeNote, isValidCoordinate } from '../../services/sanitize';
import * as Location from 'expo-location';

export default function CheckoutScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    storeId: string;
    storeName: string;
    deliveryFee: string;
    cart: string;
  }>();

  const cart: CartItem[] = JSON.parse(params.cart ?? '[]');
  const deliveryFee = parseFloat(params.deliveryFee ?? '0');
  const subtotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);
  const total = subtotal + deliveryFee;

  const [deliveryLabel, setDeliveryLabel] = useState('');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [onlineDashers, setOnlineDashers] = useState<number | null>(null);

  // Capture location in the background while the student fills the form.
  // Silent on failure — the order must never be blocked by GPS.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled && isValidCoordinate(loc.coords.latitude, loc.coords.longitude)) {
          setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch {
        // GPS unavailable — text label will carry the delivery
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Edge case: warn the student when nobody is on shift to accept their order.
  useEffect(() => {
    const q = query(collection(db, 'dashers'), where('isOnline', '==', true));
    return onSnapshot(q, snap => setOnlineDashers(snap.size));
  }, []);

  const validate = (): string | null => {
    if (!deliveryLabel.trim()) return 'Please enter your delivery location.';
    if (deliveryLabel.trim().length < 5) return 'Please be more specific about your delivery location.';
    if (note.length > 200) return 'Note must be under 200 characters.';
    return null;
  };

  const handlePlaceOrder = async () => {
    const cleanLabel = sanitizeAddress(deliveryLabel);
    const cleanNote = sanitizeNote(note);

    if (!cleanLabel || cleanLabel.length < 5) {
      Alert.alert('Missing Info', 'Please enter a specific delivery location.');
      return;
    }
    if (!user) return;

    // One active order at a time — no stacking
const activeSnap = await getDocs(query(
  collection(db, 'orders'),
  where('studentId', '==', user.uid),
  where('status', 'in', ['pending', 'accepted', 'picking_up', 'on_the_way'])
));
if (!activeSnap.empty) {
  Alert.alert('Active Order', 'You already have an order in progress. Wait for it to arrive before placing another.');
  return;
}

    setPlacing(true);
    try {
      const order: Omit<Order, 'id'> = {
        studentId: user.uid,
        studentName: sanitizeText(user.name),
        storeId: params.storeId,
        storeName: sanitizeText(params.storeName),
        items: cart,
        status: 'pending',
        totalAmount: total,
        deliveryFee,
        deliveryAddress: {
          latitude: coords?.latitude ?? CAMPUS_CENTER.latitude,
          longitude: coords?.longitude ?? CAMPUS_CENTER.longitude,
          label: cleanLabel,
          hasGpsFix: coords !== null,
        },
        studentNote: cleanNote || undefined,
        createdAt: Date.now(),
      };

      const docRef = await addDoc(collection(db, 'orders'), order);

      router.replace({
        pathname: '/(student)/order/[id]',
        params: { id: docRef.id },
      });

    } catch (e: any) {
      Alert.alert('Order Failed', e.message ?? 'Could not place order. Try again.');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Wave Background */}
      <View style={styles.waveDecoration} pointerEvents="none">
        <View style={styles.waveCircle1} />
        <View style={styles.waveCircle2} />
        <View style={styles.waveBlur1} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Checkout</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Order Items Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Your Order</Text>
          <View style={styles.card}>
            <Text style={styles.storeName}>{params.storeName}</Text>
            {cart.map((item, idx) => (
              <View key={idx} style={styles.lineItem}>
                <View style={styles.lineLeft}>
                  <View style={styles.quantityBadge}>
                    <Text style={styles.quantityText}>{item.quantity}</Text>
                  </View>
                  <Text style={styles.itemName} numberOfLines={1}>{item.menuItem.name}</Text>
                </View>
                <Text style={styles.itemPrice}>
                  {formatJMD(item.menuItem.price * item.quantity)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Delivery Location Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Delivery Location</Text>
          <View style={styles.card}>
            <Text style={styles.inputLabel}>Where should we deliver?</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Block C, Room 204"
              placeholderTextColor="#64748B"
              value={deliveryLabel}
              onChangeText={setDeliveryLabel}
              maxLength={100}
            />
            <Text style={styles.inputHint}>Be specific so your dasher can find you</Text>
          </View>
        </View>

        {/* Note to Dasher Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Note to Dasher</Text>
          <View style={styles.card}>
            <TextInput
              style={[styles.input, styles.noteInput]}
              placeholder="Special instructions (optional)"
              placeholderTextColor="#64748B"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={200}
            />
            <Text style={styles.charCount}>{note.length}/200</Text>
          </View>
        </View>

        {/* Order Summary Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Summary</Text>
          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatJMD(subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery Fee</Text>
              <Text style={styles.summaryValue}>
                {deliveryFee === 0 ? 'Free' : `${formatJMD(deliveryFee)}`}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatJMD(total)}</Text>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* Place Order Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
        {onlineDashers === 0 && (
          <View style={styles.noDasherWarning}>
            <Text style={styles.noDasherText}>
              ⚠ No dashers online right now — your order may take longer to be accepted.
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.placeButton, placing && styles.placeButtonDisabled]}
          onPress={handlePlaceOrder}
          disabled={placing}
          activeOpacity={0.85}
        >
          {placing ? (
            <ActivityIndicator color="#0A1128" size="small" />
          ) : (
            <Text style={styles.placeButtonText}>Place Order · {formatJMD(total)}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A1128',
  },

  // Wave decoration
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
    backgroundColor: '#1E5FD4',
    top: -80,
    right: -60,
    opacity: 0.05,
  },
  waveCircle2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#F5C842',
    bottom: 50,
    left: -80,
    opacity: 0.04,
  },
  waveBlur1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#0EA5E9',
    top: 200,
    right: -100,
    opacity: 0.03,
  },

  scroll: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 200, 66, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: '#F5C842',
    fontSize: 20,
    fontWeight: '500',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },

  // Sections
  section: {
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    paddingHorizontal: 2,
  },

  // Cards
  card: {
    backgroundColor: 'rgba(18, 28, 50, 0.7)',
    borderRadius: 20,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: SPACING.sm,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F5C842',
    marginBottom: 4,
  },

  // Line items
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  lineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  quantityBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 200, 66, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    color: '#F5C842',
    fontSize: 12,
    fontWeight: '700',
  },
  itemName: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F5C842',
  },

  // Inputs
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: SPACING.md,
    color: '#FFFFFF',
    fontSize: 14,
  },
  noteInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  inputHint: {
    fontSize: 11,
    color: '#64748B',
  },
  charCount: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'right',
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F5C842',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0A1128',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  noDasherWarning: {
    backgroundColor: 'rgba(245, 200, 66, 0.1)',
    borderRadius: 12,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(245, 200, 66, 0.3)',
  },
  noDasherText: {
    color: '#F5C842',
    fontSize: 12,
    textAlign: 'center',
  },
  placeButton: {
    backgroundColor: '#F5C842',
    borderRadius: 40,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F5C842',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  placeButtonDisabled: {
    opacity: 0.6,
  },
  placeButtonText: {
    color: '#0A1128',
    fontSize: 16,
    fontWeight: '700',
  },
});