import { activityHandlers } from "./handlers/activity";
import { complianceHandlers } from "./handlers/compliance";
import { organizationHandlers } from "./handlers/organization";
import { riskHandlers } from "./handlers/risk";
import { statusHandlers } from "./handlers/status";

/**
 * Mock API used by the prototype and the tests. Routes, shapes, status codes and headers
 * follow the real API contract, so screens can switch to the backend one endpoint at a
 * time.
 */
export const handlers = [
  ...statusHandlers,
  ...organizationHandlers,
  ...complianceHandlers,
  ...riskHandlers,
  ...activityHandlers,
];
