// metro.config.js
// Default Expo config, plus an opt-in PREVIEW MODE used for design QA.
//
//   DD_PREVIEW=1 npx expo start --web     (or: npm run preview:web)
//
// In preview mode every `firebase/*` import is swapped for an in-memory fake
// (see preview/) filled with sample campus data, so every screen can be opened
// and screenshotted without a real account or network. Preview mode is never
// active in normal builds: `npm run build:web` / EAS builds don't set DD_PREVIEW.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.DD_PREVIEW === '1') {
  const fakes = {
    'firebase/app': 'preview/firebase-app.ts',
    'firebase/auth': 'preview/firebase-auth.ts',
    'firebase/firestore': 'preview/firebase-firestore.ts',
    'firebase/functions': 'preview/firebase-functions.ts',
    'firebase/storage': 'preview/firebase-storage.ts',
    'firebase/messaging': 'preview/firebase-messaging.ts',
    'firebase/app-check': 'preview/firebase-app-check.ts',
  };
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (fakes[moduleName]) {
      return { type: 'sourceFile', filePath: path.join(__dirname, fakes[moduleName]) };
    }
    return upstream
      ? upstream(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
