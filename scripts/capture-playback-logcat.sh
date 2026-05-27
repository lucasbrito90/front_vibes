#!/usr/bin/env bash
# Capture filtered Android logcat while reproducing play → pause → resume manually.
#
# Usage:
#   ./scripts/capture-playback-logcat.sh              # wait for Enter, then dump
#   ./scripts/capture-playback-logcat.sh --watch      # stream filtered lines live
#   ./scripts/capture-playback-logcat.sh --dump now   # dump immediately (last 1500 lines)
#
# Output: qa-android-native/output/pause-resume-qa/manual-logcat-<timestamp>.*

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/qa-android-native/output/pause-resume-qa"
STAMP="$(date +%Y%m%d-%H%M%S)"
TAG="manual-logcat-${STAMP}"

mkdir -p "$OUT"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found — install Android platform-tools" >&2
  exit 1
fi

DEVICE_COUNT="$(adb devices | awk 'NR>1 && $2=="device"{c++} END{print c+0}')"
if [[ "$DEVICE_COUNT" -lt 1 ]]; then
  echo "No adb device attached" >&2
  exit 1
fi

FILTER='Capacitor/NativeAudio|Capacitor/Console|NativeAudio|AudioService|PlayerStore|MiniPlayer|ExoPlayer|playbackState|resumeAll|pauseAll|resumePlayback|pausePlayback|audioFocus|MediaSession'

dump_logcat() {
  local raw="$OUT/${TAG}.logcat.txt"
  local filtered="$OUT/${TAG}.logcat-filtered.txt"
  adb logcat -d -t 1500 >"$raw"
  grep -E "$FILTER" "$raw" >"$filtered" || true
  echo "Saved:"
  echo "  $raw"
  echo "  $filtered ($(wc -l <"$filtered" | tr -d ' ') matching lines)"
}

case "${1:-}" in
  --watch)
    echo "Streaming filtered logcat (Ctrl+C to stop)…"
    adb logcat -c
    adb logcat | grep -E --line-buffered "$FILTER"
    ;;
  --dump)
    dump_logcat
    ;;
  *)
    echo "Clearing logcat buffer…"
    adb logcat -c
    echo "Reproduce on device: play → pause → resume (repeat if needed)."
    echo "Press Enter when done to capture logcat…"
    read -r _
    dump_logcat
    ;;
esac
