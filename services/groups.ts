// services/groups.ts
// Group orders for dashers (functions/src/groups.ts). The app never builds
// or takes a group itself: it saves a search and asks the server to accept
// a group it offered, so every order in it is taken at once, or none.

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

function errorText(e: any, fallback: string) {
  // Callable errors carry the server's message, written for dashers.
  return typeof e?.message === 'string' && e.message && !/internal/i.test(e.message) ? e.message : fallback;
}

export type GroupSearchInput = { size: number; maxStoreDistanceM: number; storeIds: string[] };

/** Save and start a group search. Resolves to whether a group was found straight away. */
export async function startGroupSearch(search: GroupSearchInput): Promise<{ found: boolean }> {
  try {
    const res: any = await httpsCallable(functions, 'setGroupSearch')({ active: true, ...search });
    return { found: !!res.data?.found };
  } catch (e: any) {
    throw new Error(errorText(e, 'Could not start the group search. Try again.'));
  }
}

/** Stop looking for groups (any group on offer is withdrawn). */
export async function stopGroupSearch(): Promise<void> {
  try {
    await httpsCallable(functions, 'setGroupSearch')({ active: false });
  } catch (e: any) {
    throw new Error(errorText(e, 'Could not stop the group search. Try again.'));
  }
}

export type GroupAcceptOutcome = 'ok' | 'gone' | 'expired' | 'busy';

/** Take every order in the group. 'gone' = someone took one of them first. */
export async function acceptOrderGroup(groupId: string): Promise<GroupAcceptOutcome> {
  try {
    const res: any = await httpsCallable(functions, 'acceptOrderGroup')({ groupId });
    return (res.data?.outcome ?? (res.data?.ok ? 'ok' : 'gone')) as GroupAcceptOutcome;
  } catch (e: any) {
    throw new Error(errorText(e, 'Could not accept the group. Try again.'));
  }
}

/** "Same store", "Within 250 m", "Within 1 km". */
export function distanceLabel(m: number): string {
  if (m <= 0) return 'Same store';
  return m >= 1000 ? `Within ${m / 1000} km` : `Within ${m} m`;
}
