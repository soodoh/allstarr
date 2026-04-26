import type { Page } from "@playwright/test";

type CapturedEvent = {
  type: string;
  data: string;
};

/**
 * Captures SSE events emitted during an action.
 * Opens an EventSource in the browser context, runs the action,
 * then collects events of the specified types.
 */
export default async function captureSSEEvents(
  page: Page,
  baseUrl: string,
  eventTypes: string[],
  action: () => Promise<void>,
  options: {
    timeoutMs?: number;
    /** Stringified and executed in the browser context; do not close over test variables. */
    until?: (events: CapturedEvent[]) => boolean;
  } = {},
): Promise<CapturedEvent[]> {
  const timeoutMs = options.timeoutMs ?? 5000;

  await page.evaluate(
    ({ url, types }) => {
      const globalWindow = window as typeof window & {
        __allstarrSseCapture?: {
          es: EventSource;
          ready: boolean;
          events: CapturedEvent[];
        };
      };

      globalWindow.__allstarrSseCapture?.es.close();

      const events: CapturedEvent[] = [];
      const es = new EventSource(`${url}/api/events`);
      const capture = {
        es,
        ready: false,
        events,
      };

      es.addEventListener("open", () => {
        capture.ready = true;
      });

      for (const type of types) {
        es.addEventListener(type, (e) => {
          events.push({ type, data: (e as MessageEvent).data });
        });
      }

      globalWindow.__allstarrSseCapture = capture;
    },
    { url: baseUrl, types: eventTypes },
  );

  let events: CapturedEvent[] = [];

  try {
    await page.waitForFunction(
      () => {
        const globalWindow = window as typeof window & {
          __allstarrSseCapture?: { ready: boolean };
        };
        return globalWindow.__allstarrSseCapture?.ready === true;
      },
      { timeout: timeoutMs },
    );

    // Perform the action while SSE is listening
    await action();

    if (options.until) {
      await page.waitForFunction(
        (predicateText) => {
          const globalWindow = window as typeof window & {
            __allstarrSseCapture?: {
              events: CapturedEvent[];
            };
          };
          const predicate = new Function(
            "events",
            `return (${predicateText})(events);`,
          ) as (events: CapturedEvent[]) => boolean;
          return predicate(globalWindow.__allstarrSseCapture?.events ?? []);
        },
        options.until.toString(),
        { timeout: timeoutMs },
      );
    }
  } finally {
    events = await page.evaluate(() => {
      const globalWindow = window as typeof window & {
        __allstarrSseCapture?: {
          es: EventSource;
          events: CapturedEvent[];
        };
      };
      const capture = globalWindow.__allstarrSseCapture;
      if (!capture) {
        return [];
      }
      capture.es.close();
      delete globalWindow.__allstarrSseCapture;
      return capture.events;
    });
  }

  return events;
}
