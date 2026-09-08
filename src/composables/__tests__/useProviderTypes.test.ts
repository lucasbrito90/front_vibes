import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetProviderTypes } = vi.hoisted(() => ({
  mockGetProviderTypes: vi.fn(),
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
  };
});

import { useProviderTypes } from '@/composables/useProviderTypes';

const mockHomeAssistant = {
  slug: 'home_assistant',
  label: 'Home Assistant',
  config: { base_url: { type: 'string', required: true, format: 'url:https' } },
  credentials: { access_token: { type: 'string', required: true } },
};

describe('useProviderTypes', () => {
  beforeEach(() => {
    const { providerTypes, loading, error } = useProviderTypes();
    providerTypes.value = [];
    loading.value = false;
    error.value = null;
    mockGetProviderTypes.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and stores provider types', async () => {
    mockGetProviderTypes.mockResolvedValue([mockHomeAssistant]);

    const { fetchProviderTypes, providerTypes } = useProviderTypes();
    await fetchProviderTypes();

    expect(providerTypes.value).toEqual([mockHomeAssistant]);
  });

  it('sets loading to true during fetch and false after', async () => {
    let loadingDuringFetch = false;
    mockGetProviderTypes.mockImplementation(async () => {
      const { loading } = useProviderTypes();
      loadingDuringFetch = loading.value;
      return [mockHomeAssistant];
    });

    const { fetchProviderTypes } = useProviderTypes();
    await fetchProviderTypes();

    expect(loadingDuringFetch).toBe(true);
    const { loading } = useProviderTypes();
    expect(loading.value).toBe(false);
  });

  it('surfaces error when fetch fails', async () => {
    mockGetProviderTypes.mockRejectedValue(new Error('Network error'));

    const { fetchProviderTypes, error } = useProviderTypes();
    await fetchProviderTypes();

    expect(error.value).toBe('Network error');
  });

  it('findProviderType returns the matching type by slug', async () => {
    const { providerTypes, findProviderType } = useProviderTypes();
    providerTypes.value = [mockHomeAssistant];

    expect(findProviderType('home_assistant')).toEqual(mockHomeAssistant);
  });

  it('findProviderType returns undefined for unknown slug', () => {
    const { providerTypes, findProviderType } = useProviderTypes();
    providerTypes.value = [mockHomeAssistant];

    expect(findProviderType('unknown_vendor')).toBeUndefined();
  });

  it('findProviderType returns undefined when list is empty', () => {
    const { providerTypes, findProviderType } = useProviderTypes();
    providerTypes.value = [];

    expect(findProviderType('home_assistant')).toBeUndefined();
  });
});
