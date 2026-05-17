import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'front_vibes',
  webDir: 'dist',
  android: {
    // Allow the WebView (https://localhost) to request HTTP API endpoints
    // during local development (VITE_API_BASE_URL=http://<local-ip>:8000).
    // In staging/production VITE_API_BASE_URL is always HTTPS so there is
    // no mixed-content risk in those environments.
    // Without this, Android's WebView blocks HTTP requests from an HTTPS
    // context even when android:usesCleartextTraffic="true" is set in the
    // manifest (cleartext traffic is an OS-level setting; mixed-content is
    // a WebView-level security policy).
    allowMixedContent: true,
  },
  plugins: {
    // GoogleAuth runtime options.
    // serverClientId is the Web OAuth 2.0 Client ID (type "Web application") from
    // Firebase Console → Project Settings → Your Apps → Web App → OAuth.
    // It is also available in Google Cloud Console → Credentials.
    // The runtime value is overridden via GoogleAuth.initialize() in main.ts using
    // the VITE_GOOGLE_WEB_CLIENT_ID env variable.
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '',   // injected at runtime — see main.ts
      forceCodeForRefreshToken: false,
    },
    /**
     * Offline downloads use CapacitorHttp.request() explicitly → native HTTP on Android/iOS
     * without CORS from https://localhost. Setting enabled:true patches window.fetch/XHR globally;
     * not required for our download path (see offline-audio-storage.ts).
     */
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
