import type { Framework } from "@/shared/api/types";

/** How a citation names its law: "§ 30 BSIG", not the Framework's full name. */
export const LAW_ABBREVIATIONS: Record<Framework["key"], string> = {
  kritis_dachg: "KRITIS-DachG",
  bsig: "BSIG",
};
