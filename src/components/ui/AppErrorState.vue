<template>
  <div
    class="app-error-state"
    :class="[compact && 'app-error-state--compact', tone === 'inverse' && 'app-error-state--inverse']"
    role="alert"
  >
    <div class="app-error-state__icon-wrap">
      <ion-icon :icon="alertCircleOutline" class="app-error-state__icon" aria-hidden="true" />
    </div>
    <h2 class="app-error-state__title">{{ title }}</h2>
    <p v-if="description" class="app-error-state__desc">{{ description }}</p>
    <div class="app-error-state__actions">
      <ion-button
        v-if="retryLabel"
        expand="block"
        class="app-error-state__btn app-error-state__btn--primary"
        @click="emit('retry')"
      >
        {{ retryLabel }}
      </ion-button>
      <ion-button
        v-if="secondaryLabel"
        expand="block"
        fill="outline"
        class="app-error-state__btn"
        @click="emit('secondary')"
      >
        {{ secondaryLabel }}
      </ion-button>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue';
import { alertCircleOutline } from 'ionicons/icons';

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    retryLabel?: string;
    secondaryLabel?: string;
    compact?: boolean;
    tone?: 'default' | 'inverse';
  }>(),
  {
    retryLabel:     undefined,
    secondaryLabel: undefined,
    compact:        false,
    tone:           'default',
  },
);

const emit = defineEmits<{ retry: []; secondary: [] }>();
</script>

<style scoped>
.app-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--app-space-3);
  padding: var(--app-space-7) var(--app-space-5);
  width: 100%;
  box-sizing: border-box;
}

.app-error-state--compact {
  padding: var(--app-space-5) var(--app-space-4);
  gap: var(--app-space-2);
}

.app-error-state__icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: var(--app-radius-md);
  background: rgba(247, 85, 85, 0.12);
  color: var(--ion-color-danger);
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-error-state--inverse .app-error-state__icon-wrap {
  background: rgba(248, 113, 113, 0.18);
  color: #fecaca;
}

.app-error-state__icon {
  font-size: 28px;
}

.app-error-state__title {
  margin: 0;
  font-size: var(--app-font-size-h6);
  font-weight: var(--app-font-weight-bold);
  color: var(--app-color-text-primary);
}

.app-error-state--compact .app-error-state__title {
  font-size: var(--app-font-size-body-lg);
}

.app-error-state--inverse .app-error-state__title {
  color: rgba(255, 255, 255, 0.95);
}

.app-error-state__desc {
  margin: 0;
  font-size: var(--app-font-size-body-md);
  color: var(--app-color-text-secondary);
  line-height: var(--app-line-height-body);
  max-width: 300px;
}

.app-error-state--compact .app-error-state__desc {
  font-size: var(--app-font-size-body-sm);
}

.app-error-state--inverse .app-error-state__desc {
  color: rgba(255, 255, 255, 0.72);
}

.app-error-state__actions {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
  width: 100%;
  max-width: 280px;
  margin-top: var(--app-space-1);
}

.app-error-state__btn {
  margin: 0;
  min-height: 46px;
}

.app-error-state__btn--primary {
  --background: var(--ion-color-danger);
  --color: #fff;
}
</style>
