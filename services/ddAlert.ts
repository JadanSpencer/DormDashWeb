// services/ddAlert.ts
// A tiny queue for DormDash's own pop-up (components/DDAlertHost.tsx).
// On the web, Alert.alert(...) anywhere in the app is routed here by
// services/webAlert.web.ts, so every confirmation and message uses the
// DormDash-styled pop-up instead of the browser's grey box.

export type DDAlertButton = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};
export type DDAlertItem = { id: number; title: string; message?: string; buttons: DDAlertButton[] };

let seq = 0;
let queue: DDAlertItem[] = [];
const listeners = new Set<(q: DDAlertItem[]) => void>();
const emit = () => listeners.forEach(l => l(queue));

/** True once a DDAlertHost is on screen. */
export const hasDDAlertHost = () => listeners.size > 0;

export function showDDAlert(title: string, message?: string, buttons?: DDAlertButton[]) {
  const list = buttons && buttons.length ? buttons : [{ text: 'OK' }];
  queue = [...queue, { id: ++seq, title, message, buttons: list }];
  emit();
}

export function closeDDAlert(id: number) {
  queue = queue.filter(a => a.id !== id);
  emit();
}

export function subscribeDDAlert(fn: (q: DDAlertItem[]) => void) {
  listeners.add(fn);
  fn(queue);
  return () => { listeners.delete(fn); };
}
