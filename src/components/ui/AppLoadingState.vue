<template>
  <div
    class="app-loading-state"
    :class="[
      compact && 'app-loading-state--compact',
      tone === 'inverse' && 'app-loading-state--inverse',
    ]"
    role="status"
    aria-busy="true"
  >
    <template v-if="skeleton">
      <div class="app-loading-state__skel app-loading-state__skel--lg" />
      <div class="app-loading-state__skel" />
      <div class="app-loading-state__skel app-loading-state__skel--narrow" />
    </template>
    <template v-else>
      <ion-spinner name="crescent" color="primary" class="app-loading-state__spinner" />
      <p v-if="title" class="app-loading-state__title">{{ title }}</p>
      <p v-if="description" class="app-loading-state__desc">{{ description }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { IonSpinner } from '@ionic/vue';

withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    skeleton?: boolean;
    compact?: boolean;
    tone?: 'default' | 'inverse';
  }>(),
  {
    skeleton: false,
    compact:  false,
    tone:     'default',
  },
);
</script>

<style scoped>
.app-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-3);
  padding: var(--app-space-7) var(--app-space-5);
  width: 100%;
  box-sizing: border-box;
}

.app-loading-state--compact {
  padding: var(--app-space-5) var(--app-space-4);
  gap: var(--app-space-2);
}

.app-loading-state__spinner {
  width: 36px;
  height: 36px;
}

.app-loading-state__title {
  margin: 0;
  font-size: var(--app-font-size-body-md);
  font-weight: var(--app-font-weight-medium);
  color: var(--app-color-text-secondary);
}

.app-loading-state__desc {
  margin: 0;
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-muted);
  text-align: center;
  max-width: 260px;
}

.app-loading-state--inverse .app-loading-state__title {
  color: rgba(255, 255, 255, 0.85);
}

.app-loading-state--inverse .app-loading-state__desc {
  color: rgba(255, 255, 255, 0.55);
}

.app-loading-state__skel {
  height: 12px;
  width: 100%;
  max-width: 220px;
  border-radius: var(--app-radius-sm);
  background: var(--app-color-surface-subtle);
  animation: app-loading-pulse 1.2s ease-in-out infinite;
}

.app-loading-state__skel--lg {
  height: 16px;
  max-width: 160px;
}

.app-loading-state__skel--narrow {
  max-width: 120px;
}

.app-loading-state--inverse .app-loading-state__skel {
  background: rgba(255, 255, 255, 0.12);
}

@keyframes app-loading-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}
</style>
