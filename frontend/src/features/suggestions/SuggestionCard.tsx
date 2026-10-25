import { Button, Tag } from "antd";
import { useTranslation } from "react-i18next";

import type { MappingSuggestion, RequirementRef } from "@/shared/api/types";
import { useIsWideScreen } from "@/shared/lib/breakpoints";
import { SwipeableCard } from "@/shared/ui/patterns/ResponsiveTable";

import type { Decision } from "./useDecideSuggestion";

interface SuggestionCardProps {
  suggestion: MappingSuggestion;
  /** Absent when the Suggestion is decided or the role may not decide. */
  onAsk?: ((decision: Decision) => void) | undefined;
  /** This card's decision is being saved. */
  busy: boolean;
  /** Some decision is being saved, so none can be started. */
  locked: boolean;
}

/**
 * One Suggestion as a reviewer needs it: which Requirement would count for which, how far,
 * and why the model thinks so. On phones the decisions sit behind a swipe and in the
 * card's actions menu; on wide screens they are buttons.
 */
export function SuggestionCard({ suggestion, onAsk, busy, locked }: SuggestionCardProps) {
  const { t, i18n } = useTranslation();
  const wide = useIsWideScreen();
  const english = i18n.language === "en";
  const headingId = `${suggestion.id}-title`;
  const sourceId = `${suggestion.id}-source`;
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });

  const content = (
    <div className="grc-suggestion-card">
      <h3 id={headingId} className="grc-suggestion-title">
        <RequirementName requirement={suggestion.target} english={english} />
      </h3>
      {/* Several Suggestions can share a target; the source tells their names apart. */}
      <span id={sourceId} className="grc-visually-hidden">
        {t("suggestions.nameSource", { citation: suggestion.source.citation })}
      </span>
      <dl className="grc-facts">
        <dt>{t("suggestions.target")}</dt>
        <dd>{suggestion.target.framework_name}</dd>
        <dt>{t("suggestions.source")}</dt>
        <dd>
          <span className="grc-meta">{suggestion.source.framework_name}</span>
          <br />
          <RequirementName requirement={suggestion.source} english={english} />
        </dd>
      </dl>
      <div className="grc-suggestion-tags">
        <Tag>{t(`suggestions.coverage.${suggestion.coverage}`)}</Tag>
        <span className="grc-meta">
          {t("suggestions.confidence", {
            value: new Intl.NumberFormat(i18n.language, { style: "percent" }).format(
              suggestion.confidence,
            ),
          })}
        </span>
      </div>
      <p className="grc-suggestion-rationale">
        {english ? suggestion.rationale_en : suggestion.rationale_de}
      </p>
      <p className="grc-meta">
        {suggestion.decided_at
          ? t(`suggestions.decided.${suggestion.status === "approved" ? "approved" : "rejected"}`, {
              name: suggestion.decided_by_name ?? t("suggestions.someone"),
              date: dateFormat.format(new Date(suggestion.decided_at)),
            })
          : t("suggestions.proposed", {
              model: suggestion.model,
              date: dateFormat.format(new Date(suggestion.created_at)),
            })}
      </p>
      {onAsk && wide && (
        <div className="grc-suggestion-actions">
          <Button
            type="primary"
            loading={busy}
            disabled={locked && !busy}
            onClick={() => {
              onAsk("approved");
            }}
          >
            {t("suggestions.approve")}
          </Button>
          <Button
            disabled={locked}
            onClick={() => {
              onAsk("rejected");
            }}
          >
            {t("suggestions.reject")}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    // Focusable so focus can move here after a decision elsewhere in the list.
    <article
      aria-labelledby={`${headingId} ${sourceId}`}
      tabIndex={-1}
      data-suggestion={suggestion.id}
    >
      {onAsk && !wide ? (
        <SwipeableCard
          actions={[
            {
              key: "approve",
              label: t("suggestions.approve"),
              icon: "check",
              disabled: locked,
              onSelect: () => {
                onAsk("approved");
              },
            },
            {
              key: "reject",
              label: t("suggestions.reject"),
              icon: "close",
              danger: true,
              disabled: locked,
              onSelect: () => {
                onAsk("rejected");
              },
            },
          ]}
        >
          {content}
        </SwipeableCard>
      ) : (
        <div className="grc-suggestion-frame">{content}</div>
      )}
    </article>
  );
}

function RequirementName({
  requirement,
  english,
}: {
  requirement: RequirementRef;
  english: boolean;
}) {
  return (
    <>
      <strong>{requirement.citation}</strong>{" "}
      {english ? requirement.title_en : requirement.title_de}
    </>
  );
}
