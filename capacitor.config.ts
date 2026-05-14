import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'front_vibes',
  webDir: 'dist',
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
  },
};

export default config;
