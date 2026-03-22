# Book Editions Per Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat editions table with profile-aware edition cards, add per-profile language and type settings, and refactor language filtering from global to per-profile.

**Architecture:** Add `type` and `language` columns to download profiles. New `pickBestEditionForProfile` function handles format-aware edition selection. Editions tab becomes profile cards with a selection modal. Language aggregation replaces global `allowedLanguages`.

**Tech Stack:** TanStack Start, Drizzle ORM (SQLite), React, shadcn/ui, Zod

**Spec:** `docs/superpowers/specs/2026-03-22-book-editions-per-profile-design.md`

---

### Task 1: Schema — Add `type` and `language` to download profiles

**Files:**

- Modify: `src/db/schema/download-profiles.ts`
- Create: `drizzle/0004_download_profile_type_language.sql` (via `bun run db:generate`)

- [ ] **Step 1: Add columns to Drizzle schema**

In `src/db/schema/download-profiles.ts`, add two columns after `categories`:

```typescript
type: text("type").notNull().default("ebook"),
language: text("language").notNull().default("en"),
```

- [ ] **Step 2: Generate migration**

Run: `bun run db:generate`
Expected: New migration SQL file created in `drizzle/` with ALTER TABLE statements adding `type` and `language` columns.

- [ ] **Step 3: Run migration**

Run: `bun run db:migrate`
Expected: Migration applies cleanly. Existing rows get `type='ebook'` and `language='en'`.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/download-profiles.ts drizzle/
git commit -m "feat: add type and language columns to download profiles"
```

---

### Task 2: Validators — Add `type` and `language` to profile schemas

**Files:**

- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Add type and language to `downloadProfileBaseSchema`**

In `src/lib/validators.ts`, add to `downloadProfileBaseSchema` (after line 11):

```typescript
type: z.enum(["ebook", "audiobook"]),
language: z.string().min(2).max(3),
```

- [ ] **Step 2: Verify app starts**

Run: `bun run dev`
Expected: App starts without errors. The profiles page may error since the form doesn't pass `type`/`language` yet — that's addressed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validators.ts
git commit -m "feat: add type and language validators for download profiles"
```

---

### Task 3: Server — New `getProfileLanguages` helper and language refactor

**Files:**

- Create: `src/server/profile-languages.ts`
- Modify: `src/server/metadata-profile.ts`
- Modify: `src/server/import.ts`
- Modify: `src/server/search.ts`
- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Create `getProfileLanguages` helper**

Create `src/server/profile-languages.ts`:

```typescript
import { db } from "src/db";
import { downloadProfiles } from "src/db/schema";

/**
 * Returns deduplicated language codes from all download profiles.
 * Replaces the global allowedLanguages setting.
 */
export function getProfileLanguages(): string[] {
  const profiles = db
    .select({ language: downloadProfiles.language })
    .from(downloadProfiles)
    .all();
  return [...new Set(profiles.map((p) => p.language))];
}
```

- [ ] **Step 2: Remove `allowedLanguages` from MetadataProfile**

In `src/server/metadata-profile.ts`:

- Remove `allowedLanguages: string[]` from the `MetadataProfile` type (line 7)
- Remove `allowedLanguages: ["en"]` from `DEFAULT_METADATA_PROFILE` (line 16)

In `src/lib/validators.ts`:

- Remove `allowedLanguages` from `metadataProfileSchema` (lines 70-72)

- [ ] **Step 3: Update `filterEditionsByProfile` in `src/server/import.ts`**

Change the function signature at line 36 to accept a `languages` parameter instead of reading from `profile`:

```typescript
export function filterEditionsByProfile(
  editions: HardcoverRawEdition[],
  profile: MetadataProfile,
  languages: string[],
  defaultCoverEditionId: number | null,
): HardcoverRawEdition[] {
```

Replace `profile.allowedLanguages` references inside the function:

- Line 41: change `profile.allowedLanguages.length > 0` to `languages.length > 0`
- Lines 55-57: change `new Set(profile.allowedLanguages)` to `new Set(languages)`

- [ ] **Step 3b: Update `shouldSkipBook` in `src/server/import.ts`**

The `shouldSkipBook` function (around line 96) also references `profile.allowedLanguages` at line 120:

```typescript
if (filteredEditions.length === 0 && profile.allowedLanguages.length > 0) {
```

This function calls `filterEditionsByProfile` internally. Update it to also accept a `languages: string[]` parameter and pass it through to `filterEditionsByProfile`. Change line 120 to `languages.length > 0`.

- [ ] **Step 4: Update all callers of `filterEditionsByProfile` and `shouldSkipBook`**

Search for all call sites of `filterEditionsByProfile` and `shouldSkipBook` in `src/server/import.ts` and pass `getProfileLanguages()` as the `languages` argument. Import `getProfileLanguages` at the top of the file.

- [ ] **Step 5: Update `src/server/search.ts` language references**

Replace all reads of `profile.allowedLanguages` with `getProfileLanguages()`. Import `getProfileLanguages` at the top. There are 4 call sites:

1. Line 775: `const langCodes = language === "all" ? getProfileLanguages() : [language];`
2. Lines 1752-1753: `const allowedLanguages = getProfileLanguages();` and update `filterByLanguage` check
3. Line 1900: `const langCodes = selectedLanguage === "all" ? getProfileLanguages() : [selectedLanguage];`
4. Line 2188: `const langCodes = hasLanguageFilter ? [language] : getProfileLanguages();`

- [ ] **Step 6: Verify app starts and search works**

Run: `bun run dev`
Navigate to the search page and verify search results still load. Check console for errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/profile-languages.ts src/server/metadata-profile.ts src/server/import.ts src/server/search.ts src/lib/validators.ts
git commit -m "refactor: move language filtering from global setting to per-profile"
```

---

### Task 4: Server — New edition selection server functions

**Files:**

- Modify: `src/server/books.ts`
- Modify: `src/lib/validators.ts`
- Modify: `src/lib/editions.ts`

- [ ] **Step 1: Add `pickBestEditionForProfile` function**

In `src/lib/editions.ts`, add a new type and function below the existing code:

```typescript
/** Edition with enough data for profile-aware selection. */
export type ProfilePickableEdition = {
  id: number;
  languageCode: string | null;
  isDefaultCover: boolean;
  format: string | null;
  usersCount: number | null;
  score: number | null;
};

/** Format sets per profile type. */
const EBOOK_FORMATS = new Set<string | null>(["Physical Book", "E-Book", null]);
const AUDIOBOOK_FORMATS = new Set<string | null>(["Audiobook"]);

function matchesProfileFormat(
  format: string | null,
  profileType: "ebook" | "audiobook",
): boolean {
  return profileType === "audiobook"
    ? AUDIOBOOK_FORMATS.has(format)
    : EBOOK_FORMATS.has(format);
}

function byPopularity(
  a: ProfilePickableEdition,
  b: ProfilePickableEdition,
): number {
  const aScore = (a.usersCount ?? 0) * 1000 + (a.score ?? 0);
  const bScore = (b.usersCount ?? 0) * 1000 + (b.score ?? 0);
  return bScore - aScore;
}

/**
 * Select the best edition for a download profile.
 *
 * 1. Filter to matching format type
 * 2. Prefer isDefaultCover if language matches
 * 3. Next best by popularity with language match
 * 4. If no format match: fallback to all editions with same priority
 * 5. Final fallback: best by popularity regardless of language
 */
export function pickBestEditionForProfile<T extends ProfilePickableEdition>(
  editions: T[],
  profile: { language: string; type: "ebook" | "audiobook" },
): T | undefined {
  if (editions.length === 0) return undefined;

  const formatMatched = editions.filter((e) =>
    matchesProfileFormat(e.format, profile.type),
  );

  const pick = (candidates: T[]): T | undefined => {
    const defaultCover = candidates.find(
      (e) => e.isDefaultCover && e.languageCode === profile.language,
    );
    if (defaultCover) return defaultCover;

    const langMatched = candidates
      .filter((e) => e.languageCode === profile.language)
      .sort(byPopularity);
    if (langMatched.length > 0) return langMatched[0];

    return candidates.sort(byPopularity)[0];
  };

  if (formatMatched.length > 0) {
    return pick(formatMatched);
  }

  // No format match — fall back to all editions
  return pick([...editions]);
}
```

- [ ] **Step 2: Add new Zod schemas in `src/lib/validators.ts`**

Add these schemas (replacing the existing toggle schemas at lines 152-160):

```typescript
// Monitor/unmonitor book profile
export const monitorBookProfileSchema = z.object({
  bookId: z.number(),
  downloadProfileId: z.number(),
});

export const unmonitorBookProfileSchema = z.object({
  bookId: z.number(),
  downloadProfileId: z.number(),
  deleteFiles: z.boolean(),
});

export const setEditionForProfileSchema = z.object({
  editionId: z.number(),
  downloadProfileId: z.number(),
});
```

Remove `toggleBookProfileSchema` and `toggleEditionProfileSchema`.

- [ ] **Step 3: Add `monitorBookProfileFn` server function**

In `src/server/books.ts`, replace `toggleBookProfileFn` (lines 1018-1086) with:

```typescript
export const monitorBookProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => monitorBookProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { bookId, downloadProfileId } = data;

    // Get the profile to know type and language
    const profile = db
      .select()
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, downloadProfileId))
      .get();
    if (!profile) throw new Error("Download profile not found");

    // Get all editions for this book
    const bookEditions = db
      .select()
      .from(editions)
      .where(eq(editions.bookId, bookId))
      .all();

    // Pick best edition for this profile
    const bestEdition = pickBestEditionForProfile(bookEditions, profile);
    if (!bestEdition) throw new Error("No suitable edition found");

    // Remove any existing edition-profile links for this book + profile
    const bookEditionIds = bookEditions.map((e) => e.id);
    if (bookEditionIds.length > 0) {
      db.delete(editionDownloadProfiles)
        .where(
          and(
            inArray(editionDownloadProfiles.editionId, bookEditionIds),
            eq(editionDownloadProfiles.downloadProfileId, downloadProfileId),
          ),
        )
        .run();
    }

    // Insert new link
    db.insert(editionDownloadProfiles)
      .values({ editionId: bestEdition.id, downloadProfileId })
      .run();

    // Record history
    const book = db.select().from(books).where(eq(books.id, bookId)).get();
    if (book) {
      db.insert(history)
        .values({
          eventType: "bookUpdated",
          action: "profile-added",
          bookId,
          data: {
            bookTitle: book.title,
            editionId: bestEdition.id,
            editionTitle: bestEdition.title,
            downloadProfileId,
            profileName: profile.name,
          },
        })
        .run();
    }

    return { bookId, editionId: bestEdition.id };
  });
```

Add these imports to the top of `src/server/books.ts`:

- `import { pickBestEditionForProfile } from "src/lib/editions";`
- Add `downloadProfiles` to the existing `src/db/schema` import (currently missing — other tables like `books`, `editions`, `editionDownloadProfiles` are already imported)
- `and` and `inArray` are already imported from `drizzle-orm`

- [ ] **Step 4: Add `unmonitorBookProfileFn` server function**

In `src/server/books.ts`, add after `monitorBookProfileFn`:

```typescript
export const unmonitorBookProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => unmonitorBookProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { bookId, downloadProfileId, deleteFiles } = data;

    // Get all editions for this book and remove profile links
    const bookEditions = db
      .select({ id: editions.id })
      .from(editions)
      .where(eq(editions.bookId, bookId))
      .all();

    const bookEditionIds = bookEditions.map((e) => e.id);
    if (bookEditionIds.length > 0) {
      db.delete(editionDownloadProfiles)
        .where(
          and(
            inArray(editionDownloadProfiles.editionId, bookEditionIds),
            eq(editionDownloadProfiles.downloadProfileId, downloadProfileId),
          ),
        )
        .run();
    }

    // Optionally delete files
    if (deleteFiles) {
      const files = db
        .select()
        .from(bookFiles)
        .where(eq(bookFiles.bookId, bookId))
        .all();
      const fs = await import("node:fs");
      for (const file of files) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          /* file may not exist */
        }
      }
      db.delete(bookFiles).where(eq(bookFiles.bookId, bookId)).run();
    }

    // Record history
    const profile = db
      .select()
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, downloadProfileId))
      .get();
    const book = db.select().from(books).where(eq(books.id, bookId)).get();
    if (book) {
      db.insert(history)
        .values({
          eventType: "bookUpdated",
          action: "profile-removed",
          bookId,
          data: {
            bookTitle: book.title,
            downloadProfileId,
            profileName: profile?.name,
            filesDeleted: deleteFiles,
          },
        })
        .run();
    }

    return { bookId };
  });
```

Import `bookFiles` from `src/db/schema`.

- [ ] **Step 5: Add `setEditionForProfileFn` server function**

In `src/server/books.ts`, add after `unmonitorBookProfileFn`:

```typescript
export const setEditionForProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => setEditionForProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { editionId, downloadProfileId } = data;

    // Get the edition to find its bookId
    const edition = db
      .select()
      .from(editions)
      .where(eq(editions.id, editionId))
      .get();
    if (!edition) throw new Error("Edition not found");

    // Remove any existing edition-profile links for this book + profile
    const bookEditions = db
      .select({ id: editions.id })
      .from(editions)
      .where(eq(editions.bookId, edition.bookId))
      .all();

    const bookEditionIds = bookEditions.map((e) => e.id);
    if (bookEditionIds.length > 0) {
      db.delete(editionDownloadProfiles)
        .where(
          and(
            inArray(editionDownloadProfiles.editionId, bookEditionIds),
            eq(editionDownloadProfiles.downloadProfileId, downloadProfileId),
          ),
        )
        .run();
    }

    // Insert new link
    db.insert(editionDownloadProfiles)
      .values({ editionId, downloadProfileId })
      .run();

    return { editionId };
  });
```

- [ ] **Step 6: Remove old toggle functions**

Remove `toggleBookProfileFn` (lines 1018-1086) and `toggleEditionProfileFn` (lines 1089-1120) from `src/server/books.ts`. Also remove the old toggle schema imports.

- [ ] **Step 7: Verify the app compiles**

Run: `bun run build`
Expected: Build errors for components still referencing old toggle functions. These will be fixed in later tasks.

- [ ] **Step 8: Commit**

```bash
git add src/lib/editions.ts src/lib/validators.ts src/server/books.ts
git commit -m "feat: add profile-aware edition selection and monitor/unmonitor server functions"
```

---

### Task 5: Hooks — Replace toggle mutations with monitor/unmonitor/set

**Files:**

- Modify: `src/hooks/mutations/books.ts`

- [ ] **Step 1: Replace toggle hooks**

Replace `useToggleBookProfile` and `useToggleEditionProfile` in `src/hooks/mutations/books.ts` with:

```typescript
export function useMonitorBookProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { bookId: number; downloadProfileId: number }) =>
      monitorBookProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to monitor profile"),
  });
}

export function useUnmonitorBookProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      bookId: number;
      downloadProfileId: number;
      deleteFiles: boolean;
    }) => unmonitorBookProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to unmonitor profile"),
  });
}

export function useSetEditionForProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { editionId: number; downloadProfileId: number }) =>
      setEditionForProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
    },
    onError: () => toast.error("Failed to set edition"),
  });
}
```

Update the imports at the top to reference the new server functions instead of the old toggle functions.

- [ ] **Step 2: Update the mutations barrel export**

Check `src/hooks/mutations/index.ts` — update exports if the hook names changed. Replace `useToggleBookProfile`, `useToggleEditionProfile` with the three new hooks.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/mutations/
git commit -m "feat: replace toggle mutations with monitor/unmonitor/setEdition hooks"
```

---

### Task 6: UI — Add type and language to download profile form

**Files:**

- Modify: `src/components/settings/download-profiles/download-profile-form.tsx`
- Modify: `src/routes/_authed/settings/profiles.tsx`
- Create: `src/components/shared/language-single-select.tsx`

- [ ] **Step 1: Create `LanguageSingleSelect` component**

Create `src/components/shared/language-single-select.tsx`:

```typescript
import { LANGUAGES } from "src/lib/languages";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";

type LanguageSingleSelectProps = {
  value: string;
  onChange: (code: string) => void;
};

export default function LanguageSingleSelect({
  value,
  onChange,
}: LanguageSingleSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Add `type` and `language` fields to `DownloadProfileForm`**

In `src/components/settings/download-profiles/download-profile-form.tsx`:

Add `type` and `language` to the `initialValues` type (line 44) and `onSubmit` values type (line 55):

```typescript
type: "ebook" | "audiobook";
language: string;
```

Add state for the new fields in the component body:

```typescript
const [type, setType] = useState(initialValues?.type ?? "ebook");
const [language, setLanguage] = useState(initialValues?.language ?? "en");
```

Add the `type` and `language` to the form submission data.

Add UI controls for type (a `Select` with "Ebook" and "Audiobook" options) and language (the new `LanguageSingleSelect` component) in the form JSX, near the top of the form before the name field.

- [ ] **Step 3: Update profiles page to pass type and language**

In `src/routes/_authed/settings/profiles.tsx`, update `handleCreateProfile` and `handleEditProfile` value types to include `type` and `language`. Update the `editingProfile` mapping to pass `type` and `language` in `initialValues`.

- [ ] **Step 4: Verify the profiles page works**

Run: `bun run dev`
Navigate to Settings > Profiles. Create a new profile with type "Audiobook" and language "English". Edit an existing profile and verify type/language fields appear with correct values.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/language-single-select.tsx src/components/settings/download-profiles/download-profile-form.tsx src/routes/_authed/settings/profiles.tsx
git commit -m "feat: add type and language fields to download profile form"
```

---

### Task 7: UI — Remove Allowed Languages from metadata settings

**Files:**

- Modify: `src/routes/_authed/settings/metadata.tsx`
- Modify: `src/routes/_authed/bookshelf/authors/$authorId.tsx`
- Modify: `src/lib/queries/books.ts` (if metadata profile query is referenced)

- [ ] **Step 1: Remove Allowed Languages card from metadata page**

In `src/routes/_authed/settings/metadata.tsx`:

- Remove the `LanguageMultiSelect` import (line 16)
- Remove the `allowedLanguages` state (lines 32-34)
- Remove `allowedLanguages` from `handleSave` (line 52)
- Remove the entire "Allowed Languages" `<Card>` block (lines 75-94)

- [ ] **Step 2: Update author page language filtering**

In `src/routes/_authed/bookshelf/authors/$authorId.tsx`, update the `availableLanguages` memo (lines 1191-1198).

Replace the `metadataProfile.allowedLanguages` reference with a query for profile languages. There are two approaches:

- Option A: Add a new server function `getProfileLanguagesFn` that calls `getProfileLanguages()` and use it in the loader
- Option B: Derive languages from the already-loaded download profiles list

Use Option B since `downloadProfilesListQuery` is likely already loaded. Compute unique languages from the profiles:

```typescript
const profileLanguages = useMemo(() => {
  const langs = (downloadProfiles ?? []).map((p) => p.language);
  return [...new Set(langs)];
}, [downloadProfiles]);
```

Then use `profileLanguages` instead of `metadataProfile.allowedLanguages` in the `availableLanguages` memo.

Ensure `downloadProfilesListQuery` is loaded in the author page's loader if not already.

- [ ] **Step 3: Verify metadata settings and author page**

Run: `bun run dev`

- Metadata settings: "Allowed Languages" card should be gone
- Author detail page: language selector should still work, deriving options from profile languages

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed/settings/metadata.tsx src/routes/_authed/bookshelf/authors/$authorId.tsx
git commit -m "refactor: remove global allowed languages, derive from download profiles"
```

---

### Task 8: UI — Profile cards for editions tab

**Files:**

- Rewrite: `src/components/bookshelf/books/editions-tab.tsx`
- Create: `src/components/bookshelf/books/profile-edition-card.tsx`
- Modify: `src/routes/_authed/bookshelf/books/$bookId.tsx`

- [ ] **Step 1: Create `ProfileEditionCard` component**

Create `src/components/bookshelf/books/profile-edition-card.tsx`:

This component renders a single profile card — either monitored (showing edition details) or unmonitored (placeholder).

Props:

```typescript
type ProfileEditionCardProps = {
  profile: {
    id: number;
    name: string;
    icon: string;
    type: "ebook" | "audiobook";
  };
  edition: EditionData | null; // null = unmonitored
  onChooseEdition: () => void;
  onUnmonitor: () => void;
};
```

Monitored state renders:

- Profile icon + name (left column)
- Edition cover thumbnail (`BookCover` or simple img)
- Edition metadata: title, publisher, format, pages/duration, language
- Identifiers: ISBN13, ASIN
- Reader count
- "Change" and "Unmonitor" buttons

Unmonitored state renders:

- Profile icon + name (dimmed)
- "No edition selected" text
- "Choose Edition" button

Use the card layout from the brainstorming mockup (Option A — profile cards with border, icon column, cover, metadata, buttons).

- [ ] **Step 2: Rewrite `EditionsTab`**

Replace the contents of `src/components/bookshelf/books/editions-tab.tsx`:

The new component:

- Accepts `bookId`, `authorDownloadProfiles` (with `type` and `language`), and `editions` (from book detail query)
- Derives selected edition per profile by checking which edition's `downloadProfileIds` includes the profile ID
- Renders one `ProfileEditionCard` per profile, monitored first
- Manages state for which profile's edition selection modal is open
- Manages state for the unmonitor confirmation dialog

- [ ] **Step 3: Update book detail page to pass editions data**

In `src/routes/_authed/bookshelf/books/$bookId.tsx`:

- Update `authorDownloadProfiles` memo to include `type` and `language` fields from the profile
- Pass `editions={book.editions}` to `EditionsTab`
- Replace the `toggleBookProfile` usage in `ProfileToggleIcons` at the top with the new monitor/unmonitor flow:
  - Toggle-on calls `monitorBookProfile.mutate()`
  - Toggle-off opens the unmonitor dialog (manage dialog state here)

- [ ] **Step 4: Verify editions tab renders profile cards**

Run: `bun run dev`
Navigate to a book detail page. Verify:

- Profile cards display for each author download profile
- Monitored profiles show their selected edition metadata
- Unmonitored profiles show placeholder state

- [ ] **Step 5: Commit**

```bash
git add src/components/bookshelf/books/profile-edition-card.tsx src/components/bookshelf/books/editions-tab.tsx src/routes/_authed/bookshelf/books/$bookId.tsx
git commit -m "feat: replace editions table with profile-aware edition cards"
```

---

### Task 9: UI — Edition selection modal

**Files:**

- Create: `src/components/bookshelf/books/edition-selection-modal.tsx`
- Modify: `src/components/bookshelf/books/base-book-table.tsx`
- Modify: `src/components/bookshelf/books/editions-tab.tsx`

- [ ] **Step 1: Add `selectedRowKey` prop to `BaseBookTable`**

In `src/components/bookshelf/books/base-book-table.tsx`, add to the props type:

```typescript
selectedRowKey?: number | string;
```

In the row rendering, apply a highlight class when `row.key === selectedRowKey`:

```typescript
className={cn(
  // existing classes...
  selectedRowKey === row.key && "bg-primary/10 ring-1 ring-primary/30",
)}
```

- [ ] **Step 2: Create `EditionSelectionModal`**

Create `src/components/bookshelf/books/edition-selection-modal.tsx`:

Props:

```typescript
type EditionSelectionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: number;
  profile: { id: number; name: string; type: "ebook" | "audiobook" };
  currentEditionId?: number;
  onConfirm: (editionId: number) => void;
  isPending: boolean;
};
```

Content:

- Uses `Dialog` from shadcn/ui with large size
- Title: "Select Edition for {profile.name}"
- Filter toggle: `Switch` labeled "Show matching formats only" (default on)
- Reuses `bookEditionsInfiniteQuery` with the existing pagination
- Client-side format filtering: when toggle is on, filter `rows` to only include editions matching the profile's format type
- Renders `BaseBookTable` with `selectedRowKey` and `onRowClick` for row selection
- Infinite scroll sentinel (same pattern as current editions tab)
- Footer with "Cancel" and "Confirm" buttons. Confirm is disabled until a row is selected.
- When the modal opens with a `currentEditionId`, that row is pre-selected

- [ ] **Step 3: Wire modal into `EditionsTab`**

In `src/components/bookshelf/books/editions-tab.tsx`:

- Add state: `const [selectingProfile, setSelectingProfile] = useState<Profile | null>(null)`
- Pass `onChooseEdition={() => setSelectingProfile(profile)}` to each `ProfileEditionCard`
- Render `EditionSelectionModal` with `open={!!selectingProfile}`, passing the selecting profile
- On confirm, call `setEditionForProfile.mutate({ editionId, downloadProfileId: selectingProfile.id })`

- [ ] **Step 4: Verify edition selection flow**

Run: `bun run dev`

- Click "Choose Edition" on an unmonitored card → modal opens with filtered editions
- Toggle "Show all editions" → all editions appear
- Click a row → highlights
- Click "Confirm" → modal closes, card updates with selected edition
- Click "Change" on a monitored card → modal opens with current edition pre-highlighted

- [ ] **Step 5: Commit**

```bash
git add src/components/bookshelf/books/edition-selection-modal.tsx src/components/bookshelf/books/base-book-table.tsx src/components/bookshelf/books/editions-tab.tsx
git commit -m "feat: add edition selection modal with format filtering"
```

---

### Task 10: UI — Unmonitor confirmation dialog

**Files:**

- Create: `src/components/bookshelf/books/unmonitor-dialog.tsx`
- Modify: `src/components/bookshelf/books/editions-tab.tsx`
- Modify: `src/routes/_authed/bookshelf/books/$bookId.tsx`

- [ ] **Step 1: Create `UnmonitorDialog`**

Create `src/components/bookshelf/books/unmonitor-dialog.tsx`:

Props:

```typescript
type UnmonitorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileName: string;
  bookTitle: string;
  fileCount: number;
  onConfirm: (deleteFiles: boolean) => void;
  isPending: boolean;
};
```

Content:

- Uses `AlertDialog` from shadcn/ui
- Title: "Unmonitor {profileName}?"
- Description: "This will stop searching for editions of {bookTitle} for this profile."
- If `fileCount > 0`: checkbox "Also delete {fileCount} file(s) for this book" (unchecked by default)
- Cancel and Confirm buttons

- [ ] **Step 2: Wire unmonitor dialog into editions tab**

In `src/components/bookshelf/books/editions-tab.tsx`:

- Add state for the unmonitor target profile
- Pass `onUnmonitor={() => setUnmonitorProfile(profile)}` to each `ProfileEditionCard`
- Render `UnmonitorDialog`, on confirm call `unmonitorBookProfile.mutate({ bookId, downloadProfileId, deleteFiles })`

- [ ] **Step 3: Wire unmonitor dialog for book header toggle**

In `src/routes/_authed/bookshelf/books/$bookId.tsx`:

- When the user clicks a monitored profile icon (toggle-off), open `UnmonitorDialog` instead of calling toggle directly
- Add state for which profile is being unmonitored
- On confirm, call `unmonitorBookProfile.mutate()`

- [ ] **Step 4: Verify unmonitor flow**

Run: `bun run dev`

- Click "Unmonitor" on a monitored card → dialog appears
- If files exist, checkbox appears
- Click Confirm → edition is removed, card becomes unmonitored placeholder
- Click monitored icon at top of page → dialog appears (not immediate toggle)

- [ ] **Step 5: Commit**

```bash
git add src/components/bookshelf/books/unmonitor-dialog.tsx src/components/bookshelf/books/editions-tab.tsx src/routes/_authed/bookshelf/books/$bookId.tsx
git commit -m "feat: add unmonitor confirmation dialog with optional file deletion"
```

---

### Task 11: Update book list and author page toggle references

**Files:**

- Modify: `src/routes/_authed/bookshelf/books/index.tsx`
- Modify: `src/routes/_authed/bookshelf/authors/$authorId.tsx`

- [ ] **Step 1: Update books index page**

In `src/routes/_authed/bookshelf/books/index.tsx`:

- Replace `useToggleBookProfile` import with `useMonitorBookProfile` and `useUnmonitorBookProfile`
- Update the `ProfileToggleIcons` `onToggle` callback to check if the profile is currently active:
  - If toggling on: call `monitorBookProfile.mutate({ bookId, downloadProfileId })`
  - If toggling off: open the `UnmonitorDialog` (add dialog state and render it)
- Import and render `UnmonitorDialog`

- [ ] **Step 2: Update author detail page**

In `src/routes/_authed/bookshelf/authors/$authorId.tsx`:

- Replace all `useToggleBookProfile` / `toggleBookProfile` references (there are multiple components using it in this file)
- Same pattern: toggle-on calls `monitorBookProfile`, toggle-off opens `UnmonitorDialog`
- Add dialog state for each toggle context (book table rows, author header)

- [ ] **Step 3: Verify both pages**

Run: `bun run dev`

- Navigate to Books list → toggle a profile icon → verify monitor/unmonitor flow
- Navigate to an Author detail → toggle a profile icon → verify monitor/unmonitor flow

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed/bookshelf/books/index.tsx src/routes/_authed/bookshelf/authors/$authorId.tsx
git commit -m "feat: update book list and author page to use monitor/unmonitor flow"
```

---

### Task 12: Update seed migration for default metadata profile

**Files:**

- Modify: `drizzle/0000_puzzling_scarlet_spider.sql`

- [ ] **Step 1: Remove `allowedLanguages` from seed data**

In `drizzle/0000_puzzling_scarlet_spider.sql`, update line 336 to remove `allowedLanguages` from the metadata.profile JSON:

Change:

```sql
('metadata.profile', '{"allowedLanguages":["en"],"skipMissingReleaseDate":false,"skipMissingIsbnAsin":false,"skipCompilations":true,"minimumPopularity":10,"minimumPages":0}');
```

To:

```sql
('metadata.profile', '{"skipMissingReleaseDate":false,"skipMissingIsbnAsin":false,"skipCompilations":true,"minimumPopularity":10,"minimumPages":0}');
```

- [ ] **Step 2: Commit**

```bash
git add drizzle/0000_puzzling_scarlet_spider.sql
git commit -m "chore: remove allowedLanguages from default metadata profile seed"
```

---

### Task 13: Cleanup — Remove unused code and verify

**Files:**

- Modify: `src/hooks/mutations/index.ts` (verify exports)
- Modify: `src/components/shared/language-multi-select.tsx` (check if still used elsewhere)
- Various files for compile check

- [ ] **Step 1: Check for remaining references to old functions**

Search for `toggleBookProfile`, `toggleEditionProfile`, `allowedLanguages` across the codebase. Fix any remaining references.

- [ ] **Step 2: Check if `LanguageMultiSelect` is still used**

If `language-multi-select.tsx` is no longer imported anywhere, delete it. If it's used elsewhere, keep it.

- [ ] **Step 3: Full build verification**

Run: `bun run build`
Expected: Clean build with no errors.

- [ ] **Step 4: Manual smoke test**

Run: `bun run dev`
Test the full flow:

1. Navigate to Settings > Profiles — verify type/language fields on create/edit
2. Navigate to a book detail page — verify profile cards in editions tab
3. Click monitor icon on book header — verify auto-selection works
4. Click "Choose Edition" on unmonitored card — verify modal with filtered editions
5. Select and confirm an edition — verify card updates
6. Click "Change" — verify modal opens with current edition highlighted
7. Click "Unmonitor" — verify confirmation dialog
8. Check Settings > Metadata — verify "Allowed Languages" is gone
9. Navigate to an author page — verify language selector still works

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: cleanup unused code and verify full build"
```
