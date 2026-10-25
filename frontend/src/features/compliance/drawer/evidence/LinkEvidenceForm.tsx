import { Button, Form, Input } from "antd";
import { useTranslation } from "react-i18next";

import { type EvidenceTarget, useAddEvidence, useIdempotencyKey } from "./useAddEvidence";
import { SaveError } from "./SaveError";

export function LinkEvidenceForm({ target }: { target: EvidenceTarget }) {
  const { t } = useTranslation();
  const [form] = Form.useForm<{ title: string; url: string }>();
  const key = useIdempotencyKey();
  const add = useAddEvidence(target, () => {
    key.renew();
    form.resetFields();
  });

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      onValuesChange={() => {
        key.renew();
      }}
      onFinish={({ title, url }) => {
        add.mutate({
          evidence: { kind: "link", title: title.trim(), url: url.trim() },
          key: key.current(),
        });
      }}
    >
      <Form.Item
        name="title"
        label={t("evidence.title")}
        rules={[{ required: true, whitespace: true, message: t("evidence.errors.titleRequired") }]}
      >
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item
        name="url"
        label={t("evidence.url")}
        rules={[
          { required: true, message: t("evidence.errors.urlInvalid") },
          { type: "url", message: t("evidence.errors.urlInvalid") },
          {
            // Only web addresses: other schemes such as javascript: must never be stored.
            pattern: /^https?:\/\//i,
            message: t("evidence.errors.urlInvalid"),
          },
        ]}
      >
        <Input type="url" inputMode="url" placeholder="https://" />
      </Form.Item>
      <SaveError error={add.error} />
      <Button type="primary" htmlType="submit" loading={add.isPending}>
        {t("evidence.add")}
      </Button>
    </Form>
  );
}
