import { Button, Result, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";

export function TenantHome() {
  const { t } = useTranslation();
  const { tenantSlug = "" } = useParams();

  return (
    <Typography.Paragraph>{t("tenant.placeholder", { tenant: tenantSlug })}</Typography.Paragraph>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Result
      status="404"
      // Result renders its title as a plain div; the page still needs a real heading.
      title={<h1 style={{ margin: 0, fontSize: "inherit" }}>{t("notFound.title")}</h1>}
      extra={
        <Button type="primary" onClick={() => void navigate("/")}>
          {t("notFound.backHome")}
        </Button>
      }
    />
  );
}
