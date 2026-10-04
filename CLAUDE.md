# front_vibes — CLAUDE.md

Ionic 8 + Vue 3 + Capacitor 8 mobile app. **Feature-frozen** — no new features while the KMP migration (`ixora-app`) is underway. Bugfixes and critical maintenance only.

Canonical docs: `ixora-infra/docs/` — read per-domain indexes before loading full documents.

## Internals

- `services/` — one service per domain concern (`vibe.service`, `sound.service`, `schedule.service`, `audio-player.service`, `offline-*`, `push-*`, `smart-home-dispatch.service`), thin HTTP wrappers over `laravel-http.ts` plus native integration points.
- `composables/` — Vue composition state built on top of services (`useVibes`, `useSchedules`, `useAuth`, `usePlayerEngine`, `useSounds`, `useDevices`, …).
- `stores/player.store.ts` (Pinia) — the playback runtime's central state.
- Routing: nested under `TabsLayout` for the authenticated tab shell; auth pages (`/sign-in`, `/sign-up`, etc.) are flat `publicOnly` routes. Sub-pages (create/edit) **must** be children of `TabsLayout`, never flat routes — flat vs. nested tab routes conflict in the `ion-router-outlet`.
- Back navigation in sub-pages: use `router.back()`, never `router-link`/`ionRouter.replace`.
- Post-auth redirects (`login`/`signup`/`logout`): always `window.location.replace('/route')`, never `router.replace`/`ionRouter.replace`/`router.push` — the router outlet can't reliably transition between flat and nested-tab routes.
- Auth flow: Firebase login → ID token → `syncUserWithBackend` sends it as `Authorization: Bearer <token>`. Token persistence is `@capacitor/preferences` only — never `localStorage`.
- Theme supports light, dark and system (follows the OS), selected in `SettingsPage` and persisted by `useThemeMode.ts`, which toggles the `ion-palette-dark` class; design tokens in `src/theme/variables.css`/`theme.css` — don't hardcode colors outside intentional vibe-card gradients.

## docs/ in this repo

Files under `front_vibes/docs/` are **secondary mirrors** of the canonical docs in `ixora-infra/docs/`. If they diverge, `ixora-infra/docs/` wins. Key canonical paths:

| front_vibes/docs/ | Canonical source |
| --- | --- |
| `android-native-customizations.md` | `ixora-infra/docs/architecture/mobile/android-native-customizations.md` |
| `audio-cache.md` | `ixora-infra/docs/architecture/audio/audio-cache.md` |
| `artwork-background-strategy.md` | `ixora-infra/docs/architecture/storage/artwork-background-strategy.md` |
| `mobile-cdn-validation.md` | `ixora-infra/docs/architecture/storage/mobile-cdn-validation.md` |
| `storage-strategy.md` | `ixora-infra/docs/architecture/storage/storage-strategy.md` |
| `issues/audio-engine-fade-limitations.md` | `ixora-infra/docs/architecture/audio/audio-engine-fade-limitations.md` |
| `issues/native-loop-fadein.md` | `ixora-infra/docs/architecture/audio/native-loop-fadein.md` |

## Quality gate

```bash
cd front_vibes && npm run lint && npm run typecheck && npm run test:unit && npm run build
```

Single test: `npx vitest run <path>` (unit), `npx playwright test <path>` (e2e, optional).

Physical Android device via Appium is available for real-device verification — see `ixora-infra/docs/testing/mobile-e2e-testing.md`.
