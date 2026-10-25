import { can } from "./permissions";

describe("permissions", () => {
  it("let a GRC Manager view, change and approve", () => {
    expect(can("grc_manager", "view")).toBe(true);
    expect(can("grc_manager", "change")).toBe(true);
    expect(can("grc_manager", "approve")).toBe(true);
  });

  it("let an Auditor only view", () => {
    expect(can("auditor", "view")).toBe(true);
    expect(can("auditor", "change")).toBe(false);
    expect(can("auditor", "approve")).toBe(false);
  });
});
