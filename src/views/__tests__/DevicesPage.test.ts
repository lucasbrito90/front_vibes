import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import { mount } from '@vue/test-utils';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// Same pattern as useProviderConnections.test.ts / useDevices.test.ts: mock
// the SERVICE modules, let the real (singleton) composables run against them.

const {
  mockGetProviderConnections,
  mockSyncProviderConnection,
  mockGetProviderTypes,
  mockGetDevices,
  mockIsDeviceOffline,
} = vi.hoisted(() => ({
  mockGetProviderConnections: vi.fn(),
  mockSyncProviderConnection: vi.fn(),
  mockGetProviderTypes: vi.fn(),
  mockGetDevices: vi.fn(),
  mockIsDeviceOffline: vi.fn((): boolean => false),
}));

vi.mock('@/services/provider-connection.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/provider-connection.service')>();
  return {
    ...actual,
    providerConnectionService: {
      ...actual.providerConnectionService,
      getProviderConnections: mockGetProviderConnections,
      syncProviderConnection: mockSyncProviderConnection,
      getProviderTypes: mockGetProviderTypes,
    },
    isDeviceOffline: mockIsDeviceOffline,
  };
});

vi.mock('@/services/device.service', () => ({
  deviceService: {
    getDevices: mockGetDevices,
    getDevice: vi.fn(),
    createDevice: vi.fn(),
    updateDevice: vi.fn(),
    deleteDevice: vi.fn(),
  },
}));

import { useProviderConnections } from '@/composables/useProviderConnections';
import { useProviderTypes } from '@/composables/useProviderTypes';
import { useDevices } from '@/composables/useDevices';
import DevicesPage from '@/views/DevicesPage.vue';

const homeAssistantProviderType = {
  slug: 'home_assistant',
  label: 'Home Assistant',
  config: {},
  credentials: {},
  execution_capabilities: [
    'device_discovery',
    'state_read',
    'interactive_execution',
    'server_side_execution',
    'scheduled_execution',
  ],
};

const googleHomeProviderType = {
  slug: 'google_home',
  label: 'Google Home',
  config: {},
  credentials: {},
  execution_capabilities: ['device_discovery', 'state_read', 'interactive_execution'],
};

const unsupportedProviderType = {
  slug: 'mystery_vendor',
  label: 'Mystery Vendor',
  config: {},
  credentials: {},
  execution_capabilities: [] as string[],
};

function homeAssistantConnection(id = 1) {
  return {
    id,
    name: 'My HA',
    provider: 'home_assistant',
    config: { base_url: 'https://ha.example.test' },
    status: 'connected',
    last_tested_at: null,
    created_at: null,
    updated_at: null,
  };
}

function googleHomeConnection(id = 2) {
  return {
    id,
    name: 'My Google Home',
    provider: 'google_home',
    config: {},
    status: 'unknown',
    last_tested_at: null,
    created_at: null,
    updated_at: null,
  };
}

function unsupportedConnection(id = 3) {
  return {
    id,
    name: 'Mystery',
    provider: 'mystery_vendor',
    config: {},
    status: 'unknown',
    last_tested_at: null,
    created_at: null,
    updated_at: null,
  };
}

/** Mounts DevicesPage.vue inside a real Vue Router so router.push() resolves. */
function mountDevicesPage() {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/devices' },
      { path: '/devices', component: defineComponent({ template: '<div/>' }) },
      { path: '/devices/providers/new', component: defineComponent({ template: '<div/>' }) },
      { path: '/devices/providers/:id', component: defineComponent({ template: '<div/>' }) },
      {
        path: '/devices/providers/:id/discover',
        component: defineComponent({ template: '<div/>' }),
      },
      { path: '/devices/:id', component: defineComponent({ template: '<div/>' }) },
    ],
  });

  const wrapper = mount(DevicesPage, {
    global: { plugins: [router] },
  });

  return { wrapper, router };
}

beforeEach(() => {
  const { connections } = useProviderConnections();
  const { providerTypes } = useProviderTypes();
  const { devices } = useDevices();
  connections.value = [];
  providerTypes.value = [];
  devices.value = [];

  mockIsDeviceOffline.mockReset().mockReturnValue(false);
  mockGetProviderConnections.mockReset();
  mockSyncProviderConnection.mockReset();
  mockGetProviderTypes.mockReset();
  mockGetDevices.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DevicesPage — toolbar sync routes by execution_capabilities', () => {
  it('with a single home_assistant connection (server_side_execution), calls syncConnection — unchanged behaviour', async () => {
    const { connections } = useProviderConnections();
    const { providerTypes } = useProviderTypes();
    connections.value = [homeAssistantConnection(1)] as never;
    providerTypes.value = [homeAssistantProviderType];
    mockSyncProviderConnection.mockResolvedValue({
      provider_connection_id: 1,
      synced: 3,
      created: 1,
      updated: 2,
      offline: 0,
      status: 'connected',
    });

    const { wrapper, router } = mountDevicesPage();
    const pushSpy = vi.spyOn(router, 'push');

    await wrapper.find('[aria-label="Sync devices"]').trigger('click');
    await vi.waitUntil(() => mockSyncProviderConnection.mock.calls.length > 0);

    expect(mockSyncProviderConnection).toHaveBeenCalledWith(1);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('with a single google_home connection (device_discovery only), navigates to the discovery route and never calls syncConnection', async () => {
    const { connections } = useProviderConnections();
    const { providerTypes } = useProviderTypes();
    connections.value = [googleHomeConnection(2)] as never;
    providerTypes.value = [googleHomeProviderType];

    const { wrapper, router } = mountDevicesPage();
    const pushSpy = vi.spyOn(router, 'push');

    await wrapper.find('[aria-label="Sync devices"]').trigger('click');
    await vi.waitFor(() => expect(pushSpy).toHaveBeenCalled());

    expect(pushSpy).toHaveBeenCalledWith('/devices/providers/2/discover');
    expect(mockSyncProviderConnection).not.toHaveBeenCalled();
  });

  it('with a provider that has neither capability, notifies without calling the backend or navigating', async () => {
    const { connections } = useProviderConnections();
    const { providerTypes } = useProviderTypes();
    connections.value = [unsupportedConnection(3)] as never;
    providerTypes.value = [unsupportedProviderType];

    const { wrapper, router } = mountDevicesPage();
    const pushSpy = vi.spyOn(router, 'push');

    await wrapper.find('[aria-label="Sync devices"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(mockSyncProviderConnection).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    const toast = wrapper.findComponent({ name: 'IonToast' });
    expect(toast.props('isOpen')).toBe(true);
    expect(toast.props('message')).toBe('This provider does not support device sync.');
  });
});
