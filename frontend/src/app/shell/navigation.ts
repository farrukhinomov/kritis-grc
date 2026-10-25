import type { IconPreset } from "@/shared/ui/AnimatedIcon/presets";

export interface NavItem {
  key: string;
  path: string;
  icon: IconPreset;
  /** Shown in the phone tab bar; the rest sit behind "More". */
  primary: boolean;
}

/** Every screen in a Tenant, in sidebar order. The label is the `nav.<key>` text. */
export const NAV_ITEMS = [
  { key: "dashboard", path: "dashboard", icon: "dashboard", primary: true },
  { key: "compliance", path: "compliance", icon: "compliance", primary: true },
  { key: "risks", path: "risks", icon: "risks", primary: true },
  { key: "approvals", path: "approvals", icon: "approvals", primary: true },
  { key: "suggestions", path: "suggestions", icon: "suggestions", primary: false },
  { key: "deadlines", path: "deadlines", icon: "deadlines", primary: false },
  { key: "facilities", path: "facilities", icon: "facilities", primary: false },
  { key: "dependencies", path: "dependencies", icon: "dependencies", primary: false },
  { key: "coverage", path: "coverage", icon: "coverage", primary: false },
  { key: "applicability", path: "applicability", icon: "applicability", primary: false },
  { key: "activity", path: "activity", icon: "activity", primary: false },
  { key: "settings", path: "settings", icon: "settings", primary: false },
  { key: "roadmap", path: "roadmap", icon: "roadmap", primary: false },
] as const satisfies readonly NavItem[];

export type NavEntry = (typeof NAV_ITEMS)[number];

export const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => item.primary);
export const SECONDARY_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.primary);

/** The screen of a Tenant URL: "risks" for "/t/muster-stadtwerke/risks/42". */
export function screenOf(pathname: string): string | undefined {
  const screen = pathname.split("/")[3];
  return screen === "" ? undefined : screen;
}
