# Biome Complexity Override Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `noExcessiveCognitiveComplexity` biome override by refactoring all 8 violating functions to comply with the default max of 15.

**Architecture:** Extract duplicated record-parsing helpers from `search.ts` and `import-queries.ts` into a shared `record-helpers.ts` module, add domain-specific extractor functions that replace ternary chains, then use those extractors to simplify each violating function. Minimal JSX extraction for the two route pages.

**Tech Stack:** TypeScript, Biome linter

**Validation approach:** No unit tests exist in this project. Validate each task with `bunx biome check src/` (lint + format) and `bun run build` (TypeScript compilation). Run both after every code change.

---

### Task 1: Create shared record-helpers module

**Files:**
- Create: `src/server/hardcover/record-helpers.ts`

This module consolidates the duplicated base helpers from `search.ts` (lines 857-974) and `import-queries.ts` (lines 26-102), and adds new domain extractors.

- [ ] **Step 1: Create `src/server/hardcover/record-helpers.ts` with base helpers**

Use the `search.ts` implementations (which use `getNestedValue` for cleaner traversal). Include all base helpers and domain extractors:

```typescript
// ---------------------------------------------------------------------------
// Base record-parsing helpers — consolidated from search.ts & import-queries.ts
// ---------------------------------------------------------------------------

export function toRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return undefined;
}

export function toRecordArray(value: unknown): Array<Record<string, unknown>> {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.map((entry) => toRecord(entry)).filter(Boolean) as Array<
		Record<string, unknown>
	>;
}

export function getNestedValue(
	record: Record<string, unknown>,
	path: string[],
): unknown {
	let current: unknown = record;
	for (const key of path) {
		const next = toRecord(current);
		if (!next || !(key in next)) {
			return undefined;
		}
		current = next[key];
	}
	return current;
}

export function firstString(
	record: Record<string, unknown>,
	paths: string[][],
): string | undefined {
	for (const path of paths) {
		const value = getNestedValue(record, path);
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed.length > 0) {
				return trimmed;
			}
		}
	}
	return undefined;
}

export function firstNumber(
	record: Record<string, unknown>,
	paths: string[][],
): number | undefined {
	for (const path of paths) {
		const value = getNestedValue(record, path);
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === "string") {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}
	}
	return undefined;
}

export function firstId(
	record: Record<string, unknown>,
	paths: string[][],
): string | undefined {
	const asString = firstString(record, paths);
	if (asString) {
		return asString;
	}
	const asNumber = firstNumber(record, paths);
	if (asNumber === undefined) {
		return undefined;
	}
	return String(asNumber);
}

export function getCoverUrl(
	record: Record<string, unknown>,
): string | undefined {
	const imageRecord = toRecord(record.image);
	if (imageRecord) {
		const imageUrl = firstString(imageRecord, [["url"], ["large"], ["medium"]]);
		if (imageUrl) {
			return imageUrl;
		}
	}

	if (Array.isArray(record.images)) {
		for (const image of record.images) {
			const imageRecordFromList = toRecord(image);
			if (!imageRecordFromList) {
				continue;
			}
			const imageUrl = firstString(imageRecordFromList, [["url"]]);
			if (imageUrl) {
				return imageUrl;
			}
		}
	}

	return firstString(record, [["coverUrl"], ["cover", "url"]]);
}

export function getStringList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((entry) => (typeof entry === "string" ? entry.trim() : ""))
		.filter((entry) => entry.length > 0);
}

export function parseYear(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const yearMatch = value.match(/\b(\d{4})\b/);
	if (!yearMatch) {
		return undefined;
	}
	const year = Number(yearMatch[1]);
	return Number.isFinite(year) ? year : undefined;
}

export function normalizeLanguageCode(
	value: string | undefined,
): string | undefined {
	if (!value) {
		return undefined;
	}
	const normalized = value.trim().toLowerCase();
	return normalized.length > 0 ? normalized : undefined;
}

// ---------------------------------------------------------------------------
// Domain extractors — replace ternary chains in parser functions
// ---------------------------------------------------------------------------

/**
 * Extract language code and name from a record with a `language` sub-object.
 * Reads `record.language.code2` (falling back to `code3`) and `record.language.language`.
 */
export function extractLanguage(record: Record<string, unknown>): {
	code: string | null;
	name: string | null;
} {
	const langRecord = toRecord(record.language);
	if (!langRecord) {
		return { code: null, name: null };
	}
	const code =
		normalizeLanguageCode(firstString(langRecord, [["code2"], ["code3"]])) ??
		null;
	const name = firstString(langRecord, [["language"]]) ?? null;
	return { code, name };
}

/** Extract publisher name from a record with a `publisher` sub-object. */
export function extractPublisher(
	record: Record<string, unknown>,
): string | null {
	const publisherRecord = toRecord(record.publisher);
	return publisherRecord
		? (firstString(publisherRecord, [["name"]]) ?? null)
		: null;
}

/** Extract reading format from a record with a `reading_format` sub-object. */
export function extractFormat(
	record: Record<string, unknown>,
): string | null {
	const formatRecord = toRecord(record.reading_format);
	return formatRecord
		? (firstString(formatRecord, [["format"]]) ?? null)
		: null;
}

/** Extract country name from a record with a `country` sub-object. */
export function extractCountry(
	record: Record<string, unknown>,
): string | null {
	const countryRecord = toRecord(record.country);
	return countryRecord
		? (firstString(countryRecord, [["name"]]) ?? null)
		: null;
}

/**
 * Extract author names from a contributions-style array field.
 * Works with both `contributions` and `cached_contributors` shapes —
 * both store author info under `[].author.name`.
 *
 * @param items - The array value (e.g. `record.contributions` or `record.cached_contributors`)
 */
export function extractContributorNames(items: unknown): string[] {
	return toRecordArray(items)
		.map((c) => {
			const authorRecord = toRecord(c.author);
			return authorRecord ? firstString(authorRecord, [["name"]]) : undefined;
		})
		.filter((n): n is string => n !== undefined);
}
```

- [ ] **Step 2: Verify the new module compiles**

Run: `bun run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/server/hardcover/record-helpers.ts
git commit -m "refactor: create shared record-helpers module for Hardcover record parsing"
```

---

### Task 2: Migrate `import-queries.ts` to use shared helpers

**Files:**
- Modify: `src/server/hardcover/import-queries.ts`

Replace the local helper functions (lines 26-102) with imports from `record-helpers.ts`, and use domain extractors to simplify `parseSeriesBookEntry` and `parseEdition`.

- [ ] **Step 1: Replace local helpers with imports**

Delete the local `toRecord`, `toRecordArray`, `firstString`, `firstNumber`, `getCoverUrl` functions (lines 26-102). Replace with an import at the top of the file (after the existing imports):

```typescript
import {
	extractContributorNames,
	extractCountry,
	extractFormat,
	extractLanguage,
	extractPublisher,
	firstNumber,
	firstString,
	getCoverUrl,
	toRecord,
	toRecordArray,
} from "./record-helpers";
```

Note: `import-queries.ts` has its own simpler `getCoverUrl` (no `images` array or fallback fields). Switching to the `search.ts` version (in `record-helpers.ts`) is safe — it's a superset that checks `image`, `images`, and fallback fields. The data from Hardcover only uses `image.url`, so both versions produce the same result for import-queries data.

- [ ] **Step 2: Simplify `parseEdition` (lines 589-661) using domain extractors**

Replace the ternary chains for publisher, format, language, country, and contributors. The function currently looks like:

```typescript
function parseEdition(
	record: Record<string, unknown>,
	bookId: number,
): HardcoverRawEdition | undefined {
	const id = firstNumber(record, [["id"]]);
	if (!id) {
		return undefined;
	}

	const publisherRecord = toRecord(record.publisher);
	const readingFormatRecord = toRecord(record.reading_format);
	const languageRecord = toRecord(record.language);
	const countryRecord = toRecord(record.country);
	// ... long ternary chains for each ...
```

Replace with:

```typescript
function parseEdition(
	record: Record<string, unknown>,
	bookId: number,
): HardcoverRawEdition | undefined {
	const id = firstNumber(record, [["id"]]);
	if (!id) {
		return undefined;
	}

	const lang = extractLanguage(record);
	const contributors = toRecordArray(
		Array.isArray(record.cached_contributors)
			? record.cached_contributors
			: [],
	)
		.map((cr) => {
			const authorRecord = toRecord(cr.author);
			return {
				authorId: String(
					authorRecord ? (firstNumber(authorRecord, [["id"]]) ?? "") : "",
				),
				name: authorRecord
					? (firstString(authorRecord, [["name"]]) ?? "")
					: "",
				contribution:
					typeof cr.contribution === "string" ? cr.contribution : null,
			};
		})
		.filter(Boolean) as Array<{
		authorId: string;
		name: string;
		contribution: string | null;
	}>;

	return {
		id,
		bookId,
		title: firstString(record, [["title"]]) ?? "",
		isbn10: firstString(record, [["isbn_10"]]) ?? null,
		isbn13: firstString(record, [["isbn_13"]]) ?? null,
		asin: firstString(record, [["asin"]]) ?? null,
		format: mapEditionFormat(extractFormat(record)),
		pageCount: firstNumber(record, [["pages"]]) ?? null,
		audioLength: firstNumber(record, [["audio_seconds"]]) ?? null,
		publisher: extractPublisher(record),
		editionInformation: firstString(record, [["edition_information"]]) ?? null,
		releaseDate: firstString(record, [["release_date"]]) ?? null,
		language: lang.name,
		languageCode: lang.code,
		country: extractCountry(record),
		usersCount: firstNumber(record, [["users_count"]]) ?? 0,
		score: firstNumber(record, [["score"]]) ?? 0,
		coverUrl: getCoverUrl(record) ?? null,
		contributors,
	};
}
```

Note: The contributors block is kept inline because it returns structured objects (id, name, contribution), not just names — `extractContributorNames` only returns `string[]`.

- [ ] **Step 3: Simplify `parseSeriesBookEntry` (lines 425-484) using domain extractors**

Replace the primary author extraction. Currently (lines 445-479):

```typescript
	const contributions = toRecordArray(bookRecord.contributions);
	const primaryContribution =
		contributions.length > 0 ? contributions[0] : undefined;
	const primaryAuthor = primaryContribution
		? toRecord(primaryContribution.author)
		: undefined;
```

And later:

```typescript
		authorId: primaryAuthor
			? (firstNumber(primaryAuthor, [["id"]]) ?? null)
			: null,
		authorName: primaryAuthor
			? (firstString(primaryAuthor, [["name"]]) ?? null)
			: null,
		authorSlug: primaryAuthor
			? (firstString(primaryAuthor, [["slug"]]) ?? null)
			: null,
		authorImageUrl: primaryAuthor ? (getCoverUrl(primaryAuthor) ?? null) : null,
```

Replace the author extraction block with a helper that extracts the first contribution's author as a flat object:

```typescript
	const contributions = toRecordArray(bookRecord.contributions);
	const primaryAuthor = contributions.length > 0
		? toRecord(contributions[0].author)
		: undefined;
	const authorId = primaryAuthor ? (firstNumber(primaryAuthor, [["id"]]) ?? null) : null;
	const authorName = primaryAuthor ? (firstString(primaryAuthor, [["name"]]) ?? null) : null;
	const authorSlug = primaryAuthor ? (firstString(primaryAuthor, [["slug"]]) ?? null) : null;
	const authorImageUrl = primaryAuthor ? (getCoverUrl(primaryAuthor) ?? null) : null;
```

Then in the return statement, use the variables directly:

```typescript
		authorId,
		authorName,
		authorSlug,
		authorImageUrl,
```

This hoists the ternary chains out of the return object, reducing nesting depth which is the primary driver of cognitive complexity.

- [ ] **Step 4: Verify**

Run: `bunx biome check src/server/hardcover/import-queries.ts` and `bun run build`
Expected: No errors. Complexity of `parseEdition` and `parseSeriesBookEntry` should now be ≤15.

- [ ] **Step 5: Commit**

```bash
git add src/server/hardcover/import-queries.ts
git commit -m "refactor: use shared record-helpers in import-queries.ts to reduce complexity"
```

---

### Task 3: Migrate `search.ts` base helpers to shared module

**Files:**
- Modify: `src/server/search.ts`

Replace the local helper functions with imports from `record-helpers.ts`. This task handles the import swap only — parser simplification is in Task 4.

- [ ] **Step 1: Add import and remove local helpers**

Add import at the top of the file (after existing imports):

```typescript
import {
	extractContributorNames,
	extractCountry,
	extractFormat,
	extractLanguage,
	extractPublisher,
	firstId,
	firstNumber,
	firstString,
	getCoverUrl,
	getStringList,
	normalizeLanguageCode,
	parseYear,
	toRecord,
	toRecordArray,
} from "./hardcover/record-helpers";
```

Delete these local functions from `search.ts`:
- `toRecord` (lines 857-862)
- `getNestedValue` (lines 864-877)
- `firstString` (lines 879-893)
- `firstNumber` (lines 895-912)
- `firstId` (lines 914-927)
- `getStringList` (lines 929-936)
- `parseYear` (lines 938-948)
- `normalizeLanguageCode` (lines 950-956)
- `toRecordArray` (lines 958-965)
- `getCoverUrl` (lines 1007-1030)

Keep these functions that are specific to `search.ts`:
- `parseAggregateCount` (lines 967-974) — uses `toRecord` and `firstNumber` (now imported)
- `extractBookAuthorName` (lines 976-1005) — uses `getStringList`, `toRecord`, `firstString` (now imported)

- [ ] **Step 2: Verify**

Run: `bunx biome check src/server/search.ts` and `bun run build`
Expected: No errors. (Complexity violations still present — fixed in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add src/server/search.ts
git commit -m "refactor: use shared record-helpers in search.ts, remove duplicated helpers"
```

---

### Task 4: Simplify `search.ts` parser functions

**Files:**
- Modify: `src/server/search.ts`

Use domain extractors to reduce complexity in the 4 violating functions.

- [ ] **Step 1: Extract inline `.map()` in `fetchSeriesBooks` to named function**

The inline `.map()` callback at line 794 (inside `fetchSeriesBooks`) parses a series book entry. Extract it to a named function:

```typescript
function toSeriesBook(
	entry: Record<string, unknown>,
): HardcoverSeriesBook | undefined {
	const bookRecord = toRecord(entry.book);
	if (!bookRecord) {
		return undefined;
	}
	const title = firstString(bookRecord, [["title"]]);
	if (!title) {
		return undefined;
	}
	const slug = firstString(bookRecord, [["slug"]]);
	const id = firstId(bookRecord, [["id"]]) ?? slug ?? title;
	const position = firstNumber(entry, [["position"]]);
	const isCompilation = entry.compilation === true;
	const authorName = extractContributorNames(bookRecord.contributions).join(", ") || null;
	const lang = extractLanguage(
		toRecordArray(bookRecord.editions)[0] ?? {},
	);

	return {
		id,
		title,
		slug: slug ?? null,
		description: firstString(bookRecord, [["description"]]) ?? null,
		releaseDate: firstString(bookRecord, [["release_date"]]) ?? null,
		releaseYear: firstNumber(bookRecord, [["release_year"]]) ?? null,
		rating: firstNumber(bookRecord, [["rating"]]) ?? null,
		usersCount: firstNumber(bookRecord, [["users_count"]]) ?? null,
		coverUrl: getCoverUrl(bookRecord) ?? null,
		position: position ?? null,
		hardcoverUrl: slug ? `https://hardcover.app/books/${slug}` : null,
		isCompilation,
		authorName,
		languageName: lang.name,
	};
}
```

Then replace the inline `.map()` in `fetchSeriesBooks`:

```typescript
	const books: HardcoverSeriesBook[] = toRecordArray(result?.book_series)
		.map(toSeriesBook)
		.filter(Boolean) as HardcoverSeriesBook[];
```

- [ ] **Step 2: Simplify `toHardcoverAuthorBook`**

Replace the contributors and language extraction blocks. Currently:

```typescript
	const allContributions = toRecordArray(bookRecord.all_contributions);
	const contributors =
		allContributions
			.map((c) => {
				const authorRecord = toRecord(c.author);
				return authorRecord ? firstString(authorRecord, [["name"]]) : undefined;
			})
			.filter((n): n is string => n !== undefined)
			.join(", ") || null;
	const editions = toRecordArray(bookRecord.editions);
	const languageRecord =
		editions.length > 0 ? toRecord(editions[0].language) : undefined;
	const languageCode = languageRecord
		? (normalizeLanguageCode(
				firstString(languageRecord, [["code2"], ["code3"]]),
			) ?? null)
		: null;
	const languageName = languageRecord
		? (firstString(languageRecord, [["language"]]) ?? null)
		: null;
```

Replace with:

```typescript
	const contributors =
		extractContributorNames(bookRecord.all_contributions).join(", ") || null;
	const lang = extractLanguage(
		toRecordArray(bookRecord.editions)[0] ?? {},
	);
	const languageCode = lang.code;
	const languageName = lang.name;
```

- [ ] **Step 3: Extract `buildLanguageMap` from `fetchAuthorDetails`**

Extract the language map building loop (currently lines 1734-1753 inside `fetchAuthorDetails`) into a standalone function. Place it before `fetchAuthorDetails`:

```typescript
function buildLanguageMap(
	editions: Array<Record<string, unknown>>,
): Map<string, string> {
	const languagesMap = new Map<string, string>();
	for (const edition of editions) {
		const lang = extractLanguage(edition);
		if (!lang.code || !lang.name) {
			continue;
		}
		if (!languagesMap.has(lang.code)) {
			languagesMap.set(lang.code, lang.name);
		}
	}
	if (!languagesMap.has("en")) {
		languagesMap.set("en", "English");
	}
	return languagesMap;
}
```

Then in `fetchAuthorDetails`, replace lines 1734-1753 with:

```typescript
	const languagesMap = buildLanguageMap(toRecordArray(metaResult?.editions));
```

- [ ] **Step 4: Simplify `parseEditionRecord`**

Replace the ternary chains for publisher, format, language, country, and contributors. Currently:

```typescript
	const publisherRecord = toRecord(record.publisher);
	const publisher = publisherRecord
		? (firstString(publisherRecord, [["name"]]) ?? null)
		: null;

	const readingFormatRecord = toRecord(record.reading_format);
	const type = readingFormatRecord
		? (firstString(readingFormatRecord, [["format"]]) ?? null)
		: null;

	const languageRecord = toRecord(record.language);
	const language = languageRecord
		? (firstString(languageRecord, [["language"]]) ?? null)
		: null;

	const countryRecord = toRecord(record.country);
	const country = countryRecord
		? (firstString(countryRecord, [["name"]]) ?? null)
		: null;
```

And the contributors block:

```typescript
	const contributors = Array.isArray(record.cached_contributors)
		? record.cached_contributors
		: [];
	const authorNames = contributors
		.map((c: unknown) => {
			const contributorRecord = toRecord(c);
			const authorRecord = contributorRecord
				? toRecord(contributorRecord.author)
				: undefined;
			return authorRecord ? firstString(authorRecord, [["name"]]) : undefined;
		})
		.filter((n: unknown): n is string => typeof n === "string" && n.length > 0);
	const author = authorNames.length > 0 ? authorNames.join(", ") : null;
```

Replace all of the above with:

```typescript
	const publisher = extractPublisher(record);
	const type = extractFormat(record);
	const lang = extractLanguage(record);
	const country = extractCountry(record);
	const author = extractContributorNames(record.cached_contributors).join(", ") || null;
```

And in the return object, use `lang.name` for `language`:

```typescript
		language: lang.name,
```

- [ ] **Step 5: Verify all complexity violations are resolved**

Run: `bunx biome check src/server/search.ts` and `bun run build`
Expected: No errors, no complexity violations.

To double-check, run with the strict threshold:

```bash
bunx biome lint --config-path=/tmp/biome-test src/server/search.ts
```

(The `/tmp/biome-test/biome.json` was created during investigation with `maxAllowedComplexity: 15`.)

Expected: No `noExcessiveCognitiveComplexity` errors for any function in search.ts.

- [ ] **Step 6: Commit**

```bash
git add src/server/search.ts
git commit -m "refactor: simplify search.ts parser functions using domain extractors"
```

---

### Task 5: Simplify `MoviesPage` and `ShowsPage` components

**Files:**
- Modify: `src/routes/_authed/movies/index.tsx`
- Modify: `src/routes/_authed/tv/index.tsx`

Extract the header actions JSX from each page component into a sibling component in the same file.

- [ ] **Step 1: Extract `MoviesPageActions` in movies/index.tsx**

Add a new component before `MoviesPage`:

```typescript
function MoviesPageActions({
	view,
	setView,
	massEditMode,
	toggleMassEdit,
}: {
	view: "table" | "grid";
	setView: (v: "table" | "grid") => void;
	massEditMode: boolean;
	toggleMassEdit: () => void;
}) {
	return (
		<div className="flex gap-2">
			{!massEditMode && (
				<div className="flex border border-border rounded-md">
					<Button
						variant={view === "table" ? "secondary" : "ghost"}
						size="icon"
						onClick={() => setView("table")}
					>
						<List className="h-4 w-4" />
					</Button>
					<Button
						variant={view === "grid" ? "secondary" : "ghost"}
						size="icon"
						onClick={() => setView("grid")}
					>
						<LayoutGrid className="h-4 w-4" />
					</Button>
				</div>
			)}
			<Button
				variant={massEditMode ? "destructive" : "outline"}
				onClick={toggleMassEdit}
			>
				{massEditMode ? (
					<>
						<X className="mr-2 h-4 w-4" />
						Cancel
					</>
				) : (
					<>
						<Pencil className="mr-2 h-4 w-4" />
						Mass Editor
					</>
				)}
			</Button>
			{!massEditMode && (
				<Button asChild>
					<Link to="/movies/add">
						<Plus className="mr-2 h-4 w-4" />
						Add Movie
					</Link>
				</Button>
			)}
		</div>
	);
}
```

Then in `MoviesPage`, replace the `actions` prop JSX with:

```typescript
					actions={
						<MoviesPageActions
							view={view}
							setView={setView}
							massEditMode={massEditMode}
							toggleMassEdit={toggleMassEdit}
						/>
					}
```

- [ ] **Step 2: Extract `ShowsPageActions` in tv/index.tsx**

Same pattern. Add a new component before `ShowsPage`:

```typescript
function ShowsPageActions({
	view,
	setView,
	massEditMode,
	toggleMassEdit,
}: {
	view: "table" | "grid";
	setView: (v: "table" | "grid") => void;
	massEditMode: boolean;
	toggleMassEdit: () => void;
}) {
	return (
		<div className="flex gap-2">
			{!massEditMode && (
				<div className="flex border border-border rounded-md">
					<Button
						variant={view === "table" ? "secondary" : "ghost"}
						size="icon"
						onClick={() => setView("table")}
					>
						<List className="h-4 w-4" />
					</Button>
					<Button
						variant={view === "grid" ? "secondary" : "ghost"}
						size="icon"
						onClick={() => setView("grid")}
					>
						<LayoutGrid className="h-4 w-4" />
					</Button>
				</div>
			)}
			<Button
				variant={massEditMode ? "destructive" : "outline"}
				onClick={toggleMassEdit}
			>
				{massEditMode ? (
					<>
						<X className="mr-2 h-4 w-4" />
						Cancel
					</>
				) : (
					<>
						<Pencil className="mr-2 h-4 w-4" />
						Mass Editor
					</>
				)}
			</Button>
			{!massEditMode && (
				<Button asChild>
					<Link to="/tv/add">
						<Plus className="mr-2 h-4 w-4" />
						Add Show
					</Link>
				</Button>
			)}
		</div>
	);
}
```

Then in `ShowsPage`, replace the `actions` prop JSX with:

```typescript
					actions={
						<ShowsPageActions
							view={view}
							setView={setView}
							massEditMode={massEditMode}
							toggleMassEdit={toggleMassEdit}
						/>
					}
```

- [ ] **Step 3: Verify**

Run: `bunx biome check src/routes/_authed/movies/index.tsx src/routes/_authed/tv/index.tsx` and `bun run build`
Expected: No errors, no complexity violations.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed/movies/index.tsx src/routes/_authed/tv/index.tsx
git commit -m "refactor: extract page action components to reduce complexity in movies/tv pages"
```

---

### Task 6: Remove biome complexity override

**Files:**
- Modify: `biome.json`

- [ ] **Step 1: Remove the complexity override block from biome.json**

Delete the first override entry (the one with `noExcessiveCognitiveComplexity`). The overrides array currently has two entries — keep only the `src/routes/api/**` console override. Change:

```json
	"overrides": [
		{
			"includes": [
				"src/server/hardcover/import-queries.ts",
				"src/server/search.ts",
				"src/components/hardcover/book-preview-modal.tsx",
				"src/routes/_authed/movies/index.tsx",
				"src/routes/_authed/tv/index.tsx"
			],
			"linter": {
				"rules": {
					"complexity": {
						"noExcessiveCognitiveComplexity": {
							"level": "error",
							"options": {
								"maxAllowedComplexity": 25
							}
						}
					}
				}
			}
		},
		{
			"includes": ["src/routes/api/**"],
			"linter": {
				"rules": {
					"suspicious": {
						"noConsole": "off"
					}
				}
			}
		}
	]
```

To:

```json
	"overrides": [
		{
			"includes": ["src/routes/api/**"],
			"linter": {
				"rules": {
					"suspicious": {
						"noConsole": "off"
					}
				}
			}
		}
	]
```

- [ ] **Step 2: Run full lint check**

Run: `bunx biome check src/`
Expected: No errors. All files pass with default complexity threshold.

- [ ] **Step 3: Run full build**

Run: `bun run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add biome.json
git commit -m "refactor: remove biome complexity override — all functions now comply with default max"
```
