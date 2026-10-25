import { QueryClient } from "@tanstack/react-query";

import { activityQuery } from "@/shared/api/activity";
import { sessionQuery } from "@/shared/api/auth";
import { apiGet } from "@/shared/api/client";
import { tenantQuery, updateTenantTheme } from "@/shared/api/organization";
import { risksQuery } from "@/shared/api/risk";

import { setMockSession } from "./accounts";

/** The reads and writes behind the standard screens, through the typed client. */

const DEMO = "muster-stadtwerke";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

describe("the Tenant's Theme", () => {
  it("changes for everyone in the Tenant, and the session carries it", async () => {
    const tenant = await updateTenantTheme(DEMO, "blue");

    expect(tenant.theme).toBe("blue");
    expect((await client().query(tenantQuery(DEMO))).theme).toBe("blue");
    const session = await client().query(sessionQuery);
    expect(session?.memberships.find((m) => m.tenant.slug === DEMO)?.tenant.theme).toBe("blue");
  });

  it("refuses an unknown Theme", async () => {
    const error = await failure(updateTenantTheme(DEMO, "purple" as "blue"));

    expect(error).toMatchObject({ status: 422, code: "validation_error" });
  });

  it("can't be changed by an Auditor", async () => {
    setMockSession("auditor");

    const error = await failure(updateTenantTheme(DEMO, "blue"));

    expect(error).toMatchObject({ status: 403 });
  });
});

describe("the Activity Log", () => {
  it("filters by object type and action", async () => {
    const result = await client().infiniteQuery(
      activityQuery(DEMO, { object_type: "implementation", action: "updated", limit: 100 }),
    );

    const items = result.pages.flatMap((page) => page.items);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.object_type === "implementation")).toBe(true);
    expect(items.every((item) => item.action === "updated")).toBe(true);
  });

  it("refuses an unknown action", async () => {
    const error = await failure(apiGet(`/api/v1/tenants/${DEMO}/activity?action=exploded`));

    expect(error).toMatchObject({ status: 400, code: "invalid_filter" });
  });
});

describe("the risks of an Asset", () => {
  it("are the ones that name it", async () => {
    const page = await client().query(risksQuery(DEMO, { asset: "as-n-pumps" }));

    expect(page.items.map((risk) => risk.id)).toContain("rk-n-power");
    expect(page.items.every((risk) => risk.assets.some((a) => a.id === "as-n-pumps"))).toBe(true);
  });
});
