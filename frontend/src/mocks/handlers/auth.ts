import { http, HttpResponse } from "msw";

import type { FieldError } from "@/shared/api/client";
import { ROLES, type Role } from "@/shared/session/session";

import { currentSession, demoSession, setMockSession } from "../accounts";
import { isRecord, jsonBody, notAuthenticated, problem } from "../http";

const nonEmpty = (value: unknown) => typeof value === "string" && value.trim() !== "";
const isRole = (value: unknown): value is Role => ROLES.some((role) => role === value);

/**
 * Sign-in as the backend will offer it. The prototype has no accounts of its own, so a
 * password login is always refused, with the same answer for known and unknown emails;
 * the demo logins are the way in.
 */
export const authHandlers = [
  http.get("/api/v1/me", () => {
    const session = currentSession();
    return session ? HttpResponse.json(session) : notAuthenticated();
  }),

  http.post("/api/v1/auth/login", async ({ request }) => {
    const body = await jsonBody(request);
    const errors: FieldError[] = ["email", "password"]
      .filter((field) => !isRecord(body) || !nonEmpty(body[field]))
      .map((field) => ({ field, code: "required" }));
    if (errors.length > 0) {
      return problem(422, "validation_error", "Email and password are required.", errors);
    }
    return problem(400, "invalid_credentials", "Email or password is not correct.");
  }),

  http.post("/api/v1/auth/demo-login", async ({ request }) => {
    const body = await jsonBody(request);
    const role = isRecord(body) ? body.role : undefined;
    if (!isRole(role)) {
      return problem(422, "validation_error", "Choose one of the demo roles.", [
        { field: "role", code: role === undefined ? "required" : "invalid_choice" },
      ]);
    }
    setMockSession(role);
    return HttpResponse.json(demoSession(role));
  }),

  http.post("/api/v1/auth/logout", () => {
    setMockSession(null);
    return new HttpResponse(null, { status: 204 });
  }),
];
