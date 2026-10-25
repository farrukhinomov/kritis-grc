import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp } from "antd";
import deDE from "antd/locale/de_DE";
import enUS from "antd/locale/en_US";
import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ThemeProvider } from "@/shared/theme/ThemeProvider";

const loadMotionFeatures = () =>
  import("@/shared/theme/motionFeatures").then((module) => module.default);

export function Providers({ client, children }: { client: QueryClient; children: ReactNode }) {
  const { i18n } = useTranslation();

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider locale={i18n.language === "en" ? enUS : deDE}>
        <AntApp>
          {/* Honors the operating system's reduced-motion setting everywhere. */}
          <MotionConfig reducedMotion="user">
            {/* strict: a full `motion.*` component would pull every feature back in. */}
            <LazyMotion features={loadMotionFeatures} strict>
              {children}
            </LazyMotion>
          </MotionConfig>
        </AntApp>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
