/**
 * Who operates the platform, set at build time. The values are never invented in code:
 * until they are configured, the pages say so instead of showing placeholder data.
 */
export function operator() {
  const name = import.meta.env.VITE_LEGAL_OPERATOR_NAME?.trim();
  const address = import.meta.env.VITE_LEGAL_OPERATOR_ADDRESS?.trim();
  const email = import.meta.env.VITE_LEGAL_OPERATOR_EMAIL?.trim();
  return name && address && email ? { name, address, email } : null;
}
