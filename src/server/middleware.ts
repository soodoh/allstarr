import { createServerFn } from "@tanstack/react-start";
import { auth } from "src/lib/auth";
import { getRequest } from "@tanstack/react-start/server";

export const getAuthSessionFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    return session;
  },
);

// oxlint-disable-next-line explicit-module-boundary-types
export async function requireAuth() {
  const session = await getAuthSessionFn();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
