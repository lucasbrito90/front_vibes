import { createRouter, createWebHistory } from '@ionic/vue-router';
import { toastController } from '@ionic/vue';
import { RouteRecordRaw } from 'vue-router';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/services/firebase';
import { authService, LARAVEL_SYNC_FAILURE_MESSAGE } from '@/services/auth.service';
import { createLogger } from '@/utils/player-debug';
import { syncStatusBarWithRoute } from '@/composables/useStatusBarStyle';

const log = createLogger('Router');

// Extend Vue Router's RouteMeta so custom flags are type-safe everywhere.
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    publicOnly?: boolean;
    /**
     * When true, the global Mini Player bar is hidden on this route
     * even if audio is still playing. Used for pages that have their own
     * full-screen or fixed-bottom UI that would clash with the mini player.
     */
    hideMiniPlayer?: boolean;
    /**
     * Status bar icon style for Capacitor native builds.
     * `light` → dark icons on light backgrounds (most app screens).
     * `dark` → light icons on dark backgrounds (immersive player).
     */
    statusBarTheme?: 'light' | 'dark';
  }
}

const routes: Array<RouteRecordRaw> = [
  // ── Public-only routes (no tab bar) ────────────────────────────────────────
  {
    path: '/sign-in-sign-up',
    component: () => import('@/views/SignInSignUpPage.vue'),
    meta: { publicOnly: true },
  },
  {
    path: '/sign-in',
    component: () => import('@/views/SignInPage.vue'),
    meta: { publicOnly: true },
  },
  {
    path: '/sign-up',
    component: () => import('@/views/SignUpPage.vue'),
    meta: { publicOnly: true },
  },
  {
    path: '/forgot-password',
    component: () => import('@/views/ForgotPasswordPage.vue'),
    meta: { publicOnly: true },
  },
  {
    path: '/reset-password-success',
    component: () => import('@/views/ResetPasswordSuccessPage.vue'),
    meta: { publicOnly: true },
  },

  // ── Full-screen authenticated routes (no tab bar) ────────────────────────
  // These live outside TabsLayout so no tab bar appears over them.
  {
    path: '/vibes/:id/player',
    component: () => import('@/views/VibePlayerPage.vue'),
    /*
     * hideMiniPlayer: true — The MiniPlayer has position:fixed and z-index:200,
     * so it renders above everything in the viewport, including this full-screen
     * page. Without this flag, the mini player bar floats over the full player
     * page whenever audio is playing. It will reappear (with slide-up animation)
     * when the user navigates back to a tab route such as /vibes.
     */
    meta: { requiresAuth: true, hideMiniPlayer: true, statusBarTheme: 'dark' },
  },

  // ── Authenticated routes (tab bar visible) ────────────────────────────────
  // All authenticated pages live inside TabsLayout so Ionic's ion-router-outlet
  // can manage the full navigation stack (push/pop) without outlet conflicts.
  {
    path: '/',
    component: () => import('@/views/TabsLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/home' },
      {
        path: 'home',
        component: () => import('@/views/HomePage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'vibes',
        component: () => import('@/views/VibesPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'vibes/create',
        component: () => import('@/views/CreateVibePage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'vibes/:id/edit',
        component: () => import('@/views/EditVibePage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'vibes/:id/sounds',
        component: () => import('@/views/VibeSoundsPage.vue'),
        meta: { requiresAuth: true, hideMiniPlayer: true },
      },
      {
        path: 'settings',
        component: () => import('@/views/SettingsPage.vue'),
        meta: { requiresAuth: true },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

let authStateResolved = false;
let authStatePromise: Promise<User | null> | null = null;

function waitForAuthState(): Promise<User | null> {
  if (auth.currentUser || authStateResolved) {
    return Promise.resolve(auth.currentUser);
  }

  if (!authStatePromise) {
    authStatePromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        authStateResolved = true;
        unsubscribe();
        resolve(user);
      });
    });
  }

  return authStatePromise;
}

router.beforeEach(async (to) => {
  const user = await waitForAuthState();

  if (to.meta.requiresAuth && user) {
    try {
      await authService.ensureLaravelUserSynced(user);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[Router] Laravel user sync failed:', err);
      }
      await authService.logout();

      const toast = await toastController.create({
        message: LARAVEL_SYNC_FAILURE_MESSAGE,
        duration: 4500,
        color: 'danger',
      });
      await toast.present();

      return '/sign-in';
    }
  }

  if (to.meta.requiresAuth && !user) {
    return '/sign-in';
  }

  if (to.meta.publicOnly && user) {
    return '/home';
  }

  return true;
});

router.afterEach((to, from) => {
  log.debug('route changed', {
    from:           from.fullPath,
    to:             to.fullPath,
    hideMiniPlayer: !!to.meta.hideMiniPlayer,
  });
  void syncStatusBarWithRoute(to);
});

export default router;
