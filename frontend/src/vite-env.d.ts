/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "enabled" serves the API from mock data instead of the real backend. */
  readonly VITE_API_MOCKING?: "enabled" | "disabled";
  /** The operator named in the legal notice; the address uses "|" between lines. */
  readonly VITE_LEGAL_OPERATOR_NAME?: string;
  readonly VITE_LEGAL_OPERATOR_ADDRESS?: string;
  readonly VITE_LEGAL_OPERATOR_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
