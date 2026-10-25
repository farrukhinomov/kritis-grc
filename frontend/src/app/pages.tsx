import { Button, Empty, Result } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { PageHeader } from "@/shared/ui/PageHeader";

import { useRouteTitleKey } from "./routeHandle";

/** Stands in for a screen until its own issue builds it; it already has its final title. */
export function PlaceholderPage() {
  const { t } = useTranslation();
  const titleKey = useRouteTitleKey();

  return (
    <>
      <PageHeader title={titleKey === undefined ? t("app.name") : t(titleKey)} />
      <Empty description={t("shell.placeholder")} />
    </>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Result
      status="404"
      // Result renders its title as a plain div; the page still needs a real heading.
      title={<h1 className="grc-result-title">{t("notFound.title")}</h1>}
      extra={
        <Button type="primary" onClick={() => void navigate("/")}>
          {t("notFound.backHome")}
        </Button>
      }
    />
  );
}
