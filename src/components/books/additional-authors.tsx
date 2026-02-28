import { useMemo, useState } from "react";
import type { JSX } from "react";
import { Link } from "@tanstack/react-router";
import AuthorPreviewModal from "src/components/hardcover/author-preview-modal";
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
        to="/library/authors/$authorId"
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
 */
export default function AdditionalAuthors({
  bookAuthors,
  currentAuthorId,
}: AdditionalAuthorsProps): JSX.Element | null {
  const [previewAuthor, setPreviewAuthor] = useState<
    HardcoverSearchItem | undefined
  >(undefined);

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

  return (
    <>
      {sortedAuthors.map((entry, i) => {
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
