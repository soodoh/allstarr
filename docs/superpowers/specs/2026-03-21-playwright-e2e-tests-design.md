# Playwright E2E Test Suite Design

## Goal

Comprehensive Playwright e2e tests covering all critical flows in Allstarr without relying on real external services or truly downloading anything. Proper integration tests between all supported indexers and download clients using fake HTTP servers that speak the real protocols.

## Decisions

- **Fake HTTP servers** for download clients (qBittorrent, Transmission, Deluge, rTorrent, SABnzbd, NZBGet) and indexers (Newznab/Torznab, Prowlarr) — exercises real HTTP/parsing/auth code
- **Playwright route interception** for Hardcover GraphQL — read-only metadata API, simpler to mock at fetch level
- **Real temp directories** for filesystem operations — catches path-handling bugs that mocks would hide
- **Fresh SQLite per test suite** — full isolation, no leaked state, safe for parallel execution
- **No provider-level mocks** — fake servers catch protocol/parsing bugs that provider swaps would miss

## Test Infrastructure

### Dependencies

- `@playwright/test` — test runner and browser automation
- No additional mock libraries — Playwright's `page.route()` handles Hardcover interception, Bun's native HTTP server powers fake download client/indexer servers

### Project Structure

```
e2e/
├── playwright.config.ts          # Config: baseURL, webServer, projects
├── global-setup.ts               # Start fake servers, create test DB template
├── global-teardown.ts            # Cleanup
├── fixtures/
│   ├── app.ts                    # Extended test fixture with auth, DB, fake servers
│   ├── fake-servers/
│   │   ├── qbittorrent.ts        # Fake qBittorrent HTTP API
│   │   ├── transmission.ts       # Fake Transmission RPC
│   │   ├── deluge.ts             # Fake Deluge JSON-RPC
│   │   ├── rtorrent.ts           # Fake rTorrent XML-RPC
│   │   ├── sabnzbd.ts            # Fake SABnzbd HTTP API
│   │   ├── nzbget.ts             # Fake NZBGet JSON-RPC
│   │   ├── newznab.ts            # Fake Newznab/Torznab indexer
│   │   └── prowlarr.ts           # Fake Prowlarr management API
│   ├── hardcover-mock.ts         # Playwright route handler for Hardcover GraphQL
│   └── seed-data.ts              # DB seed helpers (authors, books, profiles, etc.)
├── helpers/
│   ├── auth.ts                   # Login/register helpers
│   ├── navigation.ts             # Common page navigation
│   └── sse.ts                    # SSE event capture helpers
└── tests/
    ├── 01-auth.spec.ts
    ├── 02-settings-config.spec.ts
    ├── 03-author-book-import.spec.ts
    ├── 04-search-grab.spec.ts
    ├── 05-queue-management.spec.ts
    ├── 06-auto-search.spec.ts
    ├── 07-download-lifecycle.spec.ts
    ├── 08-disk-scan.spec.ts
    ├── 09-system-health.spec.ts
    └── 10-blocklist-failure.spec.ts
```

### App Startup

- Playwright's `webServer` config runs `bun run dev` with env vars:
  - `DATABASE_URL` pointing to the per-suite test SQLite file
  - Fake server ports for download clients/indexers
- Each test file gets a fresh SQLite DB copied from a pre-migrated template created in `global-setup.ts`
- Fake servers start in `global-setup.ts` on fixed ports, shared across all tests (stateless request handlers with per-test state control)

### Custom Test Fixture (`e2e/fixtures/app.ts`)

Extends Playwright's `test` with:

- `authenticatedPage` — a page already logged in (register + login in `beforeEach`)
- `db` — direct Drizzle DB handle for the test's SQLite file (seeding and assertions)
- `fakeServers` — references to fake server URLs for configuring clients/indexers in the UI
- `tempDir` — a real temp directory for root folder / disk scan tests

## Mocking Architecture

### Fake HTTP Servers

Each fake server is a Bun HTTP server (`Bun.serve`) speaking the real protocol. State is mutable and controlled per-test via a `/__control` endpoint. A `/__reset` endpoint clears state between tests.

| Fake Server  | Protocol                     | Key Endpoints                                                                                                                                                                                                 |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| qBittorrent  | REST + cookie auth           | `POST /api/v2/auth/login`, `GET /api/v2/torrents/info`, `POST /api/v2/torrents/add`, `POST /api/v2/torrents/pause`, `POST /api/v2/torrents/resume`, `POST /api/v2/torrents/delete`, `GET /api/v2/app/version` |
| Transmission | JSON-RPC + session-id header | `POST /transmission/rpc` — methods: `torrent-get`, `torrent-add`, `torrent-stop`, `torrent-start`, `torrent-remove`, `session-get`                                                                            |
| Deluge       | JSON-RPC + cookie auth       | `POST /json` — methods: `auth.login`, `core.get_torrents_status`, `core.add_torrent_url`, `core.pause_torrent`, `core.resume_torrent`, `core.remove_torrent`, `daemon.info`                                   |
| rTorrent     | XML-RPC                      | `POST /RPC2` — methods: `d.multicall2`, `load.start`, `d.stop`, `d.start`, `d.erase`, `system.client_version`                                                                                                 |
| SABnzbd      | REST + apikey query param    | `GET /api?mode=queue`, `GET /api?mode=addurl`, `GET /api?mode=pause`, `GET /api?mode=resume`, `GET /api?mode=delete`, `GET /api?mode=version`                                                                 |
| NZBGet       | JSON-RPC + basic auth        | `POST /jsonrpc` — methods: `listgroups`, `append`, `editqueue(pause)`, `editqueue(resume)`, `editqueue(delete)`, `version`                                                                                    |
| Newznab      | Newznab XML over HTTP        | `GET /api?t=caps` (capabilities), `GET /api?t=search` (search results as RSS/XML), `GET /api/v1/health` + `/api/v1/system/status` (test connection)                                                           |
| Prowlarr     | REST JSON                    | `GET /api/v1/indexer` (list indexers), `GET /api/v1/health`, `GET /api/v1/system/status`                                                                                                                      |

### Controlling Fake Server State

Tests manipulate fake server behavior via a `/__control` POST endpoint:

```ts
// Tell qBittorrent to report 2 active torrents
await fetch(`http://localhost:${FAKE_QBIT_PORT}/__control`, {
  method: "POST",
  body: JSON.stringify({
    torrents: [
      {
        hash: "abc123",
        name: "Author - Book.epub",
        progress: 0.5,
        state: "downloading",
        size: 1048576,
      },
      {
        hash: "def456",
        name: "Author - Book2.mobi",
        progress: 1.0,
        state: "completed",
        save_path: "/downloads",
      },
    ],
  }),
});
```

### Hardcover GraphQL Mock

Intercepted at the network level via Playwright's `page.route()` for client-side calls. For server-side calls (server functions fetching Hardcover), the app's Hardcover base URL is overridden via env var to point to a simple Bun HTTP server that returns canned GraphQL responses.

```ts
await page.route("**/hardcover.app/api/graphql", (route) => {
  const body = JSON.parse(route.request().postData());
  if (body.query.includes("SearchBooks")) {
    return route.fulfill({ json: mockSearchResults });
  }
});
```

### Filesystem

- Each test that needs disk operations gets a real temp directory via `fs.mkdtemp()`
- Seed helpers create realistic folder structures: `{tempDir}/Author Name/Book Title (2020)/book.epub`
- Dummy files are real files (small random content) so size/permission checks work
- Cleaned up in `afterEach`

## Test Suites

### 01-auth.spec.ts

| Test                         | Flow                                     | Assertions                                          |
| ---------------------------- | ---------------------------------------- | --------------------------------------------------- |
| Register new account         | Fill register form, submit               | Redirects to dashboard, session cookie set          |
| Login with valid credentials | Fill login form, submit                  | Redirects to dashboard, username visible in sidebar |
| Login with wrong password    | Submit bad credentials                   | Error message shown, stays on login page            |
| Unauthenticated redirect     | Navigate to `/bookshelf` without session | Redirects to `/login`                               |
| Session persistence          | Login, reload page                       | Still authenticated, no redirect                    |
| Logout                       | Click logout in sidebar                  | Redirects to login, protected routes inaccessible   |

### 02-settings-config.spec.ts

**Download Clients:**

| Test                        | Flow                                 | Assertions                         |
| --------------------------- | ------------------------------------ | ---------------------------------- |
| Add qBittorrent client      | Fill form with fake server URL, save | Client appears in list             |
| Test qBittorrent connection | Click "Test" button                  | Success message with version shown |
| Add SABnzbd client          | Fill form with fake server URL, save | Client appears in list             |
| Test SABnzbd connection     | Click "Test"                         | Success with version               |
| Add Transmission client     | Fill form, save, test                | Success                            |
| Add Deluge client           | Fill form, save, test                | Success                            |
| Add rTorrent client         | Fill form, save, test                | Success                            |
| Add NZBGet client           | Fill form, save, test                | Success                            |
| Edit download client        | Change name/category, save           | Updated values persist on reload   |
| Delete download client      | Delete, confirm                      | Removed from list                  |
| Test connection failure     | Point to wrong port, test            | Error message shown                |

**Indexers:**

| Test                              | Flow                                  | Assertions              |
| --------------------------------- | ------------------------------------- | ----------------------- |
| Add Newznab indexer               | Fill form with fake Newznab URL, save | Indexer appears in list |
| Test indexer connection           | Click "Test"                          | Success message         |
| Add Torznab indexer               | Fill form, save, test                 | Success                 |
| Configure indexer categories      | Set categories, save                  | Values persist          |
| Assign indexer to download client | Select client override, save          | Persists                |
| Delete indexer                    | Delete, confirm                       | Removed                 |

**Prowlarr Sync:**

| Test                               | Flow                                          | Assertions                     |
| ---------------------------------- | --------------------------------------------- | ------------------------------ |
| Configure Prowlarr connection      | Enter fake Prowlarr URL in settings           | Connection established         |
| Sync indexers from Prowlarr        | Trigger sync                                  | Synced indexers appear in list |
| Override synced indexer tag/client | Set tag and download client on synced indexer | Persists, used during search   |

**Download Profiles:**

| Test                    | Flow                                               | Assertions              |
| ----------------------- | -------------------------------------------------- | ----------------------- |
| Create download profile | Fill name, root folder, select formats, set cutoff | Profile appears in list |
| Edit profile            | Change cutoff, toggle upgrade                      | Updated values persist  |
| Delete profile          | Delete, confirm                                    | Removed                 |

**Metadata Profile:**

| Test                         | Flow                           | Assertions |
| ---------------------------- | ------------------------------ | ---------- |
| Update language filters      | Select allowed languages, save | Persists   |
| Set minimum pages/popularity | Enter values, save             | Persists   |

**General Settings:**

| Test                             | Flow                            | Assertions    |
| -------------------------------- | ------------------------------- | ------------- |
| Generate API key                 | Click regenerate                | New key shown |
| Update media management settings | Toggle hard links, rename books | Persists      |

### 03-author-book-import.spec.ts

_Prerequisite: download profile and download client seeded in DB_

| Test                              | Flow                                           | Assertions                                                                       |
| --------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Search for author on Hardcover    | Type query in search bar                       | Mocked results appear (authors + books)                                          |
| View Hardcover author detail      | Click author result                            | Author page shows with books, edition counts                                     |
| Import author                     | Click "Add Author" on Hardcover author page    | Author appears in bookshelf with books and editions filtered by metadata profile |
| Metadata filtering applied        | Import author with restrictive language filter | Only matching-language editions imported                                         |
| Import single book                | From Hardcover author page, add one book       | Book + editions appear under existing author                                     |
| Browse bookshelf authors          | Navigate to authors index                      | Authors listed with book counts, profile badges                                  |
| Browse bookshelf books            | Navigate to books index                        | Books listed with author, edition count, file status                             |
| View book detail                  | Click into a book                              | Editions tab, files tab, series info visible                                     |
| Edit author                       | Change monitored status                        | Updated on reload                                                                |
| Assign download profile to author | Select profile on author page                  | Profile badge appears, propagates to books                                       |
| Toggle edition profile            | Toggle profile on specific edition             | Edition marked as wanted/unwanted                                                |
| Delete author                     | Delete author, confirm                         | Author + books removed from bookshelf                                            |

### 04-search-grab.spec.ts

_Prerequisite: seeded author/book, indexer pointing at fake Newznab, download client pointing at fake qBittorrent_

| Test                                       | Flow                                         | Assertions                                                                                        |
| ------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Interactive search for book                | Click "Search" on book detail page           | Fake Newznab returns releases, displayed with quality scores                                      |
| Release quality scoring                    | Search returns mixed formats                 | Releases sorted by score, rejections shown with reasons                                           |
| Grab release (torrent)                     | Click "Grab" on a release                    | Fake qBittorrent receives `addDownload`, tracked download created, history "bookGrabbed" recorded |
| Grab release (usenet)                      | Swap indexer to usenet protocol, grab        | Fake SABnzbd receives `addurl`, tracked download created                                          |
| Indexer priority ordering                  | Two indexers with different priorities       | Higher-priority results shown first                                                               |
| Blocked release not shown                  | Add release to blocklist, re-search          | Release marked as blocked                                                                         |
| Search with synced indexer                 | Enable synced indexer alongside manual       | Both return results, deduplication applied                                                        |
| Grab with indexer-specific client override | Indexer assigned to specific download client | Grab uses that client, not default                                                                |

### 05-queue-management.spec.ts

_Prerequisite: seeded tracked downloads, fake qBittorrent and SABnzbd with active items_

| Test                             | Flow                               | Assertions                                                  |
| -------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| View queue with active downloads | Navigate to Activity page          | Downloads listed with progress, speed, ETA                  |
| SSE real-time progress           | Fake server updates progress       | UI updates without page reload                              |
| Pause download                   | Click pause on torrent item        | Fake qBittorrent receives pause call, UI shows paused state |
| Resume download                  | Click resume                       | Fake qBittorrent receives resume, UI shows downloading      |
| Remove from queue                | Click remove, confirm              | Removed from UI and tracked downloads                       |
| Remove and blocklist             | Click remove with blocklist option | Added to blocklist                                          |
| Mixed client queue               | qBittorrent + SABnzbd items        | Both shown in unified queue with client labels              |
| Connection warning banner        | Stop fake server, trigger refresh  | Warning banner appears with client name                     |
| Dismiss warning banner           | Click dismiss on banner            | Banner hidden                                               |

### 06-auto-search.spec.ts

_Prerequisite: seeded author with books, editions with download profiles, indexer + download client configured_

| Test                               | Flow                                                    | Assertions                                                                                     |
| ---------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Wanted books identified            | Edition has profile but no files                        | Book appears in wanted list                                                                    |
| RSS sync finds and grabs           | Trigger RSS sync task manually                          | Fake Newznab searched, best release grabbed via fake download client, tracked download created |
| Auto-search respects cutoff        | Book already has file at cutoff quality                 | Not searched (already satisfied)                                                               |
| Auto-search upgrades below cutoff  | Book has file below cutoff, upgrade allowed             | Searched, better release grabbed                                                               |
| Auto-search skips upgrade-disabled | Book has file below cutoff, upgrade disabled on profile | Not searched                                                                                   |
| Blocklisted release skipped        | Best release is blocklisted                             | Next-best release grabbed instead                                                              |
| Multiple indexers searched         | Manual + synced indexers enabled                        | Both searched with 1s delay between, results deduplicated                                      |
| No grab when no acceptable release | All releases rejected by profile                        | No tracked download created, search recorded in history                                        |
| Search limited by maxBooks         | Large library, trigger auto-search                      | Only processes up to limit                                                                     |

### 07-download-lifecycle.spec.ts

_Prerequisite: seeded tracked download in "queued" state, fake download client, real temp dir for root folder_

| Test                                      | Flow                                                                         | Assertions                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Download progresses queued to downloading | Fake client reports downloading state                                        | Tracked download updated, SSE `queueProgress` emitted                                         |
| Download completes                        | Fake client reports completed + output path with dummy book file in temp dir | Tracked download state updated to completed                                                   |
| File imported to library                  | Completion triggers file import                                              | File copied/linked to root folder per naming template, `bookFiles` entry created with quality |
| History recorded on import                | After successful import                                                      | History entries: "bookGrabbed", "downloadCompleted", "fileImported"                           |
| SSE events fired                          | Full lifecycle                                                               | `queueProgress`, `downloadCompleted`, `importCompleted` events captured                       |
| Completed download removed from client    | `removeCompletedDownloads` enabled on client                                 | Fake client receives `removeDownload` call                                                    |
| Naming template applied                   | Custom naming template in settings                                           | Imported file path matches template pattern                                                   |
| Hard links vs copy                        | `useHardLinks` setting toggled                                               | Verify link count (hard link) vs separate inode (copy)                                        |

### 08-disk-scan.spec.ts

_Prerequisite: seeded author/book in DB, real temp dir as root folder with dummy files_

| Test                        | Flow                                                           | Assertions                                         |
| --------------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| Scan discovers new files    | Place `Author/Book (2020)/book.epub` in temp dir, trigger scan | `bookFiles` entry created, matched to correct book |
| Quality matched from file   | Place `.epub` file                                             | Quality ID matches EPUB format definition          |
| Multiple formats discovered | Place `.epub` + `.mobi` for same book                          | Both files recorded                                |
| Unmatched file reported     | Place file under unknown author folder                         | Scan stats show unmatched file                     |
| Removed file detected       | Delete a previously-scanned file, re-scan                      | `bookFiles` entry removed, history "fileRemoved"   |
| Scan updates changed files  | Replace file with different size, re-scan                      | `bookFiles` entry updated                          |
| History entries created     | After scan with changes                                        | "fileAdded" / "fileRemoved" events in history      |

### 09-system-health.spec.ts

_Prerequisite: various states of configuration_

| Test                            | Flow                               | Assertions                                                               |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Healthy system status           | All configured correctly           | No warnings/errors on status page                                        |
| Missing Hardcover token warning | No token in settings               | Health warning shown                                                     |
| No indexers warning             | Delete all indexers                | Health warning about no indexers                                         |
| No download clients warning     | Delete all clients                 | Health warning about no download clients                                 |
| Root folder missing warning     | Profile points to nonexistent path | Health warning shown                                                     |
| Disk space displayed            | Root folder exists in temp dir     | Disk space bar shown with free/total                                     |
| System about info               | Navigate to system status          | Version, Bun version, SQLite version, DB path, OS info, uptime displayed |
| Scheduled tasks displayed       | Navigate to tasks page             | All 7 tasks listed with last execution, interval, enabled status         |
| Run task manually               | Click "Run Now" on a task          | Task executes, last execution updated                                    |

### 10-blocklist-failure.spec.ts

_Prerequisite: seeded tracked download, fake download client, indexer configured_

| Test                                   | Flow                                    | Assertions                                                   |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| Failed download detected               | Fake client reports failed state        | Tracked download marked failed, SSE `downloadFailed` emitted |
| Auto-blocklist on failure              | `redownloadFailed` enabled              | Failed release added to blocklist automatically              |
| Auto re-search on failure              | `redownloadFailed` enabled              | Auto-search triggered for the book, grabs next-best release  |
| Failed download removed from client    | `removeFailed` enabled                  | Fake client receives `removeDownload` call                   |
| View blocklist page                    | Navigate to Activity > Blocklist        | Entries shown with source title, indexer, date, reason       |
| Remove from blocklist                  | Click remove on entry                   | Entry removed                                                |
| Bulk remove from blocklist             | Select multiple, bulk remove            | All selected removed                                         |
| Manual add to blocklist                | Remove from queue with blocklist option | Entry appears with "Manually removed" reason                 |
| Blocklisted release rejected in search | Search for book with blocklisted GUID   | Release shown as blocked, not grabbable                      |
