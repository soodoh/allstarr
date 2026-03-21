# Real-Time Queue Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the download queue page with VueTorrent-inspired visuals, adaptive server-side polling, and SSE-driven real-time progress updates.

**Architecture:** Extend the existing SSE event bus to stream full queue snapshots at adaptive intervals (4s when active, 15s when idle, 60s when no viewers). React Query stays as the state container but drops polling — SSE writes directly into the cache. Download actions (pause/resume/priority) use optimistic updates.

**Tech Stack:** TanStack Start, React Query, SSE (EventSource), Drizzle ORM, Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-20-realtime-queue-redesign-design.md`

---

## File Structure

### New Files

| File                                                  | Responsibility                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/components/activity/queue-summary-bar.tsx`       | Transfer stats (speeds, counts) + status filter pills + SSE indicator         |
| `src/components/activity/queue-item-row.tsx`          | Single download row with progress background, status coloring, inline actions |
| `src/components/activity/queue-connection-banner.tsx` | Persistent warning banner for client connection failures                      |

### Modified Files

| File                                              | Changes                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/server/download-clients/types.ts`            | Add `CanonicalStatus` type, optional `pauseDownload`/`resumeDownload`/`setPriority` to provider interface |
| `src/server/download-clients/qbittorrent.ts`      | Add status normalization in `getDownloads`, implement pause/resume/setPriority                            |
| `src/server/download-clients/transmission.ts`     | Add status normalization in `getDownloads`, implement pause/resume/setPriority                            |
| `src/server/download-clients/deluge.ts`           | Add status normalization in `getDownloads`, implement pause/resume/setPriority                            |
| `src/server/download-clients/rtorrent.ts`         | Add status normalization in `getDownloads`, implement pause/resume/setPriority                            |
| `src/server/download-clients/sabnzbd.ts`          | Add status normalization in `getDownloads`, implement pause/resume/setPriority                            |
| `src/server/download-clients/nzbget.ts`           | Add status normalization in `getDownloads`, implement pause/resume/setPriority                            |
| `src/server/download-clients/blackhole.ts`        | Add status normalization in `getDownloads`                                                                |
| `src/server/event-bus.ts`                         | Add `queueProgress` event type, add `getClientCount()` method                                             |
| `src/server/queue.ts`                             | Add `pauseDownloadFn`, `resumeDownloadFn`, `setDownloadPriorityFn`                                        |
| `src/server/download-manager.ts`                  | Emit `queueProgress` with full snapshot after refresh, support adaptive scheduling                        |
| `src/server/scheduler/index.ts`                   | Export `rescheduleTask()` for adaptive interval changes                                                   |
| `src/server/scheduler/tasks/refresh-downloads.ts` | Self-scheduling via `setTimeout` based on SSE client count + active downloads                             |
| `src/hooks/use-server-events.ts`                  | Handle `queueProgress` → write to React Query cache, expose `isConnected` state                           |
| `src/lib/queries/queue.ts`                        | Remove `refetchInterval`, remove `queueCountQuery`, add SSE disconnect fallback                           |
| `src/lib/query-keys.ts`                           | Remove `queue.count` key                                                                                  |
| `src/lib/validators.ts`                           | Add `pauseDownloadSchema`, `resumeDownloadSchema`, `setDownloadPrioritySchema`                            |
| `src/components/activity/queue-tab.tsx`           | Full rewrite — container with filter state, optimistic updates, new child components                      |
| `src/components/layout/app-sidebar.tsx`           | Replace `queueCountQuery` with `select` on `queueListQuery`                                               |

---

## Task 1: Extend Provider Interface and Types

**Files:**

- Modify: `src/server/download-clients/types.ts`

- [ ] **Step 1: Add `CanonicalStatus` type and update `DownloadItem`**

```typescript
// Add after DownloadProtocol type (line 1)
export type CanonicalStatus =
  | "downloading"
  | "completed"
  | "paused"
  | "queued"
  | "failed";

// Update DownloadItem.status from `string` to `CanonicalStatus` (line 43)
// Change: status: string;
// To:     status: CanonicalStatus;
```

- [ ] **Step 2: Add optional action methods to `DownloadClientProvider`**

```typescript
// Add after removeDownload in the provider type (after line 64)
pauseDownload?(config: ConnectionConfig, id: string): Promise<void>;
resumeDownload?(config: ConnectionConfig, id: string): Promise<void>;
setPriority?(config: ConnectionConfig, id: string, priority: number): Promise<void>;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bunx tsc --noEmit 2>&1 | head -30`
Expected: Type errors in download client files where `status: string` no longer matches `CanonicalStatus`. This is expected — we fix them in Task 2.

- [ ] **Step 4: Commit**

```bash
git add src/server/download-clients/types.ts
git commit -m "feat(queue): add CanonicalStatus type and action methods to provider interface"
```

---

## Task 2: Status Normalization in All Providers

**Files:**

- Modify: `src/server/download-clients/qbittorrent.ts`
- Modify: `src/server/download-clients/transmission.ts`
- Modify: `src/server/download-clients/deluge.ts`
- Modify: `src/server/download-clients/rtorrent.ts`
- Modify: `src/server/download-clients/sabnzbd.ts`
- Modify: `src/server/download-clients/nzbget.ts`
- Modify: `src/server/download-clients/blackhole.ts`

Each provider's `getDownloads()` currently passes raw status strings. Add a normalization function to each that maps to `CanonicalStatus`.

- [ ] **Step 1: qBittorrent — add status normalization**

Add a `normalizeStatus` function in `qbittorrent.ts`:

```typescript
import type { CanonicalStatus } from "./types";

function normalizeStatus(state: string): CanonicalStatus {
  switch (state) {
    case "downloading":
    case "stalledDL":
    case "forcedDL":
    case "metaDL":
    case "forcedMetaDL":
    case "allocating":
    case "checkingDL":
    case "checkingResumeData":
      return "downloading";
    case "uploading":
    case "stalledUP":
    case "forcedUP":
    case "checkingUP":
      return "completed";
    case "pausedDL":
    case "pausedUP":
      return "paused";
    case "queuedDL":
    case "queuedUP":
    case "queuedForChecking":
      return "queued";
    case "error":
    case "missingFiles":
      return "failed";
    default:
      return "downloading";
  }
}
```

Then update the `getDownloads()` return mapping to use `status: normalizeStatus(t.state)` instead of `status: t.state`.

- [ ] **Step 2: Transmission — add status normalization**

Add in `transmission.ts`:

```typescript
import type { CanonicalStatus } from "./types";

function normalizeStatus(status: number): CanonicalStatus {
  switch (status) {
    case 4:
      return "downloading";
    case 5:
    case 6:
      return "completed";
    case 0:
      return "paused";
    case 1:
    case 2:
    case 3:
      return "queued";
    case 7:
      return "failed";
    default:
      return "downloading";
  }
}
```

Update `getDownloads()` to use `status: normalizeStatus(t.status)`.

- [ ] **Step 3: Deluge — add status normalization**

Add in `deluge.ts`:

```typescript
import type { CanonicalStatus } from "./types";

function normalizeStatus(state: string, progress: number): CanonicalStatus {
  switch (state) {
    case "Downloading":
    case "Allocating":
    case "Checking":
      return "downloading";
    case "Seeding":
      return "completed";
    case "Paused":
      return progress >= 100 ? "completed" : "paused";
    case "Queued":
      return "queued";
    case "Error":
      return "failed";
    default:
      return progress >= 100 ? "completed" : "downloading";
  }
}
```

Update `getDownloads()` to use `status: normalizeStatus(info.state, info.progress)`.

- [ ] **Step 4: rTorrent — add status normalization**

Add in `rtorrent.ts`:

```typescript
import type { CanonicalStatus } from "./types";

function normalizeStatus(
  state: number,
  complete: number,
  hashing: number,
): CanonicalStatus {
  if (complete === 1) return "completed";
  if (hashing !== 0) return "queued";
  if (state === 0) return "paused";
  return "downloading";
}
```

Update `getDownloads()` to pass the relevant parsed fields and use the normalized status.

- [ ] **Step 5: SABnzbd — add status normalization**

Add in `sabnzbd.ts`:

```typescript
import type { CanonicalStatus } from "./types";

function normalizeQueueStatus(status: string): CanonicalStatus {
  switch (status) {
    case "Downloading":
    case "Fetching":
    case "Grabbing":
      return "downloading";
    case "Paused":
      return "paused";
    case "Queued":
      return "queued";
    default:
      return "downloading";
  }
}

function normalizeHistoryStatus(status: string): CanonicalStatus {
  switch (status) {
    case "Completed":
      return "completed";
    case "Failed":
      return "failed";
    default:
      return "completed";
  }
}
```

Update `parseQueueSlots()` and `parseHistorySlots()` to use normalized statuses.

- [ ] **Step 6: NZBGet — add status normalization**

Add in `nzbget.ts`:

```typescript
import type { CanonicalStatus } from "./types";

function normalizeActiveStatus(status: string): CanonicalStatus {
  switch (status) {
    case "DOWNLOADING":
    case "POSTPROCESSING":
    case "UNPACKING":
    case "MOVING":
    case "RENAMING":
      return "downloading";
    case "PAUSED":
    case "PAUSING":
      return "paused";
    case "QUEUED":
      return "queued";
    default:
      return "downloading";
  }
}

function normalizeHistoryStatus(status: string): CanonicalStatus {
  switch (status) {
    case "SUCCESS":
      return "completed";
    default:
      return "failed";
  }
}
```

Update `getDownloads()` to use normalized statuses.

- [ ] **Step 7: Blackhole — set status to "queued"**

In `blackhole.ts`, the `getDownloads()` currently returns `status: "Pending"`. Change to `status: "queued" as CanonicalStatus`.

- [ ] **Step 8: Verify TypeScript compiles cleanly**

Run: `bunx tsc --noEmit`
Expected: No errors. All providers now return `CanonicalStatus`.

- [ ] **Step 9: Run linter**

Run: `bun run lint`
Expected: No new lint errors.

- [ ] **Step 10: Commit**

```bash
git add src/server/download-clients/
git commit -m "feat(queue): normalize download status to canonical values across all providers"
```

---

## Task 3: Provider Action Methods (Pause/Resume/Priority)

**Files:**

- Modify: `src/server/download-clients/qbittorrent.ts`
- Modify: `src/server/download-clients/transmission.ts`
- Modify: `src/server/download-clients/deluge.ts`
- Modify: `src/server/download-clients/rtorrent.ts`
- Modify: `src/server/download-clients/sabnzbd.ts`
- Modify: `src/server/download-clients/nzbget.ts`

Blackhole gets no action methods (optional interface, so no changes needed).

- [ ] **Step 1: qBittorrent — add pause/resume/setPriority**

```typescript
async pauseDownload(config: ConnectionConfig, id: string): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const cookie = await getSessionCookie(baseUrl, config.username, config.password);
  await fetchWithTimeout(`${baseUrl}/api/v2/torrents/pause`, {
    method: "POST",
    headers: { Cookie: cookie, Referer: baseUrl, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ hashes: id }),
  });
},

async resumeDownload(config: ConnectionConfig, id: string): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const cookie = await getSessionCookie(baseUrl, config.username, config.password);
  await fetchWithTimeout(`${baseUrl}/api/v2/torrents/resume`, {
    method: "POST",
    headers: { Cookie: cookie, Referer: baseUrl, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ hashes: id }),
  });
},

async setPriority(config: ConnectionConfig, id: string, priority: number): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const cookie = await getSessionCookie(baseUrl, config.username, config.password);
  // qBittorrent uses topPrio/bottomPrio/increasePrio/decreasePrio
  const action = priority > 0 ? "increasePrio" : "decreasePrio";
  await fetchWithTimeout(`${baseUrl}/api/v2/torrents/${action}`, {
    method: "POST",
    headers: { Cookie: cookie, Referer: baseUrl, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ hashes: id }),
  });
},
```

- [ ] **Step 2: Transmission — add pause/resume/setPriority**

```typescript
async pauseDownload(config: ConnectionConfig, id: string): Promise<void> {
  await rpcCall(config, "torrent-stop", { ids: [Number(id)] });
},

async resumeDownload(config: ConnectionConfig, id: string): Promise<void> {
  await rpcCall(config, "torrent-start", { ids: [Number(id)] });
},

async setPriority(config: ConnectionConfig, id: string, priority: number): Promise<void> {
  await rpcCall(config, "queue-move-up" , { ids: [Number(id)] });
  // Transmission uses queue-move-up/queue-move-down for relative positioning
  const method = priority > 0 ? "queue-move-up" : "queue-move-down";
  await rpcCall(config, method, { ids: [Number(id)] });
},
```

Note: Fix the duplicate rpcCall — only the method variable version should remain.

- [ ] **Step 3: Deluge — add pause/resume/setPriority**

```typescript
async pauseDownload(config: ConnectionConfig, id: string): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const cookie = await getSessionCookie(baseUrl, config.password);
  await delugeCall(baseUrl, cookie, "core.pause_torrent", [id]);
},

async resumeDownload(config: ConnectionConfig, id: string): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const cookie = await getSessionCookie(baseUrl, config.password);
  await delugeCall(baseUrl, cookie, "core.resume_torrent", [id]);
},

async setPriority(config: ConnectionConfig, id: string, priority: number): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const cookie = await getSessionCookie(baseUrl, config.password);
  await delugeCall(baseUrl, cookie, "core.queue_up" , [id]);
  // Deluge uses queue_up/queue_down for relative position
  const method = priority > 0 ? "core.queue_up" : "core.queue_down";
  await delugeCall(baseUrl, cookie, method, [id]);
},
```

Note: Same fix — only the method variable version should remain.

- [ ] **Step 4: rTorrent — add pause/resume/setPriority**

```typescript
async pauseDownload(config: ConnectionConfig, id: string): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const headers = getAuthHeaders(config.username, config.password);
  const xml = buildXmlRpcCall("d.pause", [id]);
  await fetchWithTimeout(baseUrl, { method: "POST", headers: { ...headers, "Content-Type": "text/xml" }, body: xml });
},

async resumeDownload(config: ConnectionConfig, id: string): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const headers = getAuthHeaders(config.username, config.password);
  const xml = buildXmlRpcCall("d.resume", [id]);
  await fetchWithTimeout(baseUrl, { method: "POST", headers: { ...headers, "Content-Type": "text/xml" }, body: xml });
},

async setPriority(config: ConnectionConfig, id: string, priority: number): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const headers = getAuthHeaders(config.username, config.password);
  // rTorrent priority: 0=off, 1=low, 2=normal, 3=high
  const rtPriority = priority > 0 ? 3 : 1;
  const xml = buildXmlRpcCall("d.priority.set", [id, rtPriority]);
  await fetchWithTimeout(baseUrl, { method: "POST", headers: { ...headers, "Content-Type": "text/xml" }, body: xml });
},
```

- [ ] **Step 5: SABnzbd — add pause/resume/setPriority**

```typescript
async pauseDownload(config: ConnectionConfig, id: string): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const apiKey = config.apiKey ?? "";
  await fetchWithTimeout(`${baseUrl}/api?mode=queue&name=pause&value=${id}&apikey=${apiKey}&output=json`);
},

async resumeDownload(config: ConnectionConfig, id: string): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const apiKey = config.apiKey ?? "";
  await fetchWithTimeout(`${baseUrl}/api?mode=queue&name=resume&value=${id}&apikey=${apiKey}&output=json`);
},

async setPriority(config: ConnectionConfig, id: string, priority: number): Promise<void> {
  const baseUrl = buildBaseUrl(config.host, config.port, config.useSsl, config.urlBase);
  const apiKey = config.apiKey ?? "";
  // SABnzbd priority: -1=low, 0=normal, 1=high, 2=force
  const sabPriority = priority > 0 ? 1 : -1;
  await fetchWithTimeout(`${baseUrl}/api?mode=queue&name=priority&value=${id}&value2=${sabPriority}&apikey=${apiKey}&output=json`);
},
```

- [ ] **Step 6: NZBGet — add pause/resume/setPriority**

```typescript
async pauseDownload(config: ConnectionConfig, id: string): Promise<void> {
  await nzbgetCall(config, "editqueue", ["GroupPause", "", [Number(id)]]);
},

async resumeDownload(config: ConnectionConfig, id: string): Promise<void> {
  await nzbgetCall(config, "editqueue", ["GroupResume", "", [Number(id)]]);
},

async setPriority(config: ConnectionConfig, id: string, priority: number): Promise<void> {
  // NZBGet priority: -100=very low, -50=low, 0=normal, 50=high, 100=very high, 900=force
  const nzbPriority = priority > 0 ? 50 : -50;
  await nzbgetCall(config, "editqueue", ["GroupSetPriority", String(nzbPriority), [Number(id)]]);
},
```

- [ ] **Step 7: Verify TypeScript compiles and lint passes**

Run: `bunx tsc --noEmit && bun run lint`
Expected: Clean.

- [ ] **Step 8: Commit**

```bash
git add src/server/download-clients/
git commit -m "feat(queue): implement pause/resume/setPriority across all download client providers"
```

---

## Task 4: Server Functions for Actions

**Files:**

- Modify: `src/server/queue.ts`
- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Add Zod schemas for new actions**

In `src/lib/validators.ts`, add after `removeFromQueueSchema` (line 277):

```typescript
export const pauseDownloadSchema = z.object({
  downloadClientId: z.number(),
  downloadItemId: z.string().min(1),
});

export const resumeDownloadSchema = z.object({
  downloadClientId: z.number(),
  downloadItemId: z.string().min(1),
});

export const setDownloadPrioritySchema = z.object({
  downloadClientId: z.number(),
  downloadItemId: z.string().min(1),
  priority: z.number(), // positive = increase, negative = decrease
});
```

- [ ] **Step 2: Add server functions in `src/server/queue.ts`**

Add after `removeFromQueueFn` (end of file):

```typescript
import {
  removeFromQueueSchema,
  pauseDownloadSchema,
  resumeDownloadSchema,
  setDownloadPrioritySchema,
} from "src/lib/validators";

export const pauseDownloadFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pauseDownloadSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const client = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.id, data.downloadClientId))
      .get();
    if (!client) throw new Error("Download client not found");

    const provider = getProvider(client.implementation);
    if (!provider.pauseDownload)
      throw new Error("Client does not support pausing");

    const config = toConnectionConfig(client);
    await provider.pauseDownload(config, data.downloadItemId);
    return { success: true };
  });

export const resumeDownloadFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => resumeDownloadSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const client = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.id, data.downloadClientId))
      .get();
    if (!client) throw new Error("Download client not found");

    const provider = getProvider(client.implementation);
    if (!provider.resumeDownload)
      throw new Error("Client does not support resuming");

    const config = toConnectionConfig(client);
    await provider.resumeDownload(config, data.downloadItemId);
    return { success: true };
  });

export const setDownloadPriorityFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => setDownloadPrioritySchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const client = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.id, data.downloadClientId))
      .get();
    if (!client) throw new Error("Download client not found");

    const provider = getProvider(client.implementation);
    if (!provider.setPriority)
      throw new Error("Client does not support priority changes");

    const config = toConnectionConfig(client);
    await provider.setPriority(config, data.downloadItemId, data.priority);
    return { success: true };
  });
```

Note: Update the existing import at the top of `queue.ts` to include the new schemas alongside `removeFromQueueSchema`.

- [ ] **Step 3: Verify TypeScript compiles and lint passes**

Run: `bunx tsc --noEmit && bun run lint`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/queue.ts src/lib/validators.ts
git commit -m "feat(queue): add pause/resume/setPriority server functions"
```

---

## Task 5: Event Bus — queueProgress and Client Count

**Files:**

- Modify: `src/server/event-bus.ts`

- [ ] **Step 1: Add `queueProgress` event type and `getClientCount()` method**

Update the `ServerEvent` type to include the new event. Add `getClientCount()` to the class. Import `QueueItem` type.

```typescript
import type { QueueItem } from "./queue";

export type ServerEvent =
  | { type: "queueUpdated" }
  | { type: "queueProgress"; data: { items: QueueItem[]; warnings: string[] } }
  | { type: "taskUpdated"; taskId: string }
  | { type: "downloadCompleted"; bookId: number | null; title: string }
  | {
      type: "downloadFailed";
      bookId: number | null;
      title: string;
      message: string;
    }
  | { type: "importCompleted"; bookId: number | null; bookTitle: string };
```

Add to the `EventBus` class:

```typescript
getClientCount(): number {
  return this.clients.size;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: Clean. Check for circular dependency between `event-bus.ts` and `queue.ts`. If circular, use `import type` (already done above) which is erased at runtime and avoids circular issues.

- [ ] **Step 3: Commit**

```bash
git add src/server/event-bus.ts
git commit -m "feat(queue): add queueProgress event type and getClientCount to event bus"
```

---

## Task 6: Adaptive Scheduler for refresh-downloads

**Files:**

- Modify: `src/server/scheduler/index.ts`
- Modify: `src/server/scheduler/tasks/refresh-downloads.ts`
- Modify: `src/server/download-manager.ts`

- [ ] **Step 1: Add `rescheduleTask()` to scheduler**

In `src/server/scheduler/index.ts`, add a new exported function after `isTaskRunning()` (line 151):

```typescript
export function rescheduleTask(taskId: string, intervalMs: number): void {
  const existingTimer = timers.get(taskId);
  if (existingTimer) {
    clearInterval(existingTimer);
    clearTimeout(existingTimer as unknown as ReturnType<typeof setTimeout>);
  }
  const intervalId = setInterval(() => void executeTask(taskId), intervalMs);
  timers.set(taskId, intervalId);
}
```

- [ ] **Step 2: Update refresh-downloads task to use adaptive scheduling**

Rewrite `src/server/scheduler/tasks/refresh-downloads.ts`:

```typescript
import { registerTask } from "../registry";
import { refreshDownloads } from "../../download-manager";
import { eventBus } from "../../event-bus";
import { rescheduleTask } from "../index";

const INTERVAL_NO_CLIENTS = 60_000; // 60s when no SSE clients
const INTERVAL_IDLE = 15_000; // 15s when clients but no active downloads
const INTERVAL_ACTIVE = 4_000; // 4s when clients + active downloads

let currentInterval = INTERVAL_NO_CLIENTS;

function getTargetInterval(hasActiveDownloads: boolean): number {
  const clientCount = eventBus.getClientCount();
  if (clientCount === 0) return INTERVAL_NO_CLIENTS;
  return hasActiveDownloads ? INTERVAL_ACTIVE : INTERVAL_IDLE;
}

async function adaptiveRefreshDownloads() {
  const result = await refreshDownloads();

  // Determine if there are active downloads from the result message
  const hasActiveDownloads = result.message !== "No active tracked downloads";
  const targetInterval = getTargetInterval(hasActiveDownloads);

  if (targetInterval !== currentInterval) {
    currentInterval = targetInterval;
    rescheduleTask("refresh-downloads", currentInterval);
  }

  return result;
}

registerTask({
  id: "refresh-downloads",
  name: "Refresh Downloads",
  description:
    "Check download clients for status changes and import completed downloads",
  defaultInterval: 60,
  handler: adaptiveRefreshDownloads,
});
```

- [ ] **Step 3: Update download-manager to emit `queueProgress`**

In `src/server/download-manager.ts`, modify the `refreshDownloads()` function. After the existing `eventBus.emit({ type: "queueUpdated" })` on line 201, also emit the full queue snapshot:

```typescript
// Replace: eventBus.emit({ type: "queueUpdated" });
// With:
import { fetchQueueItems } from "./queue";

// At end of refreshDownloads, after stats are computed:
if (eventBus.getClientCount() > 0) {
  const queueSnapshot = await fetchQueueItems();
  eventBus.emit({ type: "queueProgress", data: queueSnapshot });
} else {
  eventBus.emit({ type: "queueUpdated" });
}
```

Note: Move the `import { fetchQueueItems }` to the top of the file with other imports. The existing `eventBus.emit({ type: "queueUpdated" })` is kept as fallback when no SSE clients are connected (for future use or other listeners).

- [ ] **Step 4: Verify TypeScript compiles and lint passes**

Run: `bunx tsc --noEmit && bun run lint`
Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/scheduler/ src/server/download-manager.ts
git commit -m "feat(queue): adaptive polling interval based on SSE client count and active downloads"
```

---

## Task 7: SSE Hook — queueProgress Handler and isConnected

**Files:**

- Modify: `src/hooks/use-server-events.ts`
- Modify: `src/lib/queries/queue.ts`
- Modify: `src/lib/query-keys.ts`
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Rewrite `useServerEvents` to handle `queueProgress` and expose `isConnected`**

```typescript
// oxlint-disable explicit-module-boundary-types -- React hook return type is inferred
// oxlint-disable import/prefer-default-export -- named export for React hook convention
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import type { QueueItem } from "src/server/queue";

type UseServerEventsReturn = {
  isConnected: boolean;
};

export function useServerEvents(): UseServerEventsReturn {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let es: EventSource;

    function connect() {
      es = new EventSource("/api/events");

      es.onopen = () => setIsConnected(true);
      es.onerror = () => {
        setIsConnected(false);
        // EventSource auto-reconnects, but we track state
      };

      es.addEventListener("queueProgress", (e) => {
        const data = JSON.parse(e.data) as {
          data: { items: QueueItem[]; warnings: string[] };
        };
        queryClient.setQueryData(queryKeys.queue.list(), data.data);
      });

      es.addEventListener("queueUpdated", () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.queue.all });
      });

      es.addEventListener("taskUpdated", () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      });

      es.addEventListener("downloadCompleted", (e) => {
        const data = JSON.parse(e.data) as { title: string };
        toast.info(`Download completed: ${data.title}`);
      });

      es.addEventListener("downloadFailed", (e) => {
        const data = JSON.parse(e.data) as { title: string; message: string };
        toast.error(`Download failed: ${data.title} — ${data.message}`);
      });

      es.addEventListener("importCompleted", (e) => {
        const data = JSON.parse(e.data) as {
          bookId: number | null;
          bookTitle: string;
        };
        if (data.bookId) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.books.detail(data.bookId),
          });
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.queue.all });
        toast.success(`Imported: ${data.bookTitle}`);
      });
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current)
        clearTimeout(reconnectTimeoutRef.current);
      es.close();
      setIsConnected(false);
    };
  }, [queryClient]);

  return { isConnected };
}
```

- [ ] **Step 2: Update `_authed.tsx` to capture `isConnected` from `useServerEvents`**

The hook is currently called as `useServerEvents()` (void). Now it returns `{ isConnected }`. Since `_authed.tsx` doesn't need `isConnected` directly (the queue components will), just update the call to ignore the return value — no changes needed in `_authed.tsx`.

- [ ] **Step 3: Update `src/lib/queries/queue.ts` — remove polling and `queueCountQuery`**

```typescript
// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import { getQueueFn } from "src/server/queue";
import { queryKeys } from "src/lib/query-keys";

export const queueListQuery = () =>
  queryOptions({
    queryKey: queryKeys.queue.list(),
    queryFn: () => getQueueFn(),
    // No refetchInterval — SSE queueProgress writes directly into this cache.
    // Fallback polling is handled by the queue-tab component when SSE disconnects.
  });
```

Remove `queueCountQuery` entirely.

- [ ] **Step 4: Remove `queue.count` from query keys**

In `src/lib/query-keys.ts`, remove the `count` key from the queue section (line 153):

```typescript
// Change from:
queue: {
  all: ["queue"] as const,
  list: () => ["queue", "list"] as const,
  count: () => ["queue", "count"] as const,
},

// To:
queue: {
  all: ["queue"] as const,
  list: () => ["queue", "list"] as const,
},
```

- [ ] **Step 5: Update sidebar to derive count from queue list**

In `src/components/layout/app-sidebar.tsx`:

Replace the import:

```typescript
// Remove: import { queueCountQuery } from "src/lib/queries/queue";
// Add:    import { queueListQuery } from "src/lib/queries/queue";
```

Replace the query usage (line 122):

```typescript
// Remove: const { data: queueCount } = useQuery(queueCountQuery());
// Add:    const { data: queueCount } = useQuery({ ...queueListQuery(), select: (data) => data.items.length });
```

The `select` option derives the count from the same cache key — no separate query needed.

- [ ] **Step 6: Verify TypeScript compiles and lint passes**

Run: `bunx tsc --noEmit && bun run lint`
Expected: Clean. Verify no remaining references to `queueCountQuery` or `queryKeys.queue.count`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-server-events.ts src/lib/queries/queue.ts src/lib/query-keys.ts src/components/layout/app-sidebar.tsx
git commit -m "feat(queue): SSE-driven queue updates with isConnected state, remove polling"
```

---

## Task 8: Queue Summary Bar Component

**Files:**

- Create: `src/components/activity/queue-summary-bar.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { JSX } from "react";
import { formatBytes } from "src/lib/format";
import type { QueueItem } from "src/server/queue";
import type { CanonicalStatus } from "src/server/download-clients/types";

type StatusFilter = CanonicalStatus | "all";

type QueueSummaryBarProps = {
  items: QueueItem[];
  filter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  isConnected: boolean;
};

const filters: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Downloading", value: "downloading" },
  { label: "Queued", value: "queued" },
  { label: "Paused", value: "paused" },
  { label: "Failed", value: "failed" },
];

export default function QueueSummaryBar({
  items,
  filter,
  onFilterChange,
  isConnected,
}: QueueSummaryBarProps): JSX.Element {
  const activeCount = items.filter((i) => i.status === "downloading").length;
  const queuedCount = items.filter((i) => i.status === "queued").length;
  const totalDownloadSpeed = items.reduce((sum, i) => sum + i.downloadSpeed, 0);
  const totalUploadSpeed = items.reduce((sum, i) => sum + i.uploadSpeed, 0);
  const hasTorrent = items.some((i) => i.protocol === "torrent");

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4 mb-4">
      <div className="flex items-center gap-8">
        {/* SSE connection indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              isConnected
                ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
                : "bg-amber-500 animate-pulse"
            }`}
          />
          {!isConnected && (
            <span className="text-xs text-amber-500">Reconnecting...</span>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Active</span>
            <div className="text-xl font-semibold">{activeCount}</div>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Queued</span>
            <div className="text-xl font-semibold">{queuedCount}</div>
          </div>
        </div>

        <div className="h-8 w-px bg-border" />

        <div className="flex items-center gap-6">
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Download</span>
            <div className="text-xl font-semibold text-blue-500">
              {totalDownloadSpeed > 0 ? `${formatBytes(totalDownloadSpeed)}/s` : "—"}
            </div>
          </div>
          {hasTorrent && (
            <div>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Upload</span>
              <div className="text-xl font-semibold text-green-500">
                {totalUploadSpeed > 0 ? `${formatBytes(totalUploadSpeed)}/s` : "—"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1.5">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onFilterChange(f.value)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              filter === f.value
                ? "bg-blue-500/20 text-blue-400"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/activity/queue-summary-bar.tsx
git commit -m "feat(queue): add transfer summary bar component with filters and SSE indicator"
```

---

## Task 9: Queue Item Row Component

**Files:**

- Create: `src/components/activity/queue-item-row.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { JSX } from "react";
import { Pause, Play, X, ChevronUp, ChevronDown } from "lucide-react";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { formatBytes } from "src/lib/format";
import type { QueueItem } from "src/server/queue";
import type { CanonicalStatus } from "src/server/download-clients/types";

type QueueItemRowProps = {
  item: QueueItem;
  onPause: (item: QueueItem) => void;
  onResume: (item: QueueItem) => void;
  onRemove: (item: QueueItem) => void;
  onPriorityUp: (item: QueueItem) => void;
  onPriorityDown: (item: QueueItem) => void;
};

const statusColors: Record<CanonicalStatus, { bg: string; border: string; dot: string; text: string; glow: boolean }> = {
  downloading: {
    bg: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.3)",
    dot: "bg-blue-500",
    text: "text-blue-500",
    glow: true,
  },
  completed: {
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.3)",
    dot: "bg-green-500",
    text: "text-green-500",
    glow: true,
  },
  paused: {
    bg: "rgba(245,158,11,0.06)",
    border: "rgba(245,158,11,0.3)",
    dot: "bg-amber-500",
    text: "text-amber-500",
    glow: false,
  },
  queued: {
    bg: "transparent",
    border: "transparent",
    dot: "bg-zinc-500",
    text: "text-muted-foreground",
    glow: false,
  },
  failed: {
    bg: "rgba(239,68,68,0.05)",
    border: "transparent",
    dot: "bg-red-500",
    text: "text-red-500",
    glow: true,
  },
};

const rowOpacity: Record<CanonicalStatus, string> = {
  downloading: "opacity-100",
  completed: "opacity-100",
  paused: "opacity-70",
  queued: "opacity-60",
  failed: "opacity-100",
};

function formatTimeLeft(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export default function QueueItemRow({
  item,
  onPause,
  onResume,
  onRemove,
  onPriorityUp,
  onPriorityDown,
}: QueueItemRowProps): JSX.Element {
  const colors = statusColors[item.status as CanonicalStatus] ?? statusColors.downloading;
  const opacity = rowOpacity[item.status as CanonicalStatus] ?? "opacity-100";

  return (
    <div
      className={`relative border-b border-border overflow-hidden ${opacity}`}
    >
      {/* Progress background */}
      {item.progress > 0 && (
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
          style={{
            width: `${item.progress}%`,
            background: colors.bg,
            borderRight: `2px solid ${colors.border}`,
          }}
        />
      )}

      {/* Failed background */}
      {item.status === "failed" && (
        <div
          className="absolute inset-0"
          style={{ background: colors.bg }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 px-4 py-3">
        {/* Line 1: Status dot, title, author, progress %, actions */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`h-2 w-2 shrink-0 rounded-full ${colors.dot} ${
                colors.glow ? "shadow-[0_0_6px_currentColor]" : ""
              }`}
            />
            <span className="font-medium text-sm truncate">{item.name}</span>
            {item.authorName && (
              <span className="text-xs text-muted-foreground shrink-0">
                {item.authorName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0 ml-4">
            {/* Progress or status text */}
            {item.status === "downloading" || item.status === "paused" ? (
              <span className={`text-sm font-medium ${colors.text}`}>
                {item.progress}%
              </span>
            ) : (
              <span className={`text-sm font-medium ${colors.text} capitalize`}>
                {item.status}
              </span>
            )}

            {/* Action buttons */}
            <div className="flex gap-1">
              {item.status === "downloading" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onPriorityUp(item)}
                    title="Increase priority"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onPriorityDown(item)}
                    title="Decrease priority"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onPause(item)}
                    title="Pause"
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              {item.status === "paused" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onResume(item)}
                  title="Resume"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              )}
              {(item.status === "queued" || item.status === "downloading") && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onPriorityUp(item)}
                    title="Increase priority"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onPriorityDown(item)}
                    title="Decrease priority"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onRemove(item)}
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Line 2: Speeds, size, ETA, client, protocol */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {item.status === "downloading" && (
            <>
              <span>
                ↓ <span className="text-blue-500">{formatBytes(item.downloadSpeed)}/s</span>
              </span>
              {item.uploadSpeed > 0 && (
                <span>
                  ↑ <span className="text-green-500">{formatBytes(item.uploadSpeed)}/s</span>
                </span>
              )}
            </>
          )}
          {item.status === "paused" && <span>Paused</span>}
          {item.status === "queued" && <span>Waiting</span>}
          {item.status === "failed" && (
            <span className="text-red-500">
              {item.trackedState === "removed" ? "Removed from client" : "Download failed"}
            </span>
          )}
          <span>
            {item.status === "downloading" || item.status === "paused"
              ? `${formatBytes(item.downloaded)} / ${formatBytes(item.size)}`
              : formatBytes(item.size)}
          </span>
          {item.status === "downloading" && item.estimatedTimeLeft !== null && (
            <span>ETA: {formatTimeLeft(item.estimatedTimeLeft)}</span>
          )}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {item.downloadClientName}
          </Badge>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
            {item.protocol}
          </Badge>
        </div>
      </div>
    </div>
  );
}
```

Note: The priority buttons are intentionally duplicated for `downloading` and `queued` status — during implementation, consolidate by checking `status === "downloading" || status === "queued"` for the priority buttons. The implementation above has some duplication in the action buttons section that should be cleaned up: remove the separate priority buttons for `downloading` (since they're already shown in the combined condition at the bottom).

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/activity/queue-item-row.tsx
git commit -m "feat(queue): add VueTorrent-inspired download row component with progress background"
```

---

## Task 10: Queue Connection Banner Component

**Files:**

- Create: `src/components/activity/queue-connection-banner.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { JSX } from "react";
import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "src/components/ui/button";

type QueueConnectionBannerProps = {
  warnings: string[];
};

export default function QueueConnectionBanner({
  warnings,
}: QueueConnectionBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = warnings.filter((w) => !dismissed.has(w));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map((warning) => (
        <div
          key={warning}
          className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <span>{warning}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() =>
              setDismissed((prev) => new Set([...prev, warning]))
            }
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/activity/queue-connection-banner.tsx
git commit -m "feat(queue): add persistent connection warning banner component"
```

---

## Task 11: Rewrite Queue Tab Container

**Files:**

- Modify: `src/components/activity/queue-tab.tsx`

This is the main container that ties everything together.

- [ ] **Step 1: Rewrite `queue-tab.tsx`**

```typescript
import type { JSX } from "react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import EmptyState from "src/components/shared/empty-state";
import RemoveDownloadDialog from "src/components/activity/remove-download-dialog";
import QueueSummaryBar from "src/components/activity/queue-summary-bar";
import QueueItemRow from "src/components/activity/queue-item-row";
import QueueConnectionBanner from "src/components/activity/queue-connection-banner";
import { queueListQuery } from "src/lib/queries";
import { queryKeys } from "src/lib/query-keys";
import {
  pauseDownloadFn,
  resumeDownloadFn,
  setDownloadPriorityFn,
} from "src/server/queue";
import type { QueueItem } from "src/server/queue";
import type { CanonicalStatus } from "src/server/download-clients/types";

type StatusFilter = CanonicalStatus | "all";

export default function QueueTab({
  isConnected,
}: { isConnected: boolean }): JSX.Element {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    ...queueListQuery(),
    // Fallback polling when SSE is disconnected
    refetchInterval: isConnected ? false : 15_000,
  });
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [removeItem, setRemoveItem] = useState<QueueItem | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = data?.items ?? [];
  const warnings = data?.warnings ?? [];

  if (items.length === 0 && warnings.length === 0) {
    return (
      <EmptyState
        icon={Download}
        title="No active downloads"
        description="Downloads from your configured clients will appear here."
      />
    );
  }

  const filteredItems =
    filter === "all" ? items : items.filter((i) => i.status === filter);

  // Optimistic update helper
  function optimisticStatusUpdate(item: QueueItem, newStatus: string) {
    queryClient.setQueryData(
      queryKeys.queue.list(),
      (old: { items: QueueItem[]; warnings: string[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((i) =>
            i.id === item.id && i.downloadClientId === item.downloadClientId
              ? { ...i, status: newStatus }
              : i,
          ),
        };
      },
    );
  }

  async function handlePause(item: QueueItem) {
    optimisticStatusUpdate(item, "paused");
    try {
      await pauseDownloadFn({
        data: {
          downloadClientId: item.downloadClientId,
          downloadItemId: item.id,
        },
      });
    } catch (error) {
      toast.error(
        `Failed to pause: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async function handleResume(item: QueueItem) {
    optimisticStatusUpdate(item, "downloading");
    try {
      await resumeDownloadFn({
        data: {
          downloadClientId: item.downloadClientId,
          downloadItemId: item.id,
        },
      });
    } catch (error) {
      toast.error(
        `Failed to resume: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async function handlePriority(item: QueueItem, direction: number) {
    try {
      await setDownloadPriorityFn({
        data: {
          downloadClientId: item.downloadClientId,
          downloadItemId: item.id,
          priority: direction,
        },
      });
    } catch (error) {
      toast.error(
        `Failed to change priority: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return (
    <>
      <QueueSummaryBar
        items={items}
        filter={filter}
        onFilterChange={setFilter}
        isConnected={isConnected}
      />
      <QueueConnectionBanner warnings={warnings} />
      <div className="rounded-lg border border-border overflow-hidden">
        {filteredItems.map((item) => (
          <QueueItemRow
            key={`${item.downloadClientId}-${item.id}`}
            item={item}
            onPause={handlePause}
            onResume={handleResume}
            onRemove={setRemoveItem}
            onPriorityUp={(i) => handlePriority(i, 1)}
            onPriorityDown={(i) => handlePriority(i, -1)}
          />
        ))}
        {filteredItems.length === 0 && items.length > 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No {filter} downloads
          </div>
        )}
      </div>
      <RemoveDownloadDialog
        item={removeItem}
        onOpenChange={(open) => {
          if (!open) setRemoveItem(null);
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: Update the queue route to pass `isConnected`**

In `src/routes/_authed/activity/index.tsx`, update to pass `isConnected` to `QueueTab`. The `useServerEvents` hook is called in `_authed.tsx` (parent layout), so we need to either:

- Pass `isConnected` via context, or
- Call `useServerEvents` in the queue page instead

The simplest approach: create a small React context for SSE connection state.

Create `src/hooks/sse-context.tsx`:

```typescript
import { createContext, useContext } from "react";

type SSEContextValue = { isConnected: boolean };

export const SSEContext = createContext<SSEContextValue>({
  isConnected: false,
});

export function useSSEConnection(): SSEContextValue {
  return useContext(SSEContext);
}
```

Update `src/routes/_authed.tsx` to provide the context:

```typescript
import { SSEContext } from "src/hooks/sse-context";

// In the component, wrap children with provider:
const { isConnected } = useServerEvents();
// ... in JSX:
<SSEContext.Provider value={{ isConnected }}>
  {/* existing children */}
</SSEContext.Provider>
```

Update `src/routes/_authed/activity/index.tsx`:

```typescript
import { useSSEConnection } from "src/hooks/sse-context";

function QueuePage() {
  const { isConnected } = useSSEConnection();
  return (
    <div>
      <PageHeader title="Queue" description="Active and pending downloads" />
      <QueueTab isConnected={isConnected} />
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles and lint passes**

Run: `bunx tsc --noEmit && bun run lint`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/activity/queue-tab.tsx src/routes/_authed/activity/index.tsx src/routes/_authed.tsx src/hooks/sse-context.tsx
git commit -m "feat(queue): rewrite queue tab with VueTorrent-inspired design, optimistic updates, SSE context"
```

---

## Task 12: Visual Polish and Dev Testing

**Files:**

- Various component files from previous tasks

- [ ] **Step 1: Start the dev server**

Run: `bun run dev`
Expected: Server starts on port 3000, no build errors.

- [ ] **Step 2: Visual verification in browser**

Open `http://localhost:3000/activity` and verify:

- Transfer summary bar renders with stats and filter pills
- SSE connection indicator shows green dot
- Download rows show progress background, correct colors, and action buttons
- Filter pills work correctly
- Pause/resume buttons trigger optimistic updates
- Remove dialog still works
- Sidebar badge shows correct queue count
- Empty state shows when no downloads

- [ ] **Step 3: Fix any visual issues found during testing**

Address spacing, color, alignment, or layout issues. Common things to check:

- Progress bar background alignment
- Status dot glow effect
- Filter pill active state
- Action button hover states
- Responsive behavior at different widths

- [ ] **Step 4: Run linter one final time**

Run: `bun run lint`
Expected: Clean.

- [ ] **Step 5: Commit any polish fixes**

```bash
git add -A
git commit -m "fix(queue): visual polish from dev testing"
```

---

## Summary

| Task | Description                        | Files                 |
| ---- | ---------------------------------- | --------------------- |
| 1    | Provider interface types           | 1 modified            |
| 2    | Status normalization (7 providers) | 7 modified            |
| 3    | Action methods (6 providers)       | 6 modified            |
| 4    | Server functions for actions       | 2 modified            |
| 5    | Event bus changes                  | 1 modified            |
| 6    | Adaptive scheduler                 | 3 modified            |
| 7    | SSE hook + query cleanup           | 4 modified            |
| 8    | Summary bar component              | 1 created             |
| 9    | Item row component                 | 1 created             |
| 10   | Connection banner component        | 1 created             |
| 11   | Queue tab rewrite + SSE context    | 4 modified, 1 created |
| 12   | Visual polish and testing          | Various               |
