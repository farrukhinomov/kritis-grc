import "./suggestions.css";

import { useQuery } from "@tanstack/react-query";
import { Alert, Modal, Pagination } from "antd";
import { LayoutGroup, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
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
const PENDING_HEADING = "suggestions-pending";

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
  const [asked, setAsked] = useState<Asked | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [failure, setFailure] = useState<"conflict" | "failed" | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);
  const nextAfter = useRef(new Map<string, string | null>());

  const decide = useDecideSuggestion(tenant, {
    onDecided: ({ suggestion, decision }) => {
      setAnnouncement(
        t(`suggestions.announce.${decision}`, { citation: suggestion.target.citation }),
      );
      setFocusTarget({ id: nextAfter.current.get(suggestion.id) ?? suggestion.id });
    },
    onFailed: (error, { suggestion }) => {
      setFailure(error instanceof ApiError && error.status === 409 ? "conflict" : "failed");
      setFocusTarget({ id: nextAfter.current.get(suggestion.id) ?? suggestion.id });
    },
  });

  // The decided card has left the list and took focus with it. Focus moves to its
  // neighbour without scrolling, which would pull the gliding card out of view; when
  // that card isn't on screen, to the pending list's heading.
  useEffect(() => {
    if (!focusTarget) {
      return;
    }
    const card = document.querySelector<HTMLElement>(`[data-suggestion="${focusTarget.id}"]`);
    (card ?? document.getElementById(PENDING_HEADING))?.focus({ preventScroll: true });
  }, [focusTarget]);

  const confirm = () => {
    if (!asked) {
      return;
    }
    const { suggestion, decision, next } = asked;
    nextAfter.current.set(suggestion.id, next);
    setAsked(null);
    setFailure(null);
    decide.mutate({ suggestion, decision });
  };

  const listProps = {
    tenant,
    // One decision at a time: a second one would race the first in the lists.
    locked: decide.isPending,
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
  locked: boolean;
  busyId: string | null;
  onAsk?:
    ((suggestion: MappingSuggestion, decision: Decision, next: string | null) => void) | undefined;
}

function SuggestionList({ tenant, status, locked, busyId, onAsk }: SuggestionListProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const query = combine([
    useQuery(mappingSuggestionsQuery(tenant, { status, page, limit: PAGE_SIZE })),
  ] as const);
  const headingId = `suggestions-${status}`;
  const total = query.data?.[0].page.total;

  // A decision can empty the page being shown; it then moves back to the last page left,
  // rather than claiming the whole list is empty. Adjusted while rendering, as React
  // recommends for state that follows other data, so no empty frame is committed.
  const lastPage = total === undefined ? page : Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > lastPage) {
    setPage(lastPage);
  }

  return (
    <section aria-labelledby={headingId} className="grc-suggestion-list">
      <h2 id={headingId} tabIndex={-1} className="grc-suggestion-list-title">
        {t(`suggestions.lists.${status}`)}
        {total !== undefined && <span className="grc-meta"> ({total})</span>}
      </h2>
      <QueryContent
        query={query}
        rows={4}
        isEmpty={([result]) => result.items.length === 0 && page === 1}
        empty={t(`suggestions.empty.${status}`)}
      >
        {([result]) => (
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
                  locked={locked}
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
        )}
      </QueryContent>
      {total !== undefined && total > PAGE_SIZE && (
        <Pagination
          className="grc-suggestion-pagination"
          current={page}
          pageSize={PAGE_SIZE}
          total={total}
          showSizeChanger={false}
          onChange={setPage}
        />
      )}
    </section>
  );
}
