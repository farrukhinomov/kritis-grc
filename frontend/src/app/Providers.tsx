import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp, ConfigProvider } from "antd";
import deDE from "antd/locale/de_DE";
import enUS from "antd/locale/en_US";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { antdTheme } from "@/shared/theme/tokens";

export function Providers({ client, children }: { client: QueryClient; children: ReactNode }) {
  const { i18n } = useTranslation();

  return (
    <QueryClientProvider client={client}>
      <ConfigProvider theme={antdTheme("light")} locale={i18n.language === "en" ? enUS : deDE}>
        <AntApp>
          {/* Honors the operating system's reduced-motion setting everywhere. */}
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
