// Preview-mode fake of firebase/functions.
export const getFunctions = (_app?: any) => ({});
export const httpsCallable = (_f: any, _name: string) => async (_data?: any) => ({ data: { ok: true } });
