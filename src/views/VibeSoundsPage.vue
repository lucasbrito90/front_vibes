<template>
  <ion-page>
    <ion-header class="ion-no-border sounds-header">
      <ion-toolbar class="sounds-toolbar">
        <ion-buttons slot="start">
          <ion-button @click="router.back()" class="sounds-back-btn">
            <ion-icon :icon="chevronBackOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="sounds-content">
      <!-- Hero banner -->
      <div class="sounds-hero">
        <div class="sounds-hero-overlay" />
        <div class="sounds-hero-text">
          <p class="sounds-hero-eyebrow">Build your ambient mix</p>
          <h1 class="sounds-hero-title">Add sounds to this vibe</h1>
          <p class="sounds-hero-lead">Choose sounds that match the mood you want.</p>
          <p class="sounds-hero-vibe">{{ vibeName }}</p>
        </div>
      </div>

      <!-- Selected layers (attached selection, before library) -->
      <section v-if="selectedLayers.length > 0" class="sounds-selected-section">
        <div class="sounds-section-head page-shell">
          <h2 class="sounds-section-title">Selected layers</h2>
          <p class="sounds-section-sub">
            {{ selectedLayers.length }} sound{{ selectedLayers.length !== 1 ? 's' : '' }} in this mix — tap a chip to remove it from the selection.
          </p>
        </div>
        <div class="sounds-selected-scroll-outer">
          <div class="sounds-selected-row">
            <article
              v-for="row in selectedLayers"
              :key="row.sound.id"
              class="sound-selected-chip app-pressable"
              @click="toggleSound(row.sound.id)"
            >
              <div class="sound-selected-thumb-wrap">
                <img
                  v-if="row.sound.thumbnail_url"
                  :src="row.sound.thumbnail_url"
                  :alt="row.sound.name"
                  class="sound-selected-img app-artwork-fade-in"
                />
                <div
                  v-else
                  class="sound-selected-fallback"
                  :style="{ background: getSoundFallbackGradient(row.sound, row.sound.id % 6) }"
                >
                  <ion-icon :icon="getSoundIcon(row.sound)" class="sound-selected-fallback-icon" />
                </div>
              </div>
              <div class="sound-selected-body">
                <span class="sound-selected-chip-name">{{ row.sound.name }}</span>
                <span class="sound-selected-chip-line">
                  <span class="sound-selected-chip-cat">{{ getSoundCategoryLabel(row.sound) }}</span>
                  <template v-if="formatSoundDuration(row.sound.duration)">
                    <span class="sound-selected-chip-dot" aria-hidden="true">·</span>
                    <span>{{ formatSoundDuration(row.sound.duration) }}</span>
                  </template>
                  <template v-if="row.vibeSound">
                    <span class="sound-selected-chip-dot" aria-hidden="true">·</span>
                    <span>{{ getPlayModeLabel(row.vibeSound.play_mode) }}</span>
                  </template>
                </span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- Attach hint -->
      <div v-if="showAttachHint" class="sounds-hint-wrap page-shell">
        <AppEmptyState
          variant="compact"
          class="sounds-hint-inner app-surface-card"
          :icon="musicalNotesOutline"
          title="Start your mix"
          description="Browse the library below and tap sound cards to add layers. Save when you’re ready — then open settings on a card to fine‑tune playback."
        />
      </div>

      <!-- Loading -->
      <AppLoadingState
        v-if="loadingSounds && !sounds.length"
        class="sounds-state-slot page-shell"
        compact
        title="Loading sounds…"
      />

      <!-- Error -->
      <AppErrorState
        v-else-if="soundsError && !sounds.length"
        class="sounds-state-slot page-shell"
        compact
        title="Couldn’t load sounds"
        :description="soundsError"
        retry-label="Retry"
        @retry="fetchSounds"
      />

      <!-- Empty catalog -->
      <AppEmptyState
        v-else-if="isCatalogEmpty"
        class="sounds-state-slot page-shell"
        variant="compact"
        :icon="musicalNotesOutline"
        title="Nothing to show here"
        :description="emptyCatalogDescription"
      />

      <!-- Categories -->
      <template v-else>
        <div class="sounds-library-head page-shell">
          <h2 class="sounds-library-title">Browse sounds</h2>
          <p class="sounds-library-sub">Tap a card to add or remove it from your mix.</p>
        </div>

        <div class="sounds-browse-tools page-shell">
          <div class="sounds-search-box sounds-search-box--browse">
            <ion-icon :icon="searchOutline" class="sounds-search-icon" aria-hidden="true" />
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search rain, fire, forest…"
              class="sounds-search-input"
              enterkeyhint="search"
              autocomplete="off"
              autocorrect="off"
            />
          </div>

          <p class="sounds-filter-label">Category</p>
          <div class="sounds-chip-scroll-outer">
            <div class="sounds-chip-row">
              <button
                v-for="opt in categoryChipOptions"
                :key="'cat-' + opt.key"
                type="button"
                class="sounds-filter-chip app-pressable"
                :class="{ 'sounds-filter-chip--active': selectedCategoryKey === opt.key }"
                @click="selectedCategoryKey = opt.key"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <template v-if="moodChipOptions.length > 0">
            <p class="sounds-filter-label">Mood</p>
            <div class="sounds-chip-scroll-outer">
              <div class="sounds-chip-row">
                <button
                  type="button"
                  class="sounds-filter-chip app-pressable"
                  :class="{ 'sounds-filter-chip--active': selectedMoodTag === null }"
                  @click="selectedMoodTag = null"
                >
                  Any
                </button>
                <button
                  v-for="tag in moodChipOptions"
                  :key="'mood-' + tag"
                  type="button"
                  class="sounds-filter-chip app-pressable"
                  :class="{ 'sounds-filter-chip--active': selectedMoodTag === tag }"
                  @click="toggleMoodTag(tag)"
                >
                  {{ tag }}
                </button>
              </div>
            </div>
          </template>
        </div>

        <AppEmptyState
          v-if="isFilteredEmpty"
          class="sounds-filter-empty page-shell"
          variant="compact"
          :icon="searchOutline"
          title="No sounds found"
          description="Try a different search or clear your filters."
          action-label="Clear filters"
          @action="clearFilters"
        />

        <div v-else class="sounds-categories app-fade-in">
        <div
          v-for="(group, category) in filteredSoundsByCategory"
          :key="category"
          class="sounds-category"
        >
          <h3 class="sounds-category-title">{{ getSoundCategoryLabel({ category: String(category) }) }}</h3>

          <div class="sounds-row-wrap">
            <div class="sounds-row">
              <div
                v-for="(sound, si) in group"
                :key="sound.id"
                class="sound-card"
                :class="{ selected: isSelected(sound.id) }"
                @click="toggleSound(sound.id)"
              >
                <!-- Thumbnail -->
                <div
                  class="sound-card-thumb"
                  :class="{ 'sound-card-thumb--photo': !!sound.thumbnail_url }"
                >
                  <img
                    v-if="sound.thumbnail_url"
                    :src="sound.thumbnail_url"
                    :alt="sound.name"
                    class="sound-card-img app-artwork-fade-in"
                  />
                  <div
                    v-else
                    class="sound-card-placeholder"
                    :style="{ background: getSoundFallbackGradient(sound, si) }"
                  >
                    <ion-icon :icon="getSoundIcon(sound)" class="sound-card-placeholder-icon" />
                  </div>
                  <div class="sound-card-thumb-scrim" aria-hidden="true" />
                  <span class="sound-card-cat-pill">{{ getSoundCategoryLabel(sound) }}</span>
                  <span
                    v-if="formatSoundDuration(sound.duration)"
                    class="sound-card-duration-pill"
                  >
                    {{ formatSoundDuration(sound.duration) }}
                  </span>
                  <div v-if="isSelected(sound.id)" class="sound-card-selected-overlay">
                    <ion-icon :icon="checkmarkCircle" class="sound-card-check" />
                  </div>
                </div>

                <!-- Footer -->
                <div class="sound-card-footer">
                  <div class="sound-card-text-block">
                    <span class="sound-card-name">{{ sound.name }}</span>
                    <div v-if="getSoundMoodTags(sound).length" class="sound-card-tags">
                      <span
                        v-for="tag in getSoundMoodTags(sound)"
                        :key="tag"
                        class="sound-card-tag"
                      >{{ tag }}</span>
                    </div>
                  </div>
                  <button
                    v-if="isSelected(sound.id) && hasPersistedVibeSound(sound.id)"
                    class="sound-card-edit-btn"
                    aria-label="Edit sound settings"
                    @click.stop="openEditModal(sound.id)"
                  >
                    <ion-icon :icon="settingsOutline" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </template>

      <!-- ── DEV: Execution Plan debug panel ─────────────────────────── -->
      <div v-if="vibeSounds.length" class="dev-panel">
        <div class="dev-panel-header">
          <span class="dev-panel-badge">DEV</span>
          <span class="dev-panel-title">DEV Execution Plan</span>
          <span class="dev-panel-count">{{ executionPlan.length }} layer{{ executionPlan.length !== 1 ? 's' : '' }}</span>
        </div>
        <div class="dev-layer" v-for="layer in executionPlan" :key="layer.soundId">
          <p class="dev-layer-summary">{{ layer.humanReadableSummary }}</p>
          <div class="dev-layer-meta">
            <span>start: {{ layer.startsAtSeconds }}s</span>
            <span v-if="layer.endsAtSeconds != null">end: {{ layer.endsAtSeconds }}s</span>
            <span v-if="layer.repeatIntervalSeconds != null">interval: {{ layer.repeatIntervalSeconds }}s</span>
            <span v-if="layer.fadeInSeconds">fade↑ {{ layer.fadeInSeconds }}s</span>
            <span v-if="layer.fadeOutSeconds">fade↓ {{ layer.fadeOutSeconds }}s</span>
          </div>
        </div>
      </div>
      <!-- ── END DEV ──────────────────────────────────────────────────── -->

      <!-- Bottom spacing for save button -->
      <div style="height: 100px" />
    </ion-content>

    <!-- Save Sounds button -->
    <div id="sounds-save-bar" class="sounds-save-bar">
      <p v-if="saveError" class="sounds-save-error">{{ saveError }}</p>
      <ion-button
        expand="block"
        class="sounds-save-btn"
        :disabled="saving"
        @click="handleSave"
      >
        <ion-spinner v-if="saving" name="crescent" slot="start" style="width:18px;height:18px" />
        <ion-icon v-else :icon="checkmarkOutline" slot="start" />
        {{ saving ? 'Saving…' : 'Save Sounds' }}
        <span v-if="!saving && pendingCount > 0" class="sounds-save-badge">{{ pendingCount }}</span>
      </ion-button>
    </div>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonToolbar,
  modalController,
  toastController,
} from '@ionic/vue';
import {
  checkmarkCircle,
  checkmarkOutline,
  chevronBackOutline,
  musicalNotesOutline,
  searchOutline,
  settingsOutline,
} from 'ionicons/icons';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSounds } from '@/composables/useSounds';
import { useVibeSounds } from '@/composables/useVibeSounds';
import { useVibes } from '@/composables/useVibes';
import { usePlayerEngine } from '@/composables/usePlayerEngine';
import { vibeSoundService } from '@/services/vibe-sound.service';
import VibeSoundEditModal from '@/views/VibeSoundEditModal.vue';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import type { Sound } from '@/services/sound.service';
import type { VibeSound } from '@/services/vibe-sound.service';
import {
  formatSoundDuration,
  getPlayModeLabel,
  getSoundCategoryLabel,
  getSoundFallbackGradient,
  getSoundIcon,
  getSoundMoodTags,
} from '@/utils/soundPresentation';

const route = useRoute();
const router = useRouter();
const vibeId = computed(() => Number(route.params.id));

const { vibes } = useVibes();
const vibeName = computed(
  () => vibes.value.find((v) => v.id === vibeId.value)?.name ?? 'this vibe',
);

const {
  sounds,
  loading: loadingSounds,
  error: soundsError,
  fetchSounds,
} = useSounds();

const { vibeSounds, fetchVibeSounds } = useVibeSounds();

const { executionPlan, buildPlan } = usePlayerEngine();

// Rebuild the execution plan whenever the attached sounds change
watch(vibeSounds, (sounds) => buildPlan(sounds), { immediate: false });

const saving = ref(false);
const saveError = ref<string | null>(null);

// IDs confirmed saved in the backend (source of truth)
const originalIds = ref<Set<number>>(new Set());
// IDs toggled in the UI before saving
const selectedIds = ref<Set<number>>(new Set());

onMounted(async () => {
  await Promise.all([fetchSounds(), fetchVibeSounds(vibeId.value)]);
  syncFromBackend();
  buildPlan(vibeSounds.value);
});

/** Sync both originalIds and selectedIds from the current vibeSounds ref. */
function syncFromBackend(): void {
  const ids = new Set(vibeSounds.value.map((s) => s.id));
  originalIds.value = ids;
  selectedIds.value = new Set(ids);
}

/** Preset ordering hints for category chips (merged with real catalog categories). */
const CATEGORY_CHIP_PRESETS = [
  'Rain',
  'Fire',
  'Forest',
  'Focus',
  'Sleep',
  'Nature',
  'Ambient',
] as const;

const searchQuery = ref('');
/** Raw category key from API, or `__all__`. */
const selectedCategoryKey = ref<string>('__all__');
/** One of `getSoundMoodTags` values from the catalog, or none. */
const selectedMoodTag = ref<string | null>(null);

const isCatalogEmpty = computed(() => sounds.value.length === 0);

function normalizedCategoryKey(sound: Sound): string {
  return sound.category?.trim() || 'Other';
}

function soundMatchesSearchQuery(sound: Sound, q: string): boolean {
  if (!q) return true;
  const name = sound.name.toLowerCase();
  const catRaw = (sound.category ?? '').toLowerCase();
  const catLabel = getSoundCategoryLabel(sound).toLowerCase();
  const moods = getSoundMoodTags(sound).map((m) => m.toLowerCase());
  return (
    name.includes(q)
    || catRaw.includes(q)
    || catLabel.includes(q)
    || moods.some((m) => m.includes(q))
  );
}

const filteredSounds = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return sounds.value.filter((sound) => {
    if (!soundMatchesSearchQuery(sound, q)) return false;
    if (selectedCategoryKey.value !== '__all__') {
      if (normalizedCategoryKey(sound) !== selectedCategoryKey.value) return false;
    }
    if (selectedMoodTag.value != null) {
      const moods = getSoundMoodTags(sound);
      if (!moods.includes(selectedMoodTag.value)) return false;
    }
    return true;
  });
});

const filteredSoundsByCategory = computed(() =>
  filteredSounds.value.reduce<Record<string, Sound[]>>((acc, sound) => {
    const cat = normalizedCategoryKey(sound);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(sound);
    return acc;
  }, {}),
);

const isFilteredEmpty = computed(
  () => sounds.value.length > 0 && filteredSounds.value.length === 0,
);

function presetRankForCategoryLabel(label: string): number {
  const low = label.toLowerCase();
  for (let i = 0; i < CATEGORY_CHIP_PRESETS.length; i++) {
    const p = CATEGORY_CHIP_PRESETS[i].toLowerCase();
    if (low === p || low.includes(p) || p.includes(low)) return i;
  }
  return CATEGORY_CHIP_PRESETS.length;
}

const categoryChipOptions = computed(() => {
  const map = new Map<string, string>();
  for (const s of sounds.value) {
    const raw = normalizedCategoryKey(s);
    map.set(raw, getSoundCategoryLabel({ category: raw }));
  }
  const sorted = [...map.entries()].sort(([_, la], [__, lb]) => {
    const ra = presetRankForCategoryLabel(la);
    const rb = presetRankForCategoryLabel(lb);
    if (ra !== rb) return ra - rb;
    return la.localeCompare(lb, undefined, { sensitivity: 'base' });
  });
  return [{ key: '__all__', label: 'All' }, ...sorted.map(([key, label]) => ({ key, label }))];
});

const MOOD_CHIP_LIMIT = 7;

const moodChipOptions = computed(() => {
  const freq = new Map<string, number>();
  for (const s of sounds.value) {
    for (const tag of getSoundMoodTags(s)) {
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
    .slice(0, MOOD_CHIP_LIMIT)
    .map(([tag]) => tag);
});

function toggleMoodTag(tag: string): void {
  selectedMoodTag.value = selectedMoodTag.value === tag ? null : tag;
}

function clearFilters(): void {
  searchQuery.value = '';
  selectedCategoryKey.value = '__all__';
  selectedMoodTag.value = null;
}

const emptyCatalogDescription =
  'There are no sounds in the catalog right now. Check back soon or try another account.';

watch(moodChipOptions, (tags) => {
  if (selectedMoodTag.value != null && !tags.includes(selectedMoodTag.value)) {
    selectedMoodTag.value = null;
  }
});

watch(categoryChipOptions, (opts) => {
  const keys = new Set(opts.map((o) => o.key));
  if (!keys.has(selectedCategoryKey.value)) selectedCategoryKey.value = '__all__';
});

/** Rows for the horizontal “Selected layers” strip */
interface SelectedLayerRow {
  sound: Sound;
  vibeSound?: VibeSound;
}

function vibeSoundAsSound(vs: VibeSound): Sound {
  return {
    id: vs.id,
    name: vs.name,
    file_url: vs.file_url,
    thumbnail_url: vs.thumbnail_url,
    category: vs.category,
    duration: vs.duration,
    created_at: '',
  };
}

const selectedLayers = computed((): SelectedLayerRow[] => {
  const soundMap = new Map(sounds.value.map((s) => [s.id, s]));
  const vibeMap = new Map(vibeSounds.value.map((vs) => [vs.id, vs]));
  const ids = [...selectedIds.value];

  const sortRank = (id: number): number => {
    const vs = vibeMap.get(id);
    if (vs != null) return vs.sort_order ?? 0;
    return 1_000_000 + id;
  };

  ids.sort((a, b) => {
    const d = sortRank(a) - sortRank(b);
    return d !== 0 ? d : a - b;
  });

  const rows: SelectedLayerRow[] = [];
  for (const id of ids) {
    const vibeSound = vibeMap.get(id);
    const fromCatalog = soundMap.get(id);
    if (fromCatalog) rows.push({ sound: fromCatalog, vibeSound });
    else if (vibeSound) rows.push({ sound: vibeSoundAsSound(vibeSound), vibeSound });
  }
  return rows;
});

function hasPersistedVibeSound(soundId: number): boolean {
  return vibeSounds.value.some((vs) => vs.id === soundId);
}

const showAttachHint = computed(
  () =>
    !loadingSounds.value
    && !soundsError.value
    && sounds.value.length > 0
    && !isCatalogEmpty.value
    && selectedIds.value.size === 0,
);

function isSelected(soundId: number): boolean {
  return selectedIds.value.has(soundId);
}

function toggleSound(soundId: number): void {
  const next = new Set(selectedIds.value);
  if (next.has(soundId)) {
    next.delete(soundId);
  } else {
    next.add(soundId);
  }
  selectedIds.value = next;
}

async function openEditModal(soundId: number): Promise<void> {
  const vibeSound = vibeSounds.value.find((vs) => vs.id === soundId);
  if (!vibeSound) return;

  const modal = await modalController.create({
    component: VibeSoundEditModal,
    componentProps: {
      vibeId: vibeId.value,
      vibeSound,
    },
    // Sheet modal — snaps to 60% with handle
    breakpoints: [0, 0.6, 0.85],
    initialBreakpoint: 0.6,
    handle: false, // we render our own handle bar
  });

  modal.onDidDismiss().then(({ data }) => {
    if (data?.updated) {
      // Patch local vibeSounds so UI reflects new values without a full re-fetch
      const idx = vibeSounds.value.findIndex((vs) => vs.id === soundId);
      if (idx !== -1) {
        vibeSounds.value[idx] = { ...vibeSounds.value[idx], ...data.updated };
      }
    }
  });

  await modal.present();
}

// Number of changes pending (adds + removes)
const pendingCount = computed(() => {
  let count = 0;
  for (const id of selectedIds.value) {
    if (!originalIds.value.has(id)) count++;
  }
  for (const id of originalIds.value) {
    if (!selectedIds.value.has(id)) count++;
  }
  return count;
});

async function showToast(message: string, color: 'success' | 'danger'): Promise<void> {
  const toast = await toastController.create({
    message,
    duration: 2500,
    color,
    position: 'bottom',
    positionAnchor: 'sounds-save-bar',
  });
  await toast.present();
}

async function handleSave(): Promise<void> {
  saving.value = true;
  saveError.value = null;

  const toAttach = [...selectedIds.value].filter((id) => !originalIds.value.has(id));
  const toRemove = [...originalIds.value].filter((id) => !selectedIds.value.has(id));

  try {
    // Run all attach and remove requests in parallel.
    // Using the service directly avoids the shared loading-ref race condition
    // that occurs when the composable's attach/remove functions run concurrently.
    await Promise.all([
      ...toAttach.map((id) =>
        vibeSoundService.attachSoundToVibe(vibeId.value, {
          sound_id: id,
          volume: 80,
          loop: true,
          sort_order: 0,
        }),
      ),
      ...toRemove.map((id) => vibeSoundService.removeSoundFromVibe(vibeId.value, id)),
    ]);

    // Re-fetch from backend to confirm persisted state, then sync UI
    await fetchVibeSounds(vibeId.value);
    syncFromBackend();

    await showToast('Sounds saved!', 'success');
    router.back();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save sounds.';
    saveError.value = msg;
    await showToast(msg, 'danger');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
/* ── Header ─────────────────────────────────────── */
.sounds-toolbar {
  --background: transparent;
  --border-style: none;
  padding-top: env(safe-area-inset-top, 0px);
  --min-height: calc(56px + env(safe-area-inset-top, 0px));
}

.sounds-toolbar-title {
  font-size: var(--app-font-size-h6);
  font-weight: var(--app-font-weight-bold);
  color: #fff;
}

.sounds-back-btn {
  --color: #fff;
}

/* ── Hero ────────────────────────────────────────── */
.sounds-hero {
  position: relative;
  height: 200px;
  background: linear-gradient(160deg, #0d7a7a 0%, #0e6b8a 50%, #1a4a6e 100%);
  /* Slide under transparent toolbar (includes notch / status inset). */
  margin-top: calc(-56px - env(safe-area-inset-top, 0px));
  display: flex;
  align-items: flex-end;
  padding: 24px 20px;
}

.sounds-hero-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
}

.sounds-hero-text {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sounds-hero-title {
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  letter-spacing: -0.3px;
  line-height: 1.2;
}

.sounds-hero-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.82);
  margin: 0;
}

.sounds-hero-lead {
  font-size: 14px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.88);
  margin: 0;
  line-height: 1.45;
  max-width: 34rem;
}

.sounds-hero-vibe {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.72);
  margin: 6px 0 0;
}

.sounds-hero-subtitle {
  font-size: 14px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.75);
  margin: 0;
  letter-spacing: 0.1px;
}

/* ── Selected layers strip ─────────────────────── */
.sounds-selected-section {
  padding: 8px 0 4px;
  background: var(--app-color-bg, #fff);
  border-bottom: 1px solid var(--app-color-border, #e2e8f0);
}

.sounds-section-head {
  padding-bottom: 10px;
}

.sounds-section-title {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--app-color-text-primary, #0f172a);
  margin: 0;
}

.sounds-section-sub {
  font-size: 13px;
  line-height: 1.45;
  color: var(--app-color-text-muted, #64748b);
  margin: 6px 0 0;
}

.sounds-selected-scroll-outer {
  position: relative;
}

.sounds-selected-scroll-outer::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 4px;
  width: 40px;
  background: linear-gradient(to right, transparent, var(--app-color-bg, #fff));
  pointer-events: none;
  z-index: 1;
}

.sounds-selected-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 20px 12px;
  scrollbar-width: none;
}

.sounds-selected-row::-webkit-scrollbar {
  display: none;
}

.sound-selected-chip {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 200px;
  max-width: 280px;
  padding: 8px 12px 8px 8px;
  border-radius: 14px;
  border: 1px solid var(--app-color-border, #e2e8f0);
  background: var(--app-color-surface, #f8fafc);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  cursor: pointer;
  transition:
    transform var(--app-motion-fast) var(--app-ease-standard),
    border-color var(--app-motion-base) var(--app-ease-standard),
    box-shadow var(--app-motion-base) var(--app-ease-standard);
}

.sound-selected-chip:active {
  transform: scale(0.98);
}

.sound-selected-thumb-wrap {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
}

.sound-selected-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sound-selected-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sound-selected-fallback-icon {
  font-size: 22px;
  color: rgba(255, 255, 255, 0.92);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));
}

.sound-selected-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sound-selected-chip-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--app-color-text-primary, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sound-selected-chip-line {
  font-size: 12px;
  color: var(--app-color-text-muted, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sound-selected-chip-cat {
  font-weight: 600;
  color: var(--ion-color-primary, #1dac92);
}

.sound-selected-chip-dot {
  margin: 0 4px;
  opacity: 0.55;
}

/* ── Browse header ─────────────────────────────── */
.sounds-library-head {
  padding-top: 20px;
  padding-bottom: 4px;
}

.sounds-library-title {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--app-color-text-primary, #0f172a);
}

.sounds-library-sub {
  font-size: 13px;
  color: var(--app-color-text-muted, #64748b);
  margin: 6px 0 0;
  line-height: 1.45;
}

/* ── Browse search & filter chips ───────────────── */
.sounds-browse-tools {
  padding-bottom: 8px;
}

.sounds-search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--app-color-surface, #f1f5f9);
  border: 1px solid var(--app-color-border, #e2e8f0);
  border-radius: 12px;
  padding: 0 14px;
  height: 48px;
}

.sounds-search-box--browse {
  margin-bottom: 14px;
}

.sounds-search-icon {
  color: var(--app-color-text-muted, #94a3b8);
  font-size: 20px;
  flex-shrink: 0;
}

.sounds-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  color: var(--app-color-text-primary, #0f172a);
}

.sounds-search-input::placeholder {
  color: var(--app-color-text-muted, #94a3b8);
}

.sounds-filter-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-color-text-muted, #64748b);
  margin: 0 0 8px;
}

.sounds-chip-scroll-outer {
  position: relative;
  margin-bottom: 12px;
}

.sounds-chip-scroll-outer::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 28px;
  background: linear-gradient(to right, transparent, var(--app-color-bg, #fff));
  pointer-events: none;
}

.sounds-chip-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}

.sounds-chip-row::-webkit-scrollbar {
  display: none;
}

.sounds-filter-chip {
  flex-shrink: 0;
  appearance: none;
  border: 1px solid var(--app-color-border, #e2e8f0);
  background: var(--app-color-surface, #f8fafc);
  color: var(--app-color-text-secondary, #475569);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background var(--app-motion-fast) var(--app-ease-standard),
    border-color var(--app-motion-fast) var(--app-ease-standard),
    color var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-fast) var(--app-ease-standard);
}

.sounds-filter-chip--active {
  border-color: var(--ion-color-primary, #1dac92);
  background: var(--ion-color-primary-tint, #d1faf3);
  color: var(--app-color-text-primary, #0f172a);
  box-shadow: 0 1px 4px rgba(29, 172, 146, 0.2);
}

.sounds-filter-empty {
  padding-top: var(--app-space-4);
  padding-bottom: var(--app-space-4);
}

/* ── Empty / loading / hint ─────────────────────── */
.sounds-hint-wrap {
  padding: 12px 0 4px;
}

.sounds-hint-inner {
  padding: var(--app-space-4) var(--app-space-5) !important;
  border-radius: var(--app-radius-lg);
}

.sounds-state-slot {
  padding-top: var(--app-space-6);
  padding-bottom: var(--app-space-4);
}

/* ── Categories ──────────────────────────────────── */
.sounds-categories {
  padding: 8px 0 0;
  background: var(--app-color-bg, #fff);
}

.sounds-category {
  margin-bottom: 24px;
}

.sounds-category-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--app-color-text-primary, #0f172a);
  margin: 0 0 12px;
  padding: 0 20px;
}

/* Horizontal scroll row with right-edge fade */
.sounds-row-wrap {
  position: relative;
}

.sounds-row-wrap::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 4px;
  width: 48px;
  background: linear-gradient(to right, transparent, var(--app-color-bg, #fff));
  pointer-events: none;
  z-index: 1;
}

.sounds-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  /* left padding aligns with page; right peek reveals next card */
  padding: 0 48px 4px 20px;
  scrollbar-width: none;
}

.sounds-row::-webkit-scrollbar {
  display: none;
}

/* ── Sound card ──────────────────────────────────── */
.sound-card {
  flex-shrink: 0;
  /* ~2.2 cards visible: (viewport - 20px left - 48px peek) / 2.2 */
  width: calc((100vw - 20px - 48px) / 2.2);
  max-width: 156px;
  cursor: pointer;
}

.sound-card-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  overflow: hidden;
  border: 2px solid transparent;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  transition:
    border-color var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-base) var(--app-ease-standard);
}

.sound-card-thumb--photo .sound-card-img {
  transform: scale(1.02);
}

.sound-card:active .sound-card-thumb {
  transform: scale(0.97);
}

.sound-card.selected .sound-card-thumb {
  border-color: var(--ion-color-primary, #1dac92);
  box-shadow:
    0 0 0 1px rgba(29, 172, 146, 0.35),
    0 12px 28px rgba(29, 172, 146, 0.18);
}

.sound-card-thumb-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(15, 23, 42, 0.05) 0%,
    rgba(15, 23, 42, 0.55) 100%
  );
  pointer-events: none;
}

.sound-card-cat-pill,
.sound-card-duration-pill {
  position: absolute;
  z-index: 2;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 8px;
  line-height: 1;
  pointer-events: none;
  backdrop-filter: blur(8px);
}

.sound-card-cat-pill {
  left: 8px;
  bottom: 8px;
  max-width: calc(100% - 16px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #fff;
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.sound-card-duration-pill {
  right: 8px;
  top: 8px;
  color: rgba(255, 255, 255, 0.95);
  background: rgba(15, 23, 42, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.14);
}

.sound-card-placeholder-icon {
  font-size: 36px;
  color: rgba(255, 255, 255, 0.92);
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.28));
}

.sound-card-text-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.sound-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.sound-card-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--app-color-surface, #f1f5f9);
  color: var(--app-color-text-muted, #64748b);
  border: 1px solid var(--app-color-border, #e2e8f0);
}

.sound-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sound-card-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1dac92 0%, #0e7490 100%);
}

/* Selected overlay */
.sound-card-selected-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  background: rgba(29, 172, 146, 0.28);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 8px;
}

.sound-card-check {
  font-size: 22px;
  color: #fff;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}

.sound-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  gap: 4px;
}

.sound-card-name {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--app-color-text-primary, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.sound-card-edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: var(--app-color-surface, #f1f5f9);
  color: var(--app-color-text-muted, #94a3b8);
  font-size: 15px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  padding: 0;
}

.sound-card-edit-btn:active {
  background: var(--ion-color-primary-tint, #d1faf3);
  color: var(--ion-color-primary, #1dac92);
}

/* ── Save bar ────────────────────────────────────── */
.sounds-save-error {
  font-size: 13px;
  color: var(--ion-color-danger);
  margin: 0 0 8px;
  text-align: center;
}

.sounds-save-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 20px calc(12px + var(--ion-safe-area-bottom, 0px));
  background: var(--app-color-bg, #fff);
  border-top: 1px solid var(--app-color-border, #e2e8f0);
  z-index: 100;
}

.sounds-save-btn {
  --background: var(--ion-color-primary, #1dac92);
  --border-radius: 14px;
  --padding-top: 16px;
  --padding-bottom: 16px;
  font-weight: 700;
  font-size: 16px;
}

.sounds-save-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  margin-left: 10px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.3);
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

/* ── DEV: Execution Plan panel ──────────────────────── */
.dev-panel {
  margin: 24px 20px 0;
  border: 1.5px dashed #f59e0b;
  border-radius: 12px;
  padding: 14px 16px 8px;
  background: rgba(245, 158, 11, 0.06);
}

.dev-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.dev-panel-badge {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #fff;
  background: #f59e0b;
  border-radius: 4px;
  padding: 2px 6px;
}

.dev-panel-title {
  font-size: 13px;
  font-weight: 700;
  color: #92400e;
}

.dev-panel-count {
  margin-left: auto;
  font-size: 11px;
  color: #b45309;
}

.dev-layer {
  border-top: 1px solid rgba(245, 158, 11, 0.25);
  padding: 10px 0 6px;
}

.dev-layer-summary {
  font-size: 13px;
  font-weight: 600;
  color: #78350f;
  margin: 0 0 6px;
  line-height: 1.4;
}

.dev-layer-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dev-layer-meta span {
  font-size: 11px;
  font-family: monospace;
  color: #92400e;
  background: rgba(245, 158, 11, 0.12);
  border-radius: 4px;
  padding: 2px 6px;
}
</style>
