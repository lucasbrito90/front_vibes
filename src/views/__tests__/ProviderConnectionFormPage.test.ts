import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import { mount } from '@vue/test-utils';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// Same pattern as DevicesPage.test.ts: mock the SERVICE modules, let the real
// (singleton) composables run against them.

const { mockGetProviderTypes, mockCreateProviderConnection, mockIsDeviceOffline } = vi.hoisted(
  () => ({
    mockGetProviderTypes: vi.fn(),
    mockCreateProviderConnection: vi.fn(),
    mockIsDeviceOffline: vi.fn((): boolean => false),
  }),
);

vi.mock('@/services/provider-connection.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/provider-connection.service')>();
  return {
    ...actual,
    providerConnectionService: {
      ...actual.providerConnectionService,
      getProviderTypes: mockGetProviderTypes,
      createProviderConnection: mockCreateProviderConnection,
    },
    isDeviceOffline: mockIsDeviceOffline,
  };
});

import { useProviderTypes } from '@/composables/useProviderTypes';
import ProviderConnectionFormPage from '@/views/ProviderConnectionFormPage.vue';

/**
 * A provider that DOES declare credential fields. Deliberately not named after
 * a real provider: the hint must be driven by the descriptor schema, never by
 * the slug string (ADR-036 / provider-neutrality).
 */
const credentialedProviderType = {
  slug: 'vendor_with_credentials',
  label: 'Vendor With Credentials',
  config: {
    base_url: { type: 'url', required: true, label: 'Base Url' },
  },
  credentials: {
    access_token: { type: 'password', required: true, label: 'Access Token' },
  },
  execution_capabilities: [
    'device_discovery',
    'state_read',
    'interactive_execution',
    'server_side_execution',
    'scheduled_execution',
  ],
};

/**
 * A provider with an EMPTY credentials map — the google_home shape, where the
 * backend stores encrypted_credentials as genuinely NULL (ADR-036 Decisions
 * 3/4, P02 migration). Claiming credentials are stored would be false here.
 */
const credentiallessProviderType = {
  slug: 'vendor_without_credentials',
  label: 'Vendor Without Credentials',
  config: {},
  credentials: {},
  execution_capabilities: ['device_discovery', 'state_read', 'interactive_execution'],
};

const CREDENTIAL_SENTENCE = 'Your credentials are stored securely on the server';

function mountFormPage() {
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
    ],
  });

  return mount(ProviderConnectionFormPage, { global: { plugins: [router] } });
}

beforeEach(() => {
  const { providerTypes } = useProviderTypes();
  providerTypes.value = [];

  mockIsDeviceOffline.mockReset().mockReturnValue(false);
  mockCreateProviderConnection.mockReset();
  mockGetProviderTypes.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProviderConnectionFormPage — credential copy is gated on the descriptor schema', () => {
  it('shows the credential sentence for a provider that declares credential fields', async () => {
    mockGetProviderTypes.mockResolvedValue([credentialedProviderType]);

    const wrapper = mountFormPage();
    await vi.waitUntil(() => wrapper.text().includes('Vendor With Credentials'));

    expect(wrapper.text()).toContain(CREDENTIAL_SENTENCE);
  });

  it('omits the credential sentence for a provider whose credentials map is empty', async () => {
    mockGetProviderTypes.mockResolvedValue([credentiallessProviderType]);

    const wrapper = mountFormPage();
    await vi.waitUntil(() => wrapper.text().includes('Vendor Without Credentials'));

    // The provider is still named — only the false claim is dropped.
    expect(wrapper.text()).toContain('Connect your Vendor Without Credentials.');
    expect(wrapper.text()).not.toContain(CREDENTIAL_SENTENCE);
  });

  it('follows the descriptor, not the slug, when the selection changes', async () => {
    mockGetProviderTypes.mockResolvedValue([
      credentiallessProviderType,
      credentialedProviderType,
    ]);

    const wrapper = mountFormPage();
    // First entry wins the initial selection — the credential-less one here,
    // proving the copy is not tied to any particular provider identity.
    await vi.waitUntil(() => wrapper.text().includes('Vendor Without Credentials'));
    expect(wrapper.text()).not.toContain(CREDENTIAL_SENTENCE);

    const select = wrapper.findComponent({ name: 'IonSelect' });
    await select.vm.$emit('update:modelValue', credentialedProviderType.slug);
    await select.vm.$emit('ionChange');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain(CREDENTIAL_SENTENCE);
  });
});
