import { useMemo, useState } from "react";
import type { JSX } from "react";
import { Link } from "@tanstack/react-router";
import AuthorPreviewModal from "src/components/bookshelf/hardcover/author-preview-modal";
import type { HardcoverSearchItem } from "src/server/search";

export type BookAuthorEntry = {
  authorId: number | null;
  foreignAuthorId: string;
  authorName: string;
  isPrimary: boolean;
};

type AdditionalAuthorsProps = {
  bookAuthors: BookAuthorEntry[];
  /** When set, this author renders as plain text instead of a link (used on author detail pages). */
  currentAuthorId?: number;
  /** Max authors to show before truncating. Defaults to 3. */
  maxVisible?: number;
  /** When true, the "and N more" text is clickable to expand/collapse the full list. */
  expandable?: boolean;
};

function AuthorEntry({
  entry,
  isCurrent,
  onPreview,
}: {
  entry: BookAuthorEntry;
  isCurrent: boolean;
  onPreview: (author: HardcoverSearchItem) => void;
}): JSX.Element {
  if (entry.authorId && !isCurrent) {
    return (
      <Link
        to="/authors/$authorId"
        params={{ authorId: String(entry.authorId) }}
        className="hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {entry.authorName}
      </Link>
    );
  }
  if (entry.foreignAuthorId && !entry.authorId && !isCurrent) {
    return (
      <button
        type="button"
        className="hover:underline cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onPreview({
            id: entry.foreignAuthorId,
            type: "author",
            slug: null,
            title: entry.authorName,
            subtitle: null,
            description: null,
            releaseYear: null,
            readers: null,
            coverUrl: null,
            hardcoverUrl: null,
          });
        }}
      >
        {entry.authorName}
      </button>
    );
  }
  return <span>{entry.authorName}</span>;
}

/**
 * Renders a list of authors as linked names.
 * - Local authors (authorId non-null) → Link to their author page (unless they match currentAuthorId)
 * - Non-local authors (authorId null, foreignAuthorId set) → button that opens AuthorPreviewModal
 * - Fallback → plain text
 *
 * When the list exceeds `maxVisible` (default 3), truncates with ", and N more".
 * If `expandable` is true, the overflow text is clickable to expand/collapse.
 */
export default function AdditionalAuthors({
  bookAuthors,
  currentAuthorId,
  maxVisible = 3,
  expandable = false,
}: AdditionalAuthorsProps): JSX.Element | null {
  const [previewAuthor, setPreviewAuthor] = useState<
    HardcoverSearchItem | undefined
  >(undefined);
  const [expanded, setExpanded] = useState(false);

  // Sort: primary first, then by name
  const sortedAuthors = useMemo(() => {
    return [...bookAuthors].toSorted((a, b) => {
      if (a.isPrimary !== b.isPrimary) {
        return a.isPrimary ? -1 : 1;
      }
      return a.authorName.localeCompare(b.authorName);
    });
  }, [bookAuthors]);

  if (sortedAuthors.length === 0) {
    return null;
  }

  const shouldTruncate = sortedAuthors.length > maxVisible && !expanded;
  const visibleAuthors = shouldTruncate
    ? sortedAuthors.slice(0, maxVisible)
    : sortedAuthors;
  const remainingCount = sortedAuthors.length - maxVisible;

  return (
    <>
      {visibleAuthors.map((entry, i) => {
        const isCurrent =
          currentAuthorId !== undefined && entry.authorId === currentAuthorId;
        return (
          <span key={entry.foreignAuthorId}>
            {i > 0 && ", "}
            <AuthorEntry
              entry={entry}
              isCurrent={isCurrent}
              onPreview={setPreviewAuthor}
            />
          </span>
        );
      })}
      {shouldTruncate &&
        (expandable ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
          >
            , and {remainingCount} more
          </button>
        ) : (
          <span className="text-muted-foreground">
            , and {remainingCount} more
          </span>
        ))}
      {expanded && expandable && sortedAuthors.length > maxVisible && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-pointer ml-1"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
        >
          (show less)
        </button>
      )}
      {previewAuthor && (
        <AuthorPreviewModal
          author={previewAuthor}
          open
          onOpenChange={(v) => {
            if (!v) {
              setPreviewAuthor(undefined);
            }
          }}
        />
      )}
    </>
  );
}
