# Image Optimization with @unpic/react

## Overview

Replace all 20 native `<img>` tags across 12 components with a single shared `OptimizedImage` component powered by `@unpic/react`. Additionally, optimize TMDB image sizes to request appropriately-sized images based on display context.

## Goals

- Standardize image rendering with consistent lazy loading, priority hints, and aspect ratio enforcement
- Eliminate 4 near-identical domain-specific image components (BookCover, AuthorPhoto, MoviePoster, ShowPoster)
- Reduce bandwidth by requesting context-appropriate TMDB image sizes instead of `w500` everywhere
- Prevent layout shifts via unpic's inline aspect-ratio styles

## Non-Goals

- Responsive `srcset` generation (Hardcover and TMDB CDNs are not in unpic's supported provider list)
- Image proxy/CDN setup (no Cloudinary, wsrv.nl, etc.)
- Hardcover image size optimization (their CDN doesn't offer size variants)

---

## OptimizedImage Component

**Location:** `src/components/shared/optimized-image.tsx`

### Props

```tsx
type ImageType = "book" | "movie" | "show" | "author" | "generic";

type OptimizedImageProps = {
  src: string | null;
  alt: string;
  type: ImageType;
  width: number;
  height: number;
  priority?: boolean; // above-the-fold images (detail page heroes)
  className?: string; // applied to the outer wrapper div
  imageClassName?: string; // applied to the img itself (e.g., "grayscale")
};
```

### Behavior

- **Valid `src`**: Renders `@unpic/react`'s `<Image>` with `layout="constrained"`, automatic `loading="lazy"`, `decoding="async"`
- **`priority={true}`**: Sets `loading="eager"` and `fetchpriority="high"`
- **Null `src` or load error**: Shows inferred fallback (icon + label) inside a `bg-muted` container
- **Error handling**: `imageFailed` state + `onError` handler + `useEffect` reset when `src` changes (existing pattern)
- **Outer wrapper**: `div` with existing styling (border, rounded corners, shadow, overflow hidden)

### Type-to-Fallback Mapping

| Type      | Icon        | Label       |
| --------- | ----------- | ----------- |
| `book`    | `BookOpen`  | "No cover"  |
| `movie`   | `Film`      | "No poster" |
| `show`    | `Tv`        | "No poster" |
| `author`  | `ImageOff`  | "No photo"  |
| `generic` | `ImageIcon` | "No image"  |

---

## TMDB Size Optimization

The DB stores full TMDB URLs with `w500` baked in (e.g., `https://image.tmdb.org/t/p/w500/abc123.jpg`). Since the same poster URL is used in both detail pages and tiny thumbnails, a client-side utility swaps the size at render time:

**Location:** `src/lib/utils.ts`

```ts
export function resizeTmdbUrl(url: string | null, size: string): string | null {
  if (!url) return null;
  return url.replace(/\/t\/p\/\w+\//, `/t/p/${size}/`);
}
```

Callers in table/calendar/search contexts use this before passing to `OptimizedImage`:

```tsx
<OptimizedImage src={resizeTmdbUrl(movie.posterUrl, "w185")} ... />
```

Detail page hero images skip this call and use the stored `w500` URL directly. Non-TMDB URLs (Hardcover) pass through unchanged since the regex won't match.

### Size mapping by context:

| Context                        | Current    | New     | Rationale                                |
| ------------------------------ | ---------- | ------- | ---------------------------------------- |
| Detail page hero (movie, show) | `w500`     | `w500`  | Already appropriate for ~224px max-width |
| Table thumbnails               | `w500`     | `w185`  | Thumbnails are ~40-60px wide             |
| Calendar items                 | `w500`     | `w154`  | Tiny `w-12` (48px) posters               |
| Search result cards (small)    | `w500`     | `w185`  | ~64px wide thumbnails                    |
| Search result preview (large)  | `w500`     | `w342`  | ~128px wide preview                      |
| Collection movie posters       | `w500`     | `w154`  | 50px wide posters                        |
| Collection card posters        | `w500`     | `w185`  | 80px wide posters                        |
| Backdrop/fanart                | `original` | `w1280` | Full-res original is overkill            |

No changes needed for Hardcover images.

---

## Cover URL Selection Utility

**Location:** `src/lib/utils.ts`

```ts
export function getCoverUrl(
  images: Array<{ url: string; coverType: string }> | undefined,
): string | null {
  return (
    images?.find((img) => img.coverType === "cover")?.url ??
    images?.[0]?.url ??
    null
  );
}
```

Extracts the cover-selection logic currently embedded in `BookCover` so callers can pass a plain `src` string to `OptimizedImage`.

---

## Migration

### Components Deleted (replaced by OptimizedImage)

- `src/components/bookshelf/books/book-cover.tsx`
- `src/components/bookshelf/authors/author-photo.tsx`
- `src/components/movies/movie-poster.tsx`
- `src/components/tv/show-poster.tsx`

### Components Updated (raw `<img>` tags replaced with OptimizedImage)

- `base-book-table.tsx` — table thumbnail
- `author-table.tsx` — table thumbnail
- `movie-table.tsx` — table thumbnail
- `show-table.tsx` — table thumbnail
- `profile-edition-card.tsx` — edition thumbnail
- `collection-movie-poster.tsx` — small poster (keeps wrapper for grayscale/border logic)
- `collection-card.tsx` — collection poster
- `movies/calendar.tsx` — calendar thumbnail
- `tv/calendar.tsx` — calendar thumbnail
- `tmdb-movie-search.tsx` — search result images (2 locations)
- `tmdb-show-search.tsx` — search result images (2 locations)
- `books/add.tsx` — search result thumbnail
- `authors/$authorId.tsx` — inline images (2 locations)

### Not Changed

- `Avatar` in `header.tsx` — user initials only, no image URL

### Priority Usage

`priority={true}` on detail page hero images only:

- Movie poster on `/movies/$movieId`
- Show poster on `/tv/$showId`
- Book cover on `/books/$bookId`
- Author photo on `/authors/$authorId`

All other images use default lazy loading.

---

## Dependencies

- **Add:** `@unpic/react`
- **Remove:** None (no existing image libraries to replace)
