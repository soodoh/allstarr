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
  timeoutMs = 5000,
): Promise<CapturedEvent[]> {
  // Inject an EventSource listener into the page
  const handle = await page.evaluateHandle(
    ({ url, types, timeout }) => {
      return new Promise<CapturedEvent[]>((resolve) => {
        const events: CapturedEvent[] = [];
        const es = new EventSource(`${url}/api/sse`);

        for (const type of types) {
          es.addEventListener(type, (e) => {
            events.push({ type, data: (e as MessageEvent).data });
          });
        }

        setTimeout(() => {
          es.close();
          resolve(events);
        }, timeout);
      });
    },
    { url: baseUrl, types: eventTypes, timeout: timeoutMs },
  );

  // Perform the action while SSE is listening
  await action();

  // Wait for the SSE collection to complete
  const events = await handle.jsonValue();
  await handle.dispose();
  return events;
}
