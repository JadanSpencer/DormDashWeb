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
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { Store } from '../../../types';
import { formatJMD } from '../../../constants';
import { S } from '../../../constants/themeMid';

const CATEGORIES = ['Fast Food', 'Grocery', 'Pharmacy', 'Drinks', 'Snacks', 'Other'];

const blankForm = () => ({
  name: '', description: '', category: 'Fast Food',
  deliveryFee: '0', estimatedTime: '20-30 mins', rating: '5.0',
  isOpen: true, address: '', latitude: '', longitude: '',
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
        deliveryFee: String(initialData.deliveryFee),
        estimatedTime: initialData.estimatedTime,
        rating: String(initialData.rating),
        isOpen: initialData.isOpen,
        address: initialData.location.address,
        latitude: String(initialData.location.latitude),
        longitude: String(initialData.location.longitude),
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
    if (!form.address.trim()) return 'Address is required';
    const fee = parseFloat(form.deliveryFee);
    if (isNaN(fee) || fee < 0) return 'Delivery fee must be a valid number';
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError('');

    const data = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      deliveryFee: parseFloat(form.deliveryFee) || 0,
      estimatedTime: form.estimatedTime.trim() || '20-30 mins',
      rating: parseFloat(form.rating) || 5.0,
      isOpen: form.isOpen,
      location: {
        address: form.address.trim(),
        latitude: parseFloat(form.latitude) || 0,
        longitude: parseFloat(form.longitude) || 0,
      },
    };

    try {
      if (isEdit && initialData) {
        await updateDoc(doc(db, 'stores', initialData.id), data);
      } else {
        await addDoc(collection(db, 'stores'), { ...data, createdAt: Date.now() });
      }
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
              <Text style={m.label}>Delivery fee (J$)</Text>
              <TextInput style={m.input} value={form.deliveryFee}
                onChangeText={v => setField('deliveryFee', v)}
                placeholder="150" placeholderTextColor={S.color.inkFaint} keyboardType="decimal-pad" />
            </View>
            <View style={m.half}>
              <Text style={m.label}>Est. time</Text>
              <TextInput style={m.input} value={form.estimatedTime}
                onChangeText={v => setField('estimatedTime', v)}
                placeholder="20-30 mins" placeholderTextColor={S.color.inkFaint} />
            </View>
          </View>

          <View style={m.field}>
            <Text style={m.label}>Address</Text>
            <TextInput style={m.input} value={form.address} onChangeText={v => setField('address', v)}
              placeholder="Building / street name" placeholderTextColor={S.color.inkFaint} />
          </View>

          <View style={m.row}>
            <View style={m.half}>
              <Text style={m.label}>Latitude</Text>
              <TextInput style={m.input} value={form.latitude} onChangeText={v => setField('latitude', v)}
                placeholder="18.0179" placeholderTextColor={S.color.inkFaint} keyboardType="decimal-pad" />
            </View>
            <View style={m.half}>
              <Text style={m.label}>Longitude</Text>
              <TextInput style={m.input} value={form.longitude} onChangeText={v => setField('longitude', v)}
                placeholder="-76.8099" placeholderTextColor={S.color.inkFaint} keyboardType="decimal-pad" />
            </View>
          </View>

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
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Store | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'stores'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setStores(snap.docs.map(d => ({ id: d.id, ...d.data() } as Store)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleDelete = (store: Store) => {
    Alert.alert('Delete Store', `Delete "${store.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await deleteDoc(doc(db, 'stores', store.id)); }
          catch (e: any) { Alert.alert('Error', 'Could not delete: ' + e.message); }
        },
      },
    ]);
  };

  const handleToggleOpen = async (store: Store) => {
    await updateDoc(doc(db, 'stores', store.id), { isOpen: !store.isOpen });
  };

  const getStoreNumber = (index: number) => (index + 1).toString().padStart(2, '0');

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.space.md }]}>
        <View>
          <Text style={styles.eyebrow}>Marketplace</Text>
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
              <Text style={styles.emptyNumber}>00</Text>
              <Text style={styles.emptyText}>No stores yet</Text>
              <Text style={styles.emptySub}>Tap ＋ New to add your first store</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardNumber}>{getStoreNumber(index)}</Text>
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
                  <Text style={styles.feeText}>{formatJMD(item.deliveryFee)}</Text>
                </View>
                <Text style={styles.metaText}>{item.estimatedTime}</Text>
                <View style={styles.metaDot} />
                <Text style={styles.metaText}>★ {item.rating}</Text>
              </View>

              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push(`/(admin)/store/${item.id}` as any)}
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
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },

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
    borderLeftWidth: 3, borderLeftColor: S.color.dangerBright,
    borderRadius: S.radius.sm, padding: S.space.sm, marginBottom: S.space.md,
  },
  errorText: { color: S.color.dangerBright, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  saveBtn: {
    backgroundColor: S.color.cerulean, borderRadius: S.radius.pill,
    height: 52, justifyContent: 'center', alignItems: 'center',
  },
  saveBtnText: { color: S.color.card, fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
});
