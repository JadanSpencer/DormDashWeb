// app/(admin)/store/[id].tsx
// DormDash — Menu-item editor for one store (mid-tone "slate" identity).
// FUNCTIONALITY PRESERVED: store header fetch, real-time menuItems
// sub-collection listener (/stores/{id}/menuItems), add/edit via
// ItemFormModal (same validation + allergens comma parsing), delete
// confirm, availability toggle, category grouping.
// Improvements: back button falls through to the stores tab when there's
// no history; price field labeled J$; prices shown with formatJMD.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable,
  Modal, TextInput, ScrollView, Alert, Switch, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import {
  collection, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, query, orderBy, getDoc,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { MenuItem, Store } from '../../../types';
import { formatJMD } from '../../../constants';
import { S } from '../../../constants/themeMid';

const blankItem = () => ({
  name: '', description: '', price: '',
  category: 'Main', isAvailable: true, allergens: '',
});

const ITEM_CATEGORIES = ['Main', 'Sides', 'Drinks', 'Desserts', 'Snacks', 'Other'];

const safeGoBack = () => {
  if (router.canGoBack()) router.back();
  else router.replace('/(admin)/(tabs)/stores' as any);
};

// ─── ITEM FORM MODAL ────────────────────────────────────────────────
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
      allergens: form.allergens.split(',').map(a => a.trim()).filter(Boolean),
    };

    try {
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
      <View style={m.container}>
        <View style={m.header}>
          <Text style={m.title}>{isEdit ? 'Edit item' : 'New menu item'}</Text>
          <TouchableOpacity onPress={onClose} style={m.closeBtn} hitSlop={8}>
            <Text style={m.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={m.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <Field label="Item name *" value={form.name} onChangeText={v => set('name', v)} placeholder="e.g. Chicken Burger" />
          <Field label="Description" value={form.description} onChangeText={v => set('description', v)} placeholder="What's in it?" multiline />
          <Field label="Price (J$) *" value={form.price} onChangeText={v => set('price', v)} placeholder="450" keyboardType="decimal-pad" />

          <Text style={m.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: S.space.md }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {ITEM_CATEGORIES.map(cat => (
                <Pressable
                  key={cat}
                  style={[m.chip, form.category === cat && m.chipActive]}
                  onPress={() => set('category', cat)}
                >
                  <Text style={[m.chipText, form.category === cat && m.chipTextActive]}>{cat}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Field label="Allergens (comma separated)" value={form.allergens} onChangeText={v => set('allergens', v)} placeholder="nuts, dairy, gluten" />

          <View style={m.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={m.label}>Available now</Text>
              <Text style={m.toggleSub}>Unavailable items are hidden from students</Text>
            </View>
            <Switch
              value={form.isAvailable}
              onValueChange={v => set('isAvailable', v)}
              trackColor={{ false: S.color.lineOnBg, true: 'rgba(15, 168, 147, 0.35)' }}
              thumbColor={form.isAvailable ? S.color.tealBright : S.color.creamFaint}
            />
          </View>

          {error ? (
            <View style={m.errorBanner}><Text style={m.errorText}>{error}</Text></View>
          ) : null}

          <Pressable
            style={({ pressed }) => [m.saveBtn, saving && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.98 }] }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={S.color.card} />
              : <Text style={m.saveBtnText}>{isEdit ? 'Save changes' : 'Add to menu'}</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
};

const Field: React.FC<{
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any;
}> = ({ label, value, onChangeText, placeholder, multiline, keyboardType }) => (
  <View style={{ marginBottom: S.space.md }}>
    <Text style={m.label}>{label}</Text>
    <TextInput
      style={[m.input, multiline && { height: 80, textAlignVertical: 'top', paddingTop: S.space.sm }]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={S.color.inkFaint}
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize="none"
    />
  </View>
);

// ─── MAIN SCREEN ────────────────────────────────────────────────────
export default function StoreMenuItems() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [store, setStore] = useState<Store | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<MenuItem | null>(null);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'stores', id)).then(snap => {
      if (snap.exists()) setStore({ id: snap.id, ...snap.data() } as Store);
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'stores', id, 'menuItems'), orderBy('category', 'asc'));
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

  const grouped = items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const sections = Object.entries(grouped);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + S.space.md }]}>
        <TouchableOpacity onPress={safeGoBack} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: S.space.md }}>
          <Text style={styles.title} numberOfLines={1}>{store?.name ?? 'Menu items'}</Text>
          <Text style={styles.subtitle}>{items.length} items</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { transform: [{ scale: 0.96 }] }]}
          onPress={openCreate}
        >
          <Text style={styles.addBtnText}>＋ Add</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={S.color.ceruleanBright} size="large" /></View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyNumber}>00</Text>
          <Text style={styles.emptyText}>No menu items yet</Text>
          <Text style={styles.emptySub}>Tap ＋ Add to create the first item</Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={([cat]) => cat}
          contentContainerStyle={{ paddingHorizontal: S.space.lg, paddingBottom: 60 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: [cat, catItems] }) => (
            <View>
              <Text style={styles.catHeader}>{cat}</Text>
              {catItems.map(item => (
                <View key={item.id} style={[styles.card, !item.isAvailable && styles.cardOff]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.description ? (
                      <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                    {item.allergens && item.allergens.length > 0 && (
                      <Text style={styles.allergens}>⚠ {item.allergens.join(', ')}</Text>
                    )}
                    <View style={styles.pricePlate}>
                      <Text style={styles.priceText}>{formatJMD(item.price)}</Text>
                    </View>
                  </View>

                  <View style={styles.controls}>
                    <Switch
                      value={item.isAvailable}
                      onValueChange={() => handleToggleAvailable(item)}
                      trackColor={{ false: S.color.lineOnCard, true: 'rgba(15, 168, 147, 0.35)' }}
                      thumbColor={item.isAvailable ? S.color.teal : S.color.inkFaint}
                    />
                    <View style={styles.btnRow}>
                      <Pressable
                        style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
                        onPress={() => openEdit(item)}
                      >
                        <Text style={styles.editText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.delBtn, pressed && { opacity: 0.8 }]}
                        onPress={() => handleDelete(item)}
                      >
                        <Text style={styles.delText}>Del</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        />
      )}

      <ItemFormModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        storeId={id!}
        initialData={editTarget}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: S.color.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: S.space.lg, paddingBottom: S.space.md,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(242, 239, 230, 0.10)',
    justifyContent: 'center', alignItems: 'center',
  },
  backText: { fontSize: 18, fontWeight: '700', color: S.color.cream },
  title: { fontSize: 20, fontWeight: '800', color: S.color.cream, letterSpacing: -0.4 },
  subtitle: { fontSize: 11, fontWeight: '600', color: S.color.creamFaint, marginTop: 1 },
  addBtn: {
    backgroundColor: S.color.cerulean, borderRadius: S.radius.pill,
    paddingHorizontal: S.space.md, paddingVertical: 9,
  },
  addBtnText: { color: S.color.card, fontSize: 13, fontWeight: '800' },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  catHeader: { ...S.type.label, color: S.color.creamSoft, marginTop: S.space.md, marginBottom: S.space.sm },

  card: {
    flexDirection: 'row', gap: S.space.md,
    backgroundColor: S.color.card, borderRadius: S.radius.lg,
    padding: S.space.md, marginBottom: S.space.sm,
    ...S.shadow.card,
  },
  cardOff: { opacity: 0.6 },
  itemName: { fontSize: 15, fontWeight: '800', color: S.color.ink, letterSpacing: -0.2 },
  itemDesc: { fontSize: 12, fontWeight: '500', color: S.color.inkSoft, lineHeight: 16 },
  allergens: { fontSize: 10, fontWeight: '700', color: S.color.danger },
  pricePlate: {
    alignSelf: 'flex-start', marginTop: 6,
    backgroundColor: S.color.ceruleanTint,
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1, borderColor: S.color.cerulean,
  },
  priceText: { fontSize: 13, fontWeight: '900', color: S.color.cerulean },

  controls: { alignItems: 'flex-end', justifyContent: 'space-between' },
  btnRow: { flexDirection: 'row', gap: 6 },
  editBtn: {
    backgroundColor: S.color.cardMuted, borderRadius: S.radius.pill,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: S.color.lineOnCard,
  },
  editText: { fontSize: 11, fontWeight: '800', color: S.color.ink },
  delBtn: {
    backgroundColor: S.color.dangerTint, borderRadius: S.radius.pill,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  delText: { fontSize: 11, fontWeight: '800', color: S.color.danger },

  empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
  emptyNumber: { ...S.type.number, fontSize: 22, color: S.color.creamFaint },
  emptyText: { fontSize: 16, fontWeight: '800', color: S.color.cream },
  emptySub: { fontSize: 12, fontWeight: '600', color: S.color.creamFaint },
});

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
  label: { ...S.type.label, color: S.color.creamSoft, marginBottom: 6 },
  input: {
    backgroundColor: S.color.card, borderRadius: S.radius.md,
    height: 48, paddingHorizontal: S.space.md,
    color: S.color.ink, fontSize: 14, fontWeight: '500',
  },
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
    borderWidth: 1, borderColor: S.color.lineOnBg, gap: S.space.md,
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
