<template>
  <ion-page>
    <ion-header class="ion-no-border sounds-header">
      <ion-toolbar class="sounds-toolbar">
        <ion-buttons slot="start">
          <ion-button @click="router.back()" class="sounds-back-btn">
            <ion-icon :icon="chevronBackOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
        <ion-title class="sounds-toolbar-title">Select Sounds</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="sounds-content">
      <!-- Hero banner -->
      <div class="sounds-hero">
        <div class="sounds-hero-overlay" />
        <h1 class="sounds-hero-title">Select Sounds</h1>
      </div>

      <!-- Search -->
      <div class="sounds-search-wrap">
        <div class="sounds-search-box">
          <ion-icon :icon="searchOutline" class="sounds-search-icon" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="What sound are you looking for?"
            class="sounds-search-input"
          />
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loadingSounds && !sounds.length" class="sounds-state">
        <ion-spinner name="crescent" color="primary" />
      </div>

      <!-- Error -->
      <div v-else-if="soundsError && !sounds.length" class="sounds-state">
        <p class="sounds-state-msg error">{{ soundsError }}</p>
        <ion-button fill="outline" size="small" @click="fetchSounds">Retry</ion-button>
      </div>

      <!-- Empty catalog -->
      <div v-else-if="isCatalogEmpty" class="sounds-state">
        <p class="sounds-state-msg">No sounds found.</p>
      </div>

      <!-- Categories -->
      <div v-else class="sounds-categories">
        <div
          v-for="(group, category) in filteredByCategory"
          :key="category"
          class="sounds-category"
        >
          <h2 class="sounds-category-title">{{ category }}</h2>

          <div class="sounds-row">
            <div
              v-for="sound in group"
              :key="sound.id"
              class="sound-card"
              :class="{ selected: isSelected(sound.id) }"
              @click="toggleSound(sound.id)"
            >
              <!-- Thumbnail -->
              <div class="sound-card-thumb">
                <img
                  v-if="sound.thumbnail_url"
                  :src="sound.thumbnail_url"
                  :alt="sound.name"
                  class="sound-card-img"
                />
                <div v-else class="sound-card-placeholder" />

                <!-- Selected overlay -->
                <div v-if="isSelected(sound.id)" class="sound-card-selected-overlay">
                  <ion-icon :icon="checkmarkCircle" class="sound-card-check" />
                </div>
              </div>

              <span class="sound-card-name">{{ sound.name }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom spacing for save button -->
      <div style="height: 100px" />
    </ion-content>

    <!-- Save Sounds button -->
    <div class="sounds-save-bar">
      <ion-button
        expand="block"
        class="sounds-save-btn"
        :disabled="saving"
        @click="handleSave"
      >
        <ion-icon :icon="checkmarkOutline" slot="start" />
        Save Sounds
        <span v-if="pendingCount > 0" class="sounds-save-badge">{{ pendingCount }}</span>
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
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import {
  checkmarkCircle,
  checkmarkOutline,
  chevronBackOutline,
  searchOutline,
} from 'ionicons/icons';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSounds } from '@/composables/useSounds';
import { useVibeSounds } from '@/composables/useVibeSounds';

const route = useRoute();
const router = useRouter();
const vibeId = computed(() => Number(route.params.id));

const {
  sounds,
  loading: loadingSounds,
  error: soundsError,
  fetchSounds,
} = useSounds();

const {
  vibeSounds,
  fetchVibeSounds,
  attachSound,
  removeVibeSound,
} = useVibeSounds();

const searchQuery = ref('');
const saving = ref(false);

// IDs currently attached to the vibe (loaded from server)
const originalIds = ref<Set<number>>(new Set());
// IDs selected in the UI (can differ before saving)
const selectedIds = ref<Set<number>>(new Set());

onMounted(async () => {
  await Promise.all([fetchSounds(), fetchVibeSounds(vibeId.value)]);

  console.log('[VibeSoundsPage] sounds loaded:', sounds.value.length, sounds.value);
  console.log('[VibeSoundsPage] vibe sounds loaded:', vibeSounds.value);

  const ids = new Set(vibeSounds.value.map((s) => s.id));
  originalIds.value = ids;
  selectedIds.value = new Set(ids);
});

// Filtered sounds grouped by category
const filteredByCategory = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  const filtered = q
    ? sounds.value.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q),
      )
    : sounds.value;

  return filtered.reduce<Record<string, typeof sounds.value>>((acc, sound) => {
    const cat = sound.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(sound);
    return acc;
  }, {});
});

// Object has no .length — check keys instead
const isCatalogEmpty = computed(() => Object.keys(filteredByCategory.value).length === 0);

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

async function handleSave(): Promise<void> {
  saving.value = true;

  const toAttach = [...selectedIds.value].filter((id) => !originalIds.value.has(id));
  const toRemove = [...originalIds.value].filter((id) => !selectedIds.value.has(id));

  await Promise.all([
    ...toAttach.map((id) => attachSound(vibeId.value, { sound_id: id })),
    ...toRemove.map((id) => removeVibeSound(vibeId.value, id)),
  ]);

  originalIds.value = new Set(selectedIds.value);
  saving.value = false;
  router.back();
}
</script>

<style scoped>
/* ── Header ─────────────────────────────────────── */
.sounds-toolbar {
  --background: transparent;
  --border-style: none;
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
  margin-top: -56px; /* slide under the transparent toolbar */
  display: flex;
  align-items: flex-end;
  padding: 24px 20px;
}

.sounds-hero-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
}

.sounds-hero-title {
  position: relative;
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  letter-spacing: -0.3px;
}

/* ── Search ──────────────────────────────────────── */
.sounds-search-wrap {
  padding: 16px 20px 8px;
  background: var(--app-color-bg, #fff);
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

.sounds-search-icon {
  color: var(--app-color-text-muted, #94a3b8);
  font-size: 20px;
  flex-shrink: 0;
}

.sounds-search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  color: var(--app-color-text-primary, #0f172a);
}

.sounds-search-input::placeholder {
  color: var(--app-color-text-muted, #94a3b8);
}

/* ── States ──────────────────────────────────────── */
.sounds-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 24px;
}

.sounds-state-msg {
  font-size: var(--app-font-size-body-md, 15px);
  color: var(--app-color-text-secondary, #475569);
  margin: 0;
}

.sounds-state-msg.error {
  color: var(--ion-color-danger);
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

/* Horizontal scroll row */
.sounds-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 0 20px 4px;
  scrollbar-width: none;
}

.sounds-row::-webkit-scrollbar {
  display: none;
}

/* ── Sound card ──────────────────────────────────── */
.sound-card {
  flex-shrink: 0;
  width: 130px;
  cursor: pointer;
}

.sound-card-thumb {
  position: relative;
  width: 130px;
  height: 130px;
  border-radius: 14px;
  overflow: hidden;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}

.sound-card.selected .sound-card-thumb {
  border-color: var(--ion-color-primary, #1dac92);
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
  background: linear-gradient(135deg, #1dac92 0%, #0e7490 100%);
}

/* Selected overlay */
.sound-card-selected-overlay {
  position: absolute;
  inset: 0;
  background: rgba(29, 172, 146, 0.35);
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

.sound-card-name {
  display: block;
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-color-text-primary, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Save bar ────────────────────────────────────── */
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
</style>
