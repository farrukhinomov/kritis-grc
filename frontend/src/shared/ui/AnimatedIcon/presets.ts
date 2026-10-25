import {
  ArrowLeft,
  Bell,
  Building,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleQuestionMark,
  CircleUser,
  Download,
  Ellipsis,
  Factory,
  Grid3x3,
  Inbox,
  Languages,
  LayoutDashboard,
  ListChecks,
  LogOut,
  type LucideIcon,
  Map,
  Maximize2,
  Minimize2,
  Monitor,
  Moon,
  Network,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

/** How an icon moves; each one is a keyframe animation in the style sheet. */
export type IconAnimation =
  | "spin"
  | "ring"
  | "pop"
  | "nudge-forward"
  | "nudge-back"
  | "turn"
  | "shake"
  | "rise"
  | "drop"
  | "tilt"
  | "lift";

interface Preset {
  icon: LucideIcon;
  animation: IconAnimation;
}

/**
 * One preset per meaning, so the same action looks and moves the same everywhere: a
 * refresh always spins, a destructive action always shakes.
 */
export const ICON_PRESETS = {
  refresh: { icon: RefreshCw, animation: "spin" },
  bell: { icon: Bell, animation: "ring" },
  check: { icon: Check, animation: "pop" },
  chevronForward: { icon: ChevronRight, animation: "nudge-forward" },
  chevronBack: { icon: ChevronLeft, animation: "nudge-back" },
  back: { icon: ArrowLeft, animation: "nudge-back" },
  plus: { icon: Plus, animation: "turn" },
  trash: { icon: Trash, animation: "shake" },
  upload: { icon: Upload, animation: "rise" },
  download: { icon: Download, animation: "drop" },
  search: { icon: Search, animation: "tilt" },
  settings: { icon: Settings, animation: "spin" },
  logout: { icon: LogOut, animation: "nudge-forward" },
  more: { icon: Ellipsis, animation: "pop" },
  close: { icon: X, animation: "turn" },
  expand: { icon: Maximize2, animation: "pop" },
  collapse: { icon: Minimize2, animation: "pop" },
  warning: { icon: TriangleAlert, animation: "shake" },
  lightMode: { icon: Sun, animation: "spin" },
  darkMode: { icon: Moon, animation: "tilt" },
  systemMode: { icon: Monitor, animation: "lift" },
  language: { icon: Languages, animation: "tilt" },
  user: { icon: CircleUser, animation: "lift" },
  tenant: { icon: Building, animation: "lift" },
  dashboard: { icon: LayoutDashboard, animation: "lift" },
  compliance: { icon: ListChecks, animation: "lift" },
  risks: { icon: ShieldAlert, animation: "lift" },
  suggestions: { icon: Sparkles, animation: "pop" },
  approvals: { icon: Inbox, animation: "lift" },
  deadlines: { icon: CalendarClock, animation: "ring" },
  facilities: { icon: Factory, animation: "lift" },
  dependencies: { icon: Network, animation: "lift" },
  coverage: { icon: Grid3x3, animation: "lift" },
  applicability: { icon: CircleQuestionMark, animation: "tilt" },
  activity: { icon: ScrollText, animation: "lift" },
  roadmap: { icon: Map, animation: "lift" },
} as const satisfies Record<string, Preset>;

export type IconPreset = keyof typeof ICON_PRESETS;
