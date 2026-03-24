# Media Profile Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make profile selection consistent across all media types — multiselect checkboxes filtered by content type, with edit capability on detail pages.

**Architecture:** Extract a shared `ProfileCheckboxGroup` component. Update Zod schemas and server functions from singular `downloadProfileId` to plural `downloadProfileIds`. Add edit dialogs to show/movie detail headers.

**Tech Stack:** React, TanStack Start server functions, Drizzle ORM, Zod, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-23-media-profiles-design.md`

---

### Task 1: Create Shared ProfileCheckboxGroup Component

**Files:**

- Create: `src/components/shared/profile-checkbox-group.tsx`

- [ ] **Step 1: Create the shared component**

```tsx
// src/components/shared/profile-checkbox-group.tsx
import type { JSX } from "react";
import Checkbox from "src/components/ui/checkbox";
import Label from "src/components/ui/label";
import { getProfileIcon } from "src/lib/profile-icons";

type ProfileCheckboxGroupProps = {
  profiles: Array<{ id: number; name: string; icon: string }>;
  selectedIds: number[];
  onToggle: (id: number) => void;
  label?: string;
};

export default function ProfileCheckboxGroup({
  profiles,
  selectedIds,
  onToggle,
  label = "Download Profiles",
}: ProfileCheckboxGroupProps): JSX.Element {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No download profiles available.
        </p>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => {
            const Icon = getProfileIcon(p.icon);
            return (
              <label
                key={p.id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Checkbox
                  checked={selectedIds.includes(p.id)}
                  onCheckedChange={() => onToggle(p.id)}
                />
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{p.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: Builds successfully (component is not yet imported anywhere)

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/profile-checkbox-group.tsx
git commit -m "feat: add shared ProfileCheckboxGroup component"
```

---

### Task 2: Filter Author/Book Profiles and Use Shared Component

**Files:**

- Modify: `src/components/bookshelf/hardcover/author-preview-modal.tsx`
- Delete: `src/components/bookshelf/hardcover/add-author-dialog.tsx`
- Modify: `src/components/bookshelf/hardcover/book-preview-modal.tsx`
- Modify: `src/components/bookshelf/authors/author-form.tsx`
- Modify: `src/routes/_authed/bookshelf/authors/$authorId.tsx`

- [ ] **Step 1: Update `author-preview-modal.tsx` — filter profiles and use shared component**

In `AddForm` (line 45-46), filter the query result and replace the checkbox rendering:

```tsx
// Replace this:
const { data: downloadProfiles = [] } = useQuery(downloadProfilesListQuery());

// With this:
const { data: allProfiles = [] } = useQuery(downloadProfilesListQuery());
const downloadProfiles = allProfiles.filter(
  (p) => p.contentType === "book" && p.enabled,
);
```

Replace the entire checkbox section (lines 72-96) with:

```tsx
<ProfileCheckboxGroup
  profiles={downloadProfiles}
  selectedIds={downloadProfileIds}
  onToggle={toggleProfile}
/>
```

Remove unused imports: `Checkbox`, `Label`, `getProfileIcon`.
Add import: `import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";`

- [ ] **Step 2: Delete `add-author-dialog.tsx`**

This component (`AddAuthorDialog`) is never imported or used anywhere in the codebase — it's dead code. Delete it:

```bash
rm src/components/bookshelf/hardcover/add-author-dialog.tsx
```

- [ ] **Step 3: Update `book-preview-modal.tsx` — filter profiles and use shared component**

In `AddBookForm` (line 45), filter the query result:

```tsx
const { data: allProfiles = [] } = useQuery(downloadProfilesListQuery());
const downloadProfiles = allProfiles.filter(
  (p) => p.contentType === "book" && p.enabled,
);
```

Replace the checkbox rendering (lines 82-98) with:

```tsx
<ProfileCheckboxGroup
  profiles={downloadProfiles}
  selectedIds={downloadProfileIds}
  onToggle={toggleProfile}
/>
```

Remove unused imports: `Checkbox`, `Label`, `getProfileIcon`.
Add import: `import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";`

- [ ] **Step 4: Update `author-form.tsx` — use shared component**

Replace the entire checkbox rendering (lines 44-69) with:

```tsx
<ProfileCheckboxGroup
  profiles={downloadProfiles}
  selectedIds={downloadProfileIds}
  onToggle={toggleProfile}
/>
```

Remove unused imports: `Checkbox`, `Label`, `getProfileIcon`.
Add import: `import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";`

- [ ] **Step 5: Update `$authorId.tsx` — filter profiles passed to AuthorForm**

At line 1513, the `AuthorForm` receives unfiltered `downloadProfiles`. Filter only the prop passed to the form:

```tsx
// Replace:
downloadProfiles={downloadProfiles}

// With:
downloadProfiles={downloadProfiles?.filter(
  (p) => p.contentType === "book" && p.enabled,
) ?? []}
```

Do NOT filter `downloadProfiles` used for `profileLanguages` (line 1293) or `authorDownloadProfiles` (line 1306-1312) — those need all profiles.

- [ ] **Step 6: Verify build**

Run: `bun run build`
Expected: Builds successfully

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: filter author/book profiles by content type and use shared component"
```

---

### Task 3: Update Schemas, Server Functions, and Show/Movie Add Modals

All changes in this task must be done together — the Zod schemas, server functions, and UI call sites all reference `downloadProfileId` and must be updated to `downloadProfileIds` atomically.

**Files:**

- Modify: `src/lib/tmdb-validators.ts`
- Modify: `src/server/shows.ts`
- Modify: `src/server/movies.ts`
- Modify: `src/components/tv/tmdb-show-search.tsx`
- Modify: `src/components/movies/tmdb-movie-search.tsx`

- [ ] **Step 1: Update Zod schemas**

In `src/lib/tmdb-validators.ts`, change all four schemas:

```tsx
// addShowSchema: line 5
// Change: downloadProfileId: z.number(),
// To:
downloadProfileIds: z.array(z.number()),

// updateShowSchema: line 22
// Change: downloadProfileId: z.number().optional(),
// To:
downloadProfileIds: z.array(z.number()).optional(),

// addMovieSchema: line 32
// Change: downloadProfileId: z.number(),
// To:
downloadProfileIds: z.array(z.number()),

// updateMovieSchema: line 44
// Change: downloadProfileId: z.number().optional(),
// To:
downloadProfileIds: z.array(z.number()).optional(),
```

- [ ] **Step 2: Update `addShowFn` in `src/server/shows.ts`**

Replace the single junction insert (lines 234-240):

```tsx
// Replace:
db.insert(showDownloadProfiles)
  .values({
    showId: show.id,
    downloadProfileId: data.downloadProfileId,
  })
  .run();

// With:
for (const profileId of data.downloadProfileIds) {
  db.insert(showDownloadProfiles)
    .values({ showId: show.id, downloadProfileId: profileId })
    .run();
}
```

- [ ] **Step 3: Update `updateShowFn` in `src/server/shows.ts`**

Replace the update logic (lines 399-420):

```tsx
// Change destructure:
const { id, downloadProfileIds, ...updates } = data;

// Replace the junction update block:
if (downloadProfileIds !== undefined) {
  db.delete(showDownloadProfiles)
    .where(eq(showDownloadProfiles.showId, id))
    .run();
  for (const profileId of downloadProfileIds) {
    db.insert(showDownloadProfiles)
      .values({ showId: id, downloadProfileId: profileId })
      .run();
  }
}
```

- [ ] **Step 4: Update `addMovieFn` in `src/server/movies.ts`**

Replace the single junction insert (lines 104-110):

```tsx
for (const profileId of data.downloadProfileIds) {
  db.insert(movieDownloadProfiles)
    .values({ movieId: movie.id, downloadProfileId: profileId })
    .run();
}
```

- [ ] **Step 5: Update `updateMovieFn` in `src/server/movies.ts`**

Replace the update logic (lines 200-221):

```tsx
const { id, downloadProfileIds, ...updates } = data;

// Replace the junction update block:
if (downloadProfileIds !== undefined) {
  db.delete(movieDownloadProfiles)
    .where(eq(movieDownloadProfiles.movieId, id))
    .run();
  for (const profileId of downloadProfileIds) {
    db.insert(movieDownloadProfiles)
      .values({ movieId: id, downloadProfileId: profileId })
      .run();
  }
}
```

- [ ] **Step 6: Update `ShowPreviewModal` in `tmdb-show-search.tsx`**

Replace imports — remove `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`. Add:

```tsx
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
```

Replace the state (lines 88-89):

```tsx
// Remove:
const [downloadProfileId, setDownloadProfileId] = useState<string>("");

// Add:
const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>([]);
```

Replace the `useEffect` auto-select (lines 93-97):

```tsx
useEffect(() => {
  if (tvProfiles.length > 0 && downloadProfileIds.length === 0) {
    setDownloadProfileIds(tvProfiles.map((p) => p.id));
  }
}, [tvProfiles, downloadProfileIds.length]);
```

Add toggle helper:

```tsx
const toggleProfile = (id: number) => {
  setDownloadProfileIds((prev) =>
    prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
  );
};
```

Update `handleAdd` (lines 101-129):

```tsx
const handleAdd = () => {
  if (downloadProfileIds.length === 0) {
    return;
  }
  addShow.mutate(
    {
      tmdbId: show.id,
      downloadProfileIds,
      monitorOption: monitorOption as
        | "all"
        | "future"
        | "missing"
        | "existing"
        | "pilot"
        | "firstSeason"
        | "lastSeason"
        | "none",
    },
    {
      onSuccess: (result) => {
        onOpenChange(false);
        navigate({
          to: "/tv/series/$showId",
          params: { showId: String(result.id) },
        });
      },
    },
  );
};
```

Replace the Download Profile `<Select>` block (lines 199-221) with:

```tsx
<ProfileCheckboxGroup
  profiles={tvProfiles}
  selectedIds={downloadProfileIds}
  onToggle={toggleProfile}
/>
```

Update the submit button disabled condition:

```tsx
disabled={
  downloadProfileIds.length === 0 ||
  addShow.isPending ||
  tvProfiles.length === 0
}
```

Keep the `Label` import — it's still used for Monitoring and Series Type labels.

- [ ] **Step 7: Update `MoviePreviewModal` in `tmdb-movie-search.tsx`**

Same pattern as Step 6. Replace imports — remove `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`. Add:

```tsx
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
```

Replace state (line 69):

```tsx
const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>([]);
```

Replace `useEffect` (lines 74-78):

```tsx
useEffect(() => {
  if (movieProfiles.length > 0 && downloadProfileIds.length === 0) {
    setDownloadProfileIds(movieProfiles.map((p) => p.id));
  }
}, [movieProfiles, downloadProfileIds.length]);
```

Add toggle helper:

```tsx
const toggleProfile = (id: number) => {
  setDownloadProfileIds((prev) =>
    prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
  );
};
```

Update `handleAdd` (lines 82-105):

```tsx
const handleAdd = () => {
  if (downloadProfileIds.length === 0) {
    return;
  }
  addMovie.mutate(
    {
      tmdbId: movie.id,
      downloadProfileIds,
      minimumAvailability: minimumAvailability as
        | "announced"
        | "inCinemas"
        | "released",
    },
    {
      onSuccess: (result) => {
        onOpenChange(false);
        navigate({
          to: "/movies/$movieId",
          params: { movieId: String(result.id) },
        });
      },
    },
  );
};
```

Replace the Download Profile `<Select>` block (lines 177-194) with:

```tsx
<ProfileCheckboxGroup
  profiles={movieProfiles}
  selectedIds={downloadProfileIds}
  onToggle={toggleProfile}
/>
```

Update button disabled condition:

```tsx
disabled={
  downloadProfileIds.length === 0 ||
  addMovie.isPending ||
  movieProfiles.length === 0
}
```

- [ ] **Step 8: Verify build**

Run: `bun run build`
Expected: Builds successfully — all schemas, server functions, and call sites updated together

- [ ] **Step 9: Commit**

```bash
git add src/lib/tmdb-validators.ts src/server/shows.ts src/server/movies.ts src/components/tv/tmdb-show-search.tsx src/components/movies/tmdb-movie-search.tsx
git commit -m "feat: convert show/movie profile selection to multiselect"
```

---

### Task 4: Add Edit Profile Dialog to Show Detail Header

**Files:**

- Modify: `src/components/tv/show-detail-header.tsx`

- [ ] **Step 1: Expand types, add state, and add edit dialog**

Update the `DownloadProfile` type (line 41-44):

```tsx
type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
  contentType: string;
  enabled: boolean;
};
```

Add imports:

```tsx
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
```

Add state and toggle logic inside the component:

```tsx
const [editProfilesOpen, setEditProfilesOpen] = useState(false);
const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>(
  show.downloadProfileIds,
);

const tvProfiles = downloadProfiles.filter(
  (p) => p.contentType === "tv" && p.enabled,
);

const toggleProfile = (id: number) => {
  setSelectedProfileIds((prev) =>
    prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
  );
};

const handleSaveProfiles = () => {
  updateShow.mutate(
    { id: show.id, downloadProfileIds: selectedProfileIds },
    {
      onSuccess: () => {
        setEditProfilesOpen(false);
        router.invalidate();
      },
    },
  );
};
```

Replace the read-only profile display (lines 221-226) — add an edit button:

```tsx
{
  profileNames.length > 0 && (
    <div className="flex justify-between gap-4 items-center">
      <dt className="text-muted-foreground">Download Profiles</dt>
      <dd className="flex items-center gap-2">
        <span className="text-right">{profileNames.join(", ")}</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            setSelectedProfileIds(show.downloadProfileIds);
            setEditProfilesOpen(true);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </dd>
    </div>
  );
}
```

Add the edit dialog before the delete `ConfirmDialog`:

```tsx
<Dialog open={editProfilesOpen} onOpenChange={setEditProfilesOpen}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>Edit Download Profiles</DialogTitle>
    </DialogHeader>
    <ProfileCheckboxGroup
      profiles={tvProfiles}
      selectedIds={selectedProfileIds}
      onToggle={toggleProfile}
    />
    <DialogFooter>
      <Button variant="outline" onClick={() => setEditProfilesOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleSaveProfiles} disabled={updateShow.isPending}>
        {updateShow.isPending ? "Saving..." : "Save"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: Builds successfully. The parent route (`$showId.tsx`) passes `downloadProfiles` from `downloadProfilesListQuery()` which returns full objects including `icon`, `contentType`, and `enabled`.

- [ ] **Step 3: Commit**

```bash
git add src/components/tv/show-detail-header.tsx
git commit -m "feat: add edit profile dialog to show detail header"
```

---

### Task 5: Add Edit Profile Dialog to Movie Detail Header

**Files:**

- Modify: `src/components/movies/movie-detail-header.tsx`

- [ ] **Step 1: Same pattern as Task 4 for movies**

Update the `DownloadProfile` type (line 36-39):

```tsx
type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
  contentType: string;
  enabled: boolean;
};
```

Add imports:

```tsx
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
```

Add state and logic inside the component:

```tsx
const [editProfilesOpen, setEditProfilesOpen] = useState(false);
const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>(
  movie.downloadProfileIds,
);

const movieProfiles = downloadProfiles.filter(
  (p) => p.contentType === "movie" && p.enabled,
);

const toggleProfile = (id: number) => {
  setSelectedProfileIds((prev) =>
    prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
  );
};

const handleSaveProfiles = () => {
  updateMovie.mutate(
    { id: movie.id, downloadProfileIds: selectedProfileIds },
    {
      onSuccess: () => {
        setEditProfilesOpen(false);
        router.invalidate();
      },
    },
  );
};
```

Replace the read-only profile display (lines 252-257):

```tsx
{
  profileNames.length > 0 && (
    <div className="flex justify-between gap-4 items-center">
      <dt className="text-muted-foreground">Download Profiles</dt>
      <dd className="flex items-center gap-2">
        <span className="text-right">{profileNames.join(", ")}</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            setSelectedProfileIds(movie.downloadProfileIds);
            setEditProfilesOpen(true);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </dd>
    </div>
  );
}
```

Add the edit dialog before the delete `ConfirmDialog`:

```tsx
<Dialog open={editProfilesOpen} onOpenChange={setEditProfilesOpen}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>Edit Download Profiles</DialogTitle>
    </DialogHeader>
    <ProfileCheckboxGroup
      profiles={movieProfiles}
      selectedIds={selectedProfileIds}
      onToggle={toggleProfile}
    />
    <DialogFooter>
      <Button variant="outline" onClick={() => setEditProfilesOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleSaveProfiles} disabled={updateMovie.isPending}>
        {updateMovie.isPending ? "Saving..." : "Save"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: Builds successfully

- [ ] **Step 3: Commit**

```bash
git add src/components/movies/movie-detail-header.tsx
git commit -m "feat: add edit profile dialog to movie detail header"
```

---

### Task 6: Final Build Verification

- [ ] **Step 1: Full build**

Run: `bun run build`
Expected: Clean build with no errors

- [ ] **Step 2: Verify no remaining references to singular `downloadProfileId` in show/movie code**

Run: `grep -rn "downloadProfileId[^s]" src/components/tv/ src/components/movies/ src/server/shows.ts src/server/movies.ts src/lib/tmdb-validators.ts`
Expected: Only matches should be in server files referencing the junction table column name (`downloadProfileId` as a DB column in insert `.values()`), not as an API field.
