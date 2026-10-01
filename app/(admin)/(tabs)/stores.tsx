// app/(admin)/(tabs)/stores.tsx
// DormDash — Admin store management (mid-tone "slate" Route identity).
// FUNCTIONALITY PRESERVED: same Firestore listener, StoreFormModal with
// identical blankForm / validate / handleSave, delete confirm, isOpen
// toggle, menu-items navigation. Fee shown as J$.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable,
  Modal, TextInput, ScrollView, Alert, Switch, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { saveStore, deleteStore, setStoreOpen } from '../../../services/stores';
import { useStores, useStoreFloats } from '../../../hooks/useStores';
import { Store } from '../../../types';
import { formatJMD, MIN_DELIVERY_FEE_JMD } from '../../../constants';
import { PICKUP_POINTS, pickupPoint } from '../../../constants/campus';
import { S } from '../../../constants/themeMid';
import { AmountPrompt } from '../../../components/AmountPrompt';
import { adminAdjustFloat } from '../../../services/payments';
import { Backdrop } from '../../../components/Backdrop';

const CATEGORIES = ['Fast Food', 'Grocery', 'Pharmacy', 'Drinks', 'Snacks', 'Other'];

const blankForm = () => ({
  name: '', description: '', category: 'Fast Food',
  estimatedTime: '20-30 mins', rating: '5.0',
  isOpen: true, address: '', latitude: '', longitude: '',
  pickupPointId: '', hours: '', phone: '',
});

// ─── Store form modal ───────────────────────────────────────────────
const StoreFormModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  initialData?: Store | null;
}> = ({ visible, onClose, initialData }) => {
  const isEdit = !!initialData;
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name,
        description: initialData.description,
        category: initialData.category,
        estimatedTime: initialData.estimatedTime,
        rating: String(initialData.rating),
        isOpen: initialData.isOpen,
        address: initialData.location.address,
        latitude: String(initialData.location.latitude),
        longitude: String(initialData.location.longitude),
        pickupPointId: initialData.pickupPointId ?? '',
        hours: initialData.hours ?? '',
        phone: initialData.phone ?? '',
      });
    } else {
      setForm(blankForm());
    }
    setError('');
  }, [initialData, visible]);

  const setField = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const validate = () => {
    if (!form.name.trim()) return 'Store name is required';
    if (!form.description.trim()) return 'Description is required';
    if (!form.pickupPointId && !form.address.trim()) return 'Choose the store\'s food spot, or type an address';
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError('');

    const spot = pickupPoint(form.pickupPointId);
    const data = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      // The real fee depends on distance (campus.ts); this field is kept
      // at the minimum because the rules require a number here.
      deliveryFee: MIN_DELIVERY_FEE_JMD,
      // Its food spot on campus: delivery fees are measured from here.
      ...(spot ? { pickupPointId: spot.id } : {}),
      estimatedTime: form.estimatedTime.trim() || '20-30 mins',
      hours: form.hours.trim(),
      phone: form.phone.trim(),
      rating: parseFloat(form.rating) || 5.0,
      isOpen: form.isOpen,
      location: spot ? {
        address: spot.name,
        latitude: spot.latitude ?? 0,
        longitude: spot.longitude ?? 0,
      } : {
        address: form.address.trim(),
        latitude: parseFloat(form.latitude) || 0,
        longitude: parseFloat(form.longitude) || 0,
      },
    };

    try {
      await saveStore(isEdit && initialData ? initialData.id : null, data);
      onClose();
    } catch (e: any) {
      setError('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={m.container}>
        <View style={m.header}>
          <Text style={m.title}>{isEdit ? 'Edit store' : 'New store'}</Text>
          <TouchableOpacity style={m.closeBtn} onPress={onClose} hitSlop={8}>
            <Text style={m.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={m.scroll} keyboardShouldPersistTaps="handled">
          <View style={m.field}>
            <Text style={m.label}>Store name</Text>
            <TextInput style={m.input} value={form.name} onChangeText={v => setField('name', v)}
              placeholder="Juici Patties" placeholderTextColor={S.color.inkFaint} />
          </View>

          <View style={m.field}>
            <Text style={m.label}>Description</Text>
            <TextInput style={[m.input, m.textArea]} value={form.description}
              onChangeText={v => setField('description', v)}
              placeholder="What does this store sell?" placeholderTextColor={S.color.inkFaint}
              multiline textAlignVertical="top" />
          </View>

          <Text style={m.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={m.catScroll}>
            <View style={m.catRow}>
              {CATEGORIES.map(cat => (
                <Pressable
                  key={cat}
                  style={[m.chip, form.category === cat && m.chipActive]}
                  onPress={() => setField('category', cat)}
                >
                  <Text style={[m.chipText, form.category === cat && m.chipTextActive]}>{cat}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View style={m.row}>
            <View style={m.half}>
              <Text style={m.label}>Est. time</Text>
              <TextInput style={m.input} value={form.estimatedTime}
                onChangeText={v => setField('estimatedTime', v)}
                placeholder="20-30 mins" placeholderTextColor={S.color.inkFaint} />
            </View>
          </View>

          <View style={m.field}>
            <Text style={m.label}>Opening hours</Text>
            <TextInput style={m.input} value={form.hours} onChangeText={v => setField('hours', v)}
              placeholder="Mon-Fri 8am-9pm, Sat 8am-5pm" placeholderTextColor={S.color.inkFaint} />
          </View>

          <View style={m.field}>
            <Text style={m.label}>Store phone</Text>
            <TextInput style={m.input} value={form.phone} onChangeText={v => setField('phone', v)}
              placeholder="876-000-0000" placeholderTextColor={S.color.inkFaint} keyboardType="phone-pad" />
          </View>

          {/* Where the dasher picks up. Delivery fees are measured from here. */}
          <Text style={m.label}>Food spot on campus</Text>
          <Text style={m.toggleSub}>Delivery fees are worked out from here. Choose "Not listed" to type a position.</Text>
          <View style={[m.catRow, m.spotWrap]}>
            {[...PICKUP_POINTS.map(pt => ({ id: pt.id, label: pt.name })), { id: '', label: 'Not listed' }].map(pt => (
              <Pressable
                key={pt.id || 'none'}
                style={[m.chip, form.pickupPointId === pt.id && m.chipActive]}
                onPress={() => setField('pickupPointId', pt.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: form.pickupPointId === pt.id }}
              >
                <Text style={[m.chipText, form.pickupPointId === pt.id && m.chipTextActive]}>{pt.label}</Text>
              </Pressable>
            ))}
          </View>

          {!form.pickupPointId && (<>
          <View style={m.field}>
            <Text style={m.label}>Address</Text>
            <TextInput style={m.input} value={form.address} onChangeText={v => setField('address', v)}
              placeholder="Building / street name" placeholderTextColor={S.color.inkFaint} />
          </View>

          <View style={m.row}>
            <View style={m.half}>
              <Text style={m.label}>Latitude</Text>
              <TextInput style={m.input} value={form.latitude} onChangeText={v => setField('latitude', v)}
                placeholder="18.0061" placeholderTextColor={S.color.inkFaint} keyboardType="decimal-pad" />
            </View>
            <View style={m.half}>
              <Text style={m.label}>Longitude</Text>
              <TextInput style={m.input} value={form.longitude} onChangeText={v => setField('longitude', v)}
                placeholder="-76.7466" placeholderTextColor={S.color.inkFaint} keyboardType="decimal-pad" />
            </View>
          </View>
          </>)}

          <View style={m.toggleRow}>
            <View>
              <Text style={m.label}>Store status</Text>
              <Text style={m.toggleSub}>Students see this live</Text>
            </View>
            <Switch
              value={form.isOpen}
              onValueChange={v => setField('isOpen', v)}
              trackColor={{ false: S.color.lineOnCard, true: 'rgba(15, 168, 147, 0.35)' }}
              thumbColor={form.isOpen ? S.color.teal : S.color.inkFaint}
            />
          </View>

          {error ? (
            <View style={m.errorBanner}><Text style={m.errorText}>{error}</Text></View>
          ) : null}

          <Pressable
            style={({ pressed }) => [m.saveBtn, pressed && { transform: [{ scale: 0.98 }] }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={S.color.card} />
              : <Text style={m.saveBtnText}>{isEdit ? 'Save changes' : 'Create store'}</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
};

// ─── Main screen ────────────────────────────────────────────────────
export default function AdminStores() {
  const insets = useSafeAreaInsets();
  const { stores, loading } = useStores();
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Store | null>(null);
  const [floatTarget, setFloatTarget] = useState<Store | null>(null);

  // Store floats are admin-only (storeFloats/{storeId}), not on the public
  // store doc. The old floatJmd field is shown until the server moves it.
  const floats = useStoreFloats();
  const floatOf = (store: Store): number | undefined => {
    if (store.id in floats) return floats[store.id];
    const legacy = (store as any).floatJmd;
    return typeof legacy === 'number' ? legacy : undefined;
  };

  const handleDelete = (store: Store) => {
    Alert.alert('Delete Store', `Delete "${store.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await deleteStore(store.id); }
          catch (e: any) { Alert.alert('Error', 'Could not delete: ' + e.message); }
        },
      },
    ]);
  };

  const handleToggleOpen = async (store: Store) => {
    await setStoreOpen(store.id, !store.isOpen);
  };


  return (
    <View style={styles.root}>
      <Backdrop tone="mid" />
      <View style={[styles.header, { paddingTop: insets.top + S.space.md }]}>
        <View>
          <Text style={styles.title}>Stores</Text>
          <Text style={styles.subtitle}>{stores.length} total</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { transform: [{ scale: 0.96 }] }]}
          onPress={() => { setEditTarget(null); setModalVisible(true); }}
        >
          <Text style={styles.addBtnText}>＋ New</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={S.color.ceruleanBright} size="large" /></View>
      ) : (
        <FlatList
          data={stores}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: S.space.lg, paddingBottom: 120 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No stores yet</Text>
              <Text style={styles.emptySub}>Tap ＋ New to add your first store</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View />
                <Pressable
                  style={[styles.statusBtn, { backgroundColor: item.isOpen ? S.color.tealTint : S.color.dangerTint }]}
                  onPress={() => handleToggleOpen(item)}
                >
                  <View style={[styles.statusDot, { backgroundColor: item.isOpen ? S.color.teal : S.color.danger }]} />
                  <Text style={[styles.statusText, { color: item.isOpen ? S.color.teal : S.color.danger }]}>
                    {item.isOpen ? 'Open' : 'Closed'}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.storeName}>{item.name}</Text>
              <Text style={styles.storeCategory}>{item.category}</Text>
              <Text style={styles.storeDesc} numberOfLines={2}>{item.description}</Text>

              <View style={styles.metaRow}>
                <View style={styles.feePlate}>
                  <Text style={styles.feeText}>
                    {pickupPoint(item.pickupPointId)?.name ?? 'No food spot set: fee J$400'}
                  </Text>
                </View>
                <Text style={styles.metaText}>{item.estimatedTime}</Text>
                <View style={styles.metaDot} />
                <Text style={styles.metaText}>★ {item.rating}</Text>
              </View>

              {/* Store float: prepaid money the store draws from, so orders
                  are ready when the dasher arrives. No float = the dasher's
                  float pays for this store's orders. */}
              <View style={styles.floatRow}>
                <Text style={styles.floatText}>
                  {floatOf(item) !== undefined
                    ? `Float: ${formatJMD(floatOf(item)!)}`
                    : 'No store float (runner\'s float pays)'}
                </Text>
                <Pressable onPress={() => setFloatTarget(item)} style={styles.floatBtn}>
                  <Text style={styles.floatBtnText}>{floatOf(item) !== undefined ? 'Adjust float' : 'Start float'}</Text>
                </Pressable>
              </View>

              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push(`/(admin)/manage-store/${item.id}` as any)}
                >
                  <Text style={styles.menuBtnText}>Menu items</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => { setEditTarget(item); setModalVisible(true); }}
                >
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => handleDelete(item)}
                >
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <StoreFormModal visible={modalVisible} onClose={() => setModalVisible(false)} initialData={editTarget} />
      <AmountPrompt
        visible={!!floatTarget}
        title={`Float for ${floatTarget?.name ?? ''}`}
        hint="J$ you gave this store to prepare Runner orders from. Each paid order's food cost is taken from it. Use a minus sign to reduce it."
        unitLabel="J$"
        onCancel={() => setFloatTarget(null)}
        onSubmit={async (amount, note) => {
          if (!floatTarget) return;
          await adminAdjustFloat('store', floatTarget.id, amount, note);
          setFloatTarget(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: S.color.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: S.space.lg, paddingBottom: S.space.md,
  },
  eyebrow: { ...S.type.label, color: S.color.tealBright, marginBottom: 4 },
  title: { ...S.type.display, color: S.color.cream },
  subtitle: { fontSize: 12, fontWeight: '600', color: S.color.creamFaint, marginTop: 2 },
  addBtn: {
    backgroundColor: S.color.cerulean, borderRadius: S.radius.pill,
    paddingHorizontal: S.space.md, paddingVertical: 10,
  },
  addBtnText: { color: S.color.card, fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: S.color.card, borderRadius: S.radius.lg,
    padding: S.space.md, marginBottom: S.space.sm,
    gap: 4, ...S.shadow.card,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  cardNumber: { ...S.type.number, color: S.color.teal },
  statusBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: S.radius.pill,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },

  storeName: { fontSize: 17, fontWeight: '800', color: S.color.ink, letterSpacing: -0.3 },
  storeCategory: { ...S.type.label, fontSize: 9, color: S.color.cerulean },
  storeDesc: { fontSize: 12, fontWeight: '500', color: S.color.inkSoft, lineHeight: 17 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  feePlate: {
    backgroundColor: S.color.ceruleanTint, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: S.color.cerulean,
  },
  feeText: { fontSize: 11, fontWeight: '900', color: S.color.cerulean },
  floatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  floatText: { flex: 1, fontSize: 13, fontWeight: '800', color: S.color.ink },
  floatBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: S.color.ceruleanTint },
  floatBtnText: { fontSize: 12, fontWeight: '800', color: S.color.cerulean },
  metaText: { fontSize: 11, fontWeight: '600', color: S.color.inkFaint },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: S.color.lineOnCard },

  actions: { flexDirection: 'row', gap: S.space.sm, marginTop: S.space.sm },
  menuBtn: {
    flex: 1, backgroundColor: S.color.cerulean, borderRadius: S.radius.pill,
    paddingVertical: 9, alignItems: 'center',
  },
  menuBtnText: { color: S.color.card, fontSize: 12, fontWeight: '800' },
  editBtn: {
    flex: 1, backgroundColor: S.color.cardMuted, borderRadius: S.radius.pill,
    paddingVertical: 9, alignItems: 'center',
    borderWidth: 1, borderColor: S.color.lineOnCard,
  },
  editBtnText: { color: S.color.ink, fontSize: 12, fontWeight: '800' },
  deleteBtn: {
    flex: 1, backgroundColor: S.color.dangerTint, borderRadius: S.radius.pill,
    paddingVertical: 9, alignItems: 'center',
  },
  deleteBtnText: { color: S.color.danger, fontSize: 12, fontWeight: '800' },

  empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
  emptyNumber: { ...S.type.number, fontSize: 22, color: S.color.creamFaint },
  emptyText: { fontSize: 16, fontWeight: '800', color: S.color.cream },
  emptySub: { fontSize: 12, fontWeight: '600', color: S.color.creamFaint },
});

// ─── Modal styles (slate sheet, cream inputs) ───────────────────────
const m = StyleSheet.create({
  container: { flex: 1, backgroundColor: S.color.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: S.space.lg, borderBottomWidth: 1, borderBottomColor: S.color.lineOnBg,
  },
  title: { fontSize: 18, fontWeight: '800', color: S.color.cream, letterSpacing: -0.3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(242, 239, 230, 0.10)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: S.color.creamSoft, fontSize: 14, fontWeight: '700' },
  scroll: { padding: S.space.lg, paddingBottom: 60 },
  field: { marginBottom: S.space.md },
  label: { ...S.type.label, color: S.color.creamSoft, marginBottom: 6 },
  input: {
    backgroundColor: S.color.card, borderWidth: 1.5, borderColor: 'transparent',
    borderRadius: S.radius.md, height: 48, paddingHorizontal: S.space.md,
    color: S.color.ink, fontSize: 14, fontWeight: '500',
  },
  textArea: { height: 80, paddingTop: S.space.sm },
  row: { flexDirection: 'row', gap: S.space.sm, marginBottom: S.space.md },
  half: { flex: 1 },
  catScroll: { marginBottom: S.space.md },
  catRow: { flexDirection: 'row', gap: S.space.sm },
  spotWrap: { flexWrap: 'wrap', marginTop: S.space.sm, marginBottom: S.space.md },
  chip: {
    paddingHorizontal: S.space.md, paddingVertical: 8, borderRadius: S.radius.pill,
    backgroundColor: 'rgba(242, 239, 230, 0.08)',
    borderWidth: 1, borderColor: S.color.lineOnBg,
  },
  chipActive: { backgroundColor: S.color.card, borderColor: S.color.card },
  chipText: { color: S.color.creamSoft, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: S.color.cerulean },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(242, 239, 230, 0.08)', borderRadius: S.radius.md,
    padding: S.space.md, marginBottom: S.space.lg,
    borderWidth: 1, borderColor: S.color.lineOnBg,
  },
  toggleSub: { fontSize: 10, color: S.color.creamFaint, marginTop: 2 },
  errorBanner: {
    backgroundColor: 'rgba(227, 107, 107, 0.15)',
    borderRadius: S.radius.sm, padding: S.space.sm, marginBottom: S.space.md,
  },
  errorText: { color: S.color.dangerBright, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  saveBtn: {
    backgroundColor: S.color.cerulean, borderRadius: S.radius.pill,
    height: 52, justifyContent: 'center', alignItems: 'center',
  },
  saveBtnText: { color: S.color.card, fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
});
