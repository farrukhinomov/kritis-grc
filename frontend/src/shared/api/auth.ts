import { queryOptions } from "@tanstack/react-query";

import type { Role, Session } from "@/shared/session/session";

import { ApiError, apiGet, apiRequest } from "./client";

const UNAUTHORIZED = 401;

/** Not under the Tenant prefix: the session decides which Tenants exist for the user. */
export const sessionKey = ["session"] as const;

export const sessionQuery = queryOptions({
  queryKey: sessionKey,
  // Being signed out is a normal state, not an error, so the gate can redirect calmly.
  queryFn: async ({ signal }) => {
    try {
      return await apiGet<Session>("/api/v1/me", signal);
    } catch (error) {
      if (error instanceof ApiError && error.status === UNAUTHORIZED) {
        return null;
      }
      throw error;
    }
  },
  staleTime: Infinity,
});

export interface Credentials {
  email: string;
  password: string;
}

export function login(credentials: Credentials): Promise<Session> {
  return apiRequest<Session>("/api/v1/auth/login", { method: "POST", body: credentials });
}

/** Signs in without a password as the Demo Tenant's account for the role. */
export function demoLogin(role: Role): Promise<Session> {
  return apiRequest<Session>("/api/v1/auth/demo-login", { method: "POST", body: { role } });
}

export function logout(): Promise<undefined> {
  return apiRequest<undefined>("/api/v1/auth/logout", { method: "POST" });
}
