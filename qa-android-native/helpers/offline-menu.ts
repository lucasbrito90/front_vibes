/**
 * WDIO helpers for VibePlayerPage ⋮ popover offline actions.
 * Guards against disabled ion-items, Ionic overlays, and popover timing.
 */
import { browser } from '@wdio/globals';

export const OFFLINE_DOWNLOAD_LABELS = [
  'Update offline download',
  'Download for offline',
] as const;

export const OFFLINE_REMOVE_LABEL = 'Remove offline download';

export type PlayerMenuItemSnapshot = {
  text: string;
  disabled: boolean;
  ariaDisabled: string | null;
  button: boolean;
};

export type PlayerMenuDiagnostics = {
  popoverOpen: boolean;
  playerLoading: boolean;
  blockingOverlays: string[];
  items: PlayerMenuItemSnapshot[];
};

/** ion-loading / modal backdrops that intercept taps (not the open popover). */
export async function waitForIonicBlockingOverlaysGone(timeoutMs = 30_000): Promise<void> {
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const blockers: string[] = [];
        document.querySelectorAll('ion-loading').forEach((el) => {
          if (!el.classList.contains('overlay-hidden')) blockers.push('ion-loading');
        });
        document.querySelectorAll('ion-alert, ion-modal').forEach((el) => {
          const hidden = el.getAttribute('aria-hidden') === 'true' || el.classList.contains('overlay-hidden');
          if (!hidden) blockers.push(el.tagName.toLowerCase());
        });
        return blockers.length === 0;
      }),
    { timeout: timeoutMs, timeoutMsg: 'Blocking Ionic overlay still visible' },
  ).catch(() => undefined);
}

/** Player route finished hydrating sounds (download menu is not stuck on !hasPlayableLayers). */
export async function waitForPlayerPageReady(timeoutMs = 45_000): Promise<void> {
  await browser.$('[data-testid="player-page"]').waitForExist({ timeout: 20_000 });
  await browser.waitUntil(
    async () => {
      const loading = await browser.$('text=Loading vibe…').isExisting().catch(() => false);
      if (loading) return false;
      const layers = await browser.$('[data-testid="player-layers-section"]').isExisting().catch(() => false);
      const sounds = await browser.$('.player-sounds-text').getText().catch(() => '');
      const hasSounds = sounds.length > 0 && sounds !== '…' && !sounds.startsWith('No sounds');
      return layers || hasSounds;
    },
    { timeout: timeoutMs, timeoutMsg: 'Player page did not finish loading playable layers' },
  );
  await waitForIonicBlockingOverlaysGone(15_000);
}

type PopoverMenuScan = { open: boolean; items: PlayerMenuItemSnapshot[] };

/** Ionic keeps ion-popover in DOM when dismissed — scan only when visibly open. */
async function scanPlayerPopoverMenu(): Promise<PopoverMenuScan> {
  return browser.execute(() => {
    function visitMenuItems(root: Document | ShadowRoot, out: Element[]): void {
      root.querySelectorAll('ion-item').forEach((el) => out.push(el));
      root.querySelectorAll('*').forEach((host) => {
        if (host.shadowRoot) visitMenuItems(host.shadowRoot, out);
      });
    }

    function snapshotItem(el: Element): PlayerMenuItemSnapshot {
      return {
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
        ariaDisabled: el.getAttribute('aria-disabled'),
        button: el.hasAttribute('button'),
      };
    }

    const popover = document.querySelector('ion-popover');
    if (!popover) return { open: false, items: [] };
    const open =
      popover.getAttribute('aria-hidden') !== 'true'
      && !popover.classList.contains('overlay-hidden');
    if (!open) return { open: false, items: [] };

    const raw: Element[] = [];
    visitMenuItems(popover, raw);
    const seen = new Set<string>();
    const items: PlayerMenuItemSnapshot[] = [];
    for (const el of raw) {
      const snap = snapshotItem(el);
      if (!snap.text || seen.has(snap.text)) continue;
      seen.add(snap.text);
      items.push(snap);
    }
    return { open: true, items };
  });
}

export async function readPlayerOptionsMenuItems(): Promise<PlayerMenuItemSnapshot[]> {
  const scan = await scanPlayerPopoverMenu();
  return scan.items;
}

export async function collectPlayerMenuDiagnostics(): Promise<PlayerMenuDiagnostics> {
  const scan = await scanPlayerPopoverMenu();
  const extra = await browser.execute(() => {
    const playerLoading = document.body?.innerText?.includes('Loading vibe…') ?? false;
    const blockers: string[] = [];
    document.querySelectorAll('ion-loading').forEach((el) => {
      if (!el.classList.contains('overlay-hidden')) blockers.push('ion-loading');
    });
    document.querySelectorAll('ion-alert, ion-modal').forEach((el) => {
      const hidden = el.getAttribute('aria-hidden') === 'true' || el.classList.contains('overlay-hidden');
      if (!hidden) blockers.push(el.tagName.toLowerCase());
    });
    return { playerLoading, blockingOverlays: blockers };
  });
  return {
    popoverOpen: scan.open,
    playerLoading: extra.playerLoading,
    blockingOverlays: extra.blockingOverlays,
    items: scan.items,
  };
}

export function formatMenuDiagnostics(diag: PlayerMenuDiagnostics): string {
  const itemLines = diag.items.map(
    (i) => `"${i.text}" disabled=${i.disabled} aria-disabled=${i.ariaDisabled ?? '—'}`,
  );
  return [
    `popoverOpen=${diag.popoverOpen}`,
    `playerLoading=${diag.playerLoading}`,
    `blockingOverlays=${JSON.stringify(diag.blockingOverlays)}`,
    `items=[${itemLines.join('; ')}]`,
  ].join(' ');
}

async function isPopoverClosed(): Promise<boolean> {
  return browser.execute(() => {
    const popover = document.querySelector('ion-popover');
    if (!popover) return true;
    return (
      popover.getAttribute('aria-hidden') === 'true'
      || popover.classList.contains('overlay-hidden')
    );
  });
}

export async function dismissPopoverIfOpen(): Promise<void> {
  await browser.execute(() => {
    document.querySelectorAll('ion-popover').forEach((popover) => {
      if (
        popover.getAttribute('aria-hidden') === 'true'
        || popover.classList.contains('overlay-hidden')
      ) {
        return;
      }
      (popover as { dismiss?: () => void }).dismiss?.();
    });
    document.querySelectorAll('ion-backdrop').forEach((backdrop) => {
      if (backdrop.classList.contains('overlay-hidden')) return;
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }).catch(() => undefined);
  await browser.waitUntil(async () => isPopoverClosed(), { timeout: 6_000 }).catch(() => undefined);
  await browser.pause(200);
}

/** Re-present popover when trigger click did not mount ion-list (SPA transition). */
async function forcePresentPlayerPopover(): Promise<void> {
  await browser.execute(() => {
    const m = window.location.pathname.match(/\/vibes\/(\d+)\/player/);
    const triggerId = m?.[1] ? `vibe-player-menu-${m[1]}` : null;
    const trigger = triggerId ? document.getElementById(triggerId) : null;
    const popover = document.querySelector('ion-popover') as {
      present?: (opts?: { event?: Event }) => Promise<void> | void;
    } | null;
    if (popover?.present) {
      void popover.present({ event: new Event('click') });
      return;
    }
    trigger?.click();
  });
  await browser.pause(300);
}

function menuHasPlayerActions(items: PlayerMenuItemSnapshot[]): boolean {
  return items.some(
    (i) =>
      i.text.includes('Restart vibe')
      || i.text.includes('Stop vibe')
      || i.text.includes('offline'),
  );
}

async function clickOptionsButton(): Promise<void> {
  const selector = 'button[aria-label="Options"]';
  await browser.$(selector).waitForExist({ timeout: 15_000 });
  await dismissPopoverIfOpen();
  await waitForIonicBlockingOverlaysGone(10_000);

  let clicked = false;
  try {
    const optionsBtn = await browser.$(selector);
    await optionsBtn.waitForClickable({ timeout: 8_000 });
    await optionsBtn.click();
    clicked = true;
  } catch {
    const dom = await browser.execute(() => {
      const btn = document.querySelector('button[aria-label="Options"]') as HTMLElement | null;
      if (!btn) return { ok: false as const, reason: 'Options button missing' };
      btn.scrollIntoView({ block: 'center', inline: 'nearest' });
      btn.click();
      return { ok: true as const, reason: 'dom click' };
    });
    if (!dom.ok) throw new Error(dom.reason);
    clicked = true;
  }
  if (!clicked) throw new Error('Options button could not be clicked');
}

export async function openPlayerOptionsMenu(): Promise<void> {
  await waitForIonicBlockingOverlaysGone(10_000);

  let lastItems: PlayerMenuItemSnapshot[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    await dismissPopoverIfOpen();
    await clickOptionsButton();
    if (attempt > 0) {
      await forcePresentPlayerPopover();
    }
    try {
      await browser.waitUntil(
        async () => {
          const scan = await scanPlayerPopoverMenu();
          lastItems = scan.items;
          return scan.open && menuHasPlayerActions(scan.items);
        },
        {
          timeout: attempt === 0 ? 18_000 : 12_000,
          timeoutMsg: 'Options popover menu items not rendered',
        },
      );
      await browser.pause(150);
      return;
    } catch {
      const scan = await scanPlayerPopoverMenu();
      lastItems = scan.items;
      if (scan.open && !menuHasPlayerActions(scan.items)) {
        await forcePresentPlayerPopover();
      }
      await dismissPopoverIfOpen();
    }
  }

  throw new Error(
    `Options popover opened but menu items not rendered after retries. lastItems=${JSON.stringify(lastItems)}`,
  );
}

type MenuItemProbe = {
  found: boolean;
  text: string;
  disabled: boolean;
  downloading: boolean;
};

/** Chrome WebView rejects WDIO `ion-item*=` selectors — probe/click via DOM instead. */
async function probePlayerMenuItem(label: string): Promise<MenuItemProbe> {
  const scan = await scanPlayerPopoverMenu();
  const match = scan.items.find((i) => i.text.includes(label));
  if (!match) {
    return { found: false, text: '', disabled: true, downloading: false };
  }
  return {
    found: true,
    text: match.text,
    disabled: match.disabled,
    downloading: /^Downloading/i.test(match.text),
  };
}

async function clickPlayerMenuItemInDom(label: string): Promise<{ ok: boolean; reason: string }> {
  return browser.execute((lbl) => {
    function visitMenuItems(root: Document | ShadowRoot, out: Element[]): void {
      root.querySelectorAll('ion-item').forEach((el) => out.push(el));
      root.querySelectorAll('*').forEach((host) => {
        if (host.shadowRoot) visitMenuItems(host.shadowRoot, out);
      });
    }

    const popover = document.querySelector('ion-popover');
    if (!popover) return { ok: false, reason: 'popover missing' };
    const open =
      popover.getAttribute('aria-hidden') !== 'true'
      && !popover.classList.contains('overlay-hidden');
    if (!open) return { ok: false, reason: 'popover not open' };

    const raw: Element[] = [];
    visitMenuItems(popover, raw);
    for (const el of raw) {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text.includes(lbl)) continue;
      const disabled =
        el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
      if (disabled) return { ok: false, reason: `disabled: "${text}"` };
      if (/^Downloading/i.test(text)) return { ok: false, reason: `downloading: "${text}"` };
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      (el as HTMLElement).click();
      return { ok: true, reason: text };
    }
    return { ok: false, reason: `no ion-item matching "${lbl}"` };
  }, label);
}

/**
 * Waits until the popover menu item exists and is enabled (not "Downloading…").
 */
export async function waitForPlayerMenuActionReady(
  label: string,
  timeoutMs = 45_000,
): Promise<MenuItemProbe> {
  let lastDiag = '';
  await browser.waitUntil(
    async () => {
      const probe = await probePlayerMenuItem(label);
      if (!probe.found) {
        lastDiag = `not in menu yet (wanted "${label}")`;
        return false;
      }
      if (probe.downloading) {
        lastDiag = `still downloading (label="${probe.text}")`;
        return false;
      }
      if (probe.disabled) {
        lastDiag = `disabled (label="${probe.text}")`;
        return false;
      }
      return true;
    },
    {
      timeout: timeoutMs,
      timeoutMsg: `Menu item not ready: ${label}. Last: ${lastDiag}`,
    },
  );
  return probePlayerMenuItem(label);
}

export type ClickMenuActionOptions = {
  /** Called before throwing when the action stays disabled or missing. */
  onUnavailable?: (label: string, diag: PlayerMenuDiagnostics) => Promise<void>;
  readyTimeoutMs?: number;
};

export async function clickPlayerMenuAction(
  label: string,
  opts: ClickMenuActionOptions = {},
): Promise<void> {
  const readyTimeout = opts.readyTimeoutMs ?? 45_000;
  try {
    await waitForPlayerMenuActionReady(label, readyTimeout);
    const clickResult = await clickPlayerMenuItemInDom(label);
    if (!clickResult.ok) {
      throw new Error(clickResult.reason);
    }
  } catch (err) {
    const diag = await collectPlayerMenuDiagnostics();
    if (opts.onUnavailable) {
      await opts.onUnavailable(label, diag);
    }
    throw new Error(
      `Failed to click menu "${label}": ${err instanceof Error ? err.message : String(err)}. ${formatMenuDiagnostics(diag)}`,
    );
  }
  await dismissPopoverIfOpen();
}

export type TriggerOfflineDownloadResult = {
  ok: boolean;
  path: 'update' | 'download' | 'remove-then-download' | 'none';
  notes: string;
};

export type TriggerOfflineDownloadHooks = {
  waitForToastContains: (fragment: string, timeoutMs: number) => Promise<boolean>;
  onMenuUnavailable?: (context: string, diag: PlayerMenuDiagnostics) => Promise<void>;
};

/**
 * Opens ⋮ and triggers an offline download (update, fresh download, or remove → download).
 */
export async function triggerOfflineDownloadFromPlayer(
  hooks: TriggerOfflineDownloadHooks,
): Promise<TriggerOfflineDownloadResult> {
  await waitForPlayerPageReady();
  await openPlayerOptionsMenu();

  const diag = await collectPlayerMenuDiagnostics();
  const enabled = (match: (text: string) => boolean) =>
    diag.items.some((i) => match(i.text) && !i.disabled && !/^Downloading/i.test(i.text));
  const hasUpdate = enabled((t) => t.includes('Update offline download'));
  const hasDownload = enabled((t) => t.includes('Download for offline'));
  const hasRemove = enabled((t) => t.includes('Remove offline download'));

  const fail = async (notes: string): Promise<TriggerOfflineDownloadResult> => {
    if (hooks.onMenuUnavailable) {
      await hooks.onMenuUnavailable('trigger-offline-download', diag);
    }
    return { ok: false, path: 'none', notes };
  };

  if (hasUpdate) {
    await clickPlayerMenuAction('Update offline download', {
      onUnavailable: hooks.onMenuUnavailable
        ? async (l, d) => hooks.onMenuUnavailable!(`update:${l}`, d)
        : undefined,
    });
    const toastOk = await hooks.waitForToastContains('offline', 180_000);
    return {
      ok: toastOk,
      path: 'update',
      notes: toastOk ? 'update toast OK' : 'update toast missing',
    };
  }

  if (hasDownload) {
    await clickPlayerMenuAction('Download for offline', {
      onUnavailable: hooks.onMenuUnavailable
        ? async (l, d) => hooks.onMenuUnavailable!(`download:${l}`, d)
        : undefined,
    });
    const toastOk = await hooks.waitForToastContains('offline', 180_000);
    return {
      ok: toastOk,
      path: 'download',
      notes: toastOk ? 'download toast OK' : 'download toast missing',
    };
  }

  if (hasRemove) {
    await clickPlayerMenuAction('Remove offline download', {
      onUnavailable: hooks.onMenuUnavailable
        ? async (l, d) => hooks.onMenuUnavailable!(`remove:${l}`, d)
        : undefined,
    });
    await hooks.waitForToastContains('offline', 30_000).catch(() => undefined);
    await waitForPlayerPageReady(30_000);
    await openPlayerOptionsMenu();
    const afterRemove = await collectPlayerMenuDiagnostics();
    const canDownload = afterRemove.items.some((i) => i.text.includes('Download for offline') && !i.disabled);
    if (!canDownload) {
      return fail(
        `Download for offline not enabled after remove. ${formatMenuDiagnostics(afterRemove)}`,
      );
    }
    await clickPlayerMenuAction('Download for offline', {
      onUnavailable: hooks.onMenuUnavailable
        ? async (l, d) => hooks.onMenuUnavailable!(`redownload:${l}`, d)
        : undefined,
    });
    const toastOk = await hooks.waitForToastContains('offline', 180_000);
    return {
      ok: toastOk,
      path: 'remove-then-download',
      notes: toastOk ? 'remove then download toast OK' : 're-download toast missing',
    };
  }

  return fail(`no offline menu action. ${formatMenuDiagnostics(diag)}`);
}
