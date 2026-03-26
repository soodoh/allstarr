# Image Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all native `<img>` tags with a shared `OptimizedImage` component powered by `@unpic/react`, and optimize TMDB image sizes per display context.

**Architecture:** Single shared component wrapping `@unpic/react`'s `<Image>` with error state, fallback icons, and type inference. A `resizeTmdbUrl` utility enables callers to request smaller TMDB images for thumbnails. Four domain-specific image components (BookCover, AuthorPhoto, MoviePoster, ShowPoster) are deleted and replaced.

**Tech Stack:** @unpic/react, React, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-25-image-optimization-design.md`

---

### Task 1: Install @unpic/react and add utility functions

**Files:**

- Modify: `package.json`
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: Install @unpic/react**

Run: `bun add @unpic/react`

- [ ] **Step 2: Add `getCoverUrl` and `resizeTmdbUrl` utilities to `src/lib/utils.ts`**

Add to the end of the existing file (which currently only has the `cn` function):

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

export function resizeTmdbUrl(url: string | null, size: string): string | null {
  if (!url) return null;
  return url.replace(/\/t\/p\/\w+\//, `/t/p/${size}/`);
}
```

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: Successful build with no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock src/lib/utils.ts
git commit -m "feat: install @unpic/react and add image utility functions"
```

---

### Task 2: Create OptimizedImage component

**Files:**

- Create: `src/components/shared/optimized-image.tsx`

- [ ] **Step 1: Create `src/components/shared/optimized-image.tsx`**

```tsx
import { Image } from "@unpic/react";
import { BookOpen, Film, ImageIcon, ImageOff, Tv } from "lucide-react";
import { useEffect, useState } from "react";
import type { JSX } from "react";
import { cn } from "src/lib/utils";

type ImageType = "book" | "movie" | "show" | "author" | "generic";

type OptimizedImageProps = {
  src: string | null;
  alt: string;
  type: ImageType;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
};

const fallbacks: Record<ImageType, { icon: typeof Film; label: string }> = {
  book: { icon: BookOpen, label: "No cover" },
  movie: { icon: Film, label: "No poster" },
  show: { icon: Tv, label: "No poster" },
  author: { icon: ImageOff, label: "No photo" },
  generic: { icon: ImageIcon, label: "No image" },
};

export default function OptimizedImage({
  src,
  alt,
  type,
  width,
  height,
  priority = false,
  className,
  imageClassName,
}: OptimizedImageProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  const { icon: FallbackIcon, label } = fallbacks[type];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-muted shadow-sm",
        className,
      )}
    >
      {src && !imageFailed ? (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          layout="constrained"
          priority={priority}
          className={cn("h-full w-full object-cover", imageClassName)}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <FallbackIcon className="h-8 w-8" />
          <span className="text-xs">{label}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: Successful build with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/optimized-image.tsx
git commit -m "feat: create OptimizedImage shared component"
```

---

### Task 3: Replace BookCover usages and delete component

**Files:**

- Delete: `src/components/bookshelf/books/book-cover.tsx`
- Modify: `src/routes/_authed/books/$bookId.tsx`
- Modify: `src/components/bookshelf/books/book-card.tsx`
- Modify: `src/components/bookshelf/books/book-detail-content.tsx`

- [ ] **Step 1: Update `src/routes/_authed/books/$bookId.tsx`**

Replace the BookCover import:

```ts
// Remove:
import BookCover from "src/components/bookshelf/books/book-cover";

// Add:
import OptimizedImage from "src/components/shared/optimized-image";
import { getCoverUrl } from "src/lib/utils";
```

Replace the usage at line ~233:

```tsx
// Remove:
<BookCover
  title={book.title}
  images={coverImages}
  className="w-full xl:w-44 shrink-0"
/>

// Replace with:
<OptimizedImage
  src={getCoverUrl(coverImages)}
  alt={`${book.title} cover`}
  type="book"
  width={224}
  height={336}
  priority
  className="aspect-[2/3] w-full max-w-56 xl:w-44 shrink-0"
/>
```

- [ ] **Step 2: Update `src/components/bookshelf/books/book-card.tsx`**

Replace the BookCover import:

```ts
// Remove:
import BookCover from "src/components/bookshelf/books/book-cover";

// Add:
import OptimizedImage from "src/components/shared/optimized-image";
import { getCoverUrl } from "src/lib/utils";
```

Replace the usage at line ~43:

```tsx
// Remove:
<BookCover
  title={book.editionTitle}
  images={book.editionImages ?? book.images}
  className="w-full transition-shadow group-hover:shadow-lg"
/>

// Replace with:
<OptimizedImage
  src={getCoverUrl(book.editionImages ?? book.images)}
  alt={`${book.editionTitle} cover`}
  type="book"
  width={224}
  height={336}
  className="aspect-[2/3] w-full max-w-56 transition-shadow group-hover:shadow-lg"
/>
```

- [ ] **Step 3: Update `src/components/bookshelf/books/book-detail-content.tsx`**

Replace the BookCover import:

```ts
// Remove:
import BookCover from "src/components/bookshelf/books/book-cover";

// Add:
import OptimizedImage from "src/components/shared/optimized-image";
import { getCoverUrl } from "src/lib/utils";
```

Replace the usage at line ~65:

```tsx
// Remove:
<BookCover title={book.title} images={coverImages} className="w-40" />

// Replace with:
<OptimizedImage
  src={getCoverUrl(coverImages)}
  alt={`${book.title} cover`}
  type="book"
  width={160}
  height={240}
  className="aspect-[2/3] w-40"
/>
```

- [ ] **Step 4: Delete `src/components/bookshelf/books/book-cover.tsx`**

Run: `rm src/components/bookshelf/books/book-cover.tsx`

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: Successful build with no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: replace BookCover with OptimizedImage"
```

---

### Task 4: Replace AuthorPhoto usages and delete component

**Files:**

- Delete: `src/components/bookshelf/authors/author-photo.tsx`
- Modify: `src/routes/_authed/authors/$authorId.tsx`
- Modify: `src/components/bookshelf/authors/author-card.tsx`
- Modify: `src/components/bookshelf/hardcover/author-preview-modal.tsx`

- [ ] **Step 1: Update `src/routes/_authed/authors/$authorId.tsx`**

Replace the AuthorPhoto import:

```ts
// Remove:
import AuthorPhoto from "src/components/bookshelf/authors/author-photo";

// Add:
import OptimizedImage from "src/components/shared/optimized-image";
```

Replace the usage at line ~1413:

```tsx
// Remove:
<AuthorPhoto
  name={author.name}
  imageUrl={author.images?.[0]?.url ?? null}
  className="xl:h-full xl:max-w-none xl:w-44 xl:aspect-auto"
/>

// Replace with:
<OptimizedImage
  src={author.images?.[0]?.url ?? null}
  alt={`${author.name} photo`}
  type="author"
  width={176}
  height={234}
  priority
  className="aspect-[3/4] w-full max-w-56 xl:h-full xl:max-w-none xl:w-44 xl:aspect-auto"
/>
```

- [ ] **Step 2: Update `src/components/bookshelf/authors/author-card.tsx`**

Replace the AuthorPhoto import:

```ts
// Remove:
import AuthorPhoto from "src/components/bookshelf/authors/author-photo";

// Add:
import OptimizedImage from "src/components/shared/optimized-image";
```

Replace the usage at line ~27:

```tsx
// Remove:
<AuthorPhoto
  name={author.name}
  imageUrl={imageUrl}
  className="w-full transition-shadow group-hover:shadow-lg"
/>

// Replace with:
<OptimizedImage
  src={imageUrl}
  alt={`${author.name} photo`}
  type="author"
  width={224}
  height={298}
  className="aspect-[3/4] w-full max-w-56 transition-shadow group-hover:shadow-lg"
/>
```

- [ ] **Step 3: Update `src/components/bookshelf/hardcover/author-preview-modal.tsx`**

Replace the AuthorPhoto import:

```ts
// Remove:
import AuthorPhoto from "src/components/bookshelf/authors/author-photo";

// Add:
import OptimizedImage from "src/components/shared/optimized-image";
```

Replace the usage at line ~236:

```tsx
// Remove:
<AuthorPhoto
  name={displayName}
  imageUrl={displayImage}
  className="h-20 w-20 rounded-full"
/>

// Replace with:
<OptimizedImage
  src={displayImage}
  alt={`${displayName} photo`}
  type="author"
  width={80}
  height={80}
  className="h-20 w-20 rounded-full"
/>
```

- [ ] **Step 4: Delete `src/components/bookshelf/authors/author-photo.tsx`**

Run: `rm src/components/bookshelf/authors/author-photo.tsx`

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: Successful build with no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: replace AuthorPhoto with OptimizedImage"
```

---

### Task 5: Replace MoviePoster usages and delete component

**Files:**

- Delete: `src/components/movies/movie-poster.tsx`
- Modify: `src/components/movies/movie-detail-header.tsx`
- Modify: `src/components/movies/movie-card.tsx`

- [ ] **Step 1: Update `src/components/movies/movie-detail-header.tsx`**

Replace the MoviePoster import:

```ts
// Remove:
import MoviePoster from "src/components/movies/movie-poster";

// Add:
import OptimizedImage from "src/components/shared/optimized-image";
```

Replace the usage at line ~296:

```tsx
// Remove:
<MoviePoster
  posterUrl={movie.posterUrl || null}
  title={movie.title}
  className="w-full xl:w-44 shrink-0"
/>

// Replace with:
<OptimizedImage
  src={movie.posterUrl || null}
  alt={`${movie.title} poster`}
  type="movie"
  width={224}
  height={336}
  priority
  className="aspect-[2/3] w-full max-w-56 xl:w-44 shrink-0"
/>
```

- [ ] **Step 2: Update `src/components/movies/movie-card.tsx`**

Replace the MoviePoster import:

```ts
// Remove:
import MoviePoster from "src/components/movies/movie-poster";

// Add:
import OptimizedImage from "src/components/shared/optimized-image";
```

Replace the usage at line ~48:

```tsx
// Remove:
<MoviePoster
  posterUrl={movie.posterUrl || null}
  title={movie.title}
  className="w-full transition-shadow group-hover:shadow-lg"
/>

// Replace with:
<OptimizedImage
  src={movie.posterUrl || null}
  alt={`${movie.title} poster`}
  type="movie"
  width={224}
  height={336}
  className="aspect-[2/3] w-full max-w-56 transition-shadow group-hover:shadow-lg"
/>
```

- [ ] **Step 3: Delete `src/components/movies/movie-poster.tsx`**

Run: `rm src/components/movies/movie-poster.tsx`

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: Successful build with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: replace MoviePoster with OptimizedImage"
```

---

### Task 6: Replace ShowPoster usages and delete component

**Files:**

- Delete: `src/components/tv/show-poster.tsx`
- Modify: `src/components/tv/show-detail-header.tsx`
- Modify: `src/components/tv/show-card.tsx`

- [ ] **Step 1: Update `src/components/tv/show-detail-header.tsx`**

Replace the ShowPoster import:

```ts
// Remove:
import ShowPoster from "src/components/tv/show-poster";

// Add:
import OptimizedImage from "src/components/shared/optimized-image";
```

Replace the usage at line ~391:

```tsx
// Remove:
<ShowPoster
  posterUrl={show.posterUrl || null}
  title={show.title}
  className="w-full xl:w-44 shrink-0"
/>

// Replace with:
<OptimizedImage
  src={show.posterUrl || null}
  alt={`${show.title} poster`}
  type="show"
  width={224}
  height={336}
  priority
  className="aspect-[2/3] w-full max-w-56 xl:w-44 shrink-0"
/>
```

- [ ] **Step 2: Update `src/components/tv/show-card.tsx`**

Replace the ShowPoster import:

```ts
// Remove:
import ShowPoster from "src/components/tv/show-poster";

// Add:
import OptimizedImage from "src/components/shared/optimized-image";
```

Replace the usage at line ~38:

```tsx
// Remove:
<ShowPoster
  posterUrl={show.posterUrl || null}
  title={show.title}
  className="w-full transition-shadow group-hover:shadow-lg"
/>

// Replace with:
<OptimizedImage
  src={show.posterUrl || null}
  alt={`${show.title} poster`}
  type="show"
  width={224}
  height={336}
  className="aspect-[2/3] w-full max-w-56 transition-shadow group-hover:shadow-lg"
/>
```

- [ ] **Step 3: Delete `src/components/tv/show-poster.tsx`**

Run: `rm src/components/tv/show-poster.tsx`

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: Successful build with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: replace ShowPoster with OptimizedImage"
```

---

### Task 7: Replace inline img tags in table components

**Files:**

- Modify: `src/components/bookshelf/books/base-book-table.tsx`
- Modify: `src/components/bookshelf/authors/author-table.tsx`
- Modify: `src/components/movies/movie-table.tsx`
- Modify: `src/components/tv/show-table.tsx`

- [ ] **Step 1: Update `src/components/bookshelf/books/base-book-table.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
```

Replace the img block at line ~310-315 (inside `<TableCell className="min-w-14 w-14">`):

```tsx
// Remove:
{
  row.coverUrl ? (
    <img
      src={row.coverUrl}
      alt={row.title}
      loading="lazy"
      className="aspect-[2/3] w-full rounded-sm object-cover"
    />
  ) : (
    <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
      <ImageIcon className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// Replace with:
<OptimizedImage
  src={row.coverUrl ?? null}
  alt={row.title}
  type="book"
  width={56}
  height={84}
  className="aspect-[2/3] w-full rounded-sm"
/>;
```

Remove the `ImageIcon` import from lucide-react if no longer used elsewhere in the file.

- [ ] **Step 2: Update `src/components/bookshelf/authors/author-table.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
```

Replace the img block at line ~130-134 (inside `<TableCell>`):

```tsx
// Remove:
{
  authorImage ? (
    <img
      src={authorImage}
      alt={author.name}
      className="aspect-square w-full rounded-full object-cover"
    />
  ) : (
    <div className="aspect-square w-full rounded-full bg-muted flex items-center justify-center">
      <ImageIcon className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// Replace with:
<OptimizedImage
  src={authorImage}
  alt={author.name}
  type="author"
  width={56}
  height={56}
  className="aspect-square w-full rounded-full"
/>;
```

Remove the `ImageIcon` import from lucide-react if no longer used elsewhere in the file.

- [ ] **Step 3: Update `src/components/movies/movie-table.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
import { resizeTmdbUrl } from "src/lib/utils";
```

Replace the img block at line ~181-185:

```tsx
// Remove:
{
  movie.posterUrl ? (
    <img
      src={movie.posterUrl}
      alt={movie.title}
      className="aspect-[2/3] w-full rounded-sm object-cover"
    />
  ) : (
    <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
      <Film className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// Replace with:
<OptimizedImage
  src={resizeTmdbUrl(movie.posterUrl, "w185")}
  alt={movie.title}
  type="movie"
  width={56}
  height={84}
  className="aspect-[2/3] w-full rounded-sm"
/>;
```

Remove the `Film` import from lucide-react if no longer used elsewhere in the file.

- [ ] **Step 4: Update `src/components/tv/show-table.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
import { resizeTmdbUrl } from "src/lib/utils";
```

Replace the img block at line ~204-208:

```tsx
// Remove:
{
  show.posterUrl ? (
    <img
      src={show.posterUrl}
      alt={show.title}
      className="aspect-[2/3] w-full rounded-sm object-cover"
    />
  ) : (
    <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
      <Tv className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// Replace with:
<OptimizedImage
  src={resizeTmdbUrl(show.posterUrl, "w185")}
  alt={show.title}
  type="show"
  width={56}
  height={84}
  className="aspect-[2/3] w-full rounded-sm"
/>;
```

Remove the `Tv` import from lucide-react if no longer used elsewhere in the file.

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: Successful build with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/bookshelf/books/base-book-table.tsx src/components/bookshelf/authors/author-table.tsx src/components/movies/movie-table.tsx src/components/tv/show-table.tsx
git commit -m "refactor: replace table thumbnail img tags with OptimizedImage"
```

---

### Task 8: Replace inline img tags in calendar, collection, and search components

**Files:**

- Modify: `src/routes/_authed/movies/calendar.tsx`
- Modify: `src/routes/_authed/tv/calendar.tsx`
- Modify: `src/components/movies/collection-movie-poster.tsx`
- Modify: `src/components/movies/collection-card.tsx`
- Modify: `src/components/bookshelf/books/profile-edition-card.tsx`

- [ ] **Step 1: Update `src/routes/_authed/movies/calendar.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
import { resizeTmdbUrl } from "src/lib/utils";
```

Replace the img block at line ~121-125 (inside `<div className="w-12 shrink-0">`):

```tsx
// Remove:
{
  movie.posterUrl ? (
    <img
      src={movie.posterUrl}
      alt={movie.title}
      className="w-12 aspect-[2/3] rounded-sm object-cover"
    />
  ) : (
    <div className="w-12 aspect-[2/3] rounded-sm bg-muted flex items-center justify-center">
      <Film className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// Replace with:
<OptimizedImage
  src={resizeTmdbUrl(movie.posterUrl, "w154")}
  alt={movie.title}
  type="movie"
  width={48}
  height={72}
  className="w-12 aspect-[2/3] rounded-sm"
/>;
```

- [ ] **Step 2: Update `src/routes/_authed/tv/calendar.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
import { resizeTmdbUrl } from "src/lib/utils";
```

Replace the img block at line ~96-100 (inside `<div className="w-12 shrink-0">`):

```tsx
// Remove:
{
  show.posterUrl ? (
    <img
      src={show.posterUrl}
      alt={show.title}
      className="w-12 aspect-[2/3] rounded-sm object-cover"
    />
  ) : (
    <div className="w-12 aspect-[2/3] rounded-sm bg-muted flex items-center justify-center">
      <Tv className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// Replace with:
<OptimizedImage
  src={resizeTmdbUrl(show.posterUrl, "w154")}
  alt={show.title}
  type="show"
  width={48}
  height={72}
  className="w-12 aspect-[2/3] rounded-sm"
/>;
```

- [ ] **Step 3: Update `src/components/movies/collection-movie-poster.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
import { resizeTmdbUrl } from "src/lib/utils";
```

Replace the img/fallback block at line ~48-61:

```tsx
// Remove:
{
  movie.posterUrl ? (
    <img
      src={movie.posterUrl}
      alt={movie.title}
      className={cn(
        "w-full h-full object-cover",
        movie.isExcluded && "grayscale",
      )}
    />
  ) : (
    <div className="w-full h-full bg-muted flex items-center justify-center">
      <Film className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// Replace with:
<OptimizedImage
  src={resizeTmdbUrl(movie.posterUrl, "w154")}
  alt={movie.title}
  type="movie"
  width={50}
  height={75}
  className="w-full h-full rounded-none border-0 shadow-none"
  imageClassName={movie.isExcluded ? "grayscale" : undefined}
/>;
```

Remove the `Film` import from lucide-react if no longer used elsewhere in the file.

- [ ] **Step 4: Update `src/components/movies/collection-card.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
import { resizeTmdbUrl } from "src/lib/utils";
```

Replace the img block at line ~53-57 (inside `<div className="w-[80px] h-[120px] flex-shrink-0 rounded-md overflow-hidden bg-muted">`):

```tsx
// Remove:
{
  collection.posterUrl ? (
    <img
      src={collection.posterUrl}
      alt={collection.title}
      className="w-full h-full object-cover"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center">
      <Film className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

// Replace with:
<OptimizedImage
  src={resizeTmdbUrl(collection.posterUrl, "w185")}
  alt={collection.title}
  type="movie"
  width={80}
  height={120}
  className="w-full h-full rounded-none border-0 shadow-none"
/>;
```

Remove the wrapping `<div className="w-[80px] h-[120px] flex-shrink-0 rounded-md overflow-hidden bg-muted">` since `OptimizedImage` provides its own wrapper. Keep the sizing on the `OptimizedImage` className instead: `className="w-[80px] h-[120px] flex-shrink-0 rounded-md"`.

- [ ] **Step 5: Update `src/components/bookshelf/books/profile-edition-card.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
```

Replace the img block at line ~60-64:

```tsx
// Remove:
{
  coverUrl ? (
    <img
      src={coverUrl}
      alt={edition.title}
      className="h-[72px] w-[48px] rounded object-cover shrink-0"
    />
  ) : (
    <div className="h-[72px] w-[48px] rounded bg-muted flex items-center justify-center shrink-0">
      <Profile className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// Replace with:
<OptimizedImage
  src={coverUrl}
  alt={edition.title}
  type="book"
  width={48}
  height={72}
  className="h-[72px] w-[48px] rounded shrink-0"
/>;
```

- [ ] **Step 6: Verify build**

Run: `bun run build`
Expected: Successful build with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_authed/movies/calendar.tsx src/routes/_authed/tv/calendar.tsx src/components/movies/collection-movie-poster.tsx src/components/movies/collection-card.tsx src/components/bookshelf/books/profile-edition-card.tsx
git commit -m "refactor: replace calendar, collection, and edition img tags with OptimizedImage"
```

---

### Task 9: Replace inline img tags in search components and author detail

**Files:**

- Modify: `src/components/movies/tmdb-movie-search.tsx`
- Modify: `src/components/tv/tmdb-show-search.tsx`
- Modify: `src/routes/_authed/books/add.tsx`
- Modify: `src/routes/_authed/authors/$authorId.tsx`

- [ ] **Step 1: Update `src/components/movies/tmdb-movie-search.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
import { resizeTmdbUrl } from "src/lib/utils";
```

Replace the **first** img block at line ~143-147 (large preview, inside `<div className="h-48 w-32 shrink-0 overflow-hidden rounded border border-border bg-muted">`):

```tsx
// Remove the wrapping div and its contents:
<div className="h-48 w-32 shrink-0 overflow-hidden rounded border border-border bg-muted">
  {movie.poster_path ? (
    <img
      src={movie.poster_path}
      alt={`${movie.title} poster`}
      className="h-full w-full object-cover"
    />
  ) : (
    <div className="h-full w-full flex items-center justify-center">
      <Film className="h-6 w-6 text-muted-foreground" />
    </div>
  )}
</div>

// Replace with:
<OptimizedImage
  src={resizeTmdbUrl(movie.poster_path ?? null, "w342")}
  alt={`${movie.title} poster`}
  type="movie"
  width={128}
  height={192}
  className="h-48 w-32 shrink-0 rounded"
/>
```

Replace the **second** img block at line ~304-309 (small card, inside `<div className="h-24 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted">`):

```tsx
// Remove the wrapping div and its contents:
<div className="h-24 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted">
  {movie.poster_path ? (
    <img
      src={movie.poster_path}
      alt={`${movie.title} poster`}
      className="h-full w-full object-cover"
      loading="lazy"
    />
  ) : (
    <div className="h-full w-full flex items-center justify-center">
      <Film className="h-4 w-4 text-muted-foreground" />
    </div>
  )}
</div>

// Replace with:
<OptimizedImage
  src={resizeTmdbUrl(movie.poster_path ?? null, "w185")}
  alt={`${movie.title} poster`}
  type="movie"
  width={64}
  height={96}
  className="h-24 w-16 shrink-0 rounded"
/>
```

- [ ] **Step 2: Update `src/components/tv/tmdb-show-search.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
import { resizeTmdbUrl } from "src/lib/utils";
```

Replace the **first** img block at line ~165-169 (large preview):

```tsx
// Remove the wrapping div and its contents, replace with:
<OptimizedImage
  src={resizeTmdbUrl(show.poster_path ?? null, "w342")}
  alt={`${show.name} poster`}
  type="show"
  width={128}
  height={192}
  className="h-48 w-32 shrink-0 rounded"
/>
```

Replace the **second** img block at line ~344-349 (small card):

```tsx
// Remove the wrapping div and its contents, replace with:
<OptimizedImage
  src={resizeTmdbUrl(show.poster_path ?? null, "w185")}
  alt={`${show.name} poster`}
  type="show"
  width={64}
  height={96}
  className="h-24 w-16 shrink-0 rounded"
/>
```

- [ ] **Step 3: Update `src/routes/_authed/books/add.tsx`**

Add import:

```ts
import OptimizedImage from "src/components/shared/optimized-image";
```

Replace the img block at line ~240-244 (inside `<div className="h-24 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted">`):

```tsx
// Remove the wrapping div and its contents, replace with:
<OptimizedImage
  src={result.coverUrl ?? null}
  alt={`${result.title} cover`}
  type="book"
  width={64}
  height={96}
  className="h-24 w-16 shrink-0 rounded"
/>
```

- [ ] **Step 4: Update `src/routes/_authed/authors/$authorId.tsx`**

Add import (OptimizedImage is already imported from Task 4):

```ts
import { getCoverUrl } from "src/lib/utils";
```

Replace **both** inline img blocks at lines ~1069 and ~1174 (inside `<TableCell className="min-w-14 w-14">`):

```tsx
// Remove (appears at both locations):
{
  coverUrl ? (
    <img
      src={coverUrl}
      alt={displayTitle}
      className="aspect-[2/3] w-full rounded-sm object-cover"
    />
  ) : (
    <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
      <ImageIcon className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// Replace with (at both locations):
<OptimizedImage
  src={coverUrl ?? null}
  alt={displayTitle}
  type="book"
  width={56}
  height={84}
  className="aspect-[2/3] w-full rounded-sm"
/>;
```

Remove the `ImageIcon` import from lucide-react if no longer used elsewhere in the file.

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: Successful build with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/movies/tmdb-movie-search.tsx src/components/tv/tmdb-show-search.tsx src/routes/_authed/books/add.tsx src/routes/_authed/authors/\$authorId.tsx
git commit -m "refactor: replace search and author detail img tags with OptimizedImage"
```

---

### Task 10: Update TMDB backdrop sizes

**Files:**

- Modify: `src/server/movies.ts`
- Modify: `src/server/shows.ts`
- Modify: `src/server/movie-collections.ts`
- Modify: `src/server/tmdb/movies.ts`
- Modify: `src/server/tmdb/shows.ts`

- [ ] **Step 1: Update all `transformImagePath(*.backdrop_path, "original")` calls to use `"w1280"`**

In `src/server/movies.ts`, replace every occurrence:

```ts
// Replace all instances of:
transformImagePath(raw.backdrop_path, "original");
transformImagePath(col.backdrop_path, "original");
// With:
transformImagePath(raw.backdrop_path, "w1280");
transformImagePath(col.backdrop_path, "w1280");
```

In `src/server/shows.ts`, replace every occurrence:

```ts
transformImagePath(raw.backdrop_path, "original");
// With:
transformImagePath(raw.backdrop_path, "w1280");
```

In `src/server/movie-collections.ts`, replace every occurrence:

```ts
transformImagePath(detail.backdrop_path, "original");
// With:
transformImagePath(detail.backdrop_path, "w1280");
```

In `src/server/tmdb/movies.ts`, replace:

```ts
backdrop_path: transformImagePath(raw.backdrop_path, "original"),
// With:
backdrop_path: transformImagePath(raw.backdrop_path, "w1280"),
```

In `src/server/tmdb/shows.ts`, replace:

```ts
backdrop_path: transformImagePath(raw.backdrop_path, "original"),
// With:
backdrop_path: transformImagePath(raw.backdrop_path, "w1280"),
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: Successful build with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/movies.ts src/server/shows.ts src/server/movie-collections.ts src/server/tmdb/movies.ts src/server/tmdb/shows.ts
git commit -m "perf: use w1280 instead of original for TMDB backdrop images"
```

---

### Task 11: Final verification and cleanup

- [ ] **Step 1: Verify no remaining raw img tags exist (except in node_modules or generated files)**

Run: `grep -r '<img' src/ --include='*.tsx' --include='*.ts' -l`
Expected: No files returned (all img tags have been replaced).

- [ ] **Step 2: Verify no orphaned imports of deleted components**

Run: `grep -r 'book-cover\|author-photo\|movie-poster\|show-poster' src/ --include='*.tsx' --include='*.ts' -l`
Expected: No files returned.

- [ ] **Step 3: Full build verification**

Run: `bun run build`
Expected: Successful build with no errors.

- [ ] **Step 4: Verify dev server starts**

Run: `bun run dev` (check it starts without errors, then stop it)
Expected: Dev server starts on port 3000 with no errors.
