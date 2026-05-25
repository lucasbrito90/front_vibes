# Artwork & background strategy (Ixora front-end)

This document describes how vibe imagery is chosen across the app. **Implementation** lives in [`src/utils/artwork.ts`](../src/utils/artwork.ts). **Backend/API fields are unchanged** — the app only consumes what the API already exposes.

**CDN:** Image URLs are opaque **HTTPS** strings (DigitalOcean Spaces CDN, legacy Firebase, etc.). There is no host whitelist in the app; `<img :src>` and CSS `background-image: url(...)` work the same for `*.digitaloceanspaces.com` as for any other TLS origin.

## API fields (reference)

| Field | Typical use |
|--------|-------------|
| `thumbnail_url` | Legacy base image; often the root fallback when others are null. |
| `card_image_url` | Resolved list/card image (`card_image_url ?? thumbnail_url` on the API). |
| `player_background_url` | Full-screen player hero (`player_background_url ?? thumbnail_url` on the API). |
| `artwork_url` | Square / notification artwork (`artwork_url ?? thumbnail_url` on the API). |

### Cover bundles → vibes

**Cover bundles** (`GET /api/cover-bundles`) are catalog entries with `thumbnail_url`, `artwork_url`, and `player_background_url` (visual-only packages). **Sounds** stay audio-only.

On **create/edit vibe**, the app can open **Choose cover** and apply a bundle: each bundle URL **overwrites the vibe field only when that URL is non-empty**; missing bundle URLs leave the vibe’s current value untouched.

**Persistence:** the vibe PATCH/POST body includes those three keys. Laravel must whitelist them on **`StoreVibeRequest`** / **`UpdateVibeRequest`** (nullable strings, e.g. `max:2048`) so `validated()` passes them into `Vibe::create` / `update`. If they are omitted from validation rules, they are ignored server-side even though the app sends them.

The backend may already collapse fallbacks into these resolved fields. Front-end helpers **still apply the same priority** so offline snapshots, cached vibes, and future API changes stay consistent.

## Priority rules (front-end)

### Cards & “Continue” surfaces

- **Display URL:** `card_image_url` → `thumbnail_url` → **gradient** (`getVibeCardImageUrl`, `getVibeCardBackgroundStyle`).

### Full-screen player hero

- **Display URL:** `player_background_url` → `thumbnail_url` → **gradient** (`getVibePlayerBackgroundUrl`, `getVibePlayerBackgroundStyle`).
- Overlays, vignette, and motion remain owned by `VibePlayerPage.vue` (UI only).

### MiniPlayer & MediaSession-style artwork

- **Square / thumb URL:** `artwork_url` → `thumbnail_url` (`getVibeArtworkUrl`).
- Session state stores whatever `playVibe()` passes (today: `getVibeArtworkUrl(vibe)` from the player).

### Explicit thumbnail only

- `getVibeThumbnailUrl(vibe)` returns `thumbnail_url` only — for diagnostics or rare UI that must ignore resolved artwork fields.

## Fallback gradients

- Defined in `VIBE_ARTWORK_GRADIENTS` in [`artwork.ts`](../src/utils/artwork.ts).
- Palette: dark teal, deep navy, cyan glow, subtle purple, warm ember, night forest.
- **Stable choice:** `getVibeFallbackGradient(seed)` uses `seed` (usually `vibe.id`) modulo the list length so the same vibe always gets the same gradient.
- Cards pass `index` into `getVibeCardBackgroundStyle(vibe, index)` so the seed mixes slightly if needed.

Gradients are **dark-by-design** so white text and badges stay readable regardless of app light/dark theme (cards sit on themed page backgrounds).

## Image loading polish

Global utilities in [`src/theme/layout.css`](../src/theme/layout.css) and durations/easing from [`src/theme/motion.css`](../src/theme/motion.css) (`--app-motion-*`, `--app-ease-*`):

- **`app-artwork-fade-in`** — `<img>` artwork fade-in.
- **`app-artwork-card-enter`** — short scale/opacity entrance for media-backed surfaces (same keyframes as `.app-card-enter` in motion.css).

Exported constants: `CLS_ARTWORK_IMG_FADE`, `CLS_ARTWORK_CARD_ENTER` in `artwork.ts`.

## Where each helper is used

| Area | Helper(s) |
|------|-----------|
| My Vibes cards | `getVibeCardBackgroundStyle`, `getVibeCardImageUrl` |
| Home “Continue your vibe” | `getVibeCardBackgroundStyle`, `getVibeCardImageUrl` |
| Player background layer | `getVibePlayerBackgroundStyle`, `getVibePlayerBackgroundUrl` |
| MiniPlayer placeholder | `getVibeFallbackGradient` + vibe id |
| `playVibe` artwork | `getVibeArtworkUrl` |

## Future-friendly

If the API starts returning distinct crops for every context:

1. Prefer **`card_image_url`** on grids, **`player_background_url`** on the player, **`artwork_url`** for square / OS notifications — without changing consumers outside `artwork.ts` where possible.
2. Keep **oneplace** fallbacks (`thumbnail_url` → gradient) so MiniPlayer, cards, and player never drift.

## Limitations

- **No `<img>` load events** in cards or player hero — backgrounds use CSS `background-image`, so “fade on load” is a short entrance animation, not tied to network completion.
- **Escaping:** URLs are interpolated into CSS `url('…')`; malformed or quoted URLs from the API could break parsing — sanitisation would be a separate hardening task.
