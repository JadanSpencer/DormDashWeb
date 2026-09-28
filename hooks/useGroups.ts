// hooks/useGroups.ts
// Live reads for group orders: the dasher's saved search and the group the
// server is offering them (one at a time). Writes live in services/groups.ts.

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { GroupSearch, OrderGroup } from '../types';

/** groupSearches/{uid}, or null if this dasher has never saved one. */
export function useGroupSearch(uid: string | undefined) {
  const [search, setSearch] = useState<GroupSearch | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'groupSearches', uid), snap => {
      setSearch(snap.exists() ? (snap.data() as GroupSearch) : null);
    }, () => setSearch(null));
  }, [uid]);
  return search;
}

/** One offered group, live (null while loading, missing, or not this dasher's). */
export function useOrderGroup(groupId: string | null | undefined) {
  const [group, setGroup] = useState<OrderGroup | null>(null);
  useEffect(() => {
    if (!groupId) { setGroup(null); return; }
    return onSnapshot(doc(db, 'orderGroups', groupId), snap => {
      setGroup(snap.exists() ? ({ id: snap.id, ...snap.data() } as OrderGroup) : null);
    }, () => setGroup(null));
  }, [groupId]);
  return group;
}
