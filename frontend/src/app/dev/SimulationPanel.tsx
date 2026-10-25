import "./simulation-panel.css";

import { useQueryClient } from "@tanstack/react-query";
import { Button, Flex, Popover, Segmented, Switch, Typography } from "antd";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { resetDb } from "@/mocks/db";
import {
  FAILURE_RATES,
  type FailureRate,
  getSimulation,
  LATENCIES,
  type Latency,
  setSimulation,
  type SimulationSettings,
  subscribeSimulation,
} from "@/mocks/simulation";
import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";

const PERCENT = 100;

/**
 * Development-only switches for the mock API, to reach loading, error, conflict and
 * "calculation pending" states on purpose. Production builds don't contain it.
 */
export function SimulationPanel() {
  const { t } = useTranslation();

  return (
    <Popover
      trigger="click"
      placement="topLeft"
      title={t("dev.simulation.title")}
      content={<SimulationControls />}
    >
      <Button className="grc-dev-simulation" icon={<AnimatedIcon preset="settings" />}>
        {t("dev.simulation.open")}
      </Button>
    </Popover>
  );
}

export function SimulationControls() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useSyncExternalStore(subscribeSimulation, getSimulation);

  // Settings change what the server would answer, so everything on screen is refetched.
  const change = (patch: Partial<SimulationSettings>) => {
    setSimulation(patch);
    void queryClient.invalidateQueries();
  };

  return (
    <Flex vertical gap={16} className="grc-dev-simulation-controls">
      <Flex vertical gap={4}>
        <Typography.Text strong id="sim-latency">
          {t("dev.simulation.latency")}
        </Typography.Text>
        <Segmented<Latency>
          aria-labelledby="sim-latency"
          value={settings.latency}
          options={(Object.keys(LATENCIES) as Latency[]).map((latency) => ({
            value: latency,
            label: t(`dev.simulation.latencies.${latency}`),
          }))}
          onChange={(latency) => {
            change({ latency });
          }}
        />
      </Flex>
      <Flex vertical gap={4}>
        <Typography.Text strong id="sim-failures">
          {t("dev.simulation.failureRate")}
        </Typography.Text>
        <Segmented<FailureRate>
          aria-labelledby="sim-failures"
          value={settings.failureRate}
          options={FAILURE_RATES.map((rate) => ({
            value: rate,
            label: `${String(rate * PERCENT)} %`,
          }))}
          onChange={(failureRate) => {
            change({ failureRate });
          }}
        />
      </Flex>
      <label className="grc-dev-simulation-switch">
        <Switch
          checked={settings.conflictOnNextWrite}
          onChange={(conflictOnNextWrite) => {
            change({ conflictOnNextWrite });
          }}
        />
        {t("dev.simulation.conflict")}
      </label>
      <label className="grc-dev-simulation-switch">
        <Switch
          checked={settings.riskEngineDown}
          onChange={(riskEngineDown) => {
            change({ riskEngineDown });
          }}
        />
        {t("dev.simulation.riskEngineDown")}
      </label>
      <Button
        icon={<AnimatedIcon preset="refresh" />}
        onClick={() => {
          resetDb();
          void queryClient.invalidateQueries();
        }}
      >
        {t("dev.simulation.reset")}
      </Button>
      <Typography.Text type="secondary">{t("dev.simulation.hint")}</Typography.Text>
    </Flex>
  );
}
