import { Button, Result } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useSession } from "@/shared/session/sessionContext";

import { PublicLayout } from "../PublicLayout";

/** A Tenant slug the user has no Membership for looks the same as one that doesn't exist. */
export function UnknownTenant() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [first] = useSession().memberships;

  return (
    <PublicLayout>
      <Result
        status="404"
        title={<h1 className="grc-result-title">{t("shell.unknownTenant.title")}</h1>}
        subTitle={t("shell.unknownTenant.description")}
        extra={
          first && (
            <Button type="primary" onClick={() => void navigate(`/t/${first.tenant.slug}`)}>
              {first.tenant.name}
            </Button>
          )
        }
      />
    </PublicLayout>
  );
}
