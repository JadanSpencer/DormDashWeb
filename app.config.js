// app.config.js
// Expo reads app.json first, then this file can extend it. The only job
// here: inject the native Google Maps API keys from environment variables so
// they are not committed to git in app.json.
//
// Locally they come from .env. For EAS cloud builds, add them once with:
//   eas env:create --name GOOGLE_MAPS_IOS_API_KEY --value ... --visibility sensitive
//   eas env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value ... --visibility sensitive
module.exports = ({ config }) => {
  const ios = process.env.GOOGLE_MAPS_IOS_API_KEY;
  const android = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...config,
    ios: {
      ...config.ios,
      ...(ios ? { config: { ...(config.ios?.config ?? {}), googleMapsApiKey: ios } } : {}),
    },
    android: {
      ...config.android,
      ...(android ? { config: { ...(config.android?.config ?? {}), googleMaps: { apiKey: android } } } : {}),
    },
  };
};
