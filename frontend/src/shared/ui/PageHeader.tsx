import { Flex, Typography } from "antd";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

/** The one h1 of a page; navigation moves focus here, so every page must render it. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Flex component="header" justify="space-between" align="flex-start" gap={16} wrap>
      <div>
        <Typography.Title level={1} style={{ marginBottom: description ? 4 : 24 }}>
          {title}
        </Typography.Title>
        {description && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
            {description}
          </Typography.Paragraph>
        )}
      </div>
      {actions && <Flex gap={8}>{actions}</Flex>}
    </Flex>
  );
}
