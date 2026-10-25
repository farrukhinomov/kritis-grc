import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import type { Membership } from "./session";
import { MembershipContext, useCan, useSession } from "./sessionContext";

const membership = (role: Membership["role"]): Membership => ({
  tenant: { slug: "t", name: "T", theme: "saar-green" },
  role,
});

function inTenant(value: Membership | null) {
  return ({ children }: { children: ReactNode }) => (
    <MembershipContext value={value}>{children}</MembershipContext>
  );
}

describe("useCan", () => {
  it("follows the role of the current Membership", () => {
    expect(
      renderHook(() => useCan("change"), { wrapper: inTenant(membership("grc_manager")) }).result
        .current,
    ).toBe(true);
    expect(
      renderHook(() => useCan("change"), { wrapper: inTenant(membership("auditor")) }).result
        .current,
    ).toBe(false);
  });

  it("allows nothing outside a Tenant", () => {
    expect(renderHook(() => useCan("view"), { wrapper: inTenant(null) }).result.current).toBe(
      false,
    );
  });
});

describe("useSession", () => {
  it("refuses to run outside the session gate", () => {
    expect(() => renderHook(() => useSession())).toThrow(/session gate/);
  });
});
