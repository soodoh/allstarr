# Dialog Overflow Fix

## Problem

Dialogs with tall content (e.g., the edit TV series modal) overflow the viewport vertically. There is no global max-height constraint, and most dialogs lack scroll handling. A few dialogs (`book-preview-modal.tsx`, `hardcover/book-preview-modal.tsx`) add `max-h-[85vh] overflow-y-auto` ad-hoc, but this is inconsistent and scrolls the entire dialog including header/footer.

## Solution

Fix the base `DialogContent` component and introduce a `DialogBody` wrapper so that all dialogs automatically get viewport-safe sizing with fixed header/footer and scrollable body.

### Base component changes (`src/components/ui/dialog.tsx`)

**`DialogContent`:**

- Add `max-h-[85vh]` to prevent viewport overflow
- Change layout from `grid` to `flex flex-col` so children can participate in flex sizing
- Keep `gap-4` for spacing between header, body, and footer

**New `DialogBody` component:**

- `flex-1 min-h-0 overflow-y-auto` — fills remaining space, scrolls when content exceeds it
- `space-y-4` — replicates the `gap-4` spacing that body items previously got from the grid parent
- Accepts `className` for per-dialog customization

### Consumer updates

Every dialog wraps its body content (everything between `DialogHeader` and `DialogFooter`) in `<DialogBody>`. Structure becomes:

```tsx
<DialogContent>
  <DialogHeader>...</DialogHeader>
  <DialogBody>{/* form fields, content, etc. */}</DialogBody>
  <DialogFooter>...</DialogFooter>
</DialogContent>
```

### Cleanup

Remove ad-hoc overflow handling from dialogs that already have it:

- `src/components/bookshelf/hardcover/book-preview-modal.tsx` — remove `max-h-[85vh] overflow-y-auto` from `DialogContent` className
- `src/components/bookshelf/books/book-preview-modal.tsx` — same
- Any other dialogs with manual overflow classes

### Files to modify

| File                                                                  | Change                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/components/ui/dialog.tsx`                                        | Add `max-h-[85vh]`, change to flex layout, add `DialogBody` component |
| `src/components/tv/show-detail-header.tsx`                            | Wrap body in `DialogBody`                                             |
| `src/components/shared/confirm-dialog.tsx`                            | Wrap body in `DialogBody`                                             |
| `src/components/shared/unmonitor-dialog.tsx`                          | Wrap body in `DialogBody`                                             |
| `src/components/shared/directory-browser-dialog.tsx`                  | Wrap body in `DialogBody`                                             |
| `src/components/bookshelf/books/book-edit-dialog.tsx`                 | Wrap body in `DialogBody`                                             |
| `src/components/bookshelf/books/book-preview-modal.tsx`               | Wrap body in `DialogBody`, remove ad-hoc overflow                     |
| `src/components/bookshelf/books/interactive-search-modal.tsx`         | Wrap body in `DialogBody`                                             |
| `src/components/bookshelf/books/edition-selection-modal.tsx`          | Wrap body in `DialogBody`                                             |
| `src/components/bookshelf/books/reassign-files-dialog.tsx`            | Wrap body in `DialogBody`                                             |
| `src/components/bookshelf/hardcover/book-preview-modal.tsx`           | Wrap body in `DialogBody`, remove ad-hoc overflow                     |
| `src/components/bookshelf/hardcover/author-preview-modal.tsx`         | Wrap body in `DialogBody`                                             |
| `src/components/movies/add-missing-movies-dialog.tsx`                 | Wrap body in `DialogBody`                                             |
| `src/components/movies/edit-collection-dialog.tsx`                    | Wrap body in `DialogBody`                                             |
| `src/components/movies/movie-detail-header.tsx`                       | Wrap body in `DialogBody`                                             |
| `src/components/movies/tmdb-movie-search.tsx`                         | Wrap body in `DialogBody`                                             |
| `src/components/settings/custom-formats/preset-selector.tsx`          | Wrap body in `DialogBody`                                             |
| `src/components/settings/download-profiles/download-profile-form.tsx` | Wrap body in `DialogBody`                                             |
| `src/components/settings/indexers/synced-indexer-view-dialog.tsx`     | Wrap body in `DialogBody`                                             |
| `src/components/activity/remove-download-dialog.tsx`                  | Wrap body in `DialogBody`                                             |

### Non-goals

- Changing dialog widths or padding
- Adding horizontal scroll (content should always fit horizontally via existing `max-w` constraints)
- Responsive breakpoint changes
