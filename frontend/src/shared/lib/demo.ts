/**
 * Whether this is the public prototype, which runs on the mock API: its visitors have no
 * account, so the app greets them with the demo already open. Read when asked, not when
 * loaded, so tests can switch it per case; the build still replaces it with a constant.
 */
export const isDemoBuild = (): boolean => import.meta.env.VITE_API_MOCKING === "enabled";
