// Preview-mode fake of firebase/functions.
// createPayment returns a WiPay-style link so the card-payment flow can be
// exercised (the page it points to doesn't exist; tests block it).
export const getFunctions = (_app?: any) => ({});
export const httpsCallable = (_f: any, name: string) => async (_data?: any) => (
  name === 'createPayment'
    ? { data: { url: 'https://wipay.preview.invalid/checkout', paymentId: 'preview-payment' } }
    : { data: { ok: true } }
);
