import { SEED } from "./seed";

const ids = (items: { id: string }[]) => new Set(items.map((item) => item.id));

const requirementIds = ids(SEED.requirements);
const scopeIds = ids(SEED.scopes);
const memberIds = ids(SEED.members);
const implementationIds = ids(SEED.implementations);
const assetIds = ids(SEED.assets);
const versionIds = new Set(SEED.frameworks.flatMap((f) => f.versions.map((v) => v.id)));

const kritisVersion = SEED.frameworks.find((f) => f.key === "kritis_dachg")!.versions[0]!.id;
const scopeKind = new Map(SEED.scopes.map((scope) => [scope.id, scope.kind]));
const requirementVersion = new Map(SEED.requirements.map((r) => [r.id, r.framework_version_id]));

describe("the seed fixtures", () => {
  it("use unique IDs in every collection", () => {
    const collections: { id: string }[][] = [
      SEED.requirements,
      SEED.scopes,
      SEED.assets,
      SEED.mappings,
      SEED.mappingSuggestions,
      SEED.implementations,
      SEED.evidence,
      SEED.hazards,
      SEED.risks,
      SEED.activity,
      SEED.members,
    ];
    for (const collection of collections) {
      expect(ids(collection).size).toBe(collection.length);
    }
  });

  it("store verbatim statute text and an English summary for every Requirement", () => {
    for (const requirement of SEED.requirements) {
      expect(versionIds.has(requirement.framework_version_id)).toBe(true);
      expect(requirement.text_de).toMatch(/^\(\d+\) /);
      expect(requirement.summary_en.length).toBeGreaterThan(10);
      expect(requirement.citation.startsWith(requirement.paragraph)).toBe(true);
    }
  });

  it("keep the statute's sentences apart, as published", () => {
    for (const requirement of SEED.requirements) {
      expect(requirement.text_de).not.toMatch(/[a-zäöüß)]\.[A-ZÄÖÜ]/);
    }
  });

  it("apply KRITIS-DachG per Critical Facility and the BSIG to the whole organization", () => {
    for (const implementation of SEED.implementations) {
      expect(requirementIds.has(implementation.requirement_id)).toBe(true);
      expect(scopeIds.has(implementation.scope_id)).toBe(true);
      expect(["open", "partial", "implemented", "not_applicable"]).toContain(implementation.status);
      if (implementation.owner_id !== null) {
        expect(memberIds.has(implementation.owner_id)).toBe(true);
      }
      const isKritis = requirementVersion.get(implementation.requirement_id) === kritisVersion;
      expect(scopeKind.get(implementation.scope_id)).toBe(
        isKritis ? "critical_facility" : "organization",
      );
    }
  });

  it("have one Implementation per Requirement and Scope", () => {
    const pairs = SEED.implementations.map((i) => `${i.requirement_id}@${i.scope_id}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("contain exactly the seven curated Platform Mappings, from BSIG to KRITIS-DachG", () => {
    const platform = SEED.mappings.filter((mapping) => mapping.kind === "platform");
    expect(platform).toHaveLength(7);
    for (const mapping of SEED.mappings) {
      expect(requirementVersion.get(mapping.target_requirement_id)).toBe(kritisVersion);
      expect(requirementIds.has(mapping.source_requirement_id)).toBe(true);
      expect(requirementVersion.get(mapping.source_requirement_id)).not.toBe(kritisVersion);
    }
  });

  it("only suggest pending Mappings between existing Requirements", () => {
    for (const suggestion of SEED.mappingSuggestions) {
      expect(suggestion.status).toBe("pending");
      expect(requirementIds.has(suggestion.target_requirement_id)).toBe(true);
      expect(requirementIds.has(suggestion.source_requirement_id)).toBe(true);
      expect(suggestion.confidence).toBeGreaterThan(0);
      expect(suggestion.confidence).toBeLessThan(1);
    }
  });

  it("attach Evidence to Implementations, with Reference Evidence pointing to another one", () => {
    for (const evidence of SEED.evidence) {
      expect(implementationIds.has(evidence.implementation_id)).toBe(true);
      expect(memberIds.has(evidence.added_by_id)).toBe(true);
      if (evidence.kind === "reference") {
        expect(implementationIds.has(evidence.referenced_implementation_id!)).toBe(true);
        expect(evidence.referenced_implementation_id).not.toBe(evidence.implementation_id);
      }
      if (evidence.kind === "file") {
        expect(evidence.file?.size_bytes).toBeGreaterThan(0);
      }
      if (evidence.kind === "link") {
        expect(evidence.url).toMatch(/^https:\/\//);
      }
    }
  });

  it("only let Assets depend on Assets that exist, without depending on themselves", () => {
    for (const asset of SEED.assets) {
      expect(scopeIds.has(asset.scope_id)).toBe(true);
      for (const dependency of asset.depends_on) {
        expect(assetIds.has(dependency)).toBe(true);
        expect(dependency).not.toBe(asset.id);
      }
    }
  });

  it("rate Risks on the 4×4 matrix with Treatments that lower a dimension", () => {
    const hazardIds = ids(SEED.hazards);
    for (const risk of SEED.risks) {
      expect(scopeKind.get(risk.scope_id)).toBe("critical_facility");
      expect(hazardIds.has(risk.hazard_id)).toBe(true);
      expect(risk.asset_ids.every((id) => assetIds.has(id))).toBe(true);
      for (const rating of [risk.inherent, risk.target]) {
        expect([1, 2, 3, 4]).toContain(rating.likelihood);
        expect([1, 2, 3, 4]).toContain(rating.impact);
      }
      for (const treatment of risk.treatments) {
        expect(implementationIds.has(treatment.implementation_id)).toBe(true);
        expect(["likelihood", "impact"]).toContain(treatment.dimension);
        expect(treatment.levels).toBeGreaterThan(0);
      }
    }
  });

  it("give every Critical Facility a planned Registration, never a confirmed one", () => {
    const facilities = SEED.scopes.filter((scope) => scope.kind === "critical_facility");
    expect(facilities.map((scope) => scope.name)).toEqual(["Wasserwerk Nord", "Wasserwerk Süd"]);
    for (const facility of facilities) {
      expect(facility.critical_facility?.registration.status).toBe("planned");
    }
  });

  it("log activity by members, newest last in the file", () => {
    const times = SEED.activity.map((entry) => entry.occurred_at);
    expect([...times].sort()).toEqual(times);
    expect(SEED.activity.every((entry) => memberIds.has(entry.actor_id))).toBe(true);
  });

  it("contain only example.com addresses, so no real person can be reached", () => {
    expect(SEED.members.every((member) => member.email.endsWith("@example.com"))).toBe(true);
  });
});
