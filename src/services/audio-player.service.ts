/**
 * audio-player.service.ts — Native audio engine (loop / once / interval)
 *
 * ## Audio backend per play mode
 * - loop:     @capgo/native-audio on native platforms (Android/iOS).
 *             Falls back to HTMLAudioElement on web (ionic serve).
 * - once:     @capgo/native-audio on native platforms (Android/iOS).
 *             Falls back to HTMLAudioElement on web (ionic serve), or if
 *             any native step (preload / play) fails.
 * - interval: @capgo/native-audio on native platforms (Android/iOS).
 *             Falls back to HTMLAudioElement on web (ionic serve), or if
 *             the initial native preload fails.
 *
 * ## Fade controls
 * fadeIn/fadeOut are intentionally NOT applied at runtime. See:
 *   docs/issues/audio-engine-fade-limitations.md
 * The fields (fade_in_seconds, fade_out_seconds) are kept in the DB schema
 * and TypeScript types for backward compatibility and future use.
 *
 * ## Native loop lifecycle
 * - preload() + loop() on start. pause() / resume() / stop()+unload() for control.
 * - All NativeAudio calls are fire-and-forget (async) to preserve the synchronous
 *   public API. Errors are logged but do not crash the session.
 * - If preload or loop fails, the layer falls back to HTMLAudioElement.
 *
 * ## Native once lifecycle
 * - preload() + play() on start. pause() / resume() / stop()+unload() for control.
 * - Completion is detected via a single global NativeAudio.addListener('complete')
 *   that dispatches to per-layer callbacks keyed by assetId. This avoids
 *   accumulating per-layer listeners and uses the official plugin API.
 * - On completion the layer is torn down and _notifySessionEndedIfEmpty() fires,
 *   exactly mirroring the HTMLAudioElement 'ended' path.
 * - If preload or play fails, the layer falls back to HTMLAudioElement.
 *
 * ## Native interval lifecycle
 * - Asset is preloaded ONCE with a stable assetId at layer start.
 * - Each tick calls NativeAudio.play({ assetId }) (not loop()). The same
 *   preloaded asset is reused for every tick — no re-preload needed.
 * - Tick completion is detected via the same global 'complete' listener used
 *   for once layers. On complete, the next gap timer is scheduled, which
 *   fires _intervalPlayTickNative() for the following tick.
 * - Overlap prevention: if the 'complete' callback for a tick is still
 *   registered when the next tick would start, the new tick is skipped with
 *   a structured warning (mirrors the HTML guard).
 * - Pause during active tick: NativeAudio.pause() is called only when a tick
 *   is playing (completion callback registered). During the gap phase nothing
 *   is playing, so NativeAudio.pause() is skipped to avoid plugin errors.
 * - Pause during gap: the gap timer is cleared and pendingIntervalRemainingMs
 *   is saved. On resume the gap timer is rescheduled from remaining time.
 * - Stop: completion callback cleared before _stopNativeAsset() to prevent
 *   ghost ticks from firing after explicit stop.
 * - If preload fails, the layer transparently falls back to HTMLAudioElement.
 *
 * ## Native preload — isComplex flag
 * The Java preloadAsset() only reads the `volume` (and `audioChannelNum`) params
 * when `isComplex: true` is passed. Without it the plugin silently defaults to
 * volume=1.0 regardless of what the JS call specifies. All loop preload() calls
 * include `isComplex: true` so the preload volume is respected.
 *
 * ## Pause vs Stop
 * - pauseAll: pauses audio (native + HTML), clears timeouts, stores remaining ms
 *   for resume. Does NOT reset currentTime or clear src on pause.
 * - stopLayer/stopAll: hard teardown — timers cleared, native stop+unload
 *   (or HTML currentTime=0/src='').
 *
 * ## Interval mode — field semantics
 *
 * The interval layer has two independent timing fields:
 *
 *   repeat_interval_seconds  — silence gap between the END of one playback and the
 *                              START of the next. This is NOT a period; it is the wait.
 *   play_duration_seconds    — total wall-clock time the layer stays active inside the
 *                              vibe session. All ticks must complete before this expires.
 *                              Null means "repeat until the user stops".
 *
 * Example:
 *   repeat_interval_seconds = 30, play_duration_seconds = 300
 *   → asset plays once → (silence 30 s) → plays again → … → layer stops at ~300 s
 *
 * This does NOT mean "play for 30 s then wait 30 s". Tick length is determined
 * solely by the audio file's natural duration.
 *
 * Future field (not yet implemented):
 *   tick_duration_seconds — maximum duration of a single tick before it is hard-stopped.
 *   TODO: Add tick_duration_seconds to backend vibe_sounds table and player-engine.service.ts.
 *         When set, each NativeAudio.play() tick should be force-stopped after
 *         tick_duration_seconds regardless of the file's natural length.
 *         Example: tick_duration_seconds=30, repeat_interval_seconds=30,
 *         play_duration_seconds=3600 → play 30 s → wait 30 s → repeat for 1 hour.
 *
 * ## Interval mode — other limitations
 * - Next tick is scheduled after `ended` (gap = repeatIntervalSeconds). If `ended`
 *   never fires the chain stalls.
 */

import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { NativeAudio } from '@capgo/native-audio';
import { audioEngine } from '@/services/audio-engine';
import type { PlayMode } from './vibe-sound.service';
import type { VibeExecutionLayer } from './player-engine.service';
import { hasValidExecutionFileUrl } from './player-engine.service';
import { createLogger } from '@/utils/player-debug';

const log = createLogger('AudioService');

/** True when running inside a native Capacitor app (Android / iOS). */
const _isNativePlatform = Capacitor.isNativePlatform();

// ── NativeAudio one-time configuration ───────────────────────────────────────
// backgroundPlayback: true — skips built-in auto-pause/resume so ExoPlayer
//   keeps running when the app backgrounds (process-keep-alive is the
//   foreground service in backgroundAudio.service.ts).
// showNotification: true — creates a native MediaSession + MediaStyle
//   notification with play/pause/stop controls on the lock screen and in the
//   notification shade. The plugin fires 'playbackState' events with
//   reason='remotePlay' / 'remotePause' / 'remoteStop' when those controls
//   are tapped, allowing us to route them back to the Pinia store.
// focus: true — requests Android AudioFocus (AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).
//   Android OS handles system-level ducking automatically. The plugin emits
//   'playbackState' events with reason='audioFocusLoss', 'audioFocusLossTransient',
//   or 'audioFocusGain' so we can sync Pinia state accordingly.
if (_isNativePlatform) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (NativeAudio.configure as any)({ backgroundPlayback: true, showNotification: true, focus: true, debug: true }).catch((err: unknown) => {
    log.warn('NativeAudio.configure failed', { err });
  });
}

// ── Notification / MediaSession vibe context ─────────────────────────────────
// Stored here so every preload call can embed the current vibe name as the
// notification title without requiring the store to be imported.

let _notificationVibeName   = '';
let _notificationArtworkUrl = '';

/** Active vibe id for offline manifest lookup — cleared when vibe context clears. */
let _playbackVibeId: number | null = null;

/**
 * Update the vibe name stored for upcoming NativeAudio preload metadata.
 * Call this from player.store.ts before audioPlayerService.playPlan().
 */
export function setNotificationVibeName(name: string): void {
  _notificationVibeName = name;
}

/**
 * Update the artwork URL stored for upcoming NativeAudio preload metadata.
 * Call this from player.store.ts before audioPlayerService.playPlan().
 * Pass null or empty string to clear (no artwork in notification).
 */
export function setNotificationArtworkUrl(url: string | null): void {
  _notificationArtworkUrl = url ?? '';
  log.debug('[Artwork] notification artwork URL updated', { hasArtwork: !!_notificationArtworkUrl });
}

/**
 * Pinia sets the active vibe id before playPlan() so native preload can resolve
 * offline copies (file://) saved via AudioEngine.cacheVibeAudio().
 */
function setPlaybackVibeContext(vibeId: number | null): void {
  _playbackVibeId = vibeId;
  log.debug('playbackVibeContext', { vibeId });
}

async function _resolvedAssetPath(layer: VibeExecutionLayer): Promise<string> {
  const id  = _playbackVibeId ?? 0;
  const url = await audioEngine.resolvePlaybackAssetUrl(layer, id);
  if (import.meta.env.DEV && typeof url === 'string' && url.trim().toLowerCase().startsWith('file:')) {
    console.log('[AudioCache] playback using local file URI', {
      soundId: layer.soundId,
      preview: url.length > 72 ? `${url.slice(0, 72)}…` : url,
    });
  }
  return url;
}

// ── Remote media control callbacks ───────────────────────────────────────────
// Registered once by the Pinia store so the global 'playbackState' listener
// can route lock-screen / notification / Bluetooth transport events back to
// store actions without importing the store here (avoids circular deps).

type MediaControlCb = () => void;

let _onRemotePlay:  MediaControlCb | null = null;
let _onRemotePause: MediaControlCb | null = null;
let _onRemoteStop:  MediaControlCb | null = null;

/**
 * Register Pinia store actions as media-control callbacks.
 * Called once from player.store.ts at store creation time.
 */
export function setMediaControlCallbacks(opts: {
  onPlay:  MediaControlCb;
  onPause: MediaControlCb;
  onStop:  MediaControlCb;
}): void {
  _onRemotePlay  = opts.onPlay;
  _onRemotePause = opts.onPause;
  _onRemoteStop  = opts.onStop;
}

// Tracks whether the most recent playback pause was caused by an audio focus
// loss so we can safely auto-resume on focus gain without resuming after a
// user-initiated pause.
let _pausedByAudioFocus = false;

// Global 'playbackState' listener — active for the lifetime of the app.
// Handles:
//   • Remote transport controls (lock screen / notification / Bluetooth)
//     reason: 'remotePlay', 'remotePause', 'remoteStop'
//   • Android audio focus events (phone calls, other audio apps, GPS)
//     reason: 'audioFocusLoss', 'audioFocusLossTransient', 'audioFocusGain'
// Local reasons ('play', 'pause', 'complete') are handled by store actions;
// reacting here would cause re-entrant loops.
if (_isNativePlatform) {
  void NativeAudio.addListener('playbackState', (event) => {
    const { assetId, state, reason } = event;

    // ── Remote media controls ─────────────────────────────────────────────
    if (reason.startsWith('remote')) {
      log.debug('[MediaSession] remote control event', { assetId, state, reason });
      if (state === 'playing')  _onRemotePlay?.();
      else if (state === 'paused')  _onRemotePause?.();
      else if (state === 'stopped') _onRemoteStop?.();
      return;
    }

    // ── Audio focus events ────────────────────────────────────────────────
    if (reason === 'audioFocusLossTransient') {
      // Another app temporarily needs audio (GPS navigation, voice command,
      // brief notification). Plugin has already paused native audio. Sync state.
      log.debug('[AudioFocus] transient loss — pausing', { assetId });
      _pausedByAudioFocus = true;
      _onRemotePause?.();
      return;
    }

    if (reason === 'audioFocusGain') {
      // Focus returned. Plugin has already resumed native audio. Sync state,
      // but only if WE paused due to focus — never auto-resume after a
      // user-initiated pause.
      log.debug('[AudioFocus] focus gained — resuming if focus-paused', { assetId, wasAutopaused: _pausedByAudioFocus });
      if (_pausedByAudioFocus) {
        _pausedByAudioFocus = false;
        _onRemotePlay?.();
      }
      return;
    }

    if (reason === 'audioFocusLoss') {
      // Permanent focus loss (phone call, another music player taking over).
      // Plugin has already stopped native audio. Stop fully, keep vibe selected
      // so user can manually resume.
      log.debug('[AudioFocus] permanent loss — stopping', { assetId });
      _pausedByAudioFocus = false;
      _onRemoteStop?.();
      return;
    }
  });
}

// ── Internal state ────────────────────────────────────────────────────────────

interface ManagedLayer {
  soundId: number;
  layer: VibeExecutionLayer;

  /**
   * True when this layer is backed by @capgo/native-audio instead of HTMLAudioElement.
   * Set synchronously in _startLoopAudio before the async native calls begin.
   */
  isNative: boolean;

  audio: HTMLAudioElement | null;

  startTimerId: ReturnType<typeof setTimeout> | null;
  durationTimerId: ReturnType<typeof setTimeout> | null;
  /** interval: silence gap before next tick */
  intervalTimerId: ReturnType<typeof setTimeout> | null;

  /** Wall-clock instant when the layer must be fully stopped (audio start + duration). */
  layerAbsoluteStopEpochMs: number | null;

  startFiresAtEpochMs: number | null;
  durationFiresAtEpochMs: number | null;
  intervalFiresAtEpochMs: number | null;

  pendingStartRemainingMs: number | null;
  pendingDurationRemainingMs: number | null;
  pendingIntervalRemainingMs: number | null;

  /** once: remove on stopLayer */
  onceEndedHandler: (() => void) | null;

  intervalTickEndedHandler: (() => void) | null;
  intervalTickErrorHandler: (() => void) | null;
}

const _layers = new Map<number, ManagedLayer>();

let _sessionPaused = false;

/**
 * Set to true during playPlan()/restartPlan() to suppress the session-ended
 * callback while the old layers are being torn down and new ones are being
 * registered. Without this guard, the callback fires as soon as stopAll()
 * clears the previous layers — before the new playLayer() calls have run —
 * which causes clearCurrentVibe() to execute in the middle of a plan rebuild,
 * leaving currentVibeId = null even though new layers are added a few
 * milliseconds later. This prevents the Mini Player from appearing.
 */
let _playPlanInProgress = false;

/**
 * Set to true during explicit stopAll() calls initiated by the user (e.g.
 * store.stopPlayback()). This suppresses the session-ended callback so that
 * the Pinia store's stopPlayback() action is the single place that resets
 * playbackState/currentVibeId — avoiding the double clearCurrentVibe() that
 * was visible in the logs when stopAll() triggered the callback synchronously
 * from within stopLayer(), then stopPlayback() cleared the state again.
 *
 * The session-ended callback is still fired for NATURAL endings:
 * - duration timers that fire while the session is active
 * - all layers finishing naturally without an explicit stop
 */
let _stopAllExplicit = false;

let _sessionEndedCallback: (() => void) | null = null;

export function setSessionEndedCallback(cb: (() => void) | null): void {
  _sessionEndedCallback = cb;
}

/**
 * Fires the session-ended callback only when ALL of the following are true:
 *   1. No layers remain in the map.
 *   2. The session is NOT currently paused.
 *
 * Condition 2 is critical for lifecycle awareness: when the app goes to
 * background we call pauseAll() which keeps layers in the map but sets
 * _sessionPaused = true. However, if an `ended` event that was already
 * queued by the browser fires AFTER pauseAll() ran, stopLayer() will
 * remove the last layer while _sessionPaused is still true. Without the
 * guard, _sessionEndedCallback (which clears currentVibeId and sets
 * playbackState → idle) would fire, making the mini player disappear.
 *
 * The callback fires correctly in the normal stop path because stopAll()
 * explicitly sets _sessionPaused = false before calling stopLayer().
 *
 * Condition 3 (_playPlanInProgress): suppressed while playPlan() rebuilds the
 * session. stopAll() is called at the start of playPlan() to tear down the
 * previous plan; without this guard the callback fires between teardown and
 * the new playLayer() registrations, causing clearCurrentVibe() to execute in
 * the middle of a restart — which makes the Mini Player disappear.
 */
function _notifySessionEndedIfEmpty(): void {
  if (!_layers.size && !_sessionPaused && !_playPlanInProgress && !_stopAllExplicit) {
    log.debug('sessionEnded — firing callback (natural end)', {
      layers:     _layers.size,
      paused:     _sessionPaused,
      inProgress: _playPlanInProgress,
      explicit:   _stopAllExplicit,
    });
    _sessionEndedCallback?.();
  }
}

// ── Playback prepare handshake (Pinia shows "preparing" until first audible start) ────────────────

type PrepareVoidCb = () => void;

let _onPlaybackPreparePrepared: PrepareVoidCb | null = null;
let _onPlaybackPrepareFailed: PrepareVoidCb | null = null;

interface PlaybackPrepareCtx {
  generation: number;
  expected: Set<number>;
  failed: Set<number>;
  settled: boolean;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

let _prepareCtx: PlaybackPrepareCtx | null = null;
let _prepareGeneration = 0;

const _PREPARE_TIMEOUT_MS = 25_000;

/** Registers callbacks so the store can transition preparing → playing (or fail). */
export function setPlaybackPrepareCallbacks(opts: { onPrepared: PrepareVoidCb; onFailed: PrepareVoidCb } | null): void {
  _onPlaybackPreparePrepared = opts?.onPrepared ?? null;
  _onPlaybackPrepareFailed = opts?.onFailed ?? null;
}

function _eligibleImmediatePrepareSoundIds(layers: VibeExecutionLayer[]): number[] {
  return layers
    .filter((layer) => {
      if (!hasValidExecutionFileUrl(layer.fileUrl)) return false;
      if (layer.playMode === 'interval') {
        const ri = layer.repeatIntervalSeconds;
        if (ri == null || ri < 1) return false;
      }
      return (layer.startsAtSeconds ?? 0) <= 0;
    })
    .map((l) => l.soundId);
}

function _cancelPlaybackPrepare(): void {
  if (_prepareCtx?.timeoutId != null) clearTimeout(_prepareCtx.timeoutId);
  _prepareCtx = null;
}

function _beginPlaybackPrepareHandshake(layers: VibeExecutionLayer[]): void {
  _cancelPlaybackPrepare();

  const immediateIds = _eligibleImmediatePrepareSoundIds(layers);
  _prepareGeneration++;
  const gen = _prepareGeneration;

  if (immediateIds.length === 0) {
    queueMicrotask(() => _signalPrepareSuccess(gen));
    return;
  }

  const timeoutId = setTimeout(() => {
    const ctx = _prepareCtx;
    if (ctx && ctx.generation === gen && !ctx.settled) {
      if (import.meta.env.DEV) {
        console.warn('[PlaybackState] prepare timeout — expected audible start from:', [...ctx.expected]);
      }
      _signalPrepareFailed(gen);
    }
  }, _PREPARE_TIMEOUT_MS);

  _prepareCtx = {
    generation: gen,
    expected: new Set(immediateIds),
    failed: new Set(),
    settled: false,
    timeoutId,
  };

  if (import.meta.env.DEV) {
    console.log('[PlaybackState] prepare handshake started', { immediateSoundIds: immediateIds });
  }
}

function _signalPrepareSuccess(gen: number): void {
  const ctx = _prepareCtx;
  if (!ctx || ctx.generation !== gen || ctx.settled) return;
  ctx.settled = true;
  if (ctx.timeoutId != null) clearTimeout(ctx.timeoutId);
  _prepareCtx = null;
  if (import.meta.env.DEV) console.log('[PlaybackState] prepare succeeded (audible layer)');
  _onPlaybackPreparePrepared?.();
}

function _signalPrepareFailed(gen: number): void {
  const ctx = _prepareCtx;
  if (!ctx || ctx.generation !== gen || ctx.settled) return;
  ctx.settled = true;
  if (ctx.timeoutId != null) clearTimeout(ctx.timeoutId);
  _prepareCtx = null;
  if (import.meta.env.DEV) console.warn('[PlaybackState] prepare failed (no audible layer)');
  _onPlaybackPrepareFailed?.();
}

function _playbackPrepareNotifySuccess(soundId: number): void {
  const ctx = _prepareCtx;
  if (!ctx || ctx.settled) return;
  if (!ctx.expected.has(soundId)) return;
  _signalPrepareSuccess(ctx.generation);
}

function _playbackPrepareNotifyFailure(soundId: number): void {
  const ctx = _prepareCtx;
  if (!ctx || ctx.settled) return;
  if (!ctx.expected.has(soundId)) return;
  ctx.failed.add(soundId);
  if (ctx.failed.size >= ctx.expected.size) {
    _signalPrepareFailed(ctx.generation);
  }
}

function _clampVolume(vol100: number): number {
  return Math.max(0, Math.min(1, vol100 / 100));
}

function _logPlayFailure(layer: VibeExecutionLayer, error: unknown): void {
  console.warn('[AudioPlayer] Failed to play layer', {
    soundId:   layer.soundId,
    soundName: layer.soundName,
    fileUrl:   layer.fileUrl,
    playMode:  layer.playMode as PlayMode,
    error,
  });
}

// ── Native audio helpers (@capgo/native-audio) ────────────────────────────────

/** assetIds of layers successfully preloaded on the native side. */
const _nativeLayers = new Set<string>();

/**
 * Single global NativeAudio 'complete' listener handle.
 * Initialized lazily on the first native once layer; never removed (module lifetime).
 * Dispatches to per-layer callbacks stored in _nativeOnceCompleteCallbacks.
 */
let _nativeOnceCompleteHandle: PluginListenerHandle | null = null;

/**
 * Map from assetId → teardown callback for native once layers.
 * Entries are removed either when the completion event fires or when
 * stopLayer() is called explicitly (to avoid spurious teardown after a stop).
 */
const _nativeOnceCompleteCallbacks = new Map<string, () => void>();

async function _ensureNativeOnceCompleteListener(): Promise<void> {
  if (_nativeOnceCompleteHandle) return;
  try {
    _nativeOnceCompleteHandle = await NativeAudio.addListener(
      'complete',
      ({ assetId }: { assetId: string }) => {
        log.debug('[NativeAudio][Once] complete event', { assetId });
        const cb = _nativeOnceCompleteCallbacks.get(assetId);
        if (cb) {
          _nativeOnceCompleteCallbacks.delete(assetId);
          cb();
        }
      },
    );
    log.debug('native once — complete listener registered');
  } catch (err) {
    log.warn('native once — failed to register complete listener', { err: String(err) });
  }
}

function _nativeAssetId(soundId: number): string {
  return `vibe-layer-${soundId}`;
}

/**
 * Converts 0–100 backend volume to the 0.1–1.0 range expected by NativeAudio.
 * The plugin does not support true silence via volume; stopping is used instead.
 */
function _toNativeVolume(vol100: number): number {
  return Math.max(0.1, Math.min(1, vol100 / 100));
}

function _logNativeFailure(fn: string, assetId: string, error: unknown): void {
  console.warn(`[AudioPlayer] NativeAudio.${fn}(${assetId}) failed`, error);
}

/**
 * Stops and unloads a native asset.
 *
 * Does NOT gate on `_nativeLayers.has(assetId)`. It always attempts stop +
 * unload so that assets orphaned in the plugin (JS state cleared by hot-reload,
 * a failed previous unload, etc.) are cleaned up before a fresh preload.
 * Fire-and-forget safe.
 */
async function _stopNativeAsset(assetId: string): Promise<void> {
  try { await NativeAudio.stop({ assetId }); } catch { /* already stopped or not loaded */ }
  try { await NativeAudio.unload({ assetId }); } catch { /* already unloaded */ }
  _nativeLayers.delete(assetId);
}

/**
 * Ensures no asset with `assetId` is registered in the native plugin before a
 * fresh preload. Uses `NativeAudio.isPreloaded()` as the source of truth — the
 * native plugin registry — rather than the JS `_nativeLayers` tracking set,
 * which can be out-of-sync after hot-reload, a failed unload, or a JS bridge
 * re-initialization that did not call the native cleanup path.
 *
 * Scenarios handled:
 *  A. Asset in native AND in _nativeLayers → normal stale cleanup
 *  B. Asset in native but NOT in _nativeLayers (orphan) → clean up the orphan
 *  C. Asset in _nativeLayers but NOT in native → JS de-sync; fix tracking only
 *  D. Neither → nothing to do
 */
async function _ensureNativeAssetClean(assetId: string): Promise<void> {
  let foundInNative = false;

  try {
    // isPreloaded() only needs assetId at runtime but the plugin types
    // incorrectly require the full PreloadOptions (including assetPath).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await NativeAudio.isPreloaded({ assetId } as any);
    foundInNative = result?.found ?? false;

    if (foundInNative) {
      log.warn('[NativeAudio][AssetLifecycle] stale asset detected in native registry — cleaning up', { assetId });
    }
  } catch (err) {
    // isPreloaded() failed — treat as "unknown" and attempt cleanup defensively
    // if JS tracking says the asset should exist.
    log.warn('[NativeAudio][AssetLifecycle] isPreloaded failed — cleaning up defensively', {
      assetId, err: String(err),
    });
    foundInNative = _nativeLayers.has(assetId); // fall back to JS truth
  }

  const foundInJs = _nativeLayers.has(assetId);

  if (!foundInNative && !foundInJs) return; // case D — nothing to do

  if (foundInNative) {
    log.warn('[NativeAudio][AssetLifecycle] stop before preload', { assetId });
    try { await NativeAudio.stop({ assetId }); } catch { /* already stopped */ }
    log.warn('[NativeAudio][AssetLifecycle] unload before preload', { assetId });
    try { await NativeAudio.unload({ assetId }); } catch { /* already unloaded */ }
  }

  if (foundInJs && !foundInNative) {
    log.warn('[NativeAudio][AssetLifecycle] JS tracking de-sync — asset in _nativeLayers but not in native; correcting', { assetId });
  }

  _nativeLayers.delete(assetId);
  log.debug('[NativeAudio][AssetLifecycle] preload after cleanup — ready for fresh preload', { assetId });
}

/**
 * Preloads and starts native looping for a layer.
 * Falls back to HTMLAudioElement if any native step fails.
 */
async function _startLoopAudioNative(
  layer: VibeExecutionLayer,
  managed: ManagedLayer,
): Promise<void> {
  const assetId = _nativeAssetId(layer.soundId);
  log.debug('native preload — start', { soundId: layer.soundId, assetId });

  // Ensure native registry is clear of any stale asset (JS state may be out-of-sync)
  await _ensureNativeAssetClean(assetId);

  // Guard: layer may have been stopped while we awaited above
  if (!_layers.has(layer.soundId)) {
    log.warn('native preload — layer removed while awaiting cleanup, aborting', { soundId: layer.soundId });
    return;
  }

  /*
   * IMPORTANT: isComplex:true is required so Java's preloadAsset() reads the
   * `volume` param. Without it the plugin silently initialises ExoPlayer at
   * 1.0 regardless of what we pass.
   */
  const targetVol = _toNativeVolume(layer.volume);

  let assetPath: string;
  try {
    assetPath = await _resolvedAssetPath(layer);
  } catch (err) {
    log.warn('native preload — resolve URL failed, using remote', { soundId: layer.soundId, err: String(err) });
    assetPath = layer.fileUrl;
  }

  try {
    await NativeAudio.preload({
      assetId,
      assetPath,
      isUrl:           true,
      // isComplex: true is a Java-side flag not in the TS typings.
      // Without it preloadAsset() ignores `volume` and `audioChannelNum`,
      // silently initialising ExoPlayer at full volume (1.0).
      isComplex:       true,
      volume:          targetVol,
      audioChannelNum: 1,
      notificationMetadata: {
        title:      _notificationVibeName || layer.soundName,
        artist:     layer.soundName,
        artworkUrl: _notificationArtworkUrl || undefined,
      },
    } as Parameters<typeof NativeAudio.preload>[0]);
    _nativeLayers.add(assetId);
    log.debug('[Artwork] loop preload metadata', { assetId, title: _notificationVibeName, hasArtwork: !!_notificationArtworkUrl });
    log.debug('native preload — OK', { assetId, nativeCount: _nativeLayers.size });
  } catch (err) {
    _logNativeFailure('preload', assetId, err);
    log.warn('native preload — FAILED, falling back to HTML', { assetId, err: String(err) });
    if (_layers.has(layer.soundId)) {
      managed.isNative = false;
      void _startLoopAudioHtml(layer, managed, 'preload-failed').catch((e) =>
        log.warn('HTML loop fallback failed', { err: String(e) }),
      );
    }
    return;
  }

  if (!_layers.has(layer.soundId)) {
    log.warn('native preload — layer removed while preloading, unloading asset', { assetId });
    void _stopNativeAsset(assetId);
    return;
  }

  try {
    log.debug('native loop — starting', {
      assetId,
      soundId:       layer.soundId,
      targetVol,
      sessionPaused: _sessionPaused,
    });

    await NativeAudio.loop({ assetId });

    log.debug('native loop — bridge resolved', { assetId, sessionPaused: _sessionPaused });

    _playbackPrepareNotifySuccess(layer.soundId);

    // Race-condition guard: if the session was paused while we were awaiting
    // loop(), immediately pause the native player so state stays consistent.
    if (_sessionPaused && _nativeLayers.has(assetId)) {
      log.debug('native loop — session was paused during preload, pausing immediately', { assetId });
      void NativeAudio.pause({ assetId }).catch((e) => _logNativeFailure('pause (race)', assetId, e));
    }
  } catch (err) {
    _logNativeFailure('loop', assetId, err);
    log.warn('native loop — FAILED, falling back to HTML', { assetId, err: String(err) });
    _nativeLayers.delete(assetId);
    if (_layers.has(layer.soundId)) {
      managed.isNative = false;
      void _startLoopAudioHtml(layer, managed, 'loop-failed').catch((e) =>
        log.warn('HTML loop fallback failed', { err: String(e) }),
      );
    }
  }
}

function _clearStartTimer(managed: ManagedLayer): void {
  if (managed.startTimerId !== null) {
    clearTimeout(managed.startTimerId);
    managed.startTimerId = null;
  }
}

function _clearDurationTimer(managed: ManagedLayer): void {
  if (managed.durationTimerId !== null) {
    clearTimeout(managed.durationTimerId);
    managed.durationTimerId = null;
  }
}

function _clearIntervalTimer(managed: ManagedLayer): void {
  if (managed.intervalTimerId !== null) {
    clearTimeout(managed.intervalTimerId);
    managed.intervalTimerId = null;
  }
}

function _detachIntervalTickListeners(managed: ManagedLayer): void {
  const audio = managed.audio;
  if (!audio) return;

  if (managed.intervalTickEndedHandler) {
    audio.removeEventListener('ended', managed.intervalTickEndedHandler);
    managed.intervalTickEndedHandler = null;
  }
  if (managed.intervalTickErrorHandler) {
    audio.removeEventListener('error', managed.intervalTickErrorHandler);
    managed.intervalTickErrorHandler = null;
  }
}

/**
 * Schedules a hard stop at durationSeconds. No fade-out is applied.
 * FadeOut was removed — see docs/issues/audio-engine-fade-limitations.md.
 */
function _scheduleLayerLifetime(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  managed.layerAbsoluteStopEpochMs = null;

  if (layer.durationSeconds == null) return;

  _clearDurationTimer(managed);

  const durMs = layer.durationSeconds * 1_000;
  managed.layerAbsoluteStopEpochMs = Date.now() + durMs;
  managed.durationFiresAtEpochMs   = managed.layerAbsoluteStopEpochMs;

  managed.durationTimerId = setTimeout(() => {
    managed.durationTimerId          = null;
    managed.durationFiresAtEpochMs   = null;
    managed.layerAbsoluteStopEpochMs = null;
    stopLayer(layer.soundId);
  }, durMs);
}

function _beginLayerAfterDelay(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  managed.startTimerId        = null;
  managed.startFiresAtEpochMs = null;
  managed.pendingStartRemainingMs = null;

  if (_sessionPaused) return;

  _scheduleLayerLifetime(layer, managed);

  switch (layer.playMode) {
    case 'loop':
      _startLoopAudio(layer, managed);
      break;
    case 'once':
      _startOnceAudio(layer, managed);
      break;
    case 'interval':
      _startIntervalAudio(layer, managed);
      break;
  }
}

/** HTMLAudioElement loop — used as fallback on web and when native preload/loop fails. */
async function _startLoopAudioHtml(
  layer: VibeExecutionLayer,
  managed: ManagedLayer,
  reason: 'web-platform' | 'preload-failed' | 'loop-failed' = 'web-platform',
): Promise<void> {
  log.debug('HTML loop — start', { soundId: layer.soundId, reason });
  let src = layer.fileUrl;
  try {
    src = await _resolvedAssetPath(layer);
  } catch (err) {
    log.warn('HTML loop — resolve URL failed, using remote', { soundId: layer.soundId, err: String(err) });
  }
  const audio = new Audio(src);
  audio.loop  = true;
  audio.volume = _clampVolume(layer.volume);
  managed.audio = audio;
  audio
    .play()
    .then(() => _playbackPrepareNotifySuccess(layer.soundId))
    .catch((error) => {
      _logPlayFailure(layer, error);
      _playbackPrepareNotifyFailure(layer.soundId);
    });
}

/**
 * Starts loop playback. On native platforms uses @capgo/native-audio;
 * on web falls back to HTMLAudioElement. Also falls back to HTML if any
 * native step fails.
 */
function _startLoopAudio(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  if (_isNativePlatform) {
    log.debug('loop backend — Native (@capgo/native-audio)', { soundId: layer.soundId });
    managed.isNative = true;
    void _startLoopAudioNative(layer, managed);
  } else {
    log.debug('loop backend — HTMLAudioElement (web platform)', { soundId: layer.soundId });
    void _startLoopAudioHtml(layer, managed, 'web-platform').catch((e) =>
      log.warn('HTML loop failed', { soundId: layer.soundId, err: String(e) }),
    );
  }
}

/**
 * HTMLAudioElement once implementation — used on web and as fallback when
 * any native once step (preload / play) fails.
 */
async function _startOnceAudioHtml(layer: VibeExecutionLayer, managed: ManagedLayer): Promise<void> {
  log.debug('HTML once — start', { soundId: layer.soundId });
  let src = layer.fileUrl;
  try {
    src = await _resolvedAssetPath(layer);
  } catch (err) {
    log.warn('HTML once — resolve URL failed, using remote', { soundId: layer.soundId, err: String(err) });
  }
  const audio = new Audio(src);
  audio.loop = false;
  const target = _clampVolume(layer.volume);
  managed.audio = audio;

  const handler = (): void => {
    if (managed.onceEndedHandler !== handler) return;
    /*
     * Guard: if the session is paused, the `ended` event may have been
     * enqueued in the browser event loop before pauseAll() ran (the clip
     * was finishing exactly as the app went to background). Do NOT tear
     * down the layer here — resumeAll() will handle it correctly later.
     * Without this guard, stopLayer() would be called while _sessionPaused
     * is true, and _notifySessionEndedIfEmpty would clear the vibe context.
     */
    if (_sessionPaused) return;
    managed.onceEndedHandler = null;
    audio.removeEventListener('ended', handler);
    stopLayer(layer.soundId);
  };

  managed.onceEndedHandler = handler;
  audio.addEventListener('ended', handler);

  audio.volume = target;
  audio
    .play()
    .then(() => _playbackPrepareNotifySuccess(layer.soundId))
    .catch((error) => {
      _logPlayFailure(layer, error);
      _playbackPrepareNotifyFailure(layer.soundId);
    });
}

/**
 * Preloads and starts native once playback for a layer.
 * Uses NativeAudio.play() (not loop()). Completion is detected via the
 * global 'complete' event dispatched through _nativeOnceCompleteCallbacks.
 * Falls back to HTMLAudioElement if any native step fails.
 */
async function _startOnceAudioNative(
  layer: VibeExecutionLayer,
  managed: ManagedLayer,
): Promise<void> {
  const assetId = _nativeAssetId(layer.soundId);
  log.debug('[NativeAudio][Once] preload — start', { soundId: layer.soundId, assetId });

  // Ensure global complete listener is ready before we register a callback
  await _ensureNativeOnceCompleteListener();

  // Ensure native registry is clear of any stale asset (JS state may be out-of-sync)
  await _ensureNativeAssetClean(assetId);

  // Guard: layer may have been stopped while awaiting above
  if (!_layers.has(layer.soundId)) {
    log.warn('[NativeAudio][Once] layer removed while awaiting cleanup, aborting', { soundId: layer.soundId });
    return;
  }

  const targetVol = _toNativeVolume(layer.volume);

  let assetPath: string;
  try {
    assetPath = await _resolvedAssetPath(layer);
  } catch (err) {
    log.warn('[NativeAudio][Once] resolve URL failed, using remote', { soundId: layer.soundId, err: String(err) });
    assetPath = layer.fileUrl;
  }

  try {
    await NativeAudio.preload({
      assetId,
      assetPath,
      isUrl: true,
      volume: targetVol,
      audioChannelNum: 1,
      notificationMetadata: {
        title:      _notificationVibeName || layer.soundName,
        artist:     layer.soundName,
        artworkUrl: _notificationArtworkUrl || undefined,
      },
    });
    _nativeLayers.add(assetId);
    log.debug('[Artwork] once preload metadata', { assetId, title: _notificationVibeName, hasArtwork: !!_notificationArtworkUrl });
    log.debug('[NativeAudio][Once] preload — OK', { assetId, nativeCount: _nativeLayers.size });
  } catch (err) {
    _logNativeFailure('preload (once)', assetId, err);
    log.warn('[NativeAudio][Once] preload — FAILED, falling back to HTML', { assetId, err: String(err) });
    if (_layers.has(layer.soundId)) {
      managed.isNative = false;
      void _startOnceAudioHtml(layer, managed).catch((e) => log.warn('HTML once fallback failed', { err: String(e) }));
    }
    return;
  }

  // Guard again: layer may have been stopped during preload
  if (!_layers.has(layer.soundId)) {
    log.warn('[NativeAudio][Once] layer removed during preload, unloading asset', { assetId });
    void _stopNativeAsset(assetId);
    return;
  }

  // Register completion callback BEFORE play() to avoid a race where the
  // audio completes before the callback is installed (very short sounds).
  _nativeOnceCompleteCallbacks.set(assetId, () => {
    log.debug('[NativeAudio][Once] complete — fired', { assetId, sessionPaused: _sessionPaused });
    /*
     * Guard: NativeAudio should not fire 'complete' while paused, but as a
     * safety net we skip teardown if the session is currently paused.
     * The player will handle cleanup when the user explicitly stops.
     */
    if (_sessionPaused) {
      log.warn('[NativeAudio][Once] complete fired while paused — ignoring', { assetId });
      return;
    }
    _nativeLayers.delete(assetId);
    if (_layers.has(layer.soundId)) {
      stopLayer(layer.soundId);
    }
  });

  try {
    await NativeAudio.play({ assetId });
    log.debug('[NativeAudio][Once] play — started', {
      assetId,
      soundId:       layer.soundId,
      sessionPaused: _sessionPaused,
      layersSize:    _layers.size,
    });

    // Race guard: if the session was paused while we were preloading,
    // immediately pause the native player so state stays consistent.
    if (_sessionPaused && _nativeLayers.has(assetId)) {
      log.debug('[NativeAudio][Once] session paused during preload, pausing immediately', { assetId });
      void NativeAudio.pause({ assetId }).catch((e) => _logNativeFailure('pause (race once)', assetId, e));
    }

    _playbackPrepareNotifySuccess(layer.soundId);
  } catch (err) {
    _logNativeFailure('play (once)', assetId, err);
    log.warn('[NativeAudio][Once] play — FAILED, falling back to HTML', { assetId, err: String(err) });
    // Clean up: remove native registration and stale completion callback
    _nativeLayers.delete(assetId);
    _nativeOnceCompleteCallbacks.delete(assetId);
    if (_layers.has(layer.soundId)) {
      managed.isNative = false;
      void _startOnceAudioHtml(layer, managed).catch((e) => log.warn('HTML once fallback failed', { err: String(e) }));
    }
  }
}

/**
 * Starts once playback. On native platforms uses @capgo/native-audio;
 * on web falls back to HTMLAudioElement. Also falls back to HTML if any
 * native step fails.
 */
function _startOnceAudio(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  if (_isNativePlatform) {
    log.debug('once backend — Native (@capgo/native-audio)', { soundId: layer.soundId });
    managed.isNative = true;
    void _startOnceAudioNative(layer, managed);
  } else {
    log.debug('once backend — HTMLAudioElement (web platform)', { soundId: layer.soundId });
    void _startOnceAudioHtml(layer, managed).catch((e) =>
      log.warn('HTML once failed', { soundId: layer.soundId, err: String(e) }),
    );
  }
}

/**
 * Preloads the interval asset once, then fires the first tick.
 * Subsequent ticks are driven by the 'complete' event → gap timer → _intervalPlayTick.
 * Falls back to HTMLAudioElement if preload fails.
 */
async function _startIntervalAudioNative(
  layer: VibeExecutionLayer,
  managed: ManagedLayer,
): Promise<void> {
  const assetId = _nativeAssetId(layer.soundId);
  log.debug('[NativeAudio][Interval] preload — start', { soundId: layer.soundId, assetId });

  // Ensure global complete listener is ready
  await _ensureNativeOnceCompleteListener();

  // Ensure native registry is clear of any stale asset (JS state may be out-of-sync)
  await _ensureNativeAssetClean(assetId);

  // Guard: layer may have been stopped while awaiting above
  if (!_layers.has(layer.soundId)) {
    log.warn('[NativeAudio][Interval] layer removed while awaiting cleanup, aborting', { soundId: layer.soundId });
    return;
  }

  let assetPath: string;
  try {
    assetPath = await _resolvedAssetPath(layer);
  } catch (err) {
    log.warn('[NativeAudio][Interval] resolve URL failed, using remote', { soundId: layer.soundId, err: String(err) });
    assetPath = layer.fileUrl;
  }

  try {
    await NativeAudio.preload({
      assetId,
      assetPath,
      isUrl: true,
      volume: _toNativeVolume(layer.volume),
      audioChannelNum: 1,
      notificationMetadata: {
        title:      _notificationVibeName || layer.soundName,
        artist:     layer.soundName,
        artworkUrl: _notificationArtworkUrl || undefined,
      },
    });
    _nativeLayers.add(assetId);
    log.debug('[Artwork] interval preload metadata', { assetId, title: _notificationVibeName, hasArtwork: !!_notificationArtworkUrl });
    log.debug('[NativeAudio][Interval] preload — OK', { assetId, nativeCount: _nativeLayers.size });
  } catch (err) {
    _logNativeFailure('preload (interval)', assetId, err);
    log.warn('[NativeAudio][Interval] preload — FAILED, falling back to HTML', { assetId, err: String(err) });
    if (_layers.has(layer.soundId)) {
      managed.isNative = false;
      _intervalPlayTick(layer, managed); // HTML fallback via dispatcher
    }
    return;
  }

  // Guard again: layer may have been stopped during preload
  if (!_layers.has(layer.soundId)) {
    log.warn('[NativeAudio][Interval] layer removed during preload, unloading asset', { assetId });
    void _stopNativeAsset(assetId);
    return;
  }

  // Kick off the first tick (managed.isNative is already true)
  _intervalPlayTick(layer, managed);
}

/**
 * Starts interval playback. On native platforms, preloads the asset once and
 * then drives ticks via the 'complete' event + gap timers. Falls back to
 * HTMLAudioElement on web or if the initial native preload fails.
 */
function _startIntervalAudio(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  if (_isNativePlatform) {
    log.debug('interval backend — Native (@capgo/native-audio)', { soundId: layer.soundId });
    managed.isNative = true;
    void _startIntervalAudioNative(layer, managed);
  } else {
    log.debug('interval backend — HTMLAudioElement (web platform)', { soundId: layer.soundId });
    _intervalPlayTick(layer, managed); // HTML via dispatcher (isNative = false)
  }
}

function _scheduleNextIntervalGap(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  const gapSec = layer.repeatIntervalSeconds ?? 0;
  const gapMs  = gapSec * 1_000;

  if (gapMs < 1_000) {
    log.warn('[Interval] invalid gap — repeatIntervalSeconds too small, skipping next tick', {
      soundId: layer.soundId,
      repeatIntervalSeconds: layer.repeatIntervalSeconds,
    });
    return;
  }

  _clearIntervalTimer(managed);

  log.debug('[Interval] next tick gap scheduled', {
    soundId: layer.soundId,
    gapSec,
  });

  managed.intervalFiresAtEpochMs = Date.now() + gapMs;
  managed.intervalTimerId = setTimeout(() => {
    managed.intervalTimerId        = null;
    managed.intervalFiresAtEpochMs = null;
    if (!_layers.has(layer.soundId)) {
      log.debug('[Interval] gap expired — tick skipped: layer was stopped', { soundId: layer.soundId });
      return;
    }
    if (_sessionPaused) {
      // pauseAll() should have cleared this timer and stored pendingIntervalRemainingMs.
      // This guard catches a microqueue race where the callback fires just after
      // _sessionPaused is set. resumeAll() will reschedule from pendingIntervalRemainingMs.
      log.debug('[Interval] gap expired — tick skipped: session paused (race guard)', { soundId: layer.soundId });
      return;
    }
    log.debug('[Interval] gap expired — firing tick', { soundId: layer.soundId });
    _intervalPlayTick(layer, managed);
  }, gapMs);
}

/**
 * HTMLAudioElement interval tick — used on web and as fallback.
 * A new short-lived audio element is created for each tick. The existing
 * element (if any) is torn down before the new one starts.
 */
async function _intervalPlayTickHtml(layer: VibeExecutionLayer, managed: ManagedLayer): Promise<void> {
  /* Previous tick still alive (shouldn't happen normally, but guard) */
  if (managed.audio !== null) {
    _tearDownIntervalTickAudio(managed);
  }

  let src = layer.fileUrl;
  try {
    src = await _resolvedAssetPath(layer);
  } catch (err) {
    log.warn('[Interval][HTML] resolve URL failed, using remote', { soundId: layer.soundId, err: String(err) });
  }

  const audio = new Audio(src);
  audio.loop = false;
  const target = _clampVolume(layer.volume);

  const onEnded = (): void => {
    _tearDownIntervalTickAudio(managed);
    if (!_layers.has(layer.soundId) || _sessionPaused) return;
    _scheduleNextIntervalGap(layer, managed);
  };

  const onError = (): void => {
    _tearDownIntervalTickAudio(managed);
    if (!_layers.has(layer.soundId) || _sessionPaused) return;
    _scheduleNextIntervalGap(layer, managed);
  };

  managed.intervalTickEndedHandler = onEnded;
  managed.intervalTickErrorHandler = onError;
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('error', onError);

  managed.audio = audio;
  audio.volume  = target;
  audio
    .play()
    .then(() => _playbackPrepareNotifySuccess(layer.soundId))
    .catch((error) => {
      _logPlayFailure(layer, error);
      onError();
    });
}

/** Tear down a single HTML interval tick element. */
function _tearDownIntervalTickAudio(managed: ManagedLayer): void {
  const audio = managed.audio;
  _detachIntervalTickListeners(managed);

  if (audio) {
    audio.pause();
    audio.src = '';
    managed.audio = null;
  }
}

/**
 * Native interval tick — calls NativeAudio.play() on the already-preloaded
 * asset. The global 'complete' listener schedules the next gap when the tick
 * finishes. Overlap prevention: if the completion callback is still registered
 * (previous tick not yet done), the new tick is skipped with a warning.
 */
async function _intervalPlayTickNative(
  layer: VibeExecutionLayer,
  managed: ManagedLayer,
): Promise<void> {
  const assetId = _nativeAssetId(layer.soundId);

  // Overlap prevention: if the completion callback for the previous tick is
  // still registered, that tick is still playing → skip this one.
  if (_nativeOnceCompleteCallbacks.has(assetId)) {
    log.warn('[NativeAudio][Interval] tick skipped — previous tick still playing', {
      assetId,
      soundId: layer.soundId,
    });
    return;
  }

  if (!_nativeLayers.has(assetId)) {
    // Asset was unloaded unexpectedly; layer will stop naturally via duration/stop.
    log.warn('[NativeAudio][Interval] tick skipped — asset not preloaded', { assetId });
    return;
  }

  // Register completion callback BEFORE play() to avoid missing the event
  // for very short audio files.
  _nativeOnceCompleteCallbacks.set(assetId, () => {
    log.debug('[NativeAudio][Interval] tick complete', { assetId, sessionPaused: _sessionPaused });
    if (_sessionPaused) {
      log.warn('[NativeAudio][Interval] tick complete while paused — ignoring', { assetId });
      return;
    }
    if (!_layers.has(layer.soundId)) return;
    log.debug('[NativeAudio][Interval] scheduling next gap', {
      assetId,
      gapSec: layer.repeatIntervalSeconds,
    });
    _scheduleNextIntervalGap(layer, managed);
  });

  try {
    await NativeAudio.play({ assetId });
    log.debug('[NativeAudio][Interval] tick play — started', {
      assetId,
      soundId:      layer.soundId,
      sessionPaused: _sessionPaused,
    });

    _playbackPrepareNotifySuccess(layer.soundId);

    // Race guard: session paused while we were awaiting play()
    if (_sessionPaused && _nativeLayers.has(assetId)) {
      log.debug('[NativeAudio][Interval] session paused during tick start, pausing immediately', { assetId });
      void NativeAudio.pause({ assetId }).catch((e) => _logNativeFailure('pause (race interval)', assetId, e));
    }
  } catch (err) {
    _logNativeFailure('play (interval tick)', assetId, err);
    log.warn('[NativeAudio][Interval] tick play — FAILED, scheduling next gap anyway', {
      assetId,
      err: String(err),
    });
    // Remove stale completion callback and keep the interval alive by
    // scheduling the next gap so a transient error doesn't kill the layer.
    _nativeOnceCompleteCallbacks.delete(assetId);
    if (_layers.has(layer.soundId) && !_sessionPaused) {
      _scheduleNextIntervalGap(layer, managed);
    }
  }
}

/**
 * Dispatcher for interval ticks. Routes to native or HTML based on managed.isNative.
 * Also the entry point called by the gap timer for subsequent ticks.
 */
function _intervalPlayTick(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  _clearIntervalTimer(managed);
  managed.intervalFiresAtEpochMs = null;

  if (_sessionPaused) {
    log.debug('[Interval] tick suppressed — session paused', { soundId: layer.soundId });
    return;
  }

  log.debug('[Interval] tick starting', {
    soundId:  layer.soundId,
    isNative: managed.isNative,
    repeatIntervalSeconds: layer.repeatIntervalSeconds,
  });

  if (managed.isNative) {
    void _intervalPlayTickNative(layer, managed);
  } else {
    void _intervalPlayTickHtml(layer, managed).catch((e) =>
      log.warn('[Interval][HTML] tick failed', { soundId: layer.soundId, err: String(e) }),
    );
  }
}

// ── Public per-layer API ──────────────────────────────────────────────────────

function playLayer(layer: VibeExecutionLayer): void {
  stopLayer(layer.soundId);

  if (!hasValidExecutionFileUrl(layer.fileUrl)) {
    log.warn('playLayer — skipped: invalid fileUrl', {
      soundId:  layer.soundId,
      playMode: layer.playMode as PlayMode,
    });
    console.warn('[AudioPlayer] Skipping layer — invalid fileUrl', {
      soundId:   layer.soundId,
      soundName: layer.soundName,
      fileUrl:   layer.fileUrl,
      playMode:  layer.playMode as PlayMode,
    });
    return;
  }

  if (layer.playMode === 'interval') {
    const ri = layer.repeatIntervalSeconds;
    if (ri == null || ri < 1) {
      log.warn('playLayer — skipped: invalid repeatIntervalSeconds', {
        soundId: layer.soundId,
        ri,
      });
      console.warn('[AudioPlayer] Skipping interval layer — invalid repeatIntervalSeconds', {
        soundId:   layer.soundId,
        soundName: layer.soundName,
        fileUrl:   layer.fileUrl,
        playMode:  'interval' as const,
      });
      return;
    }
  }

  const managed: ManagedLayer = {
    soundId:                      layer.soundId,
    layer,
    isNative:                     false,
    audio:                        null,
    startTimerId:                 null,
    durationTimerId:              null,
    intervalTimerId:              null,
    layerAbsoluteStopEpochMs:     null,
    startFiresAtEpochMs:          null,
    durationFiresAtEpochMs:       null,
    intervalFiresAtEpochMs:       null,
    pendingStartRemainingMs:      null,
    pendingDurationRemainingMs:   null,
    pendingIntervalRemainingMs:   null,
    onceEndedHandler:             null,
    intervalTickEndedHandler:     null,
    intervalTickErrorHandler:     null,
  };

  _layers.set(layer.soundId, managed);
  log.debug('playLayer — registered', {
    soundId:     layer.soundId,
    playMode:    layer.playMode as PlayMode,
    startsAt:    layer.startsAtSeconds,
    duration:    layer.durationSeconds ?? null,
    layersSize:  _layers.size,
  });

  if (layer.startsAtSeconds > 0) {
    const delayMs = layer.startsAtSeconds * 1_000;
    managed.startFiresAtEpochMs = Date.now() + delayMs;
    managed.startTimerId = setTimeout(() => {
      managed.startTimerId        = null;
      managed.startFiresAtEpochMs = null;
      if (!_layers.has(layer.soundId)) return;
      _beginLayerAfterDelay(layer, managed);
    }, delayMs);
  } else {
    _beginLayerAfterDelay(layer, managed);
  }
}

function stopLayer(soundId: number): void {
  const managed = _layers.get(soundId);
  if (!managed) return;

  log.debug('stopLayer', {
    soundId,
    playMode:  managed.layer.playMode as PlayMode,
    isNative:  managed.isNative,
    layersAfter: _layers.size - 1,
  });

  _clearStartTimer(managed);
  _clearDurationTimer(managed);
  _clearIntervalTimer(managed);

  managed.startFiresAtEpochMs      = null;
  managed.durationFiresAtEpochMs   = null;
  managed.intervalFiresAtEpochMs   = null;
  managed.layerAbsoluteStopEpochMs = null;
  managed.pendingStartRemainingMs  = null;
  managed.pendingDurationRemainingMs = null;
  managed.pendingIntervalRemainingMs = null;

  if (managed.isNative) {
    // Remove once-completion callback BEFORE stopping the native asset to
    // prevent the 'complete' event from re-entering stopLayer() after an
    // explicit stop (the event may still fire transiently on some devices).
    _nativeOnceCompleteCallbacks.delete(_nativeAssetId(soundId));
    // Fire-and-forget: stop + unload the native asset asynchronously
    void _stopNativeAsset(_nativeAssetId(soundId));
  } else {
    const audio = managed.audio;

    if (managed.onceEndedHandler && audio) {
      audio.removeEventListener('ended', managed.onceEndedHandler);
      managed.onceEndedHandler = null;
    }

    _detachIntervalTickListeners(managed);

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      managed.audio = null;
    }
  }

  _layers.delete(soundId);
  _notifySessionEndedIfEmpty();
}

// ── Session API ─────────────────────────────────────────────────────────────────

function playPlan(layers: VibeExecutionLayer[]): void {
  log.debug('playPlan — start', {
    incomingLayers: layers.length,
    currentLayers:  _layers.size,
    isNativePlatform: _isNativePlatform,
  });
  // Suppress the session-ended callback while tearing down the previous plan
  // and registering new layers. The callback is re-evaluated at the end so
  // it fires correctly if ALL new layers fail validation (nothing in _layers).
  _playPlanInProgress = true;
  try {
    stopAll();
    _sessionPaused = false;
    for (const layer of layers) {
      playLayer(layer);
    }
  } finally {
    _playPlanInProgress = false;
    log.debug('playPlan — end', {
      registeredLayers: _layers.size,
      nativeLayers:     _nativeLayers.size,
    });
    // Fire now if every layer was skipped due to validation errors.
    _notifySessionEndedIfEmpty();

    if (_layers.size > 0) {
      _beginPlaybackPrepareHandshake(layers);
    } else {
      // Valid layers were counted but none registered — complete prepare→error path.
      queueMicrotask(() => _onPlaybackPrepareFailed?.());
    }
  }
}

function restartPlan(layers: VibeExecutionLayer[]): void {
  playPlan(layers);
}

/**
 * After pause: restore a single hard stop timer from remaining wall-clock lifetime.
 * Does not re-apply fade-out ramp (Phase 3 simplicity).
 */
function _resumeLayerDurationAfterPause(managed: ManagedLayer, layer: VibeExecutionLayer): void {
  const remDur = managed.pendingDurationRemainingMs;
  if (remDur === null) return;

  managed.pendingDurationRemainingMs = null;

  if (remDur <= 0) {
    managed.layerAbsoluteStopEpochMs = null;
    stopLayer(layer.soundId);
    return;
  }

  managed.layerAbsoluteStopEpochMs = Date.now() + remDur;
  managed.durationTimerId = setTimeout(() => {
    managed.durationTimerId          = null;
    managed.durationFiresAtEpochMs   = null;
    managed.layerAbsoluteStopEpochMs = null;
    stopLayer(layer.soundId);
  }, remDur);
}

export type ResumeAllSkippedReason = 'not_paused' | 'no_layers' | 'nothing_to_resume';

export interface ResumeAllResult {
  /** True when at least one layer/timer was resumed and all native/HTML resumes succeeded. */
  resumed: boolean;
  /** Set when resumeAll returned early without attempting playback. */
  skipped?: ResumeAllSkippedReason;
  /** Native asset ids whose NativeAudio.resume() rejected. */
  failedAssetIds?: string[];
  /** True when an HTMLAudioElement.play() rejected during resume. */
  htmlPlayFailed?: boolean;
}

function pauseAll(): void {
  log.debug('pauseAll', { layers: _layers.size, nativeLayers: _nativeLayers.size });
  if (!_layers.size) {
    log.debug('pauseAll — no layers, skipping');
    return;
  }

  _sessionPaused = true;

  for (const managed of _layers.values()) {
    const layer = managed.layer;

    if (managed.startTimerId !== null) {
      _clearStartTimer(managed);
      if (managed.startFiresAtEpochMs !== null) {
        managed.pendingStartRemainingMs = Math.max(0, managed.startFiresAtEpochMs - Date.now());
        managed.startFiresAtEpochMs     = null;
      }
    }

    if (managed.durationTimerId !== null) {
      _clearDurationTimer(managed);
    }
    managed.durationFiresAtEpochMs = null;

    if (managed.layerAbsoluteStopEpochMs !== null) {
      managed.pendingDurationRemainingMs = Math.max(
        0,
        managed.layerAbsoluteStopEpochMs - Date.now(),
      );
    } else {
      managed.pendingDurationRemainingMs = null;
    }

    if (managed.intervalTimerId !== null) {
      _clearIntervalTimer(managed);
      if (managed.intervalFiresAtEpochMs !== null) {
        managed.pendingIntervalRemainingMs = Math.max(0, managed.intervalFiresAtEpochMs - Date.now());
        managed.intervalFiresAtEpochMs     = null;
      }
    }

    if (managed.isNative) {
      const assetId = _nativeAssetId(managed.soundId);
      /*
       * For interval layers, the asset may be preloaded but NOT playing
       * (we are in the gap between ticks — intervalTimerId was active).
       * Calling NativeAudio.pause() on an asset that is already stopped
       * produces a plugin error on Android. Only pause if a tick is
       * currently playing, which is indicated by the completion callback
       * being registered in _nativeOnceCompleteCallbacks.
       *
       * For loop and once layers, _nativeOnceCompleteCallbacks never has an
       * entry (loop) or always has one while playing (once), so the simpler
       * check `layer.playMode !== 'interval'` is used as an additional guard.
       */
      const tickPlaying =
        layer.playMode !== 'interval' || _nativeOnceCompleteCallbacks.has(assetId);
      if (_nativeLayers.has(assetId) && tickPlaying) {
        void NativeAudio.pause({ assetId }).catch((e) => _logNativeFailure('pause', assetId, e));
      }
    } else if (managed.audio !== null) {
      managed.audio.pause();
    }
  }
}

async function resumeAll(): Promise<ResumeAllResult> {
  log.debug('resumeAll', {
    sessionPaused: _sessionPaused,
    layers:        _layers.size,
    nativeLayers:  _nativeLayers.size,
  });

  if (!_sessionPaused) {
    log.debug('resumeAll — skipped', { reason: 'not_paused' });
    return { resumed: false, skipped: 'not_paused' };
  }
  if (!_layers.size) {
    log.debug('resumeAll — skipped', { reason: 'no_layers' });
    return { resumed: false, skipped: 'no_layers' };
  }

  type NativeResumeOp = { assetId: string; run: () => Promise<void> };
  type HtmlPlayOp = { layer: VibeExecutionLayer; run: () => Promise<void> };

  const nativeResumeOps: NativeResumeOp[] = [];
  const htmlPlayOps: HtmlPlayOp[] = [];
  const applyTimerResumes: Array<() => void> = [];

  for (const managed of _layers.values()) {
    const layer = managed.layer;

    // ── Delayed start still pending ─────────────────────────────
    if (!managed.audio && managed.pendingStartRemainingMs !== null) {
      const ms = managed.pendingStartRemainingMs;
      applyTimerResumes.push(() => {
        managed.pendingStartRemainingMs = null;
        if (ms > 0) {
          managed.startFiresAtEpochMs = Date.now() + ms;
          managed.startTimerId = setTimeout(() => {
            managed.startTimerId        = null;
            managed.startFiresAtEpochMs = null;
            if (!_layers.has(layer.soundId)) return;
            _beginLayerAfterDelay(layer, managed);
          }, ms);
        } else {
          _beginLayerAfterDelay(layer, managed);
        }
      });
      continue;
    }

    // ── Interval: waiting in gap (no tick audio) ───────────────
    if (layer.playMode === 'interval' && managed.audio === null && managed.pendingIntervalRemainingMs !== null) {
      const ms = managed.pendingIntervalRemainingMs;
      applyTimerResumes.push(() => {
        managed.pendingIntervalRemainingMs = null;
        _resumeLayerDurationAfterPause(managed, layer);
        if (!_layers.has(layer.soundId)) return;

        if (ms > 0) {
          managed.intervalFiresAtEpochMs = Date.now() + ms;
          managed.intervalTimerId = setTimeout(() => {
            managed.intervalTimerId        = null;
            managed.intervalFiresAtEpochMs = null;
            if (!_layers.has(layer.soundId) || _sessionPaused) return;
            _intervalPlayTick(layer, managed);
          }, ms);
        } else if (!_sessionPaused) {
          _intervalPlayTick(layer, managed);
        }
      });
      continue;
    }

    // ── Active native layer (loop, once, or interval mid-tick) ──
    if (managed.isNative) {
      _resumeLayerDurationAfterPause(managed, layer);
      if (!_layers.has(layer.soundId)) continue;

      const assetId = _nativeAssetId(layer.soundId);
      if (!_nativeLayers.has(assetId)) continue;

      /*
       * Mirror pauseAll(): only resume native audio when a tick is actively
       * playing (interval) or for loop/once layers that were paused in native.
       */
      const tickPlaying =
        layer.playMode !== 'interval' || _nativeOnceCompleteCallbacks.has(assetId);
      if (tickPlaying) {
        nativeResumeOps.push({
          assetId,
          run: () => NativeAudio.resume({ assetId }).then(() => undefined),
        });
      }
      continue;
    }

    // ── Active audio (HTML: once / interval mid-tick / loop fallback) ──────
    if (managed.audio !== null) {
      _resumeLayerDurationAfterPause(managed, layer);
      if (!_layers.has(layer.soundId)) continue;

      const audio = managed.audio;
      htmlPlayOps.push({
        layer,
        run: () => audio.play().then(() => undefined),
      });
    }
  }

  if (applyTimerResumes.length === 0 && nativeResumeOps.length === 0 && htmlPlayOps.length === 0) {
    log.debug('resumeAll — skipped', { reason: 'nothing_to_resume' });
    return { resumed: false, skipped: 'nothing_to_resume' };
  }

  _sessionPaused = false;
  for (const apply of applyTimerResumes) {
    apply();
  }

  const failedAssetIds: string[] = [];
  for (const { assetId, run } of nativeResumeOps) {
    try {
      await run();
    } catch (e) {
      _logNativeFailure('resume', assetId, e);
      failedAssetIds.push(assetId);
    }
  }

  let htmlPlayFailed = false;
  for (const { layer, run } of htmlPlayOps) {
    try {
      await run();
    } catch (error) {
      htmlPlayFailed = true;
      _logPlayFailure(layer, error);
    }
  }

  if (failedAssetIds.length > 0 || htmlPlayFailed) {
    log.warn('resumeAll — failed; re-pausing session', { failedAssetIds, htmlPlayFailed });
    pauseAll();
    return {
      resumed: false,
      failedAssetIds: failedAssetIds.length > 0 ? failedAssetIds : undefined,
      htmlPlayFailed: htmlPlayFailed || undefined,
    };
  }

  log.debug('resumeAll — succeeded', {
    timerResumes:  applyTimerResumes.length,
    nativeResumes: nativeResumeOps.length,
    htmlResumes:   htmlPlayOps.length,
  });
  return { resumed: true };
}

function stopAll(): void {
  _cancelPlaybackPrepare();
  log.debug('stopAll', { layers: _layers.size, nativeLayers: _nativeLayers.size });
  _stopAllExplicit = true;
  try {
    _sessionPaused = false;
    const ids = [..._layers.keys()];
    for (const soundId of ids) {
      stopLayer(soundId);
    }
  } finally {
    _stopAllExplicit = false;
  }
}

function hasActiveLayers(): boolean {
  return _layers.size > 0;
}

function isSessionPaused(): boolean {
  return _sessionPaused;
}

/** Read-only session snapshot for native QA instrumentation (no secrets). */
export function getPlaybackSessionSnapshot(): {
  sessionPaused: boolean;
  hasActiveLayers: boolean;
  layerCount: number;
  nativeLayerCount: number;
} {
  return {
    sessionPaused: _sessionPaused,
    hasActiveLayers: _layers.size > 0,
    layerCount: _layers.size,
    nativeLayerCount: _nativeLayers.size,
  };
}

/**
 * Returns the number of layers that would pass playLayer() validation.
 * Used by the store before entering `preparing`; actual playback begins after
 * the audio service handshake confirms an audible layer (`NativeAudio` / HTML).
 */
function countValidLayers(layers: VibeExecutionLayer[]): number {
  return layers.filter((layer) => {
    if (!hasValidExecutionFileUrl(layer.fileUrl)) return false;
    if (layer.playMode === 'interval') {
      return layer.repeatIntervalSeconds != null && layer.repeatIntervalSeconds >= 1;
    }
    return true;
  }).length;
}

export const audioPlayerService = {
  playPlan,
  restartPlan,
  pauseAll,
  resumeAll,
  stopAll,
  stopLayer,
  hasActiveLayers,
  isSessionPaused,
  countValidLayers,
  setPlaybackVibeContext,
};
