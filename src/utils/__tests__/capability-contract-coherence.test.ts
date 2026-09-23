import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ACCESS_LEVELS,
  CANONICAL_CAPABILITY_IDS,
  CANONICAL_CONTRACT_VERSION,
  CANONICAL_NUMBER_UNITS,
  CANONICAL_OPERATIONS,
  CANONICAL_SCHEMA_RELATIVE_PATH,
} from '@/utils/canonical-contract';

const testDir = dirname(fileURLToPath(import.meta.url));
const frontRoot = resolve(testDir, '../../..');
const vendoredSchemaPath = join(frontRoot, CANONICAL_SCHEMA_RELATIVE_PATH);
const infraSchemaPath = resolve(frontRoot, '../ixora-infra/contracts/smart-home/capability.v1.schema.json');

type CapabilitySchema = {
  'x-contract-version'?: string;
  $defs?: {
    capabilityId?: { enum?: string[] };
    operation?: { enum?: string[] };
    access?: { enum?: string[] };
    numberConstraint?: { properties?: { unit?: { enum?: string[] } } };
  };
};

function loadVendoredSchema(): CapabilitySchema {
  const raw = readFileSync(vendoredSchemaPath, 'utf8');

  return JSON.parse(raw) as CapabilitySchema;
}

describe('capability contract coherence (CSDM-07b)', () => {
  it('vendored schema is present and declares the contract version', () => {
    expect(existsSync(vendoredSchemaPath)).toBe(true);

    const schema = loadVendoredSchema();

    expect(schema['x-contract-version']).toBe(CANONICAL_CONTRACT_VERSION);
  });

  it('TypeScript vocabulary matches the vendored schema enums', () => {
    const schema = loadVendoredSchema();
    const defs = schema.$defs ?? {};

    expect([...CANONICAL_CAPABILITY_IDS].sort()).toEqual(
      [...(defs.capabilityId?.enum ?? [])].sort(),
    );
    expect([...CANONICAL_OPERATIONS].sort()).toEqual([...(defs.operation?.enum ?? [])].sort());
    expect([...CANONICAL_ACCESS_LEVELS].sort()).toEqual([...(defs.access?.enum ?? [])].sort());
    expect([...CANONICAL_NUMBER_UNITS].sort()).toEqual(
      [...(defs.numberConstraint?.properties?.unit?.enum ?? [])].sort(),
    );
  });

  it('matches ixora-infra canonical copy byte-for-byte when sibling repo exists', () => {
    if (!existsSync(infraSchemaPath)) {
      console.info(
        'SKIP: ixora-infra not found at ../ixora-infra — byte identity check against canonical copy not run.',
      );

      return;
    }

    const vendored = readFileSync(vendoredSchemaPath);
    const canonical = readFileSync(infraSchemaPath);

    expect(vendored.equals(canonical)).toBe(true);
  });
});
