// oxlint-disable import/prefer-default-export
import { QueryClient } from "@tanstack/react-query";

// SSR-safe QueryClient factory.
// On the server (typeof window === "undefined") we always create a new client
// so each request starts fresh. On the browser we reuse a singleton so the
// cache persists across navigations.

let browserClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  // oxlint-disable-next-line no-typeof-undefined
  if (typeof globalThis.window === "undefined") {
    // Server: new client every time
    return new QueryClient({
      defaultOptions: {
        queries: {
          // Data is considered fresh for 30 s – avoids re-fetching on tab-focus
          // or when navigating between routes that share the same query.
          staleTime: 30_000,
        },
      },
    });
  }

  // Browser: reuse singleton
  if (!browserClient) {
    browserClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
        },
      },
    });
  }

  return browserClient;
}
