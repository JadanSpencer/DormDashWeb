// services/webAlert.web.ts
// react-native-web ships Alert.alert as an EMPTY function. Without this shim
// every confirmation in the app (sign out, cancel order, delete store,
// deactivate user…) silently does nothing in the browser.
//
// installWebAlert() routes Alert.alert to DormDash's own pop-up
// (components/DDAlertHost.tsx, mounted in app/_layout.tsx), with the same
// buttons, button styles (cancel / destructive) and onPress handlers.
// If the pop-up isn't on screen yet, it falls back to the browser's
// alert/confirm so nothing is ever silently lost.
// It is called once from app/_layout.tsx. No screen code needs to change.

import { Alert, AlertButton } from 'react-native';
import { showDDAlert, hasDDAlertHost } from './ddAlert';

let installed = false;

export function installWebAlert(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  (Alert as any).alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    if (hasDDAlertHost()) {
      showDDAlert(title, message, buttons as any);
      return;
    }

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
