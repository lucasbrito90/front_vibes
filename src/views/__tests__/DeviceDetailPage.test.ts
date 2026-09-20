import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import { mount } from '@vue/test-utils';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// Same pattern as DevicesPage.test.ts: mock the SERVICE modules, let the real
// (singleton) composables run against them.

const { mockGetDevice, mockGetProviderTypes, mockIsDeviceOffline } = vi.hoisted(() => ({
  mockGetDevice: vi.fn(),
  mockGetProviderTypes: vi.fn(),
  mockIsDeviceOffline: vi.fn((): boolean => false),
}));

vi.mock('@/services/device.service', () => ({
  deviceService: {
    getDevices: vi.fn(),
    getDevice: mockGetDevice,
    createDevice: vi.fn(),
    updateDevice: vi.fn(),
    deleteDevice: vi.fn(),
  },
}));

vi.mock('@/services/provider-connection.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/provider-connection.service')>();
  return {
    ...actual,
    providerConnectionService: {
      ...actual.providerConnectionService,
      getProviderTypes: mockGetProviderTypes,
    },
    isDeviceOffline: mockIsDeviceOffline,
  };
});

/**
 * `onIonViewWillEnter` only fires inside an `ion-router-outlet`, which a bare
 * `mount()` does not provide — the page would render with no device at all.
 * Aliasing it to `onMounted` keeps the page's real entry logic (getDevice +
 * fetchProviderTypes) under test instead of stubbing the state it produces.
 */
vi.mock('@ionic/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/vue')>();
  const { onMounted } = await import('vue');
  return {
    ...actual,
    onIonViewWillEnter: (cb: () => void) => onMounted(cb),
  };
});

import { useDevices } from '@/composables/useDevices';
import { useProviderTypes } from '@/composables/useProviderTypes';
import DeviceDetailPage from '@/views/DeviceDetailPage.vue';

const googleHomeProviderType = {
  slug: 'google_home',
  label: 'Google Home',
  config: {},
  credentials: {},
  execution_capabilities: ['device_discovery', 'state_read', 'interactive_execution'],
};

const device = {
  id: 7,
  provider_connection_id: 2,
  name: 'QuartoCasalUm',
  type: 'lighting',
  provider: 'google_home',
  provider_device_id: 'gh-opaque-id',
  status: 'online',
  capabilities: null,
  last_seen_at: null,
  created_at: null,
  updated_at: null,
};

/**
 * Mounts DeviceDetailPage.vue with a real router positioned on /devices/7, so
 * `route.params.id` resolves the way the page expects.
 */
async function mountDeviceDetailPage() {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/devices' },
      { path: '/devices', component: defineComponent({ template: '<div/>' }) },
      { path: '/devices/:id', component: DeviceDetailPage },
    ],
  });

  await router.push('/devices/7');
  await router.isReady();

  const wrapper = mount(DeviceDetailPage, { global: { plugins: [router] } });
  await vi.waitUntil(() => wrapper.text().includes('QuartoCasalUm'));

  return wrapper;
}

beforeEach(() => {
  const { selectedDevice } = useDevices();
  const { providerTypes } = useProviderTypes();
  selectedDevice.value = null;
  providerTypes.value = [];

  mockIsDeviceOffline.mockReset().mockReturnValue(false);
  mockGetDevice.mockReset().mockResolvedValue(device);
  mockGetProviderTypes.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DeviceDetailPage — provider label matches the devices list', () => {
  it('renders the human label once provider types are available, not the raw slug', async () => {
    mockGetProviderTypes.mockResolvedValue([googleHomeProviderType]);

    const wrapper = await mountDeviceDetailPage();
    await vi.waitUntil(() => wrapper.text().includes('Google Home'));

    expect(wrapper.text()).toContain('Google Home');
    expect(wrapper.text()).not.toContain('google_home');
  });

  it('falls back to the raw slug when provider types could not be loaded — never blank, never broken', async () => {
    mockGetProviderTypes.mockRejectedValue(new Error('offline'));

    const wrapper = await mountDeviceDetailPage();

    expect(wrapper.text()).toContain('google_home');
  });

  it('never exposes the raw provider device id', async () => {
    mockGetProviderTypes.mockResolvedValue([googleHomeProviderType]);

    const wrapper = await mountDeviceDetailPage();

    expect(wrapper.text()).not.toContain('gh-opaque-id');
  });
});
