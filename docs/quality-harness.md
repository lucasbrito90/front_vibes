# Quality harness — front_vibes

Local validation before PR → `develop`:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

After Capacitor/plugin changes:

```bash
npm run cap:sync:android
```

**E2E (Cypress):** optional — not part of baseline (`npm run test:e2e`).

**Source of truth:** [ixora-infra/docs/quality-harness.md](../../ixora-infra/docs/quality-harness.md)
