import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { browser } from '@wdio/globals';

const outputRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'qa-android-native',
  'output',
);

export function ensureOutputDir(): string {
  fs.mkdirSync(outputRoot, { recursive: true });
  return outputRoot;
}

export async function capture(label: string): Promise<string> {
  const dir = ensureOutputDir();
  const safe = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  const filePath = path.join(dir, `${safe}.png`);
  await browser.saveScreenshot(filePath);
  return filePath;
}
