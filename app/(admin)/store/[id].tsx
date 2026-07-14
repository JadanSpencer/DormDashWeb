// app/(admin)/store/[id].tsx
// Menu items for a specific store.
// [id] is a dynamic segment — Expo Router fills it from the URL.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, ScrollView, Alert, Switch, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import {
  collection, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, query, orderBy, getDoc,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { MenuItem, Store } from '../../../types';
import { COLORS, SPACING, RADIUS, formatJMD } from '../../../constants';

const blankItem = () => ({
  name: '',
  description: '',
  price: '',
  category: 'Main',
  isAvailable: true,
  allergens: '',
});

const ITEM_CATEGORIES = ['Main', 'Sides', 'Drinks', 'Desserts', 'Snacks', 'Other'];

// ─── MENU ITEM FORM MODAL ─────────────────────────────────────────────────
const ItemFormModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  storeId: string;
  initialData?: MenuItem | null;
}> = ({ visible, onClose, storeId, initialData }) => {
  const isEdit = !!initialData;
  const [form, setForm] = useState(blankItem());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name,
        description: initialData.description,
        price: String(initialData.price),
        category: initialData.category,
        isAvailable: initialData.isAvailable,
        allergens: (initialData.allergens || []).join(', '),
      });
    } else {
      setForm(blankItem());
    }
    setError('');
  }, [initialData, visible]);

  const set = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Item name is required.'); return; }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) { setError('Enter a valid price.'); return; }

    setSaving(true);
    setError('');

    const data = {
      name: form.name.trim(),
      description: form.description.trim(),
      price,
      category: form.category,
      isAvailable: form.isAvailable,
      storeId,
      allergens: form.allergens
        .split(',')
        .map(a => a.trim())
        .filter(Boolean),
    };

    try {
      // Menu items are stored as a sub-collection inside the store document:
      // /stores/{storeId}/menuItems/{itemId}
      const itemsRef = collection(db, 'stores', storeId, 'menuItems');

      if (isEdit && initialData) {
        await updateDoc(doc(itemsRef, initialData.id), data);
      } else {
        await addDoc(itemsRef, data);
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
      <View style={modal.container}>
        <View style={modal.header}>
          <Text style={modal.title}>{isEdit ? 'Edit Item' : 'New Menu Item'}</Text>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Text style={modal.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={modal.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <FieldInner label="Item Name *" value={form.name} onChangeText={v => set('name', v)} placeholder="e.g. Chicken Burger" />
          <FieldInner label="Description" value={form.description} onChangeText={v => set('description', v)} placeholder="What's in it?" multiline />

          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            <View style={{ flex: 1 }}>
              <FieldInner label="Price ($) *" value={form.price} onChangeText={v => set('price', v)} placeholder="0.00" keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={modal.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACING.md }}>
                  {ITEM_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[modal.catChip, form.category === cat && modal.catChipActive]}
                      onPress={() => set('category', cat)}
                    >
                      <Text style={[modal.catText, form.category === cat && modal.catTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>

          <FieldInner label="Allergens (comma separated)" value={form.allergens} onChangeText={v => set('allergens', v)} placeholder="nuts, dairy, gluten" />

          <View style={modal.toggleRow}>
            <View>
              <Text style={modal.label}>Available Now</Text>
              <Text style={modal.toggleSub}>Unavailable items are hidden from students</Text>
            </View>
            <Switch
              value={form.isAvailable}
              onValueChange={v => set('isAvailable', v)}
              trackColor={{ false: '#1E2438', true: COLORS.success + '60' }}
              thumbColor={form.isAvailable ? COLORS.success : '#4A5568'}
            />
          </View>

          {error ? <Text style={modal.errorText}>⚠ {error}</Text> : null}

          <TouchableOpacity style={[modal.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={modal.saveBtnText}>{isEdit ? 'Save Changes' : 'Add to Menu'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

const FieldInner: React.FC<{
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any;
}> = ({ label, value, onChangeText, placeholder, multiline, keyboardType }) => (
  <View style={{ marginBottom: SPACING.md }}>
    <Text style={modal.label}>{label}</Text>
    <TextInput
      style={[modal.input, multiline && { height: 80, textAlignVertical: 'top', paddingTop: SPACING.sm }]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#4A5568"
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize="none"
    />
  </View>
);

// ─── MAIN SCREEN ───────────────────────────────────────────────────────────
export default function StoreMenuItems() {
  // useLocalSearchParams reads the [id] from the URL
  const { id } = useLocalSearchParams<{ id: string }>();
  const [store, setStore] = useState<Store | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<MenuItem | null>(null);

  // Load store name for the header
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'stores', id)).then(snap => {
      if (snap.exists()) setStore({ id: snap.id, ...snap.data() } as Store);
    });
  }, [id]);

  // Real-time listener for menu items sub-collection
  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, 'stores', id, 'menuItems'),
      orderBy('category', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem)));
      setLoading(false);
    });
    return unsub;
  }, [id]);

  const handleDelete = (item: MenuItem) => {
    Alert.alert('Delete Item', `Remove "${item.name}" from the menu?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteDoc(doc(db, 'stores', id!, 'menuItems', item.id));
        },
      },
    ]);
  };

  const handleToggleAvailable = async (item: MenuItem) => {
    await updateDoc(doc(db, 'stores', id!, 'menuItems', item.id), {
      isAvailable: !item.isAvailable,
    });
  };

  const openCreate = () => { setEditTarget(null); setModalVisible(true); };
  const openEdit = (item: MenuItem) => { setEditTarget(item); setModalVisible(true); };

  // Group items by category for a cleaner display
  const grouped = items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── HEADER ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: SPACING.md }}>
          <Text style={styles.title} numberOfLines={1}>{store?.name ?? 'Menu Items'}</Text>
          <Text style={styles.subtitle}>{items.length} items</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🍽</Text>
          <Text style={styles.emptyTitle}>No menu items yet</Text>
          <Text style={styles.emptySub}>Tap "+ Add" to add the first item</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {Object.entries(grouped).map(([category, categoryItems]) => (
            <View key={category}>
              {/* Category header */}
              <Text style={styles.categoryHeader}>{category}</Text>
              {categoryItems.map(item => (
                <View key={item.id} style={[styles.itemCard, !item.isAvailable && styles.itemCardOff]}>
                  <View style={styles.itemTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      {item.description ? (
                        <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                      ) : null}
                      {item.allergens && item.allergens.length > 0 && (
                        <Text style={styles.allergens}>⚠ {item.allergens.join(', ')}</Text>
                      )}
                    </View>
                    <View style={styles.priceBlock}>
                      <Text style={styles.itemPrice}>${formatJMD(item.price)}</Text>
                      <TouchableOpacity
                        style={[styles.availBadge, { backgroundColor: item.isAvailable ? COLORS.success + '22' : COLORS.error + '22' }]}
                        onPress={() => handleToggleAvailable(item)}
                      >
                        <Text style={[styles.availText, { color: item.isAvailable ? COLORS.success : COLORS.error }]}>
                          {item.isAvailable ? 'In Stock' : 'Off Menu'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.itemActions}>
                    <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                      <Text style={styles.editBtnText}>✏ Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                      <Text style={styles.deleteBtnText}>🗑 Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <ItemFormModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        storeId={id!}
        initialData={editTarget}
      />
    </SafeAreaView>
  );
}

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E1A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: '#1E2438' },
  title: { fontSize: 20, fontWeight: '900', color: '#fff' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1E2438', justifyContent: 'center', alignItems: 'center' },
  closeText: { color: '#8892A4', fontSize: 16, fontWeight: '700' },
  scroll: { padding: SPACING.lg, paddingBottom: 60 },
  label: { fontSize: 11, fontWeight: '800', color: '#8892A4', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  input: { backgroundColor: '#141828', borderWidth: 1.5, borderColor: '#1E2438', borderRadius: RADIUS.md, height: 50, paddingHorizontal: SPACING.md, color: '#fff', fontSize: 15 },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: '#141828', borderWidth: 1.5, borderColor: '#1E2438' },
  catChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22' },
  catText: { color: '#8892A4', fontSize: 12, fontWeight: '600' },
  catTextActive: { color: COLORS.primary },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#141828', borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#1E2438' },
  toggleSub: { fontSize: 11, color: '#4A5568', marginTop: 2 },
  errorText: { color: COLORS.error, fontSize: 13, fontWeight: '600', marginBottom: SPACING.md, backgroundColor: COLORS.error + '15', padding: SPACING.sm, borderRadius: RADIUS.sm },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, height: 56, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0E1A' },
  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: '#1E2438' },
  backBtn: { paddingRight: SPACING.sm },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#8892A4', marginTop: 1 },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, height: 38, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: SPACING.lg, paddingBottom: 100 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.sm, paddingTop: 80 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  emptySub: { fontSize: 13, color: '#8892A4' },
  categoryHeader: { fontSize: 11, fontWeight: '900', color: '#4A5568', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: SPACING.sm, marginTop: SPACING.lg },
  itemCard: { backgroundColor: '#141828', borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: '#1E2438', gap: SPACING.sm },
  itemCardOff: { opacity: 0.5 },
  itemTop: { flexDirection: 'row', gap: SPACING.md },
  itemName: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 3 },
  itemDesc: { fontSize: 12, color: '#8892A4', lineHeight: 17 },
  allergens: { fontSize: 11, color: COLORS.warning, marginTop: 4, fontWeight: '600' },
  priceBlock: { alignItems: 'flex-end', gap: SPACING.xs },
  itemPrice: { fontSize: 18, fontWeight: '900', color: COLORS.primary },
  availBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full },
  availText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  itemActions: { flexDirection: 'row', gap: SPACING.sm },
  editBtn: { flex: 1, backgroundColor: '#1E2438', borderRadius: RADIUS.sm, height: 36, justifyContent: 'center', alignItems: 'center' },
  editBtnText: { color: '#8892A4', fontSize: 13, fontWeight: '700' },
  deleteBtn: { flex: 1, backgroundColor: COLORS.error + '18', borderRadius: RADIUS.sm, height: 36, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.error + '33' },
  deleteBtnText: { color: COLORS.error, fontSize: 13, fontWeight: '700' },
});