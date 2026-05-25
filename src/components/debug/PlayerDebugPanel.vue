<template>
  <div v-if="isDev" class="player-debug-harness">
    <button
      type="button"
      class="player-debug-harness-toggle"
      :aria-expanded="harnessExpanded"
      @click="harnessExpanded = !harnessExpanded"
    >
      <span class="player-debug-badge">DIAG</span>
      <span class="player-debug-harness-title">Player Debug Harness</span>
      <span class="player-debug-harness-note">diagnostic only</span>
      <span class="player-debug-harness-chevron">{{ harnessExpanded ? '▲' : '▼' }}</span>
    </button>

    <div v-if="harnessExpanded" class="player-debug-harness-body">
      <p class="player-debug-disclaimer">
        Read-only diagnostics. Does not start, stop, or mutate playback.
      </p>

      <!-- 1. Current player state -->
      <section class="player-debug-section">
        <h3 class="player-debug-section-title">Current player state</h3>
        <div class="player-debug-grid">
          <span class="player-debug-key">currentVibeId</span>
          <strong class="player-debug-val">{{ currentVibeId ?? 'null' }}</strong>

          <span class="player-debug-key">currentVibeName</span>
          <strong class="player-debug-val">{{ currentVibeName || '—' }}</strong>

          <span class="player-debug-key">playbackState</span>
          <strong class="player-debug-val" :class="`player-debug-val--${playbackState}`">
            {{ playbackState }}
          </strong>

          <span class="player-debug-key">isPlaying</span>
          <strong class="player-debug-val">{{ isPlaying }}</strong>

          <span class="player-debug-key">isPaused</span>
          <strong class="player-debug-val">{{ isPaused }}</strong>

          <span class="player-debug-key">isPreparing</span>
          <strong class="player-debug-val">{{ isPreparing }}</strong>

          <span class="player-debug-key">elapsedSeconds</span>
          <strong class="player-debug-val">{{ elapsedSeconds }}</strong>

          <span class="player-debug-key">artwork URL</span>
          <strong
            class="player-debug-val player-debug-val--url"
            :title="currentVibeArtworkUrl ?? undefined"
          >
            {{ truncateForDisplay(currentVibeArtworkUrl ?? '') }}
          </strong>

          <span class="player-debug-key">hasActiveLayers (store)</span>
          <strong class="player-debug-val">{{ hasActiveLayers }}</strong>

          <span class="player-debug-key">hasActiveLayers (service)</span>
          <strong class="player-debug-val">{{ serviceHasActiveLayers }}</strong>
        </div>
      </section>

      <!-- 2. Execution plan -->
      <section class="player-debug-section">
        <h3 class="player-debug-section-title">
          Execution plan
          <span class="player-debug-count">{{ executionPlan.length }} layer{{ executionPlan.length === 1 ? '' : 's' }}</span>
        </h3>
        <p v-if="!executionPlan.length" class="player-debug-empty">No layers in plan.</p>
        <div
          v-for="layer in executionPlan"
          :key="layer.soundId"
          class="player-debug-layer"
        >
          <p class="player-debug-layer-name">{{ layer.soundName }} (#{{ layer.soundId }})</p>
          <div class="player-debug-grid player-debug-grid--layer">
            <span class="player-debug-key">playMode</span>
            <strong class="player-debug-val">{{ layer.playMode }}</strong>

            <span class="player-debug-key">fileUrl</span>
            <strong class="player-debug-val player-debug-val--url" :title="layer.fileUrl">
              {{ truncateForDisplay(layer.fileUrl) }}
            </strong>

            <span class="player-debug-key">volume</span>
            <strong class="player-debug-val">{{ layer.volume }}%</strong>

            <span class="player-debug-key">startsAtSeconds</span>
            <strong class="player-debug-val">{{ layer.startsAtSeconds }}</strong>

            <span class="player-debug-key">durationSeconds</span>
            <strong class="player-debug-val">{{ layer.durationSeconds ?? 'null' }}</strong>

            <span class="player-debug-key">repeatIntervalSeconds</span>
            <strong class="player-debug-val">{{ layer.repeatIntervalSeconds ?? 'null' }}</strong>

            <span class="player-debug-key">sortOrder</span>
            <strong class="player-debug-val">{{ layer.sortOrder }}</strong>

            <span class="player-debug-key">fadeInSeconds</span>
            <strong class="player-debug-val player-debug-val--ignored">
              {{ layer.fadeInSeconds }} (stored but ignored)
            </strong>

            <span class="player-debug-key">fadeOutSeconds</span>
            <strong class="player-debug-val player-debug-val--ignored">
              {{ layer.fadeOutSeconds }} (stored but ignored)
            </strong>
          </div>
        </div>
      </section>

      <!-- 3. Layer playability -->
      <section class="player-debug-section">
        <h3 class="player-debug-section-title">Layer playability</h3>
        <div class="player-debug-grid">
          <span class="player-debug-key">total layers</span>
          <strong class="player-debug-val">{{ executionPlan.length }}</strong>

          <span class="player-debug-key">playable layers</span>
          <strong class="player-debug-val">{{ playableLayerCount }}</strong>
        </div>
        <p v-if="!executionPlan.length" class="player-debug-empty">No layers to evaluate.</p>
        <ul v-else class="player-debug-playability-list">
          <li
            v-for="diag in layerPlayability"
            :key="diag.soundId"
            class="player-debug-playability-item"
            :class="{ 'player-debug-playability-item--bad': !diag.playable }"
          >
            <span>{{ diag.soundName }}</span>
            <span class="player-debug-playability-tags">
              <span :class="diag.validUrl ? 'player-debug-tag--ok' : 'player-debug-tag--bad'">
                URL {{ diag.validUrl ? 'valid' : 'invalid' }}
              </span>
              <span
                v-if="diag.intervalMissingRepeat"
                class="player-debug-tag--bad"
              >
                interval missing repeatIntervalSeconds
              </span>
              <span :class="diag.playable ? 'player-debug-tag--ok' : 'player-debug-tag--bad'">
                {{ diag.playable ? 'playable' : 'skipped' }}
              </span>
            </span>
          </li>
        </ul>
      </section>

      <!-- 4. Runtime source visibility -->
      <section class="player-debug-section">
        <h3 class="player-debug-section-title">Runtime source visibility</h3>
        <p class="player-debug-hint">
          Plan URL vs resolved playback URL (native offline lookup when currentVibeId is set).
        </p>
        <p v-if="!executionPlan.length" class="player-debug-empty">No layers.</p>
        <div
          v-for="layer in executionPlan"
          :key="`src-${layer.soundId}`"
          class="player-debug-layer player-debug-layer--compact"
        >
          <p class="player-debug-layer-name">{{ layer.soundName }}</p>
          <div class="player-debug-grid player-debug-grid--layer">
            <span class="player-debug-key">plan source</span>
            <strong class="player-debug-val">
              {{ formatUrlSourceLabel(classifyUrlSource(layer.fileUrl)) }}
            </strong>

            <span class="player-debug-key">resolved source</span>
            <strong class="player-debug-val">
              {{ resolvedSourceLabel(layer.soundId) }}
            </strong>
          </div>
        </div>
      </section>

      <!-- Runtime logs (existing dev buffer) -->
      <section class="player-debug-section player-debug-section--logs">
        <div class="player-debug-logs-header">
          <button
            type="button"
            class="player-debug-logs-toggle"
            @click="logsExpanded = !logsExpanded"
          >
            <span class="player-debug-badge player-debug-badge--logs">LOGS</span>
            <span class="player-debug-section-title player-debug-section-title--inline">Runtime logs</span>
            <span class="player-debug-count">{{ logBuffer.length }}</span>
            <span class="player-debug-harness-chevron">{{ logsExpanded ? '▲' : '▼' }}</span>
          </button>
          <button
            type="button"
            class="player-debug-logs-clear"
            title="Clear logs"
            @click="clearLogBuffer()"
          >✕</button>
        </div>
        <div v-if="logsExpanded" class="player-debug-logs-list">
          <p v-if="!logBuffer.length" class="player-debug-empty">No logs yet.</p>
          <div
            v-for="(entry, index) in logBuffer"
            :key="index"
            class="player-debug-log-entry"
            :class="`player-debug-log-entry--${entry.level}`"
          >
            <span class="player-debug-log-ts">{{ entry.ts }}</span>
            <span class="player-debug-log-prefix">[{{ entry.prefix }}]</span>
            <span class="player-debug-log-msg">{{ entry.message }}</span>
            <span v-if="entry.data" class="player-debug-log-data">{{ JSON.stringify(entry.data) }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';

import { usePlayerStore } from '@/stores/player.store';
import { usePlayerEngine } from '@/composables/usePlayerEngine';
import { audioPlayerService } from '@/services/audio-player.service';
import { audioEngine } from '@/services/audio-engine';
import {
  classifyUrlSource,
  countPlayableLayers,
  formatUrlSourceLabel,
  getLayerPlayabilityDiag,
  truncateForDisplay,
} from '@/utils/player-debug-diagnostics';
import { clearLogBuffer, logBuffer } from '@/utils/player-debug';

const isDev = import.meta.env.DEV;

const store = usePlayerStore();
const {
  playbackState,
  currentVibeId,
  currentVibeName,
  currentVibeArtworkUrl,
  elapsedSeconds,
  hasActiveLayers,
} = storeToRefs(store);

const { executionPlan } = usePlayerEngine();

const harnessExpanded = ref(false);
const logsExpanded = ref(false);
const serviceHasActiveLayers = ref(false);
const resolvedUrlBySoundId = ref<Record<number, string>>({});

let servicePollId: ReturnType<typeof setInterval> | null = null;
let resolvePollId: ReturnType<typeof setInterval> | null = null;

const isPlaying = computed(() => playbackState.value === 'playing');
const isPaused = computed(() => playbackState.value === 'paused');
const isPreparing = computed(() => playbackState.value === 'preparing');

const playableLayerCount = computed(() => countPlayableLayers(executionPlan.value));

const layerPlayability = computed(() =>
  executionPlan.value.map(getLayerPlayabilityDiag),
);

function resolvedSourceLabel(soundId: number): string {
  const resolved = resolvedUrlBySoundId.value[soundId];
  if (!resolved) {
    return currentVibeId.value ? 'pending…' : '— (no active vibe)';
  }
  return formatUrlSourceLabel(classifyUrlSource(resolved));
}

async function refreshResolvedSources(): Promise<void> {
  const vibeId = currentVibeId.value;
  if (!vibeId || executionPlan.value.length === 0) {
    resolvedUrlBySoundId.value = {};
    return;
  }

  const next: Record<number, string> = {};
  await Promise.all(
    executionPlan.value.map(async (layer) => {
      try {
        next[layer.soundId] = await audioEngine.resolvePlaybackAssetUrl(layer, vibeId);
      } catch {
        next[layer.soundId] = layer.fileUrl;
      }
    }),
  );
  resolvedUrlBySoundId.value = next;
}

function startPolling(): void {
  servicePollId = setInterval(() => {
    serviceHasActiveLayers.value = audioPlayerService.hasActiveLayers();
  }, 1_000);

  resolvePollId = setInterval(() => {
    void refreshResolvedSources();
  }, 2_000);
}

function stopPolling(): void {
  if (servicePollId !== null) {
    clearInterval(servicePollId);
    servicePollId = null;
  }
  if (resolvePollId !== null) {
    clearInterval(resolvePollId);
    resolvePollId = null;
  }
}

watch(
  [currentVibeId, executionPlan],
  () => {
    void refreshResolvedSources();
  },
  { deep: true },
);

watch(harnessExpanded, (expanded) => {
  if (!isDev) return;
  if (expanded) {
    serviceHasActiveLayers.value = audioPlayerService.hasActiveLayers();
    void refreshResolvedSources();
    startPolling();
  } else {
    stopPolling();
  }
});

onMounted(() => {
  if (!isDev || !harnessExpanded.value) return;
  serviceHasActiveLayers.value = audioPlayerService.hasActiveLayers();
  void refreshResolvedSources();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped>
.player-debug-harness {
  margin-top: 20px;
  border: 1.5px dashed rgba(245, 158, 11, 0.55);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.38);
  overflow: hidden;
}

.player-debug-logs-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-debug-logs-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.player-debug-harness-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.player-debug-harness-body {
  padding: 0 14px 14px;
  max-height: min(62vh, 520px);
  overflow-y: auto;
}

.player-debug-badge {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #fff;
  background: #f59e0b;
  border-radius: 4px;
  padding: 2px 6px;
}

.player-debug-badge--logs {
  background: #0ea5e9;
}

.player-debug-harness-title {
  font-size: 13px;
  font-weight: 700;
  color: rgba(253, 230, 138, 0.95);
}

.player-debug-harness-note {
  font-size: 10px;
  color: rgba(251, 191, 36, 0.75);
  font-style: italic;
}

.player-debug-harness-chevron {
  margin-left: auto;
  font-size: 11px;
  color: rgba(251, 191, 36, 0.85);
}

.player-debug-disclaimer {
  margin: 0 0 12px;
  font-size: 11px;
  color: rgba(253, 230, 138, 0.75);
}

.player-debug-section {
  margin-bottom: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(245, 158, 11, 0.22);
}

.player-debug-section--logs {
  border-top: 1px solid rgba(14, 165, 233, 0.35);
  margin-bottom: 0;
  padding-top: 8px;
}

.player-debug-section-title {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(253, 230, 138, 0.9);
}

.player-debug-section-title--inline {
  margin: 0;
  text-transform: none;
  letter-spacing: normal;
}

.player-debug-count {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(251, 191, 36, 0.85);
  text-transform: none;
}

.player-debug-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 12px;
  row-gap: 5px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.player-debug-grid--layer {
  margin-top: 6px;
}

.player-debug-key {
  color: rgba(199, 210, 254, 0.65);
  white-space: nowrap;
}

.player-debug-val {
  color: rgba(224, 231, 255, 0.9);
  font-weight: 600;
  word-break: break-all;
}

.player-debug-val--url {
  font-size: 11px;
}

.player-debug-val--ignored {
  color: rgba(251, 191, 36, 0.8);
  font-weight: 500;
}

.player-debug-val--idle { color: rgba(199, 210, 254, 0.5); }
.player-debug-val--playing { color: #34d399; }
.player-debug-val--paused { color: #fbbf24; }
.player-debug-val--preparing { color: #38bdf8; }
.player-debug-val--error { color: #f87171; }

.player-debug-empty {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.player-debug-hint {
  margin: 0 0 10px;
  font-size: 11px;
  color: rgba(199, 210, 254, 0.65);
  font-style: italic;
}

.player-debug-layer {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(245, 158, 11, 0.15);
}

.player-debug-layer--compact {
  margin-bottom: 8px;
  padding-bottom: 8px;
}

.player-debug-layer-name {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.player-debug-playability-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
}

.player-debug-playability-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
  border-top: 1px solid rgba(245, 158, 11, 0.12);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.88);
}

.player-debug-playability-item--bad {
  color: rgba(254, 202, 202, 0.95);
}

.player-debug-playability-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.player-debug-tag--ok,
.player-debug-tag--bad {
  font-size: 10px;
  font-family: ui-monospace, monospace;
  padding: 2px 6px;
  border-radius: 4px;
}

.player-debug-tag--ok {
  color: rgba(167, 243, 208, 0.95);
  background: rgba(16, 185, 129, 0.18);
}

.player-debug-tag--bad {
  color: rgba(254, 202, 202, 0.95);
  background: rgba(248, 113, 113, 0.15);
}

.player-debug-logs-clear {
  margin-left: 8px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: rgba(14, 165, 233, 0.2);
  color: rgba(186, 230, 253, 0.9);
  font-size: 12px;
  cursor: pointer;
}

.player-debug-logs-list {
  max-height: 180px;
  overflow-y: auto;
  padding-bottom: 4px;
}

.player-debug-log-entry {
  font-size: 11px;
  font-family: ui-monospace, monospace;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  line-height: 1.35;
}

.player-debug-log-entry--warn { color: #fbbf24; }
.player-debug-log-entry--error { color: #f87171; }

.player-debug-log-ts {
  color: rgba(148, 163, 184, 0.85);
  margin-right: 6px;
}

.player-debug-log-prefix {
  color: rgba(125, 211, 252, 0.9);
  margin-right: 4px;
}

.player-debug-log-data {
  display: block;
  margin-top: 2px;
  color: rgba(148, 163, 184, 0.8);
  word-break: break-all;
}
</style>
