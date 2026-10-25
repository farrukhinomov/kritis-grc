import type { Framework } from "@/shared/api/types";

import { currentVersion } from "./version";

const version = (id: string, effective_from: string) => ({
  id,
  label: id,
  effective_from,
  source_url: "",
  retrieved_at: "",
});
const framework = (...versions: ReturnType<typeof version>[]) =>
  ({ id: "f", key: "bsig", name: "F", versions }) as Framework;

describe("currentVersion", () => {
  it("is the latest version that has taken effect", () => {
    const f = framework(version("old", "2024-01-01"), version("now", "2026-07-29"));

    expect(currentVersion(f, "2026-10-25")?.id).toBe("now");
  });

  it("ignores an announced amendment until its date", () => {
    const f = framework(version("now", "2026-07-29"), version("next", "2027-01-01"));

    expect(currentVersion(f, "2026-10-25")?.id).toBe("now");
    expect(currentVersion(f, "2027-01-01")?.id).toBe("next");
  });

  it("falls back to the first version when all lie ahead", () => {
    const f = framework(version("b", "2028-01-01"), version("a", "2027-01-01"));

    expect(currentVersion(f, "2026-10-25")?.id).toBe("a");
  });
});
