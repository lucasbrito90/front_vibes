<template>
  <span
    class="app-automation-badge"
    :class="[
      `app-automation-badge--${badge.tone}`,
      `app-automation-badge--${badge.variant}`,
      size === 'md' && 'app-automation-badge--md',
    ]"
    :aria-label="badge.a11yLabel"
  >
    <ion-icon
      v-if="!hideIcon"
      :icon="glyph"
      class="app-automation-badge__icon"
      aria-hidden="true"
    />
    <span class="app-automation-badge__label" aria-hidden="true">{{ badge.label }}</span>
  </span>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import {
  alarmOutline,
  alertCircleOutline,
  cloudOfflineOutline,
  flashOffOutline,
  flashOutline,
  hardwareChipOutline,
  helpCircleOutline,
  syncOutline,
} from 'ionicons/icons';
import { computed } from 'vue';
import type { AutomationBadge, AutomationBadgeIcon } from '@/utils/automation-badges';

const props = withDefaults(
  defineProps<{
    /** Resolved badge metadata from `automation-badges.ts`. */
    badge: AutomationBadge;
    size?: 'sm' | 'md';
    hideIcon?: boolean;
  }>(),
  {
    size: 'sm',
    hideIcon: false,
  },
);

/** Semantic icon key → ionicon glyph. Kept in the presentation layer only. */
const ICON_GLYPHS: Record<AutomationBadgeIcon, string> = {
  flash: flashOutline,
  'flash-off': flashOffOutline,
  alarm: alarmOutline,
  'hardware-chip': hardwareChipOutline,
  'cloud-offline': cloudOfflineOutline,
  'alert-circle': alertCircleOutline,
  sync: syncOutline,
  'help-circle': helpCircleOutline,
};

const glyph = computed(() => ICON_GLYPHS[props.badge.icon] ?? helpCircleOutline);
</script>

<style scoped>
.app-automation-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: var(--app-font-size-body-xs);
  font-weight: var(--app-font-weight-medium);
  line-height: 1.2;
  letter-spacing: 0.02em;
  white-space: nowrap;
  max-width: 100%;
}

.app-automation-badge--md {
  padding: 5px 12px;
  font-size: var(--app-font-size-body-sm);
}

.app-automation-badge__icon {
  flex-shrink: 0;
  font-size: 13px;
}

.app-automation-badge--md .app-automation-badge__icon {
  font-size: 15px;
}

.app-automation-badge__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Tone · variant combinations (design-system tokens) ─────────────────────── */

/* Primary */
.app-automation-badge--primary.app-automation-badge--soft {
  background: var(--app-color-primary-100);
  color: var(--app-color-primary-600);
  border-color: var(--app-color-primary-200);
}

.app-automation-badge--primary.app-automation-badge--solid {
  background: var(--app-color-primary-500);
  color: var(--ion-color-primary-contrast);
  border-color: var(--app-color-primary-500);
}

.app-automation-badge--primary.app-automation-badge--outline {
  background: transparent;
  color: var(--app-color-primary-600);
  border-color: var(--app-color-primary-300);
}

/* Neutral */
.app-automation-badge--neutral.app-automation-badge--soft {
  background: var(--app-color-surface-subtle);
  color: var(--app-color-text-secondary);
  border-color: var(--app-color-border);
}

.app-automation-badge--neutral.app-automation-badge--outline {
  background: transparent;
  color: var(--app-color-text-secondary);
  border-color: var(--app-color-border);
}

.app-automation-badge--neutral.app-automation-badge--solid {
  background: var(--app-color-text-secondary);
  color: var(--app-color-bg);
  border-color: var(--app-color-text-secondary);
}

/* Success */
.app-automation-badge--success.app-automation-badge--soft,
.app-automation-badge--success.app-automation-badge--outline {
  background: rgba(100, 192, 134, 0.16);
  color: var(--app-color-text-primary);
  border-color: rgba(100, 192, 134, 0.5);
}

.app-automation-badge--success.app-automation-badge--solid {
  background: var(--ion-color-success);
  color: #0b1f14;
  border-color: var(--ion-color-success);
}

/* Warning — text uses primary text color to stay readable in both modes. */
.app-automation-badge--warning.app-automation-badge--soft,
.app-automation-badge--warning.app-automation-badge--outline {
  background: rgba(250, 204, 21, 0.18);
  color: var(--app-color-text-primary);
  border-color: rgba(250, 204, 21, 0.55);
}

.app-automation-badge--warning.app-automation-badge--solid {
  background: var(--ion-color-warning);
  color: #3b2f00;
  border-color: var(--ion-color-warning);
}

/* Danger */
.app-automation-badge--danger.app-automation-badge--soft,
.app-automation-badge--danger.app-automation-badge--outline {
  background: rgba(247, 85, 85, 0.15);
  color: var(--ion-color-danger);
  border-color: rgba(247, 85, 85, 0.45);
}

.app-automation-badge--danger.app-automation-badge--solid {
  background: var(--ion-color-danger);
  color: #ffffff;
  border-color: var(--ion-color-danger);
}
</style>
