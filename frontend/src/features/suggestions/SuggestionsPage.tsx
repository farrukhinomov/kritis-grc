import "./suggestions.css";

import { useQuery } from "@tanstack/react-query";
import { Alert, Modal, Pagination } from "antd";
import { LayoutGroup, m } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "@/shared/api/client";
import { mappingSuggestionsQuery } from "@/shared/api/compliance";
import type { MappingSuggestion, SuggestionStatus } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { useCan, useCurrentMembership } from "@/shared/session/sessionContext";
import { duration, ease } from "@/shared/theme/motion";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

import { SuggestionCard } from "./SuggestionCard";
import { type Decision, useDecideSuggestion } from "./useDecideSuggestion";

const PAGE_SIZE = 25;

interface Asked {
  suggestion: MappingSuggestion;
  decision: Decision;
  /** Where focus goes once the card has left the pending list. */
  next: string | null;
}

/**
 * The review of the AI's Mapping Suggestions. Nothing the model proposes counts until a
 * GRC Manager approves it, and every decision is confirmed first, because neither can be
 * undone here. A decided card glides into its new list, so the change is visible.
 */
export function SuggestionsPage() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const canDecide = useCan("approve");
  const decide = useDecideSuggestion(tenant);
  const [asked, setAsked] = useState<Asked | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [failure, setFailure] = useState<"conflict" | "failed" | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);

  // The decided card has left the list and took focus with it. Focus moves to its
  // neighbour without scrolling, which would pull the gliding card out of view.
  useEffect(() => {
    if (focusTarget) {
      document
        .querySelector<HTMLElement>(`[data-suggestion="${focusTarget}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [focusTarget]);

  const confirm = () => {
    if (!asked) {
      return;
    }
    const { suggestion, decision, next } = asked;
    setAsked(null);
    setFailure(null);
    decide.mutate(
      { suggestion, decision },
      {
        onSuccess: () => {
          setAnnouncement(t(`suggestions.announce.${decision}`));
          setFocusTarget(next ?? suggestion.id);
        },
        onError: (error) => {
          setFailure(error instanceof ApiError && error.status === 409 ? "conflict" : "failed");
        },
      },
    );
  };

  const listProps = {
    tenant,
    busyId: decide.isPending ? decide.variables.suggestion.id : null,
  };

  return (
    <>
      <PageHeader title={t("nav.suggestions")} description={t("suggestions.description")} />
      <p className="grc-meta grc-suggestions-hint">{t("suggestions.hint")}</p>
      {failure && (
        <Alert
          type={failure === "conflict" ? "warning" : "error"}
          showIcon
          closable={{
            onClose: () => {
              setFailure(null);
            },
          }}
          className="grc-suggestions-alert"
          title={t(`suggestions.errors.${failure}`)}
        />
      )}
      <p role="status" className="grc-visually-hidden">
        {announcement}
      </p>
      <LayoutGroup>
        <div className="grc-suggestions">
          <SuggestionList
            {...listProps}
            status="pending"
            onAsk={
              canDecide
                ? (suggestion, decision, next) => {
                    setAsked({ suggestion, decision, next });
                  }
                : undefined
            }
          />
          <div className="grc-suggestions-decided">
            <SuggestionList {...listProps} status="approved" />
            <SuggestionList {...listProps} status="rejected" />
          </div>
        </div>
      </LayoutGroup>
      <Modal
        open={asked !== null}
        title={t(`suggestions.confirm.${asked?.decision ?? "approved"}.title`)}
        okText={t(`suggestions.confirm.${asked?.decision ?? "approved"}.ok`)}
        okButtonProps={{ danger: asked?.decision === "rejected" }}
        cancelText={t("suggestions.confirm.cancel")}
        onOk={confirm}
        onCancel={() => {
          setAsked(null);
        }}
      >
        {asked && (
          <p>
            {t(`suggestions.confirm.${asked.decision}.body`, {
              source: `${asked.suggestion.source.framework_name} ${asked.suggestion.source.citation}`,
              target: `${asked.suggestion.target.framework_name} ${asked.suggestion.target.citation}`,
            })}
          </p>
        )}
      </Modal>
    </>
  );
}

interface SuggestionListProps {
  tenant: string;
  status: SuggestionStatus;
  busyId: string | null;
  onAsk?:
    ((suggestion: MappingSuggestion, decision: Decision, next: string | null) => void) | undefined;
}

function SuggestionList({ tenant, status, busyId, onAsk }: SuggestionListProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const query = combine([
    useQuery(mappingSuggestionsQuery(tenant, { status, page, limit: PAGE_SIZE })),
  ] as const);
  const headingId = `suggestions-${status}`;
  const total = query.data?.[0].page.total;

  return (
    <section aria-labelledby={headingId} className="grc-suggestion-list">
      <h2 id={headingId} className="grc-suggestion-list-title">
        {t(`suggestions.lists.${status}`)}
        {total !== undefined && <span className="grc-meta"> ({total})</span>}
      </h2>
      <QueryContent
        query={query}
        rows={4}
        isEmpty={([result]) => result.items.length === 0}
        empty={t(`suggestions.empty.${status}`)}
      >
        {([result]) => (
          <>
            <ul className="grc-plain-list grc-suggestion-items">
              {result.items.map((suggestion, index) => (
                <m.li
                  key={suggestion.id}
                  layoutId={suggestion.id}
                  transition={{ duration: duration.slow, ease: ease.standard }}
                >
                  <SuggestionCard
                    suggestion={suggestion}
                    busy={busyId === suggestion.id}
                    onAsk={
                      onAsk &&
                      ((decision) => {
                        const neighbour = result.items[index + 1] ?? result.items[index - 1];
                        onAsk(suggestion, decision, neighbour?.id ?? null);
                      })
                    }
                  />
                </m.li>
              ))}
            </ul>
            {result.page.total > PAGE_SIZE && (
              <Pagination
                className="grc-suggestion-pagination"
                current={page}
                pageSize={PAGE_SIZE}
                total={result.page.total}
                showSizeChanger={false}
                onChange={setPage}
              />
            )}
          </>
        )}
      </QueryContent>
    </section>
  );
}
