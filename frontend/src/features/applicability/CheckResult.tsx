import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Form, Input, Tag } from "antd";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  applicabilityCheckQuery,
  createCriticalFacility,
  type NewCriticalFacility,
} from "@/shared/api/organization";
import { resourceKey } from "@/shared/api/keys";
import type { ApplicabilityQuestion, ApplicabilityResult, Scope } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { formatDate } from "@/shared/lib/format";
import { useIdempotencyKey } from "@/shared/lib/useIdempotencyKey";
import { useCan } from "@/shared/session/sessionContext";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

/** A citation never breaks between "§" and its number. */
const keepTogether = (citation: string) => citation.replaceAll(" ", "\u00a0");

/** What each deadline is for, so a date never stands without its duty. */
type Obligation = "riskAnalysis" | "measures" | "incidents" | "management";
const OBLIGATIONS: Partial<Record<string, Obligation>> = {
  "§ 12": "riskAnalysis",
  "§ 13": "measures",
  "§ 18": "incidents",
  "§ 20": "management",
};

interface CheckResultProps {
  tenant: string;
  question: ApplicabilityQuestion;
  onRestart: () => void;
}

export function CheckResult({ tenant, question, onRestart }: CheckResultProps) {
  const { t } = useTranslation();
  const query = combine([useQuery(applicabilityCheckQuery(tenant, question))] as const);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="grc-applicability-result">
      <h2 id={headingId} className="grc-applicability-result-title">
        {t("applicability.result.title")}
      </h2>
      <QueryContent query={query} rows={5} isEmpty={() => false} empty="">
        {([result]) => (
          <>
            <Explanation result={result} />
            <Button onClick={onRestart}>{t("applicability.result.change")}</Button>
            {result.applies && <CreateFacility tenant={tenant} result={result} />}
          </>
        )}
      </QueryContent>
    </section>
  );
}

function Explanation({ result }: { result: ApplicabilityResult }) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const values = {
    people: number.format(result.people_supplied),
    threshold: number.format(result.threshold),
    thresholdCitation: keepTogether(result.citations.threshold),
    definitionCitation: keepTogether(result.citations.definition),
    registrationCitation: keepTogether(result.citations.registration),
    months: result.registration_within_months,
  };

  return (
    <div className="grc-applicability-explanation">
      <h3 className="grc-applicability-verdict" data-applies={result.applies}>
        {t(result.applies ? "applicability.result.applies" : "applicability.result.doesNotApply")}
      </h3>
      <p>
        {t(result.applies ? "applicability.result.above" : "applicability.result.below", values)}
      </p>
      {result.applies && <p>{t("applicability.result.registration", values)}</p>}
      {!result.binding && (
        // Static information, not an alert: it is read in order, not announced.
        <Alert
          type="info"
          role="note"
          showIcon
          title={t("applicability.result.preliminaryTitle")}
          description={t("applicability.result.preliminary")}
        />
      )}
    </div>
  );
}

/** Three months from today: when a facility that counts as critical has to be registered. */
function defaultRegistrationDate(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

interface FacilityFields {
  name: string;
  location: string;
  date: string;
}

function CreateFacility({ tenant, result }: { tenant: string; result: ApplicabilityResult }) {
  const { t } = useTranslation();
  const canChange = useCan("change");
  const client = useQueryClient();
  const key = useIdempotencyKey();
  const [form] = Form.useForm<FacilityFields>();
  const create = useMutation({
    mutationFn: (facility: NewCriticalFacility) =>
      createCriticalFacility(tenant, facility, key.current()),
    onSuccess: () => {
      key.renew();
    },
    // The dashboard's deadlines and the cockpit's Scope choice list the Scopes.
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: resourceKey(tenant, "scopes") }),
        client.invalidateQueries({ queryKey: resourceKey(tenant, "activity") }),
      ]),
  });

  if (create.data) {
    return <CreatedFacility scope={create.data} />;
  }
  if (!canChange) {
    return <p className="grc-meta">{t("applicability.create.readOnly")}</p>;
  }

  return (
    <Form<FacilityFields>
      form={form}
      layout="vertical"
      requiredMark={false}
      className="grc-applicability-form"
      initialValues={{ date: defaultRegistrationDate(result.registration_within_months) }}
      onValuesChange={() => {
        // A changed facility is a new request, not a retry of the last one.
        key.renew();
      }}
      onFinish={(values) => {
        create.mutate({
          name: values.name.trim(),
          location: values.location.trim(),
          critical_facility: {
            sector: result.sector,
            critical_service: result.critical_service,
            people_supplied: result.people_supplied,
            registration: { status: "planned", date: values.date },
          },
        });
      }}
    >
      <h3 className="grc-applicability-form-title">{t("applicability.create.title")}</h3>
      <Form.Item
        name="name"
        label={t("applicability.create.name")}
        rules={[
          { required: true, whitespace: true, message: t("applicability.create.nameMissing") },
        ]}
      >
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item
        name="location"
        label={t("applicability.create.location")}
        rules={[
          { required: true, whitespace: true, message: t("applicability.create.locationMissing") },
        ]}
      >
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item
        name="date"
        label={t("applicability.create.date")}
        extra={t("applicability.create.dateHint", { months: result.registration_within_months })}
        rules={[{ required: true, message: t("applicability.create.dateMissing") }]}
      >
        <Input type="date" />
      </Form.Item>
      {create.isError && (
        <Alert
          type="error"
          showIcon
          title={t("applicability.create.failed")}
          className="grc-applicability-error"
        />
      )}
      <Button type="primary" htmlType="submit" loading={create.isPending}>
        {t("applicability.create.submit")}
      </Button>
    </Form>
  );
}

function CreatedFacility({ scope }: { scope: Scope }) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const facility = scope.critical_facility;
  const heading = useRef<HTMLHeadingElement>(null);

  // The form and its button are gone; focus moves to what replaced them.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section aria-labelledby={headingId} className="grc-applicability-created">
      <h3 ref={heading} id={headingId} tabIndex={-1} className="grc-applicability-form-title">
        {t("applicability.created.title", { name: scope.name })}
      </h3>
      {facility && (
        <>
          <p>
            {t("applicability.created.registration", {
              date: formatDate(facility.registration.date, i18n.language),
            })}
          </p>
          <ul className="grc-plain-list">
            {facility.deadlines.map((deadline) => (
              <li key={deadline.citation} className="grc-applicability-deadline">
                <strong>{deadline.citation} KRITIS-DachG</strong>{" "}
                {t(`applicability.obligations.${OBLIGATIONS[deadline.citation] ?? "other"}`)}:{" "}
                {formatDate(deadline.due_date, i18n.language)}{" "}
                {!deadline.binding && <Tag>{t("dashboard.deadlines.projected")}</Tag>}
              </li>
            ))}
          </ul>
          <p className="grc-meta">{t("dashboard.deadlines.projectedHint")}</p>
        </>
      )}
    </section>
  );
}
