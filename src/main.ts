// ── Telemetry bootstrap — must run before any other app code ─────────────────
// initTelemetry() is a no-op when VITE_OTEL_ENDPOINT is unset (kill switch).
// It never throws — telemetry failures are always silent per ADR-029.
import { initTelemetry, flushTelemetry, emitErrorLog, emitErrorSpan } from '@/telemetry/otel';
initTelemetry();
// ─────────────────────────────────────────────────────────────────────────────

import { createApp } from 'vue'
import { createPinia } from 'pinia';
import App from './App.vue'
import router from './router';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

import { IonicVue } from '@ionic/vue';

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

/**
 * Dark mode: `ion-palette-dark` on `documentElement` + tokens in `variables.css`
 * (imports `@ionic/vue/css/palettes/dark.class.css`). See useThemeMode.
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* Theme variables */
import './theme/variables.css';
import './theme/theme.css';
import './theme/auth.css';
import './theme/motion.css';
import './theme/layout.css';

import { initThemeMode } from '@/composables/useThemeMode';
import { installNativeQaDiagnostics } from '@/diagnostics/native-qa-diagnostics';

installNativeQaDiagnostics();

// ── Google Auth initialisation ────────────────────────────────────────────────
// Initialize the plugin once at startup so it is ready before the first sign-in
// attempt. On web the call is a no-op for the native side but sets up the gapi
// library. On Android it configures the Google Identity Services client.
//
// VITE_GOOGLE_WEB_CLIENT_ID must contain the OAuth 2.0 Web Client ID from
// Firebase Console → Project Settings → Your Apps → Web App → OAuth.
// If the variable is empty the initialisation is skipped gracefully — the app
// will fall back to the web popup flow and native sign-in will show an error.
const _googleWebClientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;

if (_googleWebClientId) {
  // On native we pass the serverClientId so the plugin requests an ID token
  // with the correct audience for Firebase credential exchange.
  GoogleAuth.initialize({
    clientId:           _googleWebClientId,
    scopes:             ['profile', 'email'],
    grantOfflineAccess: false,
  }).catch((err: unknown) => {
    console.warn('[GoogleAuth] initialize failed:', err);
  });
} else if (Capacitor.isNativePlatform()) {
  console.warn(
    '[GoogleAuth] VITE_GOOGLE_WEB_CLIENT_ID is not set. ' +
    'Native Google Sign-In will not work. ' +
    'Add the Web OAuth Client ID to your .env file.',
  );
}
// ─────────────────────────────────────────────────────────────────────────────

const app = createApp(App)
  .use(IonicVue)
  .use(createPinia())
  .use(router);

// ── Global error handlers ─────────────────────────────────────────────────────
// None of these must ever throw or propagate — a broken handler must not crash
// the app (ADR-029 §"Failure policy").

app.config.errorHandler = (err, _instance, info) => {
  try {
    const message = err instanceof Error ? err.message : String(err);
    emitErrorSpan('vue.component.error', message, { 'vue.lifecycle': info ?? 'unknown' });
    emitErrorLog(message, { 'error.type': 'vue.component', 'vue.lifecycle': info ?? 'unknown' });
  } catch {
    /* silent — telemetry must not crash the app */
  }
};

window.addEventListener('unhandledrejection', (event) => {
  try {
    const message =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason ?? 'Unhandled promise rejection');
    emitErrorSpan('js.unhandled_rejection', message);
    emitErrorLog(message, { 'error.type': 'unhandled_rejection' });
  } catch {
    /* silent */
  }
});

window.onerror = (message, _source, _lineno, _colno, error) => {
  try {
    const msg = error?.message ?? String(message ?? 'Unknown error');
    emitErrorSpan('js.uncaught_exception', msg);
    emitErrorLog(msg, { 'error.type': 'uncaught_exception' });
  } catch {
    /* silent */
  }
  // Return false so the browser still logs the error to devtools
  return false;
};
// ─────────────────────────────────────────────────────────────────────────────

// ── Capacitor lifecycle — flush telemetry before app goes to background ───────
// Android WebViews may suspend JS timers (including BatchSpanProcessor's scheduler)
// when the app is backgrounded, causing buffered spans/logs to be dropped.
void CapApp.addListener('appStateChange', ({ isActive }) => {
  if (!isActive) {
    void flushTelemetry();
  }
});
// ─────────────────────────────────────────────────────────────────────────────

router.isReady().then(async () => {
  await initThemeMode();
  app.mount('#app');
});
