import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/** Tags and substrings useful for pause/resume investigation. */
export const PLAYBACK_LOGCAT_PATTERNS = [
  'Capacitor/NativeAudio',
  'Capacitor/Console',
  'NativeAudio',
  'AudioService',
  'PlayerStore',
  'MiniPlayer',
  'ExoPlayer',
  'playbackState',
  'resumeAll',
  'pauseAll',
  'resumePlayback',
  'pausePlayback',
  'audioFocus',
  'MediaSession',
  'MainActivity',
  'audioBecomingNoisy',
  'Headset',
  'ACTION_AUDIO_BECOMING_NOISY',
] as const;

export type PlaybackLogcatAnalysis = {
  lineCount: number;
  matchedLineCount: number;
  resumeAllSkipped: boolean;
  nativeResumeFailed: boolean;
  nativePauseFailed: boolean;
  playbackStateEvents: string[];
  nativeAudioLines: string[];
  consoleLines: string[];
  highlights: string[];
};

function adb(cmd: string): string {
  return execSync(`adb ${cmd}`, { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 }).trim();
}

export function clearLogcatBuffer(): void {
  try {
    adb('logcat -c');
  } catch {
    /* device may be offline during local edits */
  }
}

export function dumpLogcatTail(lineCount = 1_200): string {
  return adb(`logcat -d -t ${lineCount}`);
}

/** Writes full tail + filtered playback slice for easier diffing. */
export function capturePlaybackLogcat(outDir: string, tag: string, lineCount = 1_200): {
  rawPath: string;
  filteredPath: string;
  analysis: PlaybackLogcatAnalysis;
} {
  fs.mkdirSync(outDir, { recursive: true });
  const raw = dumpLogcatTail(lineCount);
  const rawPath = path.join(outDir, `${tag}.logcat.txt`);
  fs.writeFileSync(rawPath, raw);

  const analysis = analyzePlaybackLogcat(raw);
  const filteredPath = path.join(outDir, `${tag}.logcat-filtered.txt`);
  const filteredBody = [
    `# matched=${analysis.matchedLineCount} total=${analysis.lineCount}`,
    `# resumeAllSkipped=${analysis.resumeAllSkipped} nativeResumeFailed=${analysis.nativeResumeFailed}`,
    '',
    ...analysis.highlights,
    '',
    '--- playbackState events ---',
    ...analysis.playbackStateEvents,
    '',
    '--- NativeAudio ---',
    ...analysis.nativeAudioLines,
    '',
    '--- Console (Capacitor) ---',
    ...analysis.consoleLines,
  ].join('\n');
  fs.writeFileSync(filteredPath, filteredBody);

  return { rawPath, filteredPath, analysis };
}

export function analyzePlaybackLogcat(raw: string): PlaybackLogcatAnalysis {
  const lines = raw.split('\n');
  const highlights: string[] = [];
  const playbackStateEvents: string[] = [];
  const nativeAudioLines: string[] = [];
  const consoleLines: string[] = [];

  let resumeAllSkipped = false;
  let nativeResumeFailed = false;
  let nativePauseFailed = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const matched = PLAYBACK_LOGCAT_PATTERNS.some((p) => line.includes(p) || lower.includes(p.toLowerCase()));
    if (!matched) continue;

    if (/resumeAll\s*—\s*skipped|resumeAll -- skipped/i.test(line)) {
      resumeAllSkipped = true;
      highlights.push(line);
    }
    if (/NativeAudio\.resume|resume\s*—\s*FAILED|Error resuming/i.test(line)) {
      nativeResumeFailed = true;
      highlights.push(line);
    }
    if (/NativeAudio\.pause|pause\s*—\s*FAILED/i.test(line)) {
      nativePauseFailed = true;
      highlights.push(line);
    }
    if (/playbackState|Notifying listeners for event playbackState/i.test(line)) {
      playbackStateEvents.push(line);
    }
    if (/Capacitor\/NativeAudio|NativeAudio:/i.test(line)) {
      nativeAudioLines.push(line);
    }
    if (/Capacitor\/Console|chromium.*CONSOLE/i.test(line)) {
      consoleLines.push(line);
      if (/resumeAll|pauseAll|resumePlayback|pausePlayback|sessionPaused/i.test(line)) {
        highlights.push(line);
      }
    }
  }

  return {
    lineCount: lines.length,
    matchedLineCount: highlights.length + playbackStateEvents.length + nativeAudioLines.length + consoleLines.length,
    resumeAllSkipped,
    nativeResumeFailed,
    nativePauseFailed,
    playbackStateEvents,
    nativeAudioLines,
    consoleLines,
    highlights: [...new Set(highlights)],
  };
}
