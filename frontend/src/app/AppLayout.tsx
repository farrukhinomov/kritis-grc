import { Flex, Layout, theme, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";

import { LanguageSwitch } from "@/shared/ui/LanguageSwitch";

export function AppLayout() {
  const { t } = useTranslation();
  const { token } = theme.useToken();

  return (
    <Layout style={{ minHeight: "100dvh" }}>
      <Layout.Header>
        <Flex align="center" justify="space-between" style={{ height: "100%" }}>
          <Typography.Text strong style={{ color: token.colorTextLightSolid }}>
            {t("app.name")}
          </Typography.Text>
          <LanguageSwitch />
        </Flex>
      </Layout.Header>
      <Layout.Content style={{ padding: 16, maxWidth: 960, width: "100%", marginInline: "auto" }}>
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}
