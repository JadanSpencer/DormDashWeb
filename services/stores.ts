// services/stores.ts
// Every store and menu write the app makes (admin screens). Screens call
// these and never write stores directly. firestore.rules allows these writes
// for admins only; store floats are separate (storeFloats, server-written,
// see adminAdjustFloat in services/payments.ts).

import { collection, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { MenuItem, Store } from '../types';

export type StoreFields = Omit<Store, 'id' | 'createdAt'>;
export type MenuItemFields = Omit<MenuItem, 'id'>;

const menuItems = (storeId: string) => collection(db, 'stores', storeId, 'menuItems');

// ─── Stores ────────────────────────────────────────────────────────────────

/** Creates a store (storeId null) or updates an existing one. */
export async function saveStore(storeId: string | null, fields: StoreFields): Promise<void> {
  if (storeId) await updateDoc(doc(db, 'stores', storeId), fields);
  else await addDoc(collection(db, 'stores'), { ...fields, createdAt: Date.now() });
}

export async function deleteStore(storeId: string): Promise<void> {
  await deleteDoc(doc(db, 'stores', storeId));
}

export async function setStoreOpen(storeId: string, isOpen: boolean): Promise<void> {
  await updateDoc(doc(db, 'stores', storeId), { isOpen });
}

// ─── Menu items ────────────────────────────────────────────────────────────

/** Creates a menu item (itemId null) or updates an existing one. */
export async function saveMenuItem(storeId: string, itemId: string | null, fields: MenuItemFields): Promise<void> {
  if (itemId) await updateDoc(doc(menuItems(storeId), itemId), fields);
  else await addDoc(menuItems(storeId), fields);
}

export async function deleteMenuItem(storeId: string, itemId: string): Promise<void> {
  await deleteDoc(doc(menuItems(storeId), itemId));
}

export async function setMenuItemAvailable(storeId: string, itemId: string, isAvailable: boolean): Promise<void> {
  await updateDoc(doc(menuItems(storeId), itemId), { isAvailable });
}
