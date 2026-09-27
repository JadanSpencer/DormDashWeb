// app/(student)/checkout.tsx
// DormDash — Checkout (Route identity).
//
// FUNCTIONALITY UNCHANGED. All handlers preserved: GPS capture with
// permission fallback to CAMPUS_CENTER, no-dashers listener, active-order
// gate (getDocs check), sanitizeText/Address/Note, order placement with
// hasGpsFix flag, hand-off to order/[id].
//
// Visual layer:
//   • Cream canvas, ink type, cerulean action.
//   • Editorial header. Store context chip below.
//   • Cart summary — each line has qty badge, name, HOLLOWED price.
//   • Delivery location + note in soft-plate inputs.
//   • Summary card — subtotal, delivery, HOLLOWED total.
//   • No-dashers banner (danger-tint) sits above CTA.
//   • Place-order pill: cerulean, disabled state, spinner while placing.
//   • Sticky footer with proper safe-area padding.

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TouchableOpacity, TextInput, Alert, ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { collection, doc, addDoc, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';
import { CartItem, Order } from '../../types';
import { formatJMD, CAMPUS_CENTER, MAX_ACTIVE_ORDERS } from '../../constants';
import { serverNow } from '../../services/serverClock';
import { usePriceUnit } from '../../hooks/usePriceUnit';
import { PriceUnitToggle } from '../../components/PriceUnitToggle';
import { sanitizeText, sanitizeAddress, sanitizeNote, isValidCoordinate } from '../../services/sanitize';
import { T } from '../../constants/theme';
import * as Location from 'expo-location';

// Fallback-safe back — matches store screen behaviour.
const safeGoBack = () => {
  if (router.canGoBack()) router.back();
  else router.replace('/(student)/(tabs)/home');
};

export default function CheckoutScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    storeId: string; storeName: string; deliveryFee: string; cart: string;
  }>();

  const cart: CartItem[] = JSON.parse(params.cart ?? '[]');
  const deliveryFee = parseFloat(params.deliveryFee ?? '0');
  const subtotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);
  const total = subtotal + deliveryFee;

  // Payment happens after a dasher accepts: the student then chooses their
  // tokens or their card (app/(student)/order/[id].tsx). Nothing is chosen
  // or charged here. Prices show in J$ or tokens.
  const { fmt } = usePriceUnit();

  const [deliveryLabel, setDeliveryLabel] = useState('');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  // Synchronous lock. `placing` is React state, so it only takes effect on the
  // next render; fast taps (or taps while the network is slow) all got
  // through before it did, and one tap-burst created 9 orders at once.
  const placingRef = useRef(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [onlineDashers, setOnlineDashers] = useState<number | null>(null);
  const [focused, setFocused] = useState<'address' | 'note' | null>(null);

  // Motion — press feedback on the CTA
  const ctaScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled && isValidCoordinate(loc.coords.latitude, loc.coords.longitude)) {
          setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch {
        // GPS silent — text label carries the delivery
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // dashers/* is private, so the server keeps a public count
  // (onDasherOnlineChanged). Missing doc = unknown, so no warning is shown.
  useEffect(() => onSnapshot(doc(db, 'publicStats', 'app'), snap => {
    const n = snap.data()?.onlineDashers;
    setOnlineDashers(typeof n === 'number' ? n : null);
  }, () => setOnlineDashers(null)), []);

  const handlePlaceOrder = async () => {
    const cleanLabel = sanitizeAddress(deliveryLabel);
    const cleanNote = sanitizeNote(note);

    // Real campus addresses are short — "C204", "Blk A", "Rm 12" are all valid.
    // Only reject genuinely empty input, with a message that says what's wrong.
    if (!cleanLabel) {
      Alert.alert('Where should we deliver?', 'Enter your hall, block and room so your dasher can find you.');
      return;
    }
    if (cleanLabel.length < 3) {
      Alert.alert('Add a little more detail', 'Your dasher needs enough to find you, for example "Block C, Room 204".');
      return;
    }
    if (!user) return;
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      // Up to MAX_ACTIVE_ORDERS in progress at once (the server enforces
      // the same limit in verifyNewOrder).
      const activeSnap = await getDocs(query(
        collection(db, 'orders'),
        where('studentId', '==', user.uid),
        where('status', 'in', ['pending', 'accepted', 'picking_up', 'on_the_way'])
      ));
      if (activeSnap.size >= MAX_ACTIVE_ORDERS) {
        Alert.alert(
          'Order limit reached',
          `You can have up to ${MAX_ACTIVE_ORDERS} orders in progress at once. Wait for one to arrive, then order again.`
        );
        return;
      }

      // Firestore rejects `undefined` field values outright, which is why an
      // empty note used to throw "Function addDoc() called with invalid data".
      // The note is optional, so when it's blank the key is simply not written.
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
        createdAt: serverNow(),
        // "Pay after a dasher accepts". The student picks tokens or card
        // then; the server switches this to 'tokens' if they use tokens.
        paymentMethod: 'card',
        ...(cleanNote ? { studentNote: cleanNote } : {}),
      };

      const docRef = await addDoc(collection(db, 'orders'), order);
      router.replace({ pathname: '/(student)/order/[id]', params: { id: docRef.id } });
    } catch (e: any) {
      Alert.alert('Order Failed', e.message ?? 'Could not place order. Try again.');
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 160 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + T.space.md }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={safeGoBack} style={styles.backBtn} hitSlop={12}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.eyebrow}>Reviewing your order from</Text>
          <Text style={styles.storeName}>{params.storeName}</Text>
          <View style={{ marginTop: T.space.sm }}><PriceUnitToggle /></View>
        </View>

        {/* Cart summary */}
        <Text style={styles.sectionLabel}>Your order</Text>
        <View style={styles.card}>
          {cart.map((item, i) => (
            <View key={i} style={styles.lineItem}>
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyBadgeText}>{item.quantity}</Text>
              </View>
              <Text style={styles.itemName} numberOfLines={1}>{item.menuItem.name}</Text>
              <View style={styles.itemPricePlate}>
                <Text style={styles.itemPriceText}>
                  {fmt(item.menuItem.price * item.quantity)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Delivery */}
        <Text style={styles.sectionLabel}>Delivery location</Text>
        <View style={styles.card}>
          <Text style={styles.inputHint}>Where should we deliver?</Text>
          <TextInput
            style={[styles.input, focused === 'address' && styles.inputFocused]}
            placeholder="Block C, Room 204"
            placeholderTextColor={T.color.inkFaint}
            value={deliveryLabel}
            onChangeText={setDeliveryLabel}
            onFocus={() => setFocused('address')}
            onBlur={() => setFocused(null)}
            maxLength={100}
          />
          <Text style={styles.gpsHint}>
            {coords ? 'Location pinned. Your dasher gets a map pin.' : 'No location pin. Your dasher will go by the address you type.'}
          </Text>
        </View>

        {/* Note — genuinely optional */}
        <Text style={styles.sectionLabel}>Note to dasher · optional</Text>
        <View style={styles.card}>
          <TextInput
            style={[styles.input, styles.noteInput, focused === 'note' && styles.inputFocused]}
            placeholder="Allergies, gate code, landmark… (you can skip this)"
            placeholderTextColor={T.color.inkFaint}
            value={note}
            onChangeText={setNote}
            onFocus={() => setFocused('note')}
            onBlur={() => setFocused(null)}
            multiline
            maxLength={200}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{note.length}/200</Text>
        </View>

        {/* Payment */}
        <Text style={styles.sectionLabel}>Payment</Text>
        <View style={styles.card}>
          <Text style={styles.payTitle}>Pay after a dasher accepts</Text>
          <Text style={styles.paySub}>
            Nothing is charged now. When a dasher accepts, you'll get a notification and choose how to pay: with your DormDash tokens or by card. You then have 10 minutes to pay.
          </Text>
        </View>

        {/* Summary */}
        <Text style={styles.sectionLabel}>Summary</Text>
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{fmt(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery</Text>
            <Text style={[styles.summaryValue, deliveryFee === 0 && { color: T.color.teal, fontWeight: '900' }]}>
              {deliveryFee === 0 ? 'Free' : fmt(deliveryFee)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <View style={styles.totalPlate}>
              <Text style={styles.totalText}>{fmt(total)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + T.space.md }]}>
        {onlineDashers === 0 && (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              No dashers are online right now, so your order may take longer to be accepted.
            </Text>
          </View>
        )}
        <Pressable
          onPress={handlePlaceOrder}
          disabled={placing}
          onPressIn={() => Animated.spring(ctaScale, { toValue: 0.97, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(ctaScale, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
        >
          <Animated.View style={[styles.cta, placing && styles.ctaBusy, { transform: [{ scale: ctaScale }] }]}>
            {placing ? (
              <ActivityIndicator color={T.color.card} />
            ) : (
              <>
                <Text style={styles.ctaText}>Place order</Text>
                <View style={styles.ctaTotalPlate}>
                  <Text style={styles.ctaTotalText}>{fmt(total)}</Text>
                </View>
              </>
            )}
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.cream },

  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 },
  blobTeal: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: T.color.teal, opacity: 0.06,
    top: -80, right: -80,
  },
  blobCerulean: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: T.color.cerulean, opacity: 0.05,
    top: 300, left: -100,
  },

  header: { paddingHorizontal: T.space.lg, paddingBottom: T.space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: T.space.md },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: T.color.card,
    justifyContent: 'center', alignItems: 'center',
    ...T.shadow.card,
  },
  backText: { fontSize: 20, fontWeight: '700', color: T.color.ink },
  eyebrow: { ...T.type.label, color: T.color.teal, marginBottom: 4 },
  storeName: { ...T.type.display, fontSize: 30, color: T.color.ink },

  sectionLabel: {
    ...T.type.label,
    color: T.color.inkSoft,
    paddingHorizontal: T.space.lg,
    paddingTop: T.space.lg,
    paddingBottom: T.space.sm,
  },
  card: {
    backgroundColor: T.color.card,
    marginHorizontal: T.space.lg,
    borderRadius: T.radius.lg,
    padding: T.space.md,
    borderWidth: 1, borderColor: T.color.line,
    gap: T.space.sm,
  },

  // Cart lines
  lineItem: {
    flexDirection: 'row', alignItems: 'center', gap: T.space.sm,
    paddingVertical: 4,
  },
  qtyBadge: {
    minWidth: 28, height: 28, borderRadius: 8,
    backgroundColor: T.color.ceruleanTint,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 1, borderColor: 'rgba(14, 143, 181, 0.2)',
  },
  qtyBadgeText: { color: T.color.cerulean, fontSize: 12, fontWeight: '900' },
  itemName: { flex: 1, ...T.type.body, fontSize: 14, color: T.color.ink, fontWeight: '600' },
  itemPricePlate: {},
  itemPriceText: { fontSize: 14, fontWeight: '800', color: T.color.ink, letterSpacing: -0.2 },

  // Inputs
  inputHint: { ...T.type.label, color: T.color.inkFaint, fontSize: 10, marginBottom: 4 },
  input: {
    backgroundColor: T.color.cream,
    borderWidth: 1.5, borderColor: T.color.line,
    borderRadius: T.radius.md,
    height: 50, paddingHorizontal: T.space.md,
    color: T.color.ink,
    ...T.type.body,
  },
  inputFocused: { borderColor: T.color.cerulean, backgroundColor: T.color.card },
  noteInput: { height: 84, paddingTop: T.space.sm },
  gpsHint: { fontSize: 11, color: T.color.inkFaint, marginTop: 4 },
  charCount: { fontSize: 11, color: T.color.inkFaint, textAlign: 'right', marginTop: 4 },

  // Summary
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payOpt: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: T.space.sm, borderRadius: T.radius.md,
    borderWidth: 1.5, borderColor: T.color.line, backgroundColor: T.color.cream,
  },
  payOptOn: { borderColor: T.color.cerulean, backgroundColor: T.color.card },
  radio: {
    width: 20, height: 20, borderRadius: 10, marginTop: 2,
    borderWidth: 2, borderColor: T.color.inkFaint, alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: T.color.cerulean },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.color.cerulean },
  payTitle: { fontSize: 15, fontWeight: '800', color: T.color.ink },
  paySub: { fontSize: 12, lineHeight: 17, color: T.color.inkSoft, marginTop: 2 },
  payLink: { fontSize: 14, fontWeight: '800', color: T.color.ceruleanDeep, textDecorationLine: 'underline', paddingTop: 4 },
  summaryLabel: { ...T.type.body, fontSize: 14, color: T.color.inkSoft },
  summaryValue: { ...T.type.body, fontSize: 14, fontWeight: '800', color: T.color.ink },
  divider: { height: 1, backgroundColor: T.color.line, marginVertical: 6 },
  totalLabel: { ...T.type.body, fontSize: 16, fontWeight: '800', color: T.color.ink },
  totalPlate: {},
  totalText: { fontSize: 22, fontWeight: '900', color: T.color.cerulean, letterSpacing: -0.5 },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: T.color.cream,
    paddingHorizontal: T.space.lg,
    paddingTop: T.space.md,
    borderTopWidth: 1, borderTopColor: T.color.line,
  },
  warning: {
    backgroundColor: T.color.dangerTint,
    borderRadius: T.radius.sm,
    padding: T.space.sm,
    marginBottom: T.space.sm,
  },
  warningText: { color: T.color.danger, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: T.color.cerulean,
    borderRadius: T.radius.pill,
    height: 56, paddingHorizontal: T.space.md,
    ...T.shadow.button,
  },
  ctaBusy: { opacity: 0.85 },
  ctaText: { color: T.color.card, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  ctaTotalPlate: {},
  ctaTotalText: { color: T.color.card, fontSize: 14, fontWeight: '900' },
});
