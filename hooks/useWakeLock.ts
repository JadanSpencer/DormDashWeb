// hooks/useWakeLock.ts
// Native: no-op. The native app keeps its heartbeat via the OS; if you ever
// want the screen kept on natively, add expo-keep-awake here.
// Web version: hooks/useWakeLock.web.ts.
export function useWakeLock(_active: boolean): void {}
