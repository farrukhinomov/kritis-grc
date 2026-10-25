import { Alert, Button, Card, Flex, Skeleton, Typography } from "antd";
import { CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { CHECK_NAMES, type DisplayedCheckState, type SystemStatus, useSystemStatus } from "./api";

const ICONS = { ok: CircleCheck, unavailable: CircleX, unknown: CircleHelp } as const;
const TONES = { ok: "success", unavailable: "danger", unknown: "secondary" } as const;

export function StatusPage() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useSystemStatus();

  return (
    <Card aria-busy={isPending}>
      <Typography.Title level={1}>{t("status.title")}</Typography.Title>
      <Typography.Paragraph type="secondary">{t("status.subtitle")}</Typography.Paragraph>
      {isPending && <Skeleton active paragraph={{ rows: CHECK_NAMES.length }} title={false} />}
      {isError && (
        <Alert
          type="error"
          showIcon
          title={t("status.loadError")}
          action={<Button onClick={() => void refetch()}>{t("status.retry")}</Button>}
        />
      )}
      {data && <StatusReport status={data} />}
    </Card>
  );
}

function StatusReport({ status }: { status: SystemStatus }) {
  const { t } = useTranslation();
  const healthy = status.status === "ok";

  return (
    <>
      <Alert
        type={healthy ? "success" : "warning"}
        showIcon
        title={t(healthy ? "status.summary.ok" : "status.summary.degraded")}
      />
      {/* An explicit role: Safari's VoiceOver drops list semantics once markers are hidden. */}
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- see the line above */}
      <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {CHECK_NAMES.map((name, index) => (
          <motion.li
            key={name}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Flex justify="space-between" align="center" style={{ paddingBlock: 12 }}>
              <Typography.Text>{t(`status.checks.${name}`)}</Typography.Text>
              <CheckBadge state={status.checks[name] ?? "unknown"} />
            </Flex>
          </motion.li>
        ))}
      </ul>
    </>
  );
}

function CheckBadge({ state }: { state: DisplayedCheckState }) {
  const { t } = useTranslation();
  const Icon = ICONS[state];

  return (
    <Typography.Text type={TONES[state]}>
      <Icon aria-hidden size={16} style={{ verticalAlign: "text-bottom", marginInlineEnd: 6 }} />
      {t(`status.states.${state}`)}
    </Typography.Text>
  );
}
