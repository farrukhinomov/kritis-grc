import { Alert } from "antd";
import { useTranslation } from "react-i18next";

import { ApiError } from "@/shared/api/client";

export function SaveError({ error }: { error: unknown }) {
  const { t } = useTranslation();

  if (!error) {
    return null;
  }
  const denied = error instanceof ApiError && error.code === "permission_denied";
  return (
    <Alert
      type="error"
      showIcon
      title={t(denied ? "evidence.errors.permission" : "evidence.errors.save")}
    />
  );
}
