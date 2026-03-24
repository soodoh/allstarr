# Phase 5: Advanced Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cross-content Activity filters, root folder file-move with confirmation dialog, TMDB attribution, and polish the Activity section descriptions for multi-media.

**Architecture:** Activity pages get content-type filter tabs (All/Books/TV/Movies). Profile edit gains a root folder change handler that detects affected files and shows a confirmation dialog before moving them. TMDB attribution is added to the System > Status page or a new About section.

**Tech Stack:** TanStack Start, shadcn/ui, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-23-multi-media-support-design.md` (Sections 10, 13)

**Deferred to future sessions:** Custom format scoring system (needs its own brainstorm/spec — it's essentially Radarr v3 Custom Formats, a significant feature), Interactive search refinements (needs UI for release comparison table, depends on indexer search being wired up for video content).

---

## File Map

### Files to Create

| File                                              | Responsibility                                          |
| ------------------------------------------------- | ------------------------------------------------------- |
| `src/components/activity/content-type-filter.tsx` | Reusable content type filter tabs (All/Books/TV/Movies) |

### Files to Modify

| File                                                                  | What Changes                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/components/activity/history-tab.tsx`                             | Add content type filter                                    |
| `src/components/activity/queue-tab.tsx`                               | Add content type filter                                    |
| `src/components/activity/blocklist-tab.tsx`                           | Add content type filter                                    |
| `src/routes/_authed/activity/history.tsx`                             | Update description for multi-media                         |
| `src/components/settings/download-profiles/download-profile-form.tsx` | Root folder change detection + confirmation dialog         |
| `src/server/download-profiles.ts`                                     | Add server function to move files when root folder changes |
| `src/routes/_authed/system/status.tsx`                                | Add TMDB attribution                                       |

---

## Tasks

### Task 1: Content Type Filter Component

**Files:**

- Create: `src/components/activity/content-type-filter.tsx`

- [ ] **Step 1: Create reusable filter component**

Create a content type filter that can be dropped into any Activity tab:

```typescript
type ContentTypeFilterProps = {
  value: "all" | "books" | "tv" | "movies";
  onChange: (value: "all" | "books" | "tv" | "movies") => void;
};
```

UI: A row of toggle buttons or shadcn Tabs:

- All (default), Books (BookMarked icon), TV (Tv icon), Movies (Film icon)
- Compact styling, sits above the table/content area
- Follow the existing filter pattern in history-tab (Select dropdown) or use a small TabsList

- [ ] **Step 2: Commit**

```bash
git add src/components/activity/content-type-filter.tsx
git commit -m "feat: add reusable content type filter component"
```

---

### Task 2: Activity History Content Filter

**Files:**

- Modify: `src/components/activity/history-tab.tsx`
- Modify: `src/routes/_authed/activity/history.tsx`

- [ ] **Step 1: Add content type filter to history tab**

Read `src/components/activity/history-tab.tsx`. Add the ContentTypeFilter above the existing event type filter.

Filter logic:

- "all": show all events (default, current behavior)
- "books": show events where data includes bookId or authorId, or event type starts with "author"/"book"
- "tv": show events where event type starts with "show"/"episode"
- "movies": show events where event type starts with "movie"

This filtering can be done client-side on the returned data, or passed as a query parameter to the server. Client-side is simpler and sufficient for now.

- [ ] **Step 2: Update history page description**

In `src/routes/_authed/activity/history.tsx`, change description from "Activity log for your bookshelf" to "Activity log for your library".

- [ ] **Step 3: Commit**

```bash
git add src/components/activity/history-tab.tsx src/routes/_authed/activity/history.tsx
git commit -m "feat: add content type filter to activity history"
```

---

### Task 3: Activity Queue and Blocklist Content Filters

**Files:**

- Modify: `src/components/activity/queue-tab.tsx`
- Modify: `src/components/activity/blocklist-tab.tsx`

- [ ] **Step 1: Add content type filter to queue tab**

Read `src/components/activity/queue-tab.tsx`. Add ContentTypeFilter.

Filter queue items by content type:

- Queue items have `bookId`, `showId`, `episodeId`, or `movieId` fields (added in Phase 2)
- "books": items with bookId set
- "tv": items with showId or episodeId set
- "movies": items with movieId set
- "all": all items

- [ ] **Step 2: Add content type filter to blocklist tab**

Read `src/components/activity/blocklist-tab.tsx`. Add ContentTypeFilter.

Filter blocklist items similarly using their bookId/showId/movieId fields.

- [ ] **Step 3: Commit**

```bash
git add src/components/activity/queue-tab.tsx src/components/activity/blocklist-tab.tsx
git commit -m "feat: add content type filter to queue and blocklist"
```

---

### Task 4: Root Folder File-Move on Profile Edit

**Files:**

- Modify: `src/server/download-profiles.ts`
- Modify: `src/components/settings/download-profiles/download-profile-form.tsx`

- [ ] **Step 1: Add file-move server function**

Read `src/server/download-profiles.ts`. Add a new server function `moveProfileFilesFn`:

Input: `{ profileId: number, oldRootFolder: string, newRootFolder: string }`

Logic:

1. Find all files associated with this profile:
   - For book profiles: query book_files through authors -> author_download_profiles -> books -> book_files where the file path starts with oldRootFolder
   - For TV profiles: query episode_files through shows -> show_download_profiles -> episodes -> episode_files
   - For movie profiles: query movie_files through movies -> movie_download_profiles -> movie_files
2. For each affected file:
   - Compute new path: replace oldRootFolder prefix with newRootFolder
   - Create destination directory if needed (fs.mkdirSync recursive)
   - Move file (fs.renameSync, fallback to copy+delete for cross-device moves)
   - Update the file record's path in the DB
3. Update the `path` cache column on shows/movies if applicable
4. Return: `{ movedCount: number, errors: string[] }`

- [ ] **Step 2: Add confirmation dialog to profile form**

Read `src/components/settings/download-profiles/download-profile-form.tsx`.

When saving a profile and the rootFolderPath has changed from the initial value:

1. Before submitting, check if there are existing files under the old root (could call a lightweight server function or check client-side if data is available)
2. Show a ConfirmDialog: "Root folder changed from {old} to {new}. Move X files to the new location?"
3. Options: "Move Files" (calls moveProfileFilesFn then saves profile), "Don't Move" (just saves profile without moving), "Cancel" (abort save)
4. Show progress/loading state during move

- [ ] **Step 3: Commit**

```bash
git add src/server/download-profiles.ts src/components/settings/download-profiles/download-profile-form.tsx
git commit -m "feat: add root folder file-move with confirmation on profile edit"
```

---

### Task 5: TMDB Attribution

**Files:**

- Modify: `src/routes/_authed/system/status.tsx`

- [ ] **Step 1: Add TMDB attribution**

Read `src/routes/_authed/system/status.tsx`.

Add a section at the bottom of the system status page (or in an "About" card):

```
Powered by
[TMDB logo or text link] — "This product uses the TMDB API but is not endorsed or certified by TMDB."
[Hardcover text link] — "Book metadata provided by Hardcover."
```

Per TMDB terms of use, the attribution must be visible. A simple text line in the system status page is sufficient.

Use a Card with CardHeader "Attribution" and CardContent with the text and links:

- TMDB: link to `https://www.themoviedb.org/`
- Hardcover: link to `https://hardcover.app/`

- [ ] **Step 2: Commit**

```bash
git add src/routes/_authed/system/status.tsx
git commit -m "feat: add TMDB and Hardcover attribution to system status"
```

---

### Task 6: Build Verification

- [ ] **Step 1: Run build**

Run: `bun run build`
Expected: Clean build.

- [ ] **Step 2: Smoke test**

Run: `bun run dev`
Verify:

- Activity > History has content type filter (All/Books/TV/Movies)
- Activity > Queue has content type filter
- Activity > Blocklist has content type filter
- Profile edit: changing root folder shows confirmation dialog
- System > Status shows TMDB/Hardcover attribution

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: Phase 5 integration fixes"
```
