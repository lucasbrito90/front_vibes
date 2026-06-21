/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_E2E_MOCK_AUTH?: string;
  readonly VITE_ENABLE_NATIVE_QA_DIAGNOSTICS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
