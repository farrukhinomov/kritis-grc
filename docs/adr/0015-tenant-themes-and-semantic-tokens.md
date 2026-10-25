---
status: accepted
date: 2026-10-25
---

# Tenants choose a Theme; components use only semantic tokens

The UI ships three Themes: Saar Green (the default, matching the target employer's palette under a neutral name), Blue (own brand) and High Contrast (WCAG AA). Each Theme has a light and a dark variant. The Tenant chooses the Theme, so the platform can be white-labelled per organization. Each user chooses light, dark or system, stored on their server-side profile and applied before first paint.

Tokens come in three layers: a primitive palette per Theme, semantic tokens shared by all Themes (`primary`, `surface`, `sidebar.bg`, `risk.*`, `status.*`) with hand-tuned light and dark values, and the mapping into Ant Design 6's `ConfigProvider` (React 19). antd 6 emits CSS variables by default, so switching Theme or mode at runtime only swaps variables instead of regenerating styles. Dark values are designed by hand rather than produced by `darkAlgorithm` alone, because the algorithm makes the risk colors glaring.

## Consequences

- Components never use raw color values. A lint rule or review check rejects hex codes outside the token files.
- A unit test checks WCAG AA contrast for every Theme in both modes.
- No other company's name or logo appears in the UI or repo. Saar Green is a palette, not a brand.
