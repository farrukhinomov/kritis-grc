import { Alert, Card, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { operator } from "./operator";

function Operator() {
  const { t } = useTranslation();
  const details = operator();
  if (!details) {
    return <Alert type="warning" showIcon title={t("legal.notConfigured")} />;
  }
  return (
    <address className="grc-legal-operator">
      <Typography.Paragraph>
        {details.name}
        {details.address.split("|").map((line) => (
          <span key={line}>
            <br />
            {line.trim()}
          </span>
        ))}
      </Typography.Paragraph>
      <Typography.Paragraph>
        {t("legal.email")}: <a href={`mailto:${details.email}`}>{details.email}</a>
      </Typography.Paragraph>
    </address>
  );
}

const PRIVACY_SECTIONS = [
  "controller",
  "data",
  "cookies",
  "logs",
  "demo",
  "hosting",
  "rights",
] as const;

export function ImprintPage() {
  const { t } = useTranslation();
  return (
    <Card>
      <Typography.Title level={1}>{t("legal.imprint.title")}</Typography.Title>
      <Typography.Paragraph type="secondary">{t("legal.imprint.basis")}</Typography.Paragraph>
      <Operator />
      <Typography.Paragraph>{t("legal.imprint.prototype")}</Typography.Paragraph>
    </Card>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <Card>
      <Typography.Title level={1}>{t("legal.privacy.title")}</Typography.Title>
      {PRIVACY_SECTIONS.map((section) => (
        <section key={section}>
          <Typography.Title level={2}>{t(`legal.privacy.${section}.title`)}</Typography.Title>
          <Typography.Paragraph>{t(`legal.privacy.${section}.text`)}</Typography.Paragraph>
          {section === "controller" && <Operator />}
        </section>
      ))}
    </Card>
  );
}
