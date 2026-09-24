// Preview-mode fake of firebase/app. See metro.config.js.
const app = { name: '[preview]', options: {} };
export const initializeApp = (_cfg?: any) => app;
export const getApps = () => [app];
export const getApp = () => app;
