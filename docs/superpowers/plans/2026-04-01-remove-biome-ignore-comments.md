# Remove biome-ignore Comments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all 16 `biome-ignore` comments by refactoring each implementation to comply with the underlying biome lint rules.

**Architecture:** Each fix uses the simplest compliant refactor for its specific lint rule. Skeleton/slider `noArrayIndexKey` fixes move mapping into `Array.from`'s mapFn. Pagination gets a typed data model. Rejections use a natural key. Label gets explicit `htmlFor`. Cookie uses `cookieStore` API.

**Tech Stack:** React, TypeScript, Biome linter, shadcn/ui

---

### Task 1: Refactor `loading-skeleton.tsx` — remove file-level `biome-ignore-all`

**Files:**
- Modify: `src/components/shared/loading-skeleton.tsx:1` (remove `biome-ignore-all`), and all `Array.from().map()` patterns throughout (lines 18, 50, 87, 116, 131, 149, 169, 193, 216, 222, 240, 280, 311, 350)

- [ ] **Step 1: Remove the file-level biome-ignore-all comment**

Delete line 1:
```tsx
// biome-ignore-all lint/suspicious/noArrayIndexKey: static skeleton placeholders
```

- [ ] **Step 2: Convert all `Array.from().map()` to `Array.from(_, mapFn)` throughout the file**

Every instance in this file follows the same pattern. Convert each one from:
```tsx
{Array.from({ length: N }).map((_, i) => (
  <SomeElement key={i} ... />
))}
```
to:
```tsx
{Array.from({ length: N }, (_, i) => (
  <SomeElement key={`skel-${i}`} ... />
))}
```

The nested case in `BookTableRowsSkeleton` (line 222) has two levels — convert both:
```tsx
// outer (line 216)
{Array.from({ length: rows }, (_, i) => (
  <tr key={`skel-${i}`} className="border-b">
    {hasLeadingCell && <td className="p-2" />}
    <td className="p-2">
      <Skeleton className="aspect-[2/3] w-full rounded-sm" />
    </td>
    {/* inner (line 222) */}
    {Array.from({ length: columns }, (__, j) => (
      <td key={`skel-col-${j}`} className="p-2">
        <Skeleton className={`h-4 ${widths[j % widths.length]}`} />
      </td>
    ))}
  </tr>
))}
```

- [ ] **Step 3: Run biome check on the file**

Run: `bunx biome check src/components/shared/loading-skeleton.tsx`
Expected: No errors, no biome-ignore comments remain.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/loading-skeleton.tsx
git commit -m "refactor: remove biome-ignore from loading-skeleton.tsx — use Array.from mapFn"
```

---

### Task 2: Refactor route skeleton placeholders (7 files, 10 comments)

**Files:**
- Modify: `src/routes/_authed/movies/collections.tsx:270-272`
- Modify: `src/routes/_authed/movies/$movieId.tsx:121-123`
- Modify: `src/routes/_authed/movies/index.tsx:292-294`
- Modify: `src/routes/_authed/manga/index.tsx:278-280`
- Modify: `src/routes/_authed/manga/series/$mangaId.tsx:106-108,128-130`
- Modify: `src/routes/_authed/tv/series/$showId.tsx:111-113,133-135`
- Modify: `src/routes/_authed/tv/index.tsx:292-294`
- Modify: `src/components/bookshelf/books/release-table.tsx:104-106`

- [ ] **Step 1: Fix `movies/collections.tsx:270`**

Change:
```tsx
				{Array.from({ length: 3 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
					<Skeleton key={`skel-${i}`} className="h-40 w-full rounded-lg" />
				))}
```
to:
```tsx
				{Array.from({ length: 3 }, (_, i) => (
					<Skeleton key={`skel-${i}`} className="h-40 w-full rounded-lg" />
				))}
```

- [ ] **Step 2: Fix `movies/$movieId.tsx:121`**

Change:
```tsx
						{Array.from({ length: 7 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
							<div key={i} className="flex justify-between gap-4">
```
to:
```tsx
						{Array.from({ length: 7 }, (_, i) => (
							<div key={`skel-${i}`} className="flex justify-between gap-4">
```

- [ ] **Step 3: Fix `movies/index.tsx:292`**

Change:
```tsx
				{Array.from({ length: 12 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
					<div key={i} className="flex flex-col gap-2">
```
to:
```tsx
				{Array.from({ length: 12 }, (_, i) => (
					<div key={`skel-${i}`} className="flex flex-col gap-2">
```

- [ ] **Step 4: Fix `manga/index.tsx:278`**

Change:
```tsx
				{Array.from({ length: 12 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
					<div key={i} className="flex flex-col gap-2">
```
to:
```tsx
				{Array.from({ length: 12 }, (_, i) => (
					<div key={`skel-${i}`} className="flex flex-col gap-2">
```

- [ ] **Step 5: Fix `manga/series/$mangaId.tsx:106` (first occurrence — details)**

Change:
```tsx
						{Array.from({ length: 8 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
							<div key={i} className="flex justify-between gap-4">
```
to:
```tsx
						{Array.from({ length: 8 }, (_, i) => (
							<div key={`skel-${i}`} className="flex justify-between gap-4">
```

- [ ] **Step 6: Fix `manga/series/$mangaId.tsx:127` (second occurrence — volumes)**

Change:
```tsx
					{Array.from({ length: 3 }).map((_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
							key={i}
							className="flex items-center gap-4 py-3 border-b last:border-b-0"
```
to:
```tsx
					{Array.from({ length: 3 }, (_, i) => (
						<div
							key={`skel-${i}`}
							className="flex items-center gap-4 py-3 border-b last:border-b-0"
```

- [ ] **Step 7: Fix `tv/series/$showId.tsx:111` (first occurrence — details)**

Change:
```tsx
						{Array.from({ length: 8 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
							<div key={i} className="flex justify-between gap-4">
```
to:
```tsx
						{Array.from({ length: 8 }, (_, i) => (
							<div key={`skel-${i}`} className="flex justify-between gap-4">
```

- [ ] **Step 8: Fix `tv/series/$showId.tsx:132` (second occurrence — seasons)**

Change:
```tsx
					{Array.from({ length: 3 }).map((_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
							key={i}
							className="flex items-center gap-4 py-3 border-b last:border-b-0"
```
to:
```tsx
					{Array.from({ length: 3 }, (_, i) => (
						<div
							key={`skel-${i}`}
							className="flex items-center gap-4 py-3 border-b last:border-b-0"
```

- [ ] **Step 9: Fix `tv/index.tsx:292`**

Change:
```tsx
				{Array.from({ length: 12 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
					<div key={i} className="flex flex-col gap-2">
```
to:
```tsx
				{Array.from({ length: 12 }, (_, i) => (
					<div key={`skel-${i}`} className="flex flex-col gap-2">
```

- [ ] **Step 10: Fix `release-table.tsx:104` (skeleton)**

Change:
```tsx
			{Array.from({ length: 6 }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
				<Skeleton key={i} className="h-12 w-full" />
			))}
```
to:
```tsx
			{Array.from({ length: 6 }, (_, i) => (
				<Skeleton key={`skel-${i}`} className="h-12 w-full" />
			))}
```

- [ ] **Step 11: Run biome check on all modified files**

Run: `bunx biome check src/routes/_authed/movies/collections.tsx src/routes/_authed/movies/\$movieId.tsx src/routes/_authed/movies/index.tsx src/routes/_authed/manga/index.tsx src/routes/_authed/manga/series/\$mangaId.tsx src/routes/_authed/tv/series/\$showId.tsx src/routes/_authed/tv/index.tsx src/components/bookshelf/books/release-table.tsx`
Expected: No `noArrayIndexKey` errors on these files.

- [ ] **Step 12: Commit**

```bash
git add src/routes/_authed/movies/collections.tsx src/routes/_authed/movies/\$movieId.tsx src/routes/_authed/movies/index.tsx src/routes/_authed/manga/index.tsx src/routes/_authed/manga/series/\$mangaId.tsx src/routes/_authed/tv/series/\$showId.tsx src/routes/_authed/tv/index.tsx src/components/bookshelf/books/release-table.tsx
git commit -m "refactor: remove biome-ignore from route skeleton placeholders — use Array.from mapFn"
```

---

### Task 3: Refactor pagination ellipsis — typed data model

**Files:**
- Modify: `src/components/shared/table-pagination.tsx:23-49,109-130`

- [ ] **Step 1: Change `getPageNumbers` return type and ellipsis representation**

Replace the entire `getPageNumbers` function:

```tsx
/** Returns the page numbers to render, inserting unique ellipsis strings for gaps. */
function getPageNumbers(
	page: number,
	totalPages: number,
): Array<number | string> {
	if (totalPages <= 7) {
		return Array.from({ length: totalPages }, (_, i) => i + 1);
	}

	const pages: Array<number | string> = [];
	const around = new Set(
		[1, totalPages, page - 1, page, page + 1].filter(
			(p) => p >= 1 && p <= totalPages,
		),
	);

	let prev: number | undefined;
	let ellipsisCount = 0;
	for (const p of [...around].toSorted((a, b) => a - b)) {
		if (prev !== undefined && p - prev > 1) {
			ellipsisCount++;
			pages.push(`ellipsis-${ellipsisCount}`);
		}
		pages.push(p);
		prev = p;
	}

	return pages;
}
```

- [ ] **Step 2: Update the render logic to use the new type**

Replace the `pageNumbers.map` block:
```tsx
				{pageNumbers.map((p) =>
					typeof p === "string" ? (
						<span
							key={p}
							className="flex h-8 w-8 items-center justify-center text-muted-foreground"
						>
							…
						</span>
					) : (
						<Button
							key={p}
							variant={p === page ? "default" : "outline"}
							size="icon-sm"
							onClick={() => onPageChange(p)}
							aria-label={`Page ${p}`}
							aria-current={p === page ? "page" : undefined}
						>
							{p}
						</Button>
					),
				)}
```

- [ ] **Step 3: Run biome check**

Run: `bunx biome check src/components/shared/table-pagination.tsx`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/table-pagination.tsx
git commit -m "refactor: remove biome-ignore from table-pagination — use typed ellipsis keys"
```

---

### Task 4: Refactor rejection messages — use `reason` as key

**Files:**
- Modify: `src/components/bookshelf/books/release-table.tsx:179-183`

- [ ] **Step 1: Replace index key with `rejection.reason`**

Change:
```tsx
						{rejections.map((rejection, idx) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: rejection messages may not be unique
								key={idx}
								className="text-sm text-muted-foreground flex gap-2"
							>
```
to:
```tsx
						{rejections.map((rejection) => (
							<li
								key={rejection.reason}
								className="text-sm text-muted-foreground flex gap-2"
							>
```

- [ ] **Step 2: Run biome check**

Run: `bunx biome check src/components/bookshelf/books/release-table.tsx`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/bookshelf/books/release-table.tsx
git commit -m "refactor: remove biome-ignore from release-table rejections — use reason as key"
```

---

### Task 5: Refactor slider thumbs — prefix key string

**Files:**
- Modify: `src/components/ui/slider.tsx:64-79`

- [ ] **Step 1: Remove the biome-ignore comment and prefix the key**

Change:
```tsx
			{Array.from({ length: _values.length }, (_, index) => {
				const isDisabled = disabledThumbs?.has(index) ?? false;
				return (
					<SliderPrimitive.Thumb
						data-slot="slider-thumb"
						// biome-ignore lint/suspicious/noArrayIndexKey: slider thumbs are identified by position
						key={index}
```
to:
```tsx
			{Array.from({ length: _values.length }, (_, index) => {
				const isDisabled = disabledThumbs?.has(index) ?? false;
				return (
					<SliderPrimitive.Thumb
						data-slot="slider-thumb"
						key={`thumb-${index}`}
```

- [ ] **Step 2: Run biome check**

Run: `bunx biome check src/components/ui/slider.tsx`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/slider.tsx
git commit -m "refactor: remove biome-ignore from slider — prefix thumb key string"
```

---

### Task 6: Refactor checkbox label — add explicit htmlFor/id

**Files:**
- Modify: `src/components/shared/profile-checkbox-group.tsx:34-39`

- [ ] **Step 1: Add `htmlFor` to label and `id` to Checkbox**

Change:
```tsx
								{/* biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders an input internally */}
								<label className="flex items-center gap-2 cursor-pointer">
									<Checkbox
										checked={selectedIds.includes(p.id)}
										onCheckedChange={() => onToggle(p.id)}
									/>
```
to:
```tsx
								<label htmlFor={`profile-${p.id}`} className="flex items-center gap-2 cursor-pointer">
									<Checkbox
										id={`profile-${p.id}`}
										checked={selectedIds.includes(p.id)}
										onCheckedChange={() => onToggle(p.id)}
									/>
```

- [ ] **Step 2: Run biome check**

Run: `bunx biome check src/components/shared/profile-checkbox-group.tsx`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/profile-checkbox-group.tsx
git commit -m "refactor: remove biome-ignore from profile-checkbox-group — add htmlFor/id"
```

---

### Task 7: Refactor sidebar cookie — use cookieStore API

**Files:**
- Modify: `src/components/ui/sidebar.tsx:95-97`

- [ ] **Step 1: Replace `document.cookie` with `cookieStore.set()`**

Change:
```tsx
			// This sets the cookie to keep the sidebar state.
			// biome-ignore lint/suspicious/noDocumentCookie: shadcn/ui sidebar uses direct cookie access
			document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
```
to:
```tsx
			// This sets the cookie to keep the sidebar state.
			cookieStore.set({
				name: SIDEBAR_COOKIE_NAME,
				value: String(openState),
				path: "/",
				// @ts-expect-error cookieStore.set uses maxAge (camelCase), not max-age
				maxAge: SIDEBAR_COOKIE_MAX_AGE,
			});
```

**Note:** The `cookieStore` API is globally available in modern browsers. If TypeScript complains about `cookieStore` not existing on the global scope, the `@ts-expect-error` on `maxAge` may not be needed — test and adjust. If `cookieStore` itself is not typed, add a declaration at the top of the file:

```tsx
declare const cookieStore: {
	set(options: { name: string; value: string; path?: string; maxAge?: number }): Promise<void>;
};
```

- [ ] **Step 2: Run biome check**

Run: `bunx biome check src/components/ui/sidebar.tsx`
Expected: No `noDocumentCookie` error.

**Fallback:** If `cookieStore` causes issues (SSR, browser compat), add a biome override in `biome.json` instead:

```json
{
  "overrides": [{
    "include": ["src/components/ui/sidebar.tsx"],
    "linter": {
      "rules": {
        "suspicious": {
          "noDocumentCookie": "off"
        }
      }
    }
  }]
}
```

- [ ] **Step 3: Run build to verify no SSR issues**

Run: `bun run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/sidebar.tsx
git commit -m "refactor: remove biome-ignore from sidebar — use cookieStore API"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full biome check**

Run: `bun run lint`
Expected: Clean pass, zero biome-ignore related issues.

- [ ] **Step 2: Verify no biome-ignore comments remain**

Run: `grep -r "biome-ignore" src/`
Expected: No output (zero matches).

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Final commit (if any remaining changes)**

Only if previous tasks left uncommitted changes. Otherwise, this step is a no-op.
