import "./login.css";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Divider, Form, Input, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";

import { type Credentials, demoLogin, login, sessionKey } from "@/shared/api/auth";
import { ApiError, type FieldError } from "@/shared/api/client";
import { RETURN_PARAM } from "@/shared/session/paths";
import type { Role, Session } from "@/shared/session/session";

/** Decided at build time, like the mock API itself. */
const SHOWS_DEMO_DATA = import.meta.env.VITE_API_MOCKING === "enabled";

const DEMO_ROLES: readonly Role[] = ["grc_manager", "auditor"];

/**
 * Only paths inside a Tenant are followed after sign-in. Anything else, such as
 * `//other.example`, would turn the login page into a redirect to someone else's site.
 */
function returnPath(next: string | null): string | null {
  return next?.startsWith("/t/") ? next : null;
}

function useSignIn<T>(signIn: (input: T) => Promise<Session>) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  return useMutation({
    mutationFn: signIn,
    onSuccess: async (session) => {
      // A previous user's cached data must never show in the new session.
      client.clear();
      client.setQueryData(sessionKey, session);
      const first = session.memberships[0];
      const target =
        returnPath(params.get(RETURN_PARAM)) ?? (first ? `/t/${first.tenant.slug}/dashboard` : "/");
      await navigate(target, { replace: true });
    },
  });
}

export function LoginPage() {
  const { t } = useTranslation();

  return (
    <Card className="grc-login">
      <Typography.Title level={1}>{t("auth.title")}</Typography.Title>
      <DemoLogin />
      <Divider plain>{t("auth.orWithEmail")}</Divider>
      <PasswordLogin />
    </Card>
  );
}

/** The two ways into the Demo Tenant, each saying what the role can do. */
function DemoLogin() {
  const { t } = useTranslation();
  const signIn = useSignIn(demoLogin);

  return (
    <section aria-labelledby="demo-login-title">
      <Typography.Title level={2} id="demo-login-title" className="grc-login-subtitle">
        {t("auth.demo.title")}
      </Typography.Title>
      {signIn.isError && (
        <Alert type="error" showIcon className="grc-login-alert" title={t("auth.demo.failed")} />
      )}
      <div className="grc-login-roles">
        {DEMO_ROLES.map((role) => (
          <div key={role} className="grc-login-role">
            <Button
              type={role === "grc_manager" ? "primary" : "default"}
              size="large"
              block
              loading={signIn.isPending && signIn.variables === role}
              disabled={signIn.isPending && signIn.variables !== role}
              aria-describedby={`demo-login-${role}`}
              onClick={() => {
                signIn.mutate(role);
              }}
            >
              {t(`auth.demo.${role}.action`)}
            </Button>
            <Typography.Text type="secondary" id={`demo-login-${role}`}>
              {t(`auth.demo.${role}.description`)}
            </Typography.Text>
          </div>
        ))}
      </div>
    </section>
  );
}

const FORM_FIELDS: readonly string[] = ["email", "password"] satisfies (keyof Credentials)[];

/** The server's field errors this form can show on a field; the rest need the general alert. */
function fieldErrors(error: unknown): FieldError[] {
  return error instanceof ApiError
    ? error.errors.filter(({ field }) => FORM_FIELDS.includes(field))
    : [];
}

function PasswordLogin() {
  const { t } = useTranslation();
  const [form] = Form.useForm<Credentials>();
  const signIn = useSignIn(login);
  const error = signIn.error;
  const placed = fieldErrors(error);
  const unplaced = error instanceof ApiError ? error.errors.length - placed.length : 0;

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      disabled={signIn.isPending}
      onFinish={(credentials) => {
        signIn.mutate(credentials, {
          onError: (failure) => {
            // Field errors from the server land on their fields, like the local checks.
            form.setFields(
              fieldErrors(failure).map(({ field, code }) => ({
                name: field as keyof Credentials,
                errors: [
                  t(
                    `auth.fields.${field === "email" ? "email" : "password"}.${code === "required" ? "required" : "invalid"}`,
                  ),
                ],
              })),
            );
          },
        });
      }}
    >
      {error && (placed.length === 0 || unplaced > 0) && (
        <Alert
          type="error"
          showIcon
          className="grc-login-alert"
          title={t(
            error instanceof ApiError && error.code === "invalid_credentials"
              ? "auth.invalidCredentials"
              : "auth.failed",
          )}
        />
      )}
      <Form.Item
        name="email"
        label={t("auth.fields.email.label")}
        rules={[
          { required: true, whitespace: true, message: t("auth.fields.email.required") },
          { type: "email", message: t("auth.fields.email.invalid") },
        ]}
      >
        <Input type="email" autoComplete="username" />
      </Form.Item>
      <Form.Item
        name="password"
        label={t("auth.fields.password.label")}
        rules={[{ required: true, message: t("auth.fields.password.required") }]}
      >
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <Button htmlType="submit" block loading={signIn.isPending}>
        {t("auth.submit")}
      </Button>
      {SHOWS_DEMO_DATA && (
        <Typography.Paragraph type="secondary" className="grc-login-hint">
          {t("auth.prototypeHint")}
        </Typography.Paragraph>
      )}
    </Form>
  );
}
