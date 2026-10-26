import "./approvals.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Input, Modal, Tag } from "antd";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import {
  approvalsQuery,
  approveRiskAssessment,
  rejectRiskAssessment,
} from "@/shared/api/approvals";
import { ApiError } from "@/shared/api/client";
import { approveSuggestion, rejectSuggestion } from "@/shared/api/compliance";
import { resourceKey } from "@/shared/api/keys";
import type { ApprovalItem, ApprovalKind, Approvals } from "@/shared/api/types";
import { useIsWideScreen } from "@/shared/lib/breakpoints";
import { combine } from "@/shared/lib/combineQueries";
import { formatLocalDate } from "@/shared/lib/format";
import { useCan, useCurrentMembership } from "@/shared/session/sessionContext";
import { duration, ease } from "@/shared/theme/motion";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { SwipeableCard } from "@/shared/ui/patterns/ResponsiveTable";

type Decision = "approve" | "reject";

interface Asked {
  item: ApprovalItem;
  decision: Decision;
  next: string | null;
}

/**
 * Everything waiting for the current user's approval, from every module, oldest first.
 * Each decision is confirmed first, as none can be undone here; rejecting a Risk
 * Assessment needs a reason, so its author knows what to rework. The server decides what
 * belongs here: an Auditor approves nothing, and nobody approves their own submission.
 */
export function ApprovalsPage() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const canApprove = useCan("approve");
  const client = useQueryClient();
  const query = combine([useQuery({ ...approvalsQuery(tenant), enabled: canApprove })] as const);
  const [asked, setAsked] = useState<Asked | null>(null);
  const [note, setNote] = useState("");
  const [noteMissing, setNoteMissing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [failure, setFailure] = useState<"conflict" | "failed" | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ id: string | null } | null>(null);
  const noteId = useId();

  const decide = useMutation({
    mutationFn: async ({ item, decision, reason }: Asked & { reason: string }) => {
      if (item.kind === "risk_assessment") {
        await (decision === "approve"
          ? approveRiskAssessment(tenant, item.id)
          : rejectRiskAssessment(tenant, item.id, reason));
      } else {
        await (decision === "approve"
          ? approveSuggestion(tenant, item.id)
          : rejectSuggestion(tenant, item.id));
      }
    },
    onSuccess: (_, { item, decision, next }) => {
      // The item leaves the inbox and the count at once, in the same render; the
      // refetch below only confirms it. Until then it could be decided a second time.
      client.setQueryData<Approvals>(approvalsQuery(tenant).queryKey, (current) =>
        current
          ? {
              items: current.items.filter(
                (other) => !(other.kind === item.kind && other.id === item.id),
              ),
              total: current.total - 1,
            }
          : current,
      );
      setAnnouncement(t(`approvals.announce.${decision}`, { title: item.title }));
      setFocusTarget({ id: next });
    },
    onError: (error) => {
      setFailure(error instanceof ApiError && error.status === 409 ? "conflict" : "failed");
    },
    onSettled: () => {
      // The decision reaches every list that shows the item, and the log records it.
      for (const resource of [
        "approvals",
        "mapping-suggestions",
        "mappings",
        "risk-assessments",
        "deadlines",
        "activity",
      ]) {
        void client.invalidateQueries({ queryKey: resourceKey(tenant, resource) });
      }
    },
  });

  // The decided card leaves the list and takes focus with it; focus moves to its
  // neighbour, or to the list's heading when it was the last.
  useEffect(() => {
    if (!focusTarget) {
      return;
    }
    const card = [...document.querySelectorAll<HTMLElement>("[data-approval]")].find(
      (element) => element.dataset.approval === focusTarget.id,
    );
    (card ?? document.getElementById("approvals-heading"))?.focus({ preventScroll: true });
  }, [focusTarget]);

  const ask = (item: ApprovalItem, decision: Decision, next: string | null) => {
    setFailure(null);
    setNote("");
    setNoteMissing(false);
    setAsked({ item, decision, next });
  };

  const confirm = () => {
    if (!asked) {
      return;
    }
    const needsReason = asked.item.kind === "risk_assessment" && asked.decision === "reject";
    if (needsReason && note.trim() === "") {
      setNoteMissing(true);
      return;
    }
    decide.mutate({ ...asked, reason: note.trim() });
    setAsked(null);
  };

  const dialogKey: `${ApprovalKind}.${Decision}` = asked
    ? `${asked.item.kind}.${asked.decision}`
    : "risk_assessment.approve";

  return (
    <>
      <PageHeader title={t("nav.approvals")} description={t("approvals.description")} />
      {failure && (
        <Alert
          type={failure === "conflict" ? "warning" : "error"}
          showIcon
          className="grc-approvals-alert"
          title={t(`approvals.errors.${failure}`)}
        />
      )}
      <p role="status" className="grc-visually-hidden">
        {announcement}
      </p>
      <h2 id="approvals-heading" tabIndex={-1} className="grc-visually-hidden">
        {t("approvals.list")}
      </h2>
      {canApprove ? (
        <QueryContent
          query={query}
          rows={5}
          isEmpty={([approvals]) => approvals.items.length === 0}
          empty={t("approvals.empty")}
        >
          {([approvals]) => (
            <ul aria-label={t("approvals.list")} className="grc-plain-list grc-approvals">
              <AnimatePresence initial={false}>
                {approvals.items.map((item, index) => (
                  <m.li
                    key={`${item.kind}-${item.id}`}
                    layout
                    exit={{ opacity: 0, height: 0 }}
                    className="grc-approval-item"
                    transition={{ duration: duration.base, ease: ease.standard }}
                  >
                    <ApprovalCard
                      tenant={tenant}
                      item={item}
                      busy={decide.isPending}
                      onAsk={(decision) => {
                        const neighbour = approvals.items[index + 1] ?? approvals.items[index - 1];
                        ask(item, decision, neighbour ? neighbour.id : null);
                      }}
                    />
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </QueryContent>
      ) : (
        <p className="grc-meta">{t("approvals.auditor")}</p>
      )}
      <Modal
        open={asked !== null}
        title={t(`approvals.confirm.${dialogKey}.title`)}
        okText={t(`approvals.confirm.${dialogKey}.ok`)}
        okButtonProps={{ danger: asked?.decision === "reject" }}
        cancelText={t("approvals.confirm.cancel")}
        // Focus moves to the next item once decided; giving it back to the decided
        // card's button, which leaves with the card, would drop it on the page.
        focusable={{ focusTriggerAfterClose: false }}
        onOk={confirm}
        onCancel={() => {
          setAsked(null);
        }}
      >
        {asked && <p>{t(`approvals.confirm.${dialogKey}.body`, { title: asked.item.title })}</p>}
        {asked?.item.kind === "risk_assessment" && asked.decision === "reject" && (
          <div className="grc-approvals-reason">
            <label htmlFor={noteId}>{t("approvals.reason")}</label>
            <Input.TextArea
              id={noteId}
              rows={3}
              maxLength={2000}
              status={noteMissing ? "error" : ""}
              aria-invalid={noteMissing}
              {...(noteMissing ? { "aria-describedby": `${noteId}-error` } : {})}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteMissing(false);
              }}
            />
            {noteMissing && (
              <span id={`${noteId}-error`} className="grc-approvals-error">
                {t("approvals.reasonMissing")}
              </span>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function ApprovalCard({
  tenant,
  item,
  busy,
  onAsk,
}: {
  tenant: string;
  item: ApprovalItem;
  busy: boolean;
  onAsk: (decision: Decision) => void;
}) {
  const { t, i18n } = useTranslation();
  const wide = useIsWideScreen();
  const headingId = `${item.kind}-${item.id}-title`;
  const link =
    item.kind === "risk_assessment"
      ? `/t/${tenant}/risks?${new URLSearchParams({ scope: item.scope_id ?? "" }).toString()}`
      : `/t/${tenant}/suggestions`;

  const content = (
    <div className="grc-approval">
      <Tag className="grc-approval-kind">{t(`approvals.kinds.${item.kind}`)}</Tag>
      <h3 id={headingId} className="grc-approval-title">
        {item.title}
      </h3>
      <p className="grc-meta">{item.detail}</p>
      <p className="grc-meta">
        {item.submitted_by_name
          ? t("approvals.submittedBy", {
              name: item.submitted_by_name,
              date: formatLocalDate(item.submitted_at, i18n.language),
            })
          : t("approvals.proposedOn", { date: formatLocalDate(item.submitted_at, i18n.language) })}
      </p>
      <div className="grc-approval-actions">
        <Link to={link} className="grc-approval-link">
          {t(`approvals.open.${item.kind}`)}
        </Link>
        {wide && (
          <>
            <Button
              type="primary"
              disabled={busy}
              onClick={() => {
                onAsk("approve");
              }}
            >
              {t(`approvals.approveAction.${item.kind}`)}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                onAsk("reject");
              }}
            >
              {t("approvals.reject")}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <article
      aria-labelledby={headingId}
      tabIndex={-1}
      data-approval={item.id}
      className="grc-approval-frame"
    >
      {wide ? (
        content
      ) : (
        <SwipeableCard
          actions={[
            {
              key: "approve",
              label: t(`approvals.approveAction.${item.kind}`),
              icon: "check",
              disabled: busy,
              onSelect: () => {
                onAsk("approve");
              },
            },
            {
              key: "reject",
              label: t("approvals.reject"),
              icon: "close",
              danger: true,
              disabled: busy,
              onSelect: () => {
                onAsk("reject");
              },
            },
          ]}
        >
          {content}
        </SwipeableCard>
      )}
    </article>
  );
}
