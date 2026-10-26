import { activityHandlers } from "./handlers/activity";
import { approvalHandlers } from "./handlers/approvals";
import { authHandlers } from "./handlers/auth";
import { complianceHandlers } from "./handlers/compliance";
import { coverageHandlers } from "./handlers/coverage";
import { dependencyHandlers } from "./handlers/dependencies";
import { organizationHandlers } from "./handlers/organization";
import { riskHandlers } from "./handlers/risk";
import { searchHandlers } from "./handlers/search";
import { statusHandlers } from "./handlers/status";

/**
 * Mock API used by the prototype and the tests. Routes, shapes, status codes and headers
 * follow the real API contract, so screens can switch to the backend one endpoint at a
 * time.
 */
export const handlers = [
  ...statusHandlers,
  ...authHandlers,
  ...organizationHandlers,
  ...dependencyHandlers,
  ...complianceHandlers,
  ...coverageHandlers,
  ...riskHandlers,
  ...activityHandlers,
  ...searchHandlers,
  ...approvalHandlers,
];
