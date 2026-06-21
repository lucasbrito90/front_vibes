# Player visual polish — manual QA checklist

Use after automated gates (`lint`, `typecheck`, `build`, `test:unit`, `test:e2e`, native QA scripts).

Device: physical Android (low-end if available). Build: debug APK with latest `cap sync`.

## Artwork transition

- [ ] Open a playable vibe with `player_background_url` or thumbnail.
- [ ] Switch to another vibe with different artwork.
- [ ] No white flash between backgrounds; previous gradient underlay visible during crossfade.
- [ ] Artwork fade feels smooth (~0.5s), not abrupt.

## Ambient glow intensity

- [ ] Tap play — subtle green radial glow appears; not distracting.
- [ ] Pause — warm/amber tint reduced, not flashing.
- [ ] Preparing — blue tint only while `Preparing playback…`; stops after play starts.
- [ ] Glow does not obscure title or controls.

## MiniPlayer transition

- [ ] Leave player while playing — MiniPlayer slides up smoothly.
- [ ] Artwork thumbnail fades in (no double-fade flicker).
- [ ] Meta line crossfades on pause/resume (no layout jump).
- [ ] Tap bar → returns to player; stop → bar hides cleanly.

## Reduced motion

- [ ] Enable Android **Remove animations** (or system reduced motion).
- [ ] Open player, play — no Ken Burns drift, no ambient breathing, no preparing dot pulse.
- [ ] App remains usable; play/pause/stop still work.

## Vibe switch — no white flash

- [ ] Rapidly switch between two vibes with artwork.
- [ ] Title/identity crossfade; no stale previous vibe name.
- [ ] Sound layers list matches current vibe only.

## Offline (native)

- [ ] Downloaded vibe plays from `file://` after airplane mode.
- [ ] Offline badges readable; download success toast brief (~2s).

## Background / notification

- [ ] Background app while playing; return foreground — UI state matches audio.
- [ ] Notification controls pause/resume; MiniPlayer stays in sync.
