import { Alert, Button, Modal, Radio, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { Implementation, ImplementationStatus } from "@/shared/api/types";
import { useCan } from "@/shared/session/sessionContext";
import { StatusBadge } from "@/shared/ui/StatusBadge/StatusBadge";

import { useUpdateStatus } from "./useUpdateStatus";

const STATUSES: readonly ImplementationStatus[] = [
  "open",
  "partial",
  "implemented",
  "not_applicable",
];

export function StatusPanel({
  tenant,
  implementation,
}: {
  tenant: string;
  implementation: Implementation;
}) {
  const { t } = useTranslation();
  const canChange = useCan("change");
  const update = useUpdateStatus(tenant, implementation);

  return (
    <div className="grc-drawer-panel">
      <Radio.Group
        aria-label={t("compliance.status")}
        className="grc-status-choice"
        value={implementation.status}
        // A second change before the first is saved would be based on the old version
        // and fail as a conflict with oneself.
        disabled={!canChange || update.isPending}
        data-rolled-back={update.rolledBack || undefined}
        onChange={(event) => {
          update.mutate(event.target.value as ImplementationStatus);
        }}
      >
        {STATUSES.map((status) => (
          <Radio key={status} value={status} className="grc-status-option">
            <StatusBadge status={status} />
          </Radio>
        ))}
      </Radio.Group>
      <div aria-live="polite" className="grc-drawer-feedback">
        {update.isPending && (
          <Typography.Text type="secondary">{t("drawer.saving")}</Typography.Text>
        )}
        {update.isSuccess && <Typography.Text type="success">{t("drawer.saved")}</Typography.Text>}
        {update.rolledBack && <Alert type="warning" showIcon title={t("drawer.rolledBack")} />}
      </div>
      <Modal
        open={update.conflict}
        title={t("drawer.conflict.title")}
        onCancel={update.dismissConflict}
        footer={
          <Button type="primary" onClick={update.dismissConflict}>
            {t("drawer.conflict.reload")}
          </Button>
        }
      >
        {t("drawer.conflict.description")}
      </Modal>
      {!canChange && (
        <Typography.Paragraph type="secondary">{t("drawer.readOnly")}</Typography.Paragraph>
      )}
    </div>
  );
}
