import { execSync } from 'node:child_process';

import { browser } from '@wdio/globals';

/**
 * Dispatches the same window event MainActivity bridges from ACTION_AUDIO_BECOMING_NOISY.
 * Android blocks `adb shell am broadcast` for this protected system action (uid=2000).
 */
export async function dispatchAudioBecomingNoisyInWebView(): Promise<void> {
  await browser.execute(() => {
    window.dispatchEvent(new Event('audioBecomingNoisy'));
  });
}

/** Sends the app to the Android home screen (background). */
export function sendAppToBackground(): void {
  execSync('adb shell input keyevent KEYCODE_HOME', { encoding: 'utf8', maxBuffer: 1024 * 1024 });
}

/** Brings the app back to foreground by launching its main activity. */
export function bringAppToForeground(
  packageName = process.env.ANDROID_APP_PACKAGE ?? 'io.ionic.starter',
  activity = process.env.ANDROID_APP_ACTIVITY ?? '.MainActivity',
): void {
  execSync(
    `adb shell am start -n ${packageName}/${activity}`,
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
}

/** Returns true when MainActivity registered the noisy receiver (logcat tail). */
export function logcatShowsNoisyReceiverRegistered(): boolean {
  try {
    const tail = execSync('adb logcat -d -t 400', { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    return /ACTION_AUDIO_BECOMING_NOISY receiver registered/i.test(tail);
  } catch {
    return false;
  }
}
