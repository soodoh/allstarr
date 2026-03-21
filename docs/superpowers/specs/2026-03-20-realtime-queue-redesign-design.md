# Real-Time Queue Redesign

**Date:** 2026-03-20
**Status:** Approved

## Summary

Redesign the download queue page with VueTorrent-inspired visuals, adaptive server-side polling, and SSE-driven real-time progress updates. Replace the current 60-second polling table with a responsive, color-coded download view that updates every 3-5 seconds when actively watched.

## Goals

1. Near real-time download progress when viewing the queue (3-5s updates)
2. VueTorrent-inspired row design with progress-bar-as-background, color-coded status
3. Download actions: pause/resume, priority reordering, remove (existing)
4. Minimal server load when nobody is watching

## Non-Goals

- Retry failed downloads (touches grab/search flow — separate concern)
- WebSocket transport (SSE is sufficient; actions are infrequent)
- Redesigning History or Blocklist tabs
- Custom state management (React Query stays as state container)

## Architecture: Adaptive SSE with Optimistic Updates

### Why This Approach

No download client supports WebSocket APIs. The practical pattern (used by Sonarr/Radarr/Flood) is: server polls clients on an interval, then pushes updates to the browser. Allstarr already has SSE infrastructure (event bus, `/api/events` endpoint, `useServerEvents` hook). This design extends that infrastructure rather than replacing it.

### Adaptive Polling

The `refresh-downloads` scheduler task currently runs at a fixed 60-second interval. It becomes adaptive based on two factors: whether any SSE clients are connected, and whether there are active downloads.

| SSE Clients Connected | Active Downloads | Poll Interval |
| --------------------- | ---------------- | ------------- |
| No                    | —                | 60s           |
| Yes                   | No               | 15s           |
| Yes                   | Yes              | 4s            |

The event bus already tracks connected clients via its `Set` of stream controllers. The scheduler reads this count to decide its interval.

### SSE Progress Streaming

A new `queueProgress` event type carries the full queue snapshot:

```typescript
type ServerEvent =
  | { type: "queueUpdated" }
  | { type: "queueProgress"; data: QueueItem[] }
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

The `queueProgress` event replaces the current pattern where `queueUpdated` triggers a React Query cache invalidation followed by a refetch. Instead, the SSE handler writes queue data directly into the React Query cache via `queryClient.setQueryData`.

### React Query: Simplified Role

React Query stays as the state container for queue data, but its responsibilities shrink:

**Keeps:**

- Initial data fetch on page mount (one-time `queryFn`, before first SSE snapshot arrives)
- Cache that components subscribe to
- Loading/error states
- Shared cache between queue tab and sidebar badge

**Removes:**

- `refetchInterval` — SSE replaces polling entirely
- `queueUpdated` cache invalidation — SSE carries the data directly
- `queueCountQuery` — derive count from the same cache key

**SSE disconnect fallback:** If SSE disconnects, re-enable a temporary `refetchInterval` (15s) until reconnected.

### Optimistic Updates for Actions

When the user clicks an action (e.g., pause), the UI immediately updates the item's status in the React Query cache (e.g., status becomes `"pausing"`). The next SSE `queueProgress` snapshot reconciles with the actual state from the download client. If the server function call fails, a toast shows the error and the next SSE snapshot corrects the UI.

## Download Actions

### New Server Functions

Added to `src/server/queue.ts`:

- `pauseDownloadFn(downloadClientId, downloadItemId)` — pauses a download
- `resumeDownloadFn(downloadClientId, downloadItemId)` — resumes a paused download
- `setDownloadPriorityFn(downloadClientId, downloadItemId, priority)` — changes queue priority

### Provider Interface Extension

New optional methods on `DownloadClientProvider`:

```typescript
interface DownloadClientProvider {
  // existing
  getDownloads(config: ConnectionConfig): Promise<DownloadItem[]>;
  removeDownload(
    config: ConnectionConfig,
    id: string,
    deleteFiles: boolean,
  ): Promise<void>;
  // new
  pauseDownload?(config: ConnectionConfig, id: string): Promise<void>;
  resumeDownload?(config: ConnectionConfig, id: string): Promise<void>;
  setPriority?(
    config: ConnectionConfig,
    id: string,
    priority: number,
  ): Promise<void>;
}
```

Methods are optional because not all clients support all actions (Blackhole supports none). The UI disables unsupported actions based on provider capabilities.

### Client Support Matrix

| Client       | Pause/Resume | Priority |
| ------------ | ------------ | -------- |
| qBittorrent  | Yes          | Yes      |
| Transmission | Yes          | Yes      |
| Deluge       | Yes          | Yes      |
| rTorrent     | Yes          | Yes      |
| SABnzbd      | Yes          | Yes      |
| NZBGet       | Yes          | Yes      |
| Blackhole    | No           | No       |

## UI Design: VueTorrent-Inspired Queue

### Transfer Summary Bar

A persistent bar above the queue showing aggregate stats and status filters:

- **Left side:** Active count, Queued count, total download speed, total upload speed
- **Right side:** Filter pills — All, Downloading, Queued, Paused, Failed

### Download Row Design

Each row uses a two-line layout with the progress bar as the row background:

**Line 1:** Status dot | Title (format) | Author | Progress % | Action buttons
**Line 2:** Download speed | Upload speed | Size (downloaded / total) | ETA | Client badge | Protocol badge

**Progress background:** An absolutely-positioned div behind the row content, width set to progress %, with the status color at low opacity. A subtle 2px border-right marks the progress edge.

### Status Color System

| Status      | Color | Dot Glow | Row Opacity |
| ----------- | ----- | -------- | ----------- |
| Downloading | Blue  | Yes      | 1.0         |
| Completed   | Green | Yes      | 1.0         |
| Paused      | Amber | No       | 0.7         |
| Queued      | Gray  | No       | 0.6         |
| Failed      | Red   | Yes      | 1.0         |

### Action Buttons

Contextual per status:

- **Downloading:** Pause, Remove
- **Paused:** Resume, Remove
- **Queued:** Remove
- **Failed:** Remove

### SSE Connection Indicator

A small dot in the transfer summary bar:

- Green dot — SSE connected, live updates
- Amber dot + "Reconnecting..." — SSE disconnected, fallback polling active

### Error Handling

Download client connection failures show as a persistent warning banner above queue rows ("Failed to connect to [client name]") instead of ephemeral toasts. Dismissible.

## Component Architecture

### New/Modified Files

```
src/components/activity/
├── queue-tab.tsx              # Container — queue state, filter state, optimistic updates
├── queue-summary-bar.tsx      # NEW — transfer stats + status filter pills
├── queue-item-row.tsx         # NEW — single download row
├── queue-connection-banner.tsx # NEW — client connection warning
├── remove-download-dialog.tsx # Existing — no change
```

### Data Flow

1. `queue-tab.tsx` subscribes to React Query cache for queue data
2. `useServerEvents` hook writes `queueProgress` data into React Query cache
3. `queue-tab.tsx` applies status filter, computes aggregate stats
4. Passes filtered items to `queue-item-row` components
5. Passes aggregate stats to `queue-summary-bar`
6. Action callbacks (pause, resume, remove, set priority) defined in `queue-tab`, passed as props

### Server-Side Changes

| File                                              | Change                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/server/queue.ts`                             | Add `pauseDownloadFn`, `resumeDownloadFn`, `setDownloadPriorityFn`         |
| `src/server/download-clients/types.ts`            | Add optional `pauseDownload`, `resumeDownload`, `setPriority` to interface |
| `src/server/download-clients/*.ts`                | Implement new methods per client                                           |
| `src/server/event-bus.ts`                         | Add `queueProgress` event type with data payload                           |
| `src/server/scheduler/tasks/refresh-downloads.ts` | Adaptive interval based on SSE client count + active downloads             |
| `src/hooks/use-server-events.ts`                  | Handle `queueProgress` → write to React Query cache, expose `isConnected`  |
| `src/lib/queries/queue.ts`                        | Remove `refetchInterval`, remove `queueCountQuery`                         |

## Download Client API Reference

No download client supports WebSocket. All use polling:

| Client       | API Type   | Best Mechanism                   |
| ------------ | ---------- | -------------------------------- |
| qBittorrent  | REST       | Incremental sync via `rid` param |
| Transmission | JSON-RPC   | `recently-active` filter         |
| Deluge       | JSON-RPC   | Web API polling                  |
| rTorrent     | XML-RPC    | Standard polling                 |
| SABnzbd      | REST       | `mode=queue` endpoint            |
| NZBGet       | JSON-RPC   | `listgroups` method              |
| Blackhole    | Filesystem | Watch folder (no status API)     |
