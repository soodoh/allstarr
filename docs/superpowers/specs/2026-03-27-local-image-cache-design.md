# Local Image Cache Design

## Context

All images in Allstarr (book covers, author photos, movie posters, etc.) are currently loaded directly from external CDNs (Hardcover, TMDB, MangaUpdates). This creates several problems:

- **External dependency**: If a CDN is down or changes URLs, images break
- **Performance**: Every page load fetches from remote servers
- **`@unpic/react` compatibility**: The `priority` prop passes through to the DOM as a boolean attribute when the image source isn't a recognized CDN, causing React warnings
- **No optimization**: No responsive image generation or format conversion for non-TMDB sources

The solution is to download and cache all metadata images locally at import time, then serve them through a local API route with on-the-fly `sharp`-based resizing. `@unpic/react/base` with a custom transformer provides proper `srcset` generation and responsive image support.

## Data Model

### New columns per entity table

Each entity that stores image URLs gets a corresponding cached path column. The original URL columns remain as the source of truth for where the image came from.

| Table      | New Column         | Type           | Notes                  |
| ---------- | ------------------ | -------------- | ---------------------- |
| `authors`  | `cachedImagePath`  | text, nullable | Author photo           |
| `books`    | `cachedImagePath`  | text, nullable | Book cover             |
| `editions` | `cachedImagePath`  | text, nullable | Edition-specific cover |
| `movies`   | `cachedPosterPath` | text, nullable | Movie poster           |
| `movies`   | `cachedFanartPath` | text, nullable | Movie backdrop         |
| `shows`    | `cachedPosterPath` | text, nullable | Show poster            |
| `shows`    | `cachedFanartPath` | text, nullable | Show backdrop          |
| `seasons`  | `cachedPosterPath` | text, nullable | Season poster          |
| `manga`    | `cachedPosterPath` | text, nullable | Manga poster           |
| `manga`    | `cachedFanartPath` | text, nullable | Manga backdrop         |

Paths are stored relative to `data/images/`, e.g. `authors/42.jpg`.

## Disk Layout

```
data/
  images/
    authors/
      42.jpg
    books/
      15.png
    editions/
      8.jpg
    movies/
      3.jpg
      3-fanart.jpg
    shows/
      7.jpg
      7-fanart.jpg
    seasons/
      12.jpg
    manga/
      5.jpg
      5-fanart.jpg
```

Images are stored in their original format (no conversion at download time). The filename is the entity ID with the original file extension.

## Image Download Service

### New module: `src/server/image-cache.ts`

**Core function: `cacheImage(url: string, type: string, id: number): Promise<string | null>`**

- Fetches the image from the external URL
- Determines the file extension from the response `Content-Type` header
- Saves to `data/images/{type}/{id}.{ext}`
- Returns the relative path (e.g. `authors/42.jpg`) on success, `null` on failure
- Failures are logged but do not block the import flow
- Creates subdirectories as needed

**Helper: `cacheEntityImages(entity, type, id)`**

Convenience wrapper that handles the different image column patterns:

- For entities with `images` JSON array: extracts the cover URL and caches it
- For entities with `posterUrl`/`fanartUrl`: caches both

### Integration points

Called from existing import/add flows:

- `src/server/import.ts` — author and book imports from Hardcover
- `src/server/movies.ts` — movie additions from TMDB
- `src/server/shows.ts` — show additions from TMDB
- `src/server/manga.ts` — manga additions from MangaUpdates
- Metadata refresh flows — re-download when covers change upstream

## Image Serving

### API route: `src/routes/api/images/$.ts`

A catch-all route that serves cached images with on-the-fly resizing via `sharp`.

**Request format:**

```
GET /api/images/authors/42?w=400&h=600&q=80&format=webp
```

**Behavior:**

1. Auth-gated via `requireAuth()`
2. Resolves the path to `data/images/authors/42.{ext}` (finds the file regardless of extension)
3. Uses `sharp` to resize to requested dimensions and convert to requested format
4. Returns with `Content-Type` and `Cache-Control: public, max-age=86400` headers
5. Returns 404 if the file doesn't exist

**Query parameters:**

- `w` — target width (optional)
- `h` — target height (optional)
- `q` — quality 1-100 (default: 80)
- `format` — output format: `webp`, `avif`, `jpg`, `png` (default: `webp`)

If no resize params are provided, serves the original image.

### Custom unpic transformer: `src/lib/image-transformer.ts`

A transformer function compatible with `@unpic/react/base` that converts `@unpic`'s requested dimensions into query params for the local API route.

```typescript
export function localTransform({
  url,
  width,
  height,
}: TransformParams): string {
  const params = new URLSearchParams();
  if (width) params.set("w", String(width));
  if (height) params.set("h", String(height));
  params.set("format", "webp");
  return `${url}?${params}`;
}
```

### Updated `OptimizedImage` component

- Import `Image` from `@unpic/react/base` instead of `@unpic/react`
- Pass the custom `localTransform` transformer
- If `cachedPath` exists, use `/api/images/{cachedPath}` as `src`
- If no cached image, fall back to the external URL (with the auto-detecting `Image` from `@unpic/react`)
- `priority` prop works correctly because `@unpic/react/base` + transformer handles it through `transformSharedProps`

## Dependencies

- **`sharp`** — added as a new dependency for on-the-fly image resizing and format conversion. Standard Node.js image processing library with prebuilt binaries for all platforms.

## Migration for Existing Entities

Existing entities already have external image URLs but no cached images. A one-time migration task will:

1. Query all entities that have image URLs but `null` cached paths
2. Download and cache each image using the same `cacheImage()` function
3. Update the DB with the cached path
4. Run as a background task (similar to existing data migration scripts)
5. Failures are skipped — those entities continue using external URLs until the next metadata refresh

This can be triggered manually via a server function or run automatically on first startup after the migration.

## Error Handling

- **Download failures**: Logged, cached path stays `null`, frontend falls back to external URL or placeholder
- **Serving failures**: 404 response, frontend shows fallback placeholder via existing `onError` handler
- **Missing originals**: If the cached file is deleted from disk but the DB still has the path, the 404 triggers re-download on next metadata refresh

## Verification

1. Add a new author/book/movie — confirm image downloads to `data/images/`
2. Load the detail page — confirm images load from `/api/images/` with proper `srcset`
3. Resize browser window — confirm responsive images load at appropriate sizes
4. Delete a cached image file — confirm fallback to external URL works
5. Check no `priority` React warnings in console
6. Run `bun run build` — confirm production build succeeds
