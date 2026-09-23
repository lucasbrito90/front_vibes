import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * CSDM-07b boundary scanners — shared by production guards and sentinels.
 *
 * Comment and docblock text is stripped before scale/provider detection so
 * explanatory prose that cites forbidden scales or provider names never
 * false-positives. Executable code must not carry those values in the domain.
 */

const FRONT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const KNOWN_PROVIDER_SLUGS = ['home_assistant', 'google_home', 'fake'] as const;

const FORBIDDEN_PROVIDER_TERMS = [
  ...KNOWN_PROVIDER_SLUGS,
  'OnOffTrait',
  'LevelControl',
  'light.turn_on',
  'moveToLevel',
  'supported_features',
] as const;

/**
 * Domain modules that must stay provider-neutral. Legacy `can_*` **read**
 * paths in canonical-capabilities.ts are allowlisted — they never emit provider
 * scales, only translate stored legacy rows into canonical constraints.
 */
const DOMAIN_TS_FILES = [
  'src/utils/canonical-capabilities.ts',
  'src/utils/device-action.ts',
  'src/utils/canonical-contract.ts',
] as const;

const DOMAIN_VUE_EDITOR = 'src/views/SceneDeviceActionEditModal.vue';

/** Provider-layer files where native scales and SDK vocabulary may exist. */
const PROVIDER_TS_FILES = [
  'src/services/google-home.service.ts',
  'src/services/provider-connection.service.ts',
] as const;

export function stripTsComments(source: string): string {
  const withoutBlock = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutBlock.replace(/^\s*\/\/.*$/gm, '');
}

export function extractVueScript(source: string): string {
  const match = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);

  return match?.[1] ?? '';
}

export function canonicalScaleViolations(source: string): string[] {
  const code = stripTsComments(source);
  const violations: string[] = [];

  if (/\b25[45]\b/.test(code)) {
    violations.push('numeric literal 255 or 254');
  }

  if (/['"]0-25[45]['"]/.test(code)) {
    violations.push('range literal 0-255 or 0-254');
  }

  return violations;
}

export function canonicalProviderViolations(source: string): string[] {
  const code = stripTsComments(source);
  const violations: string[] = [];

  for (const term of FORBIDDEN_PROVIDER_TERMS) {
    if (term === 'home_assistant' || term === 'google_home' || term === 'fake') {
      const slugPatterns = [
        new RegExp(`['"]provider['"]\\s*[:=]\\s*['"]${term}['"]`),
        new RegExp(`provider\\s*(?:===|!==|==|!=)\\s*['"]${term}['"]`),
        new RegExp(`['"]${term}['"]\\s*(?:===|!==|==|!=)\\s*\\w*provider`),
      ];

      if (slugPatterns.some((pattern) => pattern.test(code))) {
        violations.push(`provider slug assignment/comparison [${term}]`);
      }

      continue;
    }

    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(code)) {
      violations.push(`provider term [${term}]`);
    }
  }

  return violations;
}

/**
 * Legacy ADR-033 key names used only for dual-read in canonical-capabilities.ts.
 * Numeric provider scales must not appear even in that file.
 */
export function legacyReadAllowlistViolations(relativePath: string, source: string): string[] {
  if (!relativePath.endsWith('canonical-capabilities.ts')) {
    return [];
  }

  const code = stripTsComments(source);
  const violations: string[] = [];

  if (/\bcan_set_brightness\b/.test(code) && /\b25[45]\b/.test(code)) {
    violations.push('legacy reader must not embed provider brightness scale literals');
  }

  return violations;
}

function isProviderLayerFile(relativePath: string): boolean {
  return (PROVIDER_TS_FILES as readonly string[]).includes(relativePath);
}

export function providerFrontierViolations(relativePath: string, source: string): string[] {
  if (isProviderLayerFile(relativePath)) {
    return [];
  }

  if (!relativePath.startsWith('src/services/')) {
    return [];
  }

  const code = stripTsComments(source);
  const violations: string[] = [];

  if (/\b25[45]\b/.test(code) && /brightness|matter|level/i.test(code)) {
    violations.push('provider scale literal outside google-home boundary');
  }

  if (/\bcan_turn_on\b|\bcan_set_brightness\b/.test(code) && /capabilities\s*[:=]/.test(code)) {
    violations.push('generating legacy can_* capability map outside provider mapper');
  }

  return violations;
}

function readDomainSources(): Array<{ relative: string; contents: string }> {
  const entries: Array<{ relative: string; contents: string }> = [];

  for (const relative of DOMAIN_TS_FILES) {
    const path = join(FRONT_ROOT, relative);
    entries.push({ relative, contents: readFileSync(path, 'utf8') });
  }

  const vuePath = join(FRONT_ROOT, DOMAIN_VUE_EDITOR);
  const vueSource = readFileSync(vuePath, 'utf8');
  entries.push({
    relative: DOMAIN_VUE_EDITOR,
    contents: extractVueScript(vueSource),
  });

  return entries;
}

function withTempFixture(body: string, scanner: (source: string) => string[]): void {
  const dir = mkdtempSync(join(tmpdir(), 'csdm07-front-'));

  try {
    writeFileSync(join(dir, 'Leak.ts'), body);
    const contents = readFileSync(join(dir, 'Leak.ts'), 'utf8');
    expect(scanner(contents)).not.toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('canonical boundary guards (CSDM-07b)', () => {
  it('domain modules exist for scanning', () => {
    for (const relative of DOMAIN_TS_FILES) {
      expect(existsSync(join(FRONT_ROOT, relative))).toBe(true);
    }

    expect(existsSync(join(FRONT_ROOT, DOMAIN_VUE_EDITOR))).toBe(true);
  });

  it('GUARD scale: domain canonical modules contain no provider brightness scales in code', () => {
    for (const { relative, contents } of readDomainSources()) {
      const violations = [
        ...canonicalScaleViolations(contents),
        ...legacyReadAllowlistViolations(relative, contents),
      ];

      expect(violations, `${relative}: ${violations.join(', ')}`).toEqual([]);
    }
  });

  it('GUARD provider: domain modules contain no provider slug or trait references in code', () => {
    for (const { relative, contents } of readDomainSources()) {
      const violations = canonicalProviderViolations(contents);

      expect(violations, `${relative}: ${violations.join(', ')}`).toEqual([]);
    }
  });

  it('GUARD frontier: legacy can_* maps are not generated outside provider services', () => {
    for (const relative of PROVIDER_TS_FILES) {
      const path = join(FRONT_ROOT, relative);
      const contents = readFileSync(path, 'utf8');
      const violations = providerFrontierViolations(relative, contents);

      expect(violations, `${relative}: ${violations.join(', ')}`).toEqual([]);
    }

    const googleHome = readFileSync(join(FRONT_ROOT, 'src/services/google-home.service.ts'), 'utf8');
    const code = stripTsComments(googleHome);

    expect(code).not.toMatch(/\bcan_turn_on\b|\bcan_set_brightness\b/);
    expect(code).not.toMatch(/\b25[45]\b/);
  });

  it('scale sentinel detects deliberate 255 leak and ignores comment-only prohibition prose', () => {
    withTempFixture(
      `/** 0-255 belongs in the mapper. */\nexport const max = 255;`,
      canonicalScaleViolations,
    );

    expect(canonicalScaleViolations('// 0-254 is forbidden here\nconst x = 100;')).toEqual([]);
  });

  it('provider sentinel detects deliberate trait leak and ignores comment-only prose', () => {
    withTempFixture('const t = OnOffTrait.prototype;', canonicalProviderViolations);

    expect(canonicalProviderViolations('// moveToLevel stays in Kotlin\nconst ok = true;')).toEqual(
      [],
    );
  });

  it('frontier sentinel detects legacy can_* generation outside allowlist', () => {
    withTempFixture(
      'export const capabilities = { can_set_brightness: { min: 0, max: 255, step: 1 } };',
      (source) => providerFrontierViolations('src/services/evil.service.ts', source),
    );
  });
});
