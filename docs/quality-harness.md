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

**E2E (Playwright):** optional — not part of baseline (`npm run test:e2e`, `npm run test:e2e:ui`).

**Android smoke (WebdriverIO/Appium):** local only — see [android-smoke-tests.md](android-smoke-tests.md) (`npm run test:smoke:android`).

Legacy Cypress scaffold remains as `npm run test:e2e:cypress`.

**Source of truth:** [ixora-infra/docs/quality-harness.md](../../ixora-infra/docs/quality-harness.md)
