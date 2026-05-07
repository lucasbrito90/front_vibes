import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/services/firebase';

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
    meta: { requiresAuth: true },
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

  if (to.meta.requiresAuth && !user) {
    return '/sign-in';
  }

  if (to.meta.publicOnly && user) {
    return '/home';
  }

  return true;
});

export default router;
