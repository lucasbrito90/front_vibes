<template>
  <ion-modal :is-open="isOpen" class="cover-bundle-picker-modal" @did-dismiss="onDismiss">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-title>Choose a cover</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="close">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <p class="cover-bundle-picker__hint">
        Pick a catalog cover bundle. Only URLs provided by the bundle overwrite your vibe images.
      </p>

      <AppLoadingState v-if="loading" compact title="Loading covers…" />

      <AppErrorState
        v-else-if="error"
        compact
        title="Couldn’t load covers"
        :description="error"
        retry-label="Retry"
        @retry="loadList"
      />

      <AppEmptyState
        v-else-if="!list.length"
        title="No covers available"
        description="Ask an admin to publish active cover bundles in the catalog."
        variant="compact"
      />

      <div v-else class="cover-bundle-picker__grid">
        <button
          v-for="b in list"
          :key="b.id"
          type="button"
          class="cover-bundle-picker__card"
          :class="{ 'cover-bundle-picker__card--selected': selectedId === b.id }"
          @click="selectedId = b.id"
        >
          <div class="cover-bundle-picker__thumb-wrap">
            <img
              v-if="previewSrc(b)"
              :src="previewSrc(b)!"
              alt=""
              class="cover-bundle-picker__thumb app-artwork-fade-in"
              loading="lazy"
            />
            <div v-else class="cover-bundle-picker__thumb-placeholder">No preview</div>
          </div>
          <div class="cover-bundle-picker__meta">
            <span class="cover-bundle-picker__name">{{ b.name }}</span>
            <span v-if="b.category" class="cover-bundle-picker__cat">{{ b.category }}</span>
            <span v-if="b.tags.length" class="cover-bundle-picker__tags">{{ b.tags.slice(0, 4).join(' · ') }}</span>
          </div>
        </button>
      </div>

      <div class="cover-bundle-picker__footer">
        <ion-button expand="block" :disabled="selectedId == null" class="auth-submit" @click="applySelection">
          Apply
        </ion-button>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { ref, watch } from 'vue';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { useCoverBundles } from '@/composables/useCoverBundles';
import type { CoverBundle } from '@/types/cover-bundle';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  'update:isOpen': [boolean];
  apply: [CoverBundle];
}>();

const { list, loading, error, loadList } = useCoverBundles();
const selectedId = ref<number | null>(null);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      selectedId.value = null;
      void loadList();
    }
  },
);

function previewSrc(b: CoverBundle): string | null {
  return b.thumbnail_url?.trim() || b.artwork_url?.trim() || null;
}

function close(): void {
  emit('update:isOpen', false);
}

function onDismiss(): void {
  emit('update:isOpen', false);
}

function applySelection(): void {
  const b = list.value.find((x) => x.id === selectedId.value);
  if (b) emit('apply', b);
  close();
}
</script>

<style scoped>
.cover-bundle-picker__hint {
  margin: 0 0 var(--app-space-4);
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-secondary);
  line-height: var(--app-line-height-body);
}

.cover-bundle-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: var(--app-space-3);
  padding-bottom: var(--app-space-6);
}

.cover-bundle-picker__card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: left;
  padding: 0;
  margin: 0;
  border: 2px solid var(--app-color-border);
  border-radius: var(--app-radius-lg);
  background: var(--app-color-surface);
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.cover-bundle-picker__card--selected {
  border-color: var(--ion-color-primary);
  box-shadow: 0 0 0 1px var(--ion-color-primary-tint);
}

.cover-bundle-picker__thumb-wrap {
  aspect-ratio: 1;
  background: var(--app-color-surface-alt, rgba(0, 0, 0, 0.06));
}

.cover-bundle-picker__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-bundle-picker__thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--app-font-size-caption);
  color: var(--app-color-text-tertiary);
  padding: var(--app-space-2);
  text-align: center;
}

.cover-bundle-picker__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--app-space-2) var(--app-space-3) var(--app-space-3);
}

.cover-bundle-picker__name {
  font-size: var(--app-font-size-body-md);
  font-weight: var(--app-font-weight-semibold);
  color: var(--app-color-text-primary);
}

.cover-bundle-picker__cat {
  font-size: var(--app-font-size-caption);
  color: var(--app-color-text-secondary);
}

.cover-bundle-picker__tags {
  font-size: var(--app-font-size-caption);
  color: var(--app-color-text-tertiary);
  line-height: 1.3;
}

.cover-bundle-picker__footer {
  position: sticky;
  bottom: 0;
  padding-top: var(--app-space-3);
  padding-bottom: var(--app-space-2);
  background: linear-gradient(
    to top,
    var(--ion-background-color, #fff) 85%,
    transparent
  );
}
</style>
