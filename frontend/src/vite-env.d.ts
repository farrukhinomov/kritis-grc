/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "enabled" serves the API from mock data instead of the real backend. */
  readonly VITE_API_MOCKING?: "enabled" | "disabled";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
