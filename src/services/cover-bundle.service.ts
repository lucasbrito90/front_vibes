import { authService } from '@/services/auth.service';
import type { CoverBundle } from '@/types/cover-bundle';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function authHeaders(): Promise<HeadersInit> {
  const token = await authService.getIdToken();
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

function normalizeCoverBundle(raw: Record<string, unknown>): CoverBundle {
  let tags: string[] = [];
  const t = raw.tags;
  if (Array.isArray(t)) tags = t.filter((x): x is string => typeof x === 'string');
  else if (typeof t === 'string' && t.trim()) {
    tags = t.split(',').map((s) => s.trim()).filter(Boolean);
  }

  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    description: raw.description != null ? String(raw.description) : null,
    thumbnail_url: raw.thumbnail_url != null ? String(raw.thumbnail_url) : null,
    artwork_url: raw.artwork_url != null ? String(raw.artwork_url) : null,
    player_background_url:
      raw.player_background_url != null ? String(raw.player_background_url) : null,
    category: raw.category != null ? String(raw.category) : null,
    tags,
    is_active: Boolean(raw.is_active),
    created_at: raw.created_at != null ? String(raw.created_at) : undefined,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : undefined,
  };
}

/** Active bundles only (default Laravel list — no include_inactive). */
export async function listCoverBundles(): Promise<CoverBundle[]> {
  const res = await fetch(`${API_BASE_URL}/api/cover-bundles`, {
    headers: await authHeaders(),
  });
  const body = await handleResponse<{ data: unknown[] }>(res);
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows.map((r) => normalizeCoverBundle(r as Record<string, unknown>));
}

export const coverBundleService = {
  listCoverBundles,
};
