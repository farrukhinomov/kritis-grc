import type { Role } from "./session";

export type Permission = "view" | "change" | "approve";

/**
 * The permission sets the backend's services enforce. The UI only uses them to hide or
 * disable what would be refused anyway; it never is the check itself.
 */
const PERMISSIONS: Record<Role, readonly Permission[]> = {
  grc_manager: ["view", "change", "approve"],
  auditor: ["view"],
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}
