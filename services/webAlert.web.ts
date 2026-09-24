// services/webAlert.web.ts
// react-native-web ships Alert.alert as an EMPTY function. Without this shim
// every confirmation in the app (sign out, cancel order, delete store,
// deactivate user…) silently does nothing in the browser.
//
// installWebAlert() replaces Alert.alert with window.alert / window.confirm:
//   • 0–1 buttons  → window.alert, then that button's onPress
//   • 2+ buttons   → window.confirm. OK runs the first non-cancel button,
//                    Cancel runs the button marked style: 'cancel'.
// It is called once from app/_layout.tsx. No screen code needs to change.

import { Alert, AlertButton } from 'react-native';

let installed = false;

export function installWebAlert(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  (Alert as any).alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');

    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }

    const cancel = buttons.find(b => b.style === 'cancel');
    const action = buttons.find(b => b.style !== 'cancel') ?? buttons[buttons.length - 1];

    if (window.confirm(text)) action?.onPress?.();
    else cancel?.onPress?.();
  };
}
