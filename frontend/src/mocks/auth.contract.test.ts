import { QueryClient } from "@tanstack/react-query";

import { activityQuery } from "@/shared/api/activity";
import { demoLogin, login, logout, sessionQuery } from "@/shared/api/auth";
import { ApiError, apiRequest } from "@/shared/api/client";
import {
  approveSuggestion,
  implementationsQuery,
  mappingSuggestionsQuery,
  updateImplementation,
} from "@/shared/api/compliance";
import { tenantQuery } from "@/shared/api/organization";

import { setMockSession } from "./accounts";

/** The sign-in endpoints and who may do what, exercised through the real typed client. */

const DEMO = "muster-stadtwerke";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

async function firstImplementation() {
  const page = await client().query(implementationsQuery(DEMO, { limit: 1 }));
  return page.items[0]!;
}

describe("the session", () => {
  it("is null when nobody is signed in", async () => {
    setMockSession(null);

    await expect(client().query(sessionQuery)).resolves.toBeNull();
  });

  it("names the user and one role per Membership", async () => {
    const session = await client().query(sessionQuery);

    expect(session?.user.display_name).toBe("Alex Kramer");
    expect(session?.memberships.map(({ tenant, role }) => [tenant.slug, role])).toEqual([
      ["muster-stadtwerke", "grc_manager"],
      ["wasserverband-musterland", "grc_manager"],
      ["klinikum-beispielstadt", "auditor"],
    ]);
  });
});

describe("demo login", () => {
  beforeEach(() => {
    setMockSession(null);
  });

  it("signs in as the GRC Manager of the Demo Tenant", async () => {
    const session = await demoLogin("grc_manager");

    expect(session.memberships[0]).toMatchObject({ tenant: { slug: DEMO }, role: "grc_manager" });
    await expect(client().query(sessionQuery)).resolves.toEqual(session);
  });

  it("signs in as an Auditor in every Tenant", async () => {
    const session = await demoLogin("auditor");

    expect(session.user.display_name).toBe("Tobias Wolff");
    expect(new Set(session.memberships.map(({ role }) => role))).toEqual(new Set(["auditor"]));
  });

  it("rejects an unknown role as a field error", async () => {
    const error = await failure(
      apiRequest("/api/v1/auth/demo-login", { method: "POST", body: { role: "admin" } }),
    );

    expect(error).toMatchObject({
      status: 422,
      code: "validation_error",
      errors: [{ field: "role", code: "invalid_choice" }],
    });
  });
});

describe("password login", () => {
  beforeEach(() => {
    setMockSession(null);
  });

  it("refuses every account without revealing whether it exists", async () => {
    const known = await failure(login({ email: "alex.kramer@example.com", password: "secret" }));
    const unknown = await failure(login({ email: "nobody@example.com", password: "secret" }));

    expect(known).toMatchObject({ status: 400, code: "invalid_credentials" });
    expect(unknown).toMatchObject({ status: 400, code: "invalid_credentials" });
    await expect(client().query(sessionQuery)).resolves.toBeNull();
  });

  it("reports missing fields", async () => {
    const error = await failure(login({ email: "", password: "" }));

    expect(error).toMatchObject({
      status: 422,
      code: "validation_error",
      errors: [
        { field: "email", code: "required" },
        { field: "password", code: "required" },
      ],
    });
  });
});

describe("logout", () => {
  it("ends the session", async () => {
    await logout();

    await expect(client().query(sessionQuery)).resolves.toBeNull();
  });
});

describe("tenant data", () => {
  it("answers 401 without a session", async () => {
    setMockSession(null);

    const error = await failure(client().query(tenantQuery(DEMO)));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "not_authenticated" });
  });

  it("is readable for an Auditor", async () => {
    setMockSession("auditor");

    await expect(client().query(tenantQuery(DEMO))).resolves.toMatchObject({ slug: DEMO });
  });

  it("refuses an Auditor's change with 403 and logs nothing", async () => {
    const implementation = await firstImplementation();
    const before = await client().infiniteQuery(activityQuery(DEMO));
    setMockSession("auditor");

    const error = await failure(
      updateImplementation(DEMO, implementation.id, implementation.version, {
        status: "implemented",
      }),
    );

    expect(error).toMatchObject({ status: 403, code: "permission_denied" });
    expect(await firstImplementation()).toEqual(implementation);
    expect((await client().infiniteQuery(activityQuery(DEMO))).pages).toEqual(before.pages);
  });

  it("refuses an Auditor's approval", async () => {
    const [suggestion] = (await client().query(mappingSuggestionsQuery(DEMO))).items;
    setMockSession("auditor");

    const error = await failure(approveSuggestion(DEMO, suggestion!.id));

    expect(error).toMatchObject({ status: 403, code: "permission_denied" });
  });

  it("follows the role of the Membership, not of the user", async () => {
    // The GRC Manager of the Demo Tenant is only an Auditor at the hospital.
    const page = await client().query(implementationsQuery("klinikum-beispielstadt"));
    expect(page.items).toEqual([]);

    const error = await failure(
      updateImplementation("klinikum-beispielstadt", "im-any", 1, { status: "implemented" }),
    );

    expect(error).toMatchObject({ status: 403, code: "permission_denied" });
  });
});
