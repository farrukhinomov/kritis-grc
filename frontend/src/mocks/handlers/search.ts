import { HttpResponse } from "msw";

import type { SearchGroup, SearchResults } from "@/shared/api/types";
import { MIN_SEARCH_LENGTH } from "@/shared/api/search";

import type { TenantData } from "../db";
import { problem, tenantRoute } from "../http";

const PER_GROUP = 5;

/** Lower case without accents, so "Gefahrdung" finds "Gefährdung". */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** A citation compared without spaces and dots: "§13 abs.3" finds "§ 13 Abs. 3". */
const compact = (text: string) => fold(text).replace(/[\s.]/g, "");

function group<T>(ranked: { item: T; rank: number }[]): SearchGroup<T> {
  const sorted = ranked.toSorted((a, b) => a.rank - b.rank);
  return { items: sorted.slice(0, PER_GROUP).map(({ item }) => item), total: sorted.length };
}

/**
 * The search behind the command palette. It runs on the server, inside one Tenant, as
 * the backend will: the browser never loads whole lists to filter them. Requirements are
 * the public catalogue; Risks and Assets are the Tenant's own. Citation matches rank
 * before title matches, title matches before text matches.
 */
function search(data: TenantData, q: string): SearchResults {
  const needle = fold(q);
  const compactNeedle = compact(q);
  const frameworkOf = (versionId: string) =>
    data.frameworks.find((framework) =>
      framework.versions.some((version) => version.id === versionId),
    );
  const scopeName = (id: string) => data.scopes.find((scope) => scope.id === id)?.name ?? "";

  const requirements = data.requirements.flatMap((requirement) => {
    const rank = compact(requirement.citation).includes(compactNeedle)
      ? 0
      : fold(`${requirement.title_de} ${requirement.title_en}`).includes(needle)
        ? 1
        : fold(`${requirement.text_de} ${requirement.summary_en}`).includes(needle)
          ? 2
          : null;
    const framework = frameworkOf(requirement.framework_version_id);
    return rank === null || !framework
      ? []
      : [
          {
            rank,
            item: {
              id: requirement.id,
              citation: requirement.citation,
              title_de: requirement.title_de,
              title_en: requirement.title_en,
              framework_id: framework.id,
              framework_name: framework.name,
              paragraph: requirement.paragraph,
            },
          },
        ];
  });

  const risks = data.risks.flatMap((risk) =>
    fold(risk.title_de).includes(needle)
      ? [
          {
            rank: 0,
            item: { id: risk.id, title_de: risk.title_de, scope_name: scopeName(risk.scope_id) },
          },
        ]
      : [],
  );

  const assets = data.assets.flatMap((asset) =>
    fold(asset.name).includes(needle)
      ? [
          {
            rank: 0,
            item: {
              id: asset.id,
              name: asset.name,
              scope_id: asset.scope_id,
              scope_name: scopeName(asset.scope_id),
            },
          },
        ]
      : [],
  );

  return { requirements: group(requirements), risks: group(risks), assets: group(assets) };
}

export const searchHandlers = [
  tenantRoute("get", "/search", ({ data, url }) => {
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < MIN_SEARCH_LENGTH) {
      return problem(
        400,
        "invalid_filter",
        `Search for at least ${String(MIN_SEARCH_LENGTH)} characters.`,
      );
    }
    return HttpResponse.json(search(data, q));
  }),
];
