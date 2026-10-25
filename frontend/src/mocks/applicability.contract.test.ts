import { QueryClient } from "@tanstack/react-query";

import { apiGet } from "@/shared/api/client";
import {
  applicabilityCheckQuery,
  createCriticalFacility,
  criticalServicesQuery,
  type NewCriticalFacility,
  scopesQuery,
} from "@/shared/api/organization";

import { setMockSession } from "./accounts";

/** The Applicability Check and the Critical Facility it creates, through the typed client. */

const EMPTY = "wasserverband-musterland";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);
const WATER = { sector: "water", critical_service: "drinking_water_supply" } as const;

const facility = (overrides: Partial<NewCriticalFacility> = {}): NewCriticalFacility => ({
  name: "Wasserwerk Ost",
  location: "Musterland-Ost",
  critical_facility: {
    ...WATER,
    people_supplied: 540000,
    registration: { status: "planned", date: "2027-03-01" },
  },
  ...overrides,
});

describe("the Critical Services", () => {
  it("name their measure, threshold and its legal basis", async () => {
    const page = await client().query(criticalServicesQuery(EMPTY));

    expect(page.items).toContainEqual({
      ...WATER,
      measure: "people_supplied",
      threshold: 500000,
      threshold_basis: "statutory_default",
      citation: "§ 5 Abs. 2",
    });
  });
});

describe("the Applicability Check", () => {
  it("applies above the threshold, but not bindingly while the ordinance is pending", async () => {
    const result = await client().query(
      applicabilityCheckQuery(EMPTY, { ...WATER, people_supplied: 620000 }),
    );

    expect(result).toMatchObject({
      applies: true,
      threshold: 500000,
      binding: false,
      not_binding_reason: "ordinance_pending",
      registration_within_months: 3,
      citations: { definition: "§ 2 Nr. 3", threshold: "§ 5 Abs. 2", registration: "§ 8 Abs. 1" },
    });
  });

  it("applies once the threshold is reached", async () => {
    const result = await client().query(
      applicabilityCheckQuery(EMPTY, { ...WATER, people_supplied: 500000 }),
    );

    expect(result.applies).toBe(true);
  });

  it("doesn't apply below the threshold", async () => {
    const result = await client().query(
      applicabilityCheckQuery(EMPTY, { ...WATER, people_supplied: 120000 }),
    );

    expect(result.applies).toBe(false);
  });

  it.each([
    ["an unknown service", "sector=water&critical_service=power&people_supplied=1"],
    [
      "a service of another sector",
      "sector=health&critical_service=drinking_water_supply&people_supplied=1",
    ],
    ["a negative number", "sector=water&critical_service=drinking_water_supply&people_supplied=-5"],
    ["a fraction", "sector=water&critical_service=drinking_water_supply&people_supplied=1.5"],
    ["no number", "sector=water&critical_service=drinking_water_supply"],
  ])("refuses %s", async (_, query) => {
    const error = await failure(apiGet(`/api/v1/tenants/${EMPTY}/applicability-check?${query}`));

    expect(error).toMatchObject({ status: 400, code: "invalid_filter" });
  });
});

describe("a Critical Facility created from the check", () => {
  it("is a Scope with a planned Registration and projected deadlines", async () => {
    const scope = await createCriticalFacility(EMPTY, facility(), "key-1");

    expect(scope).toMatchObject({ name: "Wasserwerk Ost", kind: "critical_facility" });
    expect(scope.critical_facility).toMatchObject({
      threshold: 500000,
      location: "Musterland-Ost",
      registration: { status: "planned", date: "2027-03-01" },
    });
    expect(scope.critical_facility!.deadlines).toContainEqual({
      citation: "§ 12",
      due_date: "2027-12-01",
      binding: false,
    });
    const scopes = await client().query(scopesQuery(EMPTY));
    expect(scopes.items.map((item) => item.id)).toContain(scope.id);
  });

  it("is created once, however often a lost answer is retried", async () => {
    const first = await createCriticalFacility(EMPTY, facility(), "key-2");
    const retry = await createCriticalFacility(EMPTY, facility(), "key-2");

    expect(retry.id).toBe(first.id);
    const scopes = await client().query(scopesQuery(EMPTY));
    expect(scopes.items.filter((item) => item.name === "Wasserwerk Ost")).toHaveLength(1);
  });

  it.each([
    ["without a name", facility({ name: " " }), "name"],
    [
      "with an invalid date",
      facility({
        critical_facility: {
          ...WATER,
          people_supplied: 540000,
          registration: { status: "planned", date: "2027-02-30" },
        },
      }),
      "critical_facility.registration.date",
    ],
    [
      "without people supplied",
      facility({
        critical_facility: {
          ...WATER,
          people_supplied: 0,
          registration: { status: "planned", date: "2027-03-01" },
        },
      }),
      "critical_facility.people_supplied",
    ],
  ])("is refused %s", async (_, input, field) => {
    const error = await failure(createCriticalFacility(EMPTY, input, `key-${field}`));

    expect(error).toMatchObject({ status: 422, code: "validation_error" });
    expect((error as { errors: { field: string }[] }).errors.map((item) => item.field)).toContain(
      field,
    );
  });

  it("can't be created by an Auditor", async () => {
    setMockSession("auditor");

    const error = await failure(createCriticalFacility(EMPTY, facility(), "key-auditor"));

    expect(error).toMatchObject({ status: 403 });
  });
});
