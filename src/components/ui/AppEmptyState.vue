<template>
  <div
    class="app-empty-state"
    :class="[
      `app-empty-state--${variant}`,
      tone === 'inverse' && 'app-empty-state--inverse',
    ]"
    role="status"
  >
    <div v-if="icon" class="app-empty-state__icon-wrap">
      <ion-icon :icon="icon" class="app-empty-state__icon" aria-hidden="true" />
    </div>
    <h2 class="app-empty-state__title">{{ title }}</h2>
    <p v-if="description" class="app-empty-state__desc">{{ description }}</p>
    <ion-button
      v-if="actionLabel"
      expand="block"
      class="app-empty-state__btn"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </ion-button>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue';

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    /** Ionicons glyph reference */
    icon?: string;
    actionLabel?: string;
    variant?: 'default' | 'compact' | 'card';
    /** `inverse` — light text for dark backdrops (e.g. player hero). */
    tone?: 'default' | 'inverse';
  }>(),
  {
    variant: 'default',
    tone:    'default',
  },
);

const emit = defineEmits<{ action: [] }>();
</script>

<style scoped>
.app-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--app-space-3);
  padding: var(--app-space-7) var(--app-space-5);
  box-sizing: border-box;
  width: 100%;
}

.app-empty-state--compact {
  padding: var(--app-space-5) var(--app-space-4);
  gap: var(--app-space-2);
}

.app-empty-state--card {
  padding: var(--app-space-6);
  background: var(--app-color-surface);
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-lg);
  box-shadow: var(--app-shadow-soft);
}

.app-empty-state__icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: var(--app-radius-md);
  background: var(--app-color-primary-100);
  color: var(--app-color-primary-600);
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-empty-state--inverse .app-empty-state__icon-wrap {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(167, 243, 208, 0.95);
}

.app-empty-state__icon {
  font-size: 28px;
}

.app-empty-state--compact .app-empty-state__icon-wrap {
  width: 44px;
  height: 44px;
}

.app-empty-state--compact .app-empty-state__icon {
  font-size: 24px;
}

.app-empty-state__title {
  margin: 0;
  font-size: var(--app-font-size-h6);
  font-weight: var(--app-font-weight-bold);
  color: var(--app-color-text-primary);
  line-height: var(--app-line-height-heading-tight);
}

.app-empty-state--compact .app-empty-state__title {
  font-size: var(--app-font-size-body-lg);
}

.app-empty-state--inverse .app-empty-state__title {
  color: rgba(255, 255, 255, 0.95);
}

.app-empty-state__desc {
  margin: 0;
  font-size: var(--app-font-size-body-md);
  color: var(--app-color-text-secondary);
  line-height: var(--app-line-height-body);
  max-width: 320px;
}

.app-empty-state--compact .app-empty-state__desc {
  font-size: var(--app-font-size-body-sm);
}

.app-empty-state--inverse .app-empty-state__desc {
  color: rgba(255, 255, 255, 0.72);
}

.app-empty-state__btn {
  margin-top: var(--app-space-2);
  min-height: 48px;
  max-width: 280px;
}
</style>
