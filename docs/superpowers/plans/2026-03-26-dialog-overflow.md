# Dialog Overflow Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent all dialogs from overflowing the viewport by constraining `DialogContent` height and adding a scrollable `DialogBody` component.

**Architecture:** Update the base `DialogContent` to use `flex flex-col` with `max-h-[85vh]`, add a new `DialogBody` primitive for scrollable body content, then update all consumer dialogs.

**Tech Stack:** React, Radix UI Dialog, Tailwind CSS, shadcn/ui

---

## File Map

| File                                                                  | Change                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/components/ui/dialog.tsx`                                        | Add `max-h-[85vh]`, change `grid` to `flex flex-col`, add `DialogBody` component, update exports |
| `src/components/tv/show-detail-header.tsx`                            | Wrap EditShowDialog body in `DialogBody`                                                         |
| `src/components/shared/unmonitor-dialog.tsx`                          | Wrap body in `DialogBody`                                                                        |
| `src/components/bookshelf/books/book-edit-dialog.tsx`                 | Wrap body in `DialogBody`                                                                        |
| `src/components/activity/remove-download-dialog.tsx`                  | Wrap body in `DialogBody`                                                                        |
| `src/components/movies/add-missing-movies-dialog.tsx`                 | Wrap body in `DialogBody`                                                                        |
| `src/components/movies/edit-collection-dialog.tsx`                    | Wrap body in `DialogBody`                                                                        |
| `src/components/shared/directory-browser-dialog.tsx`                  | Wrap body in `DialogBody`                                                                        |
| `src/components/bookshelf/books/reassign-files-dialog.tsx`            | Wrap body in `DialogBody`                                                                        |
| `src/components/movies/movie-detail-header.tsx`                       | Wrap body in `DialogBody` for both edit and delete dialogs                                       |
| `src/components/settings/download-profiles/download-profile-form.tsx` | Wrap move-files dialog body in `DialogBody`                                                      |
| `src/components/bookshelf/hardcover/author-preview-modal.tsx`         | Wrap body in `DialogBody`                                                                        |
| `src/components/settings/indexers/synced-indexer-view-dialog.tsx`     | Wrap body in `DialogBody`                                                                        |
| `src/components/bookshelf/hardcover/book-preview-modal.tsx`           | Remove ad-hoc `max-h-[85vh] overflow-y-auto`, wrap body in `DialogBody`                          |
| `src/components/movies/tmdb-movie-search.tsx`                         | Remove ad-hoc `max-h-[85vh] overflow-y-auto`, wrap body in `DialogBody`                          |
| `src/components/settings/custom-formats/preset-selector.tsx`          | Remove ad-hoc `max-h-[80vh] overflow-y-auto`, wrap body in `DialogBody`                          |
| `src/components/bookshelf/books/interactive-search-modal.tsx`         | Remove redundant `max-h-[85vh] flex flex-col` (base provides them now)                           |
| `src/components/bookshelf/books/edition-selection-modal.tsx`          | Remove redundant `flex flex-col` (base provides it; keep custom `max-h`)                         |

**No changes needed:**

- `src/components/shared/confirm-dialog.tsx` — no body content between header and footer

---

### Task 1: Update base Dialog component

**Files:**

- Modify: `src/components/ui/dialog.tsx`

- [ ] **Step 1: Update DialogContent layout**

In `src/components/ui/dialog.tsx`, change the `DialogContent` className from `grid` to `flex flex-col` and add `max-h-[85vh]`:

```tsx
// In the className string, replace:
"grid w-full max-w-[calc(100%-2rem)]";
// With:
"flex flex-col w-full max-w-[calc(100%-2rem)] max-h-[85vh]";
```

- [ ] **Step 2: Add DialogBody component**

Add this new component before the `DialogTitle` function:

```tsx
function DialogBody({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="dialog-body"
      className={cn("flex-1 min-h-0 overflow-y-auto space-y-4", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 3: Export DialogBody**

Add `DialogBody` to the export block:

```tsx
export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "feat: add DialogBody component and constrain DialogContent height"
```

---

### Task 2: Update simple dialogs (batch 1)

These dialogs have body content between header and footer that needs wrapping in `DialogBody`. The pattern is the same for all: add `DialogBody` to the import, wrap body content.

**Files:**

- Modify: `src/components/tv/show-detail-header.tsx`
- Modify: `src/components/shared/unmonitor-dialog.tsx`
- Modify: `src/components/bookshelf/books/book-edit-dialog.tsx`
- Modify: `src/components/activity/remove-download-dialog.tsx`

- [ ] **Step 1: Update show-detail-header.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

Wrap the body content (lines 184–266, everything between `</DialogHeader>` and `<DialogFooter>`) in `<DialogBody>`:

```tsx
        <DialogBody>
          {/* Monitor New Seasons */}
          <div className="space-y-2">
            ...
          </div>

          {/* Series Type */}
          <div className="space-y-2">
            ...
          </div>

          {/* Episode Ordering */}
          <EpisodeGroupAccordion ... />

          <ProfileCheckboxGroup ... />

          {/* Use Season Folder toggle */}
          <div className="flex items-center justify-between pt-4 border-t">
            ...
          </div>
        </DialogBody>
```

- [ ] **Step 2: Update unmonitor-dialog.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

Wrap the conditional checkbox div (between `</DialogHeader>` and `<DialogFooter>`) in `<DialogBody>`:

```tsx
<DialogBody>
  {fileCount > 0 && (
    <div className="flex items-center gap-2">
      <Checkbox
        id="delete-files"
        checked={deleteFiles}
        onCheckedChange={(checked) => setDeleteFiles(checked === true)}
      />
      <Label htmlFor="delete-files" className="cursor-pointer">
        Also delete {fileCount} file(s)
      </Label>
    </div>
  )}
</DialogBody>
```

- [ ] **Step 3: Update book-edit-dialog.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

Wrap the switch div (between `</DialogHeader>` and `<DialogFooter>`) in `<DialogBody>`:

```tsx
<DialogBody>
  <div className="flex items-center justify-between gap-4 py-4">...</div>
</DialogBody>
```

- [ ] **Step 4: Update remove-download-dialog.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

Wrap the checkboxes div (between `</DialogHeader>` and `<DialogFooter>`) in `<DialogBody>`:

```tsx
<DialogBody>
  <div className="flex flex-col gap-3 py-2">...</div>
</DialogBody>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/tv/show-detail-header.tsx src/components/shared/unmonitor-dialog.tsx src/components/bookshelf/books/book-edit-dialog.tsx src/components/activity/remove-download-dialog.tsx
git commit -m "refactor: wrap dialog body content in DialogBody (batch 1)"
```

---

### Task 3: Update simple dialogs (batch 2)

**Files:**

- Modify: `src/components/movies/add-missing-movies-dialog.tsx`
- Modify: `src/components/movies/edit-collection-dialog.tsx`
- Modify: `src/components/shared/directory-browser-dialog.tsx`
- Modify: `src/components/bookshelf/books/reassign-files-dialog.tsx`

- [ ] **Step 1: Update add-missing-movies-dialog.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "src/components/ui/dialog";
```

Wrap the form content div (between `</DialogHeader>` and `<DialogFooter>`) in `<DialogBody>`:

```tsx
<DialogBody>
  <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
    ...
  </div>
</DialogBody>
```

- [ ] **Step 2: Update edit-collection-dialog.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "src/components/ui/dialog";
```

Wrap the form content div (between `</DialogHeader>` and `<DialogFooter>`) in `<DialogBody>`:

```tsx
<DialogBody>
  <div className="space-y-4 py-4">...</div>
</DialogBody>
```

- [ ] **Step 3: Update directory-browser-dialog.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

Wrap the path display div and ScrollArea (between `</DialogHeader>` and `<DialogFooter>`) in `<DialogBody>`:

```tsx
<DialogBody>
  {/* Current path display */}
  <div className="flex items-center gap-2">...</div>

  {/* Directory listing */}
  <ScrollArea className="h-[300px] rounded-md border">
    {renderContent()}
  </ScrollArea>
</DialogBody>
```

- [ ] **Step 4: Update reassign-files-dialog.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

Wrap the search + list div (between `</DialogHeader>` and `<DialogFooter>`) in `<DialogBody>`:

```tsx
<DialogBody>
  <div className="space-y-3">...</div>
</DialogBody>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/movies/add-missing-movies-dialog.tsx src/components/movies/edit-collection-dialog.tsx src/components/shared/directory-browser-dialog.tsx src/components/bookshelf/books/reassign-files-dialog.tsx
git commit -m "refactor: wrap dialog body content in DialogBody (batch 2)"
```

---

### Task 4: Update inline dialogs and no-footer dialogs

**Files:**

- Modify: `src/components/movies/movie-detail-header.tsx`
- Modify: `src/components/settings/download-profiles/download-profile-form.tsx`
- Modify: `src/components/bookshelf/hardcover/author-preview-modal.tsx`
- Modify: `src/components/settings/indexers/synced-indexer-view-dialog.tsx`

- [ ] **Step 1: Update movie-detail-header.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

**Edit profiles dialog** (~line 388): Wrap `ProfileCheckboxGroup` and the availability `div` in `<DialogBody>`:

```tsx
<DialogBody>
  <ProfileCheckboxGroup
    profiles={movieProfiles}
    selectedIds={selectedProfileIds}
    onToggle={toggleProfile}
  />
  <div className="flex items-center justify-between pt-4 border-t">...</div>
</DialogBody>
```

**Delete dialog** (~line 441): Wrap the conditional checkbox div in `<DialogBody>`:

```tsx
<DialogBody>
  {movie.collectionId !== null && (
    <div className="flex items-center gap-3 py-2">...</div>
  )}
</DialogBody>
```

- [ ] **Step 2: Update download-profile-form.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

In the move-files dialog (~line 816), wrap the paths/warning div in `<DialogBody>`:

```tsx
<DialogBody>
  <div className="space-y-3 text-sm">...</div>
</DialogBody>
```

- [ ] **Step 3: Update author-preview-modal.tsx**

This dialog has no `DialogFooter` — all content after the header is body content. Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

Wrap everything after `</DialogHeader>` in `<DialogBody>`:

```tsx
        <DialogBody>
          {/* Author identity */}
          <div className="flex gap-4">
            ...
          </div>

          {/* Bio */}
          <BioSection ... />

          {/* Actions */}
          {!inLibrary && !addOpen && (
            ...
          )}

          {inLibrary && (
            ...
          )}

          {addOpen && !inLibrary && fullAuthor && (
            <AddForm ... />
          )}
        </DialogBody>
```

- [ ] **Step 4: Update synced-indexer-view-dialog.tsx**

This dialog has no `DialogFooter` — it has its own action buttons at the bottom. Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

Wrap the conditional content block after `</DialogHeader>` in `<DialogBody>`:

```tsx
<DialogBody>{indexer && <div className="space-y-4">...</div>}</DialogBody>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/movies/movie-detail-header.tsx src/components/settings/download-profiles/download-profile-form.tsx src/components/bookshelf/hardcover/author-preview-modal.tsx src/components/settings/indexers/synced-indexer-view-dialog.tsx
git commit -m "refactor: wrap dialog body content in DialogBody (batch 3)"
```

---

### Task 5: Clean up dialogs with ad-hoc overflow

These dialogs manually added `max-h-[85vh] overflow-y-auto` (or similar) to `DialogContent`. The base now provides `max-h-[85vh]` and `DialogBody` handles scrolling, so remove the ad-hoc classes and wrap body in `DialogBody`.

**Files:**

- Modify: `src/components/bookshelf/hardcover/book-preview-modal.tsx`
- Modify: `src/components/movies/tmdb-movie-search.tsx`
- Modify: `src/components/settings/custom-formats/preset-selector.tsx`

- [ ] **Step 1: Update hardcover/book-preview-modal.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

Remove `max-h-[85vh] overflow-y-auto` from DialogContent className:

```tsx
        <DialogContent
          className="max-w-2xl"
          onClick={(e) => e.stopPropagation()}
        >
```

Wrap `BookDetailContent` and everything after header in `<DialogBody>`:

```tsx
<DialogBody>
  <BookDetailContent book={bookDetailData}>...</BookDetailContent>
</DialogBody>
```

- [ ] **Step 2: Update tmdb-movie-search.tsx (MoviePreviewModal)**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

Remove `max-h-[85vh] overflow-y-auto` from DialogContent className:

```tsx
      <DialogContent
        className="max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
```

Wrap the `<div className="space-y-4">` after header in `<DialogBody>`:

```tsx
<DialogBody>
  <div className="space-y-4">
    {/* Poster + title row */}
    ...
    {/* Add form */}
    ...
  </div>
</DialogBody>
```

- [ ] **Step 3: Update preset-selector.tsx**

Add `DialogBody` to the import:

```tsx
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
```

Remove `max-h-[80vh] overflow-y-auto` from DialogContent className:

```tsx
        <DialogContent className="sm:max-w-2xl">
```

Wrap the loading/empty/preset-cards content after `</DialogHeader>` in `<DialogBody>`:

```tsx
          <DialogBody>
            {isLoading && (
              ...
            )}

            {presets && presets.length === 0 && (
              ...
            )}

            {presets && presets.length > 0 && (
              <div className="grid gap-4">
                ...
              </div>
            )}
          </DialogBody>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/bookshelf/hardcover/book-preview-modal.tsx src/components/movies/tmdb-movie-search.tsx src/components/settings/custom-formats/preset-selector.tsx
git commit -m "refactor: replace ad-hoc overflow handling with DialogBody"
```

---

### Task 6: Clean up dialogs with custom flex layout

These dialogs already have their own scroll handling (fixed toolbar + scrollable table). They don't need `DialogBody` — they just need redundant classes removed since the base now provides `flex flex-col` and `max-h-[85vh]`.

**Files:**

- Modify: `src/components/bookshelf/books/interactive-search-modal.tsx`
- Modify: `src/components/bookshelf/books/edition-selection-modal.tsx`

- [ ] **Step 1: Update interactive-search-modal.tsx**

Remove `max-h-[85vh] flex flex-col` from DialogContent className (base provides both):

```tsx
      <DialogContent className="max-w-5xl">
```

No other changes needed — the existing inner `overflow-y-auto flex-1 min-h-0` div handles scrolling.

- [ ] **Step 2: Update edition-selection-modal.tsx**

Remove `flex flex-col` from DialogContent className (base provides it). Keep the custom `max-h` values since they differ from the base `85vh`:

```tsx
      <DialogContent className="max-w-[100vw] sm:max-w-[calc(100vw-4rem)] max-h-[100vh] sm:max-h-[80vh]">
```

No other changes needed — the existing inner `flex-1 min-h-0 overflow-auto` div handles scrolling.

- [ ] **Step 3: Commit**

```bash
git add src/components/bookshelf/books/interactive-search-modal.tsx src/components/bookshelf/books/edition-selection-modal.tsx
git commit -m "refactor: remove redundant flex/overflow classes from custom-layout dialogs"
```

---

### Task 7: Build verification

- [ ] **Step 1: Run production build**

```bash
bun run build
```

Expected: Build succeeds with no TypeScript or compilation errors.

- [ ] **Step 2: Verify in browser**

Start the dev server and visually verify:

1. Edit TV show dialog — body scrolls, header/footer stay fixed
2. A simple dialog (e.g., delete confirmation) — still looks normal, no scroll needed
3. A preview modal (e.g., book preview) — scrolls properly without double scrollbar

```bash
bun run dev
```
