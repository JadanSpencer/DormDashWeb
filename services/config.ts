// services/config.ts
// Validates that all required environment variables exist at startup.
// The app will fail loudly in development if a key is missing,
// rather than silently failing in production.

const required = [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
  ];
  
  export function validateConfig(): void {
    if (__DEV__) { // Only run this check in development
      const missing = required.filter(key => !process.env[key]);
      if (missing.length > 0) {
        throw new Error(
          `Missing required environment variables:\n${missing.join('\n')}\n\nCheck your .env file.`
        );
      }
    }
  }