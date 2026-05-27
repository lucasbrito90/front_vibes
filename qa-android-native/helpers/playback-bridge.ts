import { browser } from '@wdio/globals';

export type PlaybackBridgeSnapshot = {
  source: 'native-qa-bridge' | 'unavailable';
  ts: string;
  store: {
    currentVibeId: number | null;
    playbackState: string;
    showMiniPlayer: boolean;
    hasActiveLayers: boolean;
  };
  engine: {
    sessionPaused: boolean;
    hasActiveLayers: boolean;
    layerCount: number;
    nativeLayerCount: number;
  } | null;
  ui: {
    miniPlayerMeta: string;
    playerStatusText: string;
    playPauseAriaLabel: string;
  };
};

export type PlaybackDesyncFinding = {
  code: string;
  message: string;
  severity: 'error' | 'warn' | 'info';
};

const EMPTY_SNAPSHOT: PlaybackBridgeSnapshot = {
  source: 'unavailable',
  ts: new Date().toISOString(),
  store: {
    currentVibeId: null,
    playbackState: 'unknown',
    showMiniPlayer: false,
    hasActiveLayers: false,
  },
  engine: null,
  ui: {
    miniPlayerMeta: '',
    playerStatusText: '',
    playPauseAriaLabel: '',
  },
};

export async function readPlaybackBridgeSnapshot(): Promise<PlaybackBridgeSnapshot> {
  const snapshot = await browser.execute(() => {
    type QaBridge = {
      getPlaybackBridgeSnapshot?: () => Omit<PlaybackBridgeSnapshot, 'source' | 'ts'>;
    };
    const qa = (window as unknown as { __IXORA_NATIVE_QA__?: QaBridge }).__IXORA_NATIVE_QA__;
    if (!qa?.getPlaybackBridgeSnapshot) {
      return null;
    }
    return qa.getPlaybackBridgeSnapshot();
  });

  if (!snapshot) {
    return { ...EMPTY_SNAPSHOT, ts: new Date().toISOString() };
  }

  return {
    source: 'native-qa-bridge',
    ts: new Date().toISOString(),
    ...snapshot,
  };
}

/** Heuristic desync checks after pause/resume steps (instrumentation — not production guards). */
export function analyzeBridgeDesync(
  label: string,
  snap: PlaybackBridgeSnapshot,
): PlaybackDesyncFinding[] {
  const findings: PlaybackDesyncFinding[] = [];

  if (snap.source === 'unavailable') {
    findings.push({
      code: 'bridge-unavailable',
      message: `${label}: rebuild APK with VITE_ENABLE_NATIVE_QA_DIAGNOSTICS=true`,
      severity: 'error',
    });
    return findings;
  }

  const { store, engine, ui } = snap;
  if (!engine) return findings;

  if (store.playbackState === 'playing' && engine.sessionPaused) {
    findings.push({
      code: 'ui-playing-session-paused',
      message: `${label}: Pinia playing but _sessionPaused=true`,
      severity: 'error',
    });
  }

  if (store.playbackState === 'paused' && !engine.sessionPaused && engine.hasActiveLayers) {
    findings.push({
      code: 'ui-paused-session-active',
      message: `${label}: Pinia paused but _sessionPaused=false with active layers`,
      severity: 'error',
    });
  }

  if (store.playbackState === 'playing' && ui.playPauseAriaLabel === 'Resume') {
    findings.push({
      code: 'ui-playing-resume-button',
      message: `${label}: store playing but MiniPlayer shows Resume`,
      severity: 'warn',
    });
  }

  if (store.playbackState === 'paused' && ui.playPauseAriaLabel === 'Pause') {
    findings.push({
      code: 'ui-paused-pause-button',
      message: `${label}: store paused but MiniPlayer shows Pause`,
      severity: 'warn',
    });
  }

  if (store.hasActiveLayers !== engine.hasActiveLayers) {
    findings.push({
      code: 'layers-store-service-mismatch',
      message: `${label}: store.hasActiveLayers=${store.hasActiveLayers} engine.hasActiveLayers=${engine.hasActiveLayers}`,
      severity: 'warn',
    });
  }

  return findings;
}
