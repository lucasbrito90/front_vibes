# Mobile CDN asset validation (manual checklist)

Short QA list for **Ionic / Capacitor** builds consuming **HTTPS** asset URLs from Laravel (DigitalOcean Spaces CDN for new content; legacy Firebase URLs may still appear).

**Environment:** point `VITE_API_BASE_URL` at an API that returns CDN URLs for catalog sounds, covers, and vibes.

---

## Sounds & playback

- [ ] Catalog sound uses **`file_url`** pointing at `https://ixora-buckets.tor1.cdn.digitaloceanspaces.com/...` — plays on device (native engine).
- [ ] Layer strip / editor shows **thumbnail** from CDN on `thumbnail_url`.
- [ ] **Offline → Download for offline** with CDN `file_url`; enable **airplane mode**; vibe still **plays**.
- [ ] Leave player and **return** — playback still works offline (manifest + snapshot).
- [ ] **Remove download** — playback falls back to HTTPS when online.

## Imagery

- [ ] **My Vibes** cards show CDN **`card_image_url` / `thumbnail_url`** (no broken images).
- [ ] **Home** “Continue” card imagery loads from CDN.
- [ ] **MiniPlayer** / MediaSession artwork uses CDN **`artwork_url`** (or fallback chain).
- [ ] **Player** full-screen **`player_background_url`** from CDN (or gradient fallback).

## Cover bundles & presets

- [ ] **Choose cover** applies CDN URLs from a cover bundle into create/edit vibe form.
- [ ] **Preset import** (with nested CDN cover bundle URLs) — vibe visuals and sound **`file_url`** work.

## Theme & build

- [ ] **Dark** and **light** app theme — artwork legible (gradients unchanged).
- [ ] **Android release / debug build on real device** without live reload — smoke test above.

---

## DEV-only diagnostics

With `npm run dev`, console shows **`[CDNAssets]`** lines (hostname only — not full URLs):

- **`sound`** — when building the execution plan (unique `fileUrl` per plan).
- **`artwork`** — when `playVibe()` runs (square / notification artwork URL).
- **`offline-download`** — when a native offline GET starts.

Production builds strip `import.meta.env.DEV`; these logs should not appear.

---

## Limitations

- Offline manifest keys on **exact URL string**; changing CDN path or query params requires re-download.
- No Spaces **upload** or **private bucket** access from mobile — only public URLs.
