import "./applicability.css";

import { useQuery } from "@tanstack/react-query";
import { Button, InputNumber, Radio, Steps } from "antd";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { criticalServicesQuery } from "@/shared/api/organization";
import type { ApplicabilityQuestion, CriticalService, Scope, Sector } from "@/shared/api/types";
import { useIsWideScreen } from "@/shared/lib/breakpoints";
import { combine } from "@/shared/lib/combineQueries";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

import { CheckResult } from "./CheckResult";

/** The sectors of the KRITIS-Dachgesetz, in the order the law lists them. */
const SECTORS: readonly Sector[] = [
  "energy",
  "transport",
  "finance",
  "social_security",
  "health",
  "water",
  "food",
  "it_telecom",
  "space",
  "municipal_waste",
];

type Step = "sector" | "service" | "supply" | "result";
const STEPS: readonly Step[] = ["sector", "service", "supply", "result"];

/**
 * "Bin ich betroffen?": Sector, Critical Service and the number of people supplied lead to
 * a result the server derives and the page explains with its legal citations. The page
 * never decides itself; it asks the rule and words the answer.
 */
export function ApplicabilityPage() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const catalogue = useQuery(criticalServicesQuery(tenant));
  const [step, setStep] = useState<Step>("sector");
  const [sector, setSector] = useState<Sector | null>(null);
  const [service, setService] = useState<CriticalService | null>(null);
  const [people, setPeople] = useState<number | null>(null);
  const [question, setQuestion] = useState<ApplicabilityQuestion | null>(null);
  // Kept here, not in the result, so changing the answers can't offer the same facility again.
  const [created, setCreated] = useState<Scope | null>(null);
  const peopleId = useId();
  const wide = useIsWideScreen();
  const stepHeading = useRef<HTMLElement>(null);
  const moved = useRef(false);

  // A step replaces the one whose button was just pressed, and focus would fall to the
  // page. It moves to the new step's question instead, so keyboard and screen reader
  // users continue there; on the first render nothing has moved yet.
  useEffect(() => {
    if (moved.current) {
      stepHeading.current?.focus();
    }
  }, [step]);

  const go = (target: Step) => {
    moved.current = true;
    setStep(target);
  };
  const restart = () => {
    setSector(null);
    setService(null);
    setPeople(null);
    setQuestion(null);
    setCreated(null);
    go("sector");
  };

  const services = catalogue.data?.items ?? [];
  const definition = services.find(
    (item) => item.sector === sector && item.critical_service === service,
  );
  const validPeople = people !== null && Number.isInteger(people) && people > 0;
  const questionRef = (element: HTMLElement | null) => {
    stepHeading.current = element;
  };

  return (
    <>
      <PageHeader title={t("nav.applicability")} description={t("applicability.description")} />
      {/* Four labelled steps don't fit a phone's width; there one line says where you are. */}
      {wide ? (
        <Steps
          className="grc-applicability-steps"
          size="small"
          current={STEPS.indexOf(step)}
          items={STEPS.map((item) => ({ title: t(`applicability.steps.${item}`) }))}
        />
      ) : (
        <p className="grc-applicability-steps grc-meta">
          {t("applicability.stepOf", {
            number: STEPS.indexOf(step) + 1,
            total: STEPS.length,
            title: t(`applicability.steps.${step}`),
          })}
        </p>
      )}
      <div className="grc-applicability-panel">
        {step === "sector" && (
          <QueryContent
            query={combine([catalogue] as const)}
            rows={6}
            isEmpty={() => false}
            empty=""
          >
            {() => (
              <fieldset className="grc-applicability-fieldset">
                <legend ref={questionRef} tabIndex={-1}>
                  {t("applicability.sector.question")}
                </legend>
                <Radio.Group
                  className="grc-applicability-options"
                  value={sector}
                  onChange={(event) => {
                    setSector(event.target.value as Sector);
                    setService(null);
                  }}
                  options={SECTORS.map((item) => ({
                    value: item,
                    disabled: !services.some((entry) => entry.sector === item),
                    label: t(`applicability.sectors.${item}`),
                  }))}
                />
                <p className="grc-meta">
                  {t("applicability.sector.notAvailable")} {t("applicability.sector.basis")}
                </p>
                <div className="grc-applicability-actions">
                  <Button
                    type="primary"
                    disabled={sector === null}
                    onClick={() => {
                      go("service");
                    }}
                  >
                    {t("applicability.next")}
                  </Button>
                </div>
              </fieldset>
            )}
          </QueryContent>
        )}

        {step === "service" && sector && (
          <fieldset className="grc-applicability-fieldset">
            <legend ref={questionRef} tabIndex={-1}>
              {t("applicability.service.question")}
            </legend>
            <Radio.Group
              className="grc-applicability-options"
              value={service}
              onChange={(event) => {
                setService(event.target.value as CriticalService);
              }}
              options={services
                .filter((item) => item.sector === sector)
                .map((item) => ({
                  value: item.critical_service,
                  label: (
                    <span className="grc-applicability-option">
                      {t(`applicability.services.${item.critical_service}.name`)}
                      <span className="grc-meta">
                        {t(`applicability.services.${item.critical_service}.measure`)}
                      </span>
                    </span>
                  ),
                }))}
            />
            <div className="grc-applicability-actions">
              <Button
                onClick={() => {
                  go("sector");
                }}
              >
                {t("applicability.back")}
              </Button>
              <Button
                type="primary"
                disabled={service === null}
                onClick={() => {
                  go("supply");
                }}
              >
                {t("applicability.next")}
              </Button>
            </div>
          </fieldset>
        )}

        {step === "supply" && definition && (
          <form
            className="grc-applicability-fieldset"
            onSubmit={(event) => {
              event.preventDefault();
              if (validPeople) {
                setQuestion({
                  sector: definition.sector,
                  critical_service: definition.critical_service,
                  people_supplied: people,
                });
                go("result");
              }
            }}
          >
            <label
              ref={questionRef}
              tabIndex={-1}
              htmlFor={peopleId}
              className="grc-applicability-label"
            >
              {t("applicability.supply.label")}
            </label>
            <InputNumber
              id={peopleId}
              className="grc-applicability-number"
              min={1}
              precision={0}
              inputMode="numeric"
              value={people}
              onChange={(value) => {
                setPeople(value);
              }}
            />
            <p className="grc-meta">
              {t(`applicability.services.${definition.critical_service}.hint`)}
            </p>
            <div className="grc-applicability-actions">
              <Button
                onClick={() => {
                  go("service");
                }}
              >
                {t("applicability.back")}
              </Button>
              <Button type="primary" htmlType="submit" disabled={!validPeople}>
                {t("applicability.check")}
              </Button>
            </div>
          </form>
        )}

        {step === "result" && question && (
          <CheckResult
            tenant={tenant}
            question={question}
            headingRef={questionRef}
            created={created}
            onCreated={setCreated}
            onChange={() => {
              go("supply");
            }}
            onRestart={restart}
          />
        )}
      </div>
    </>
  );
}
