import { useMemo, useState } from "react";
import type { JSX } from "react";
import { Link } from "@tanstack/react-router";
import AuthorPreviewModal from "src/components/hardcover/author-preview-modal";
import type { HardcoverSearchItem } from "src/server/search";

type ForeignAuthorIdEntry = { foreignAuthorId: string; name: string };

type AdditionalAuthorsProps = {
  foreignAuthorIds: ForeignAuthorIdEntry[] | null;
  resolvedAuthors: Record<string, { id: number; name: string }>;
  /** When set, this author is prepended to the list (primary author of the book). */
  primaryAuthor?: { foreignAuthorId: string; name: string } | null;
  /** When set, this author renders as plain text instead of a link (used on author detail pages). */
  currentAuthorId?: number;
};

function AuthorEntry({
  entry,
  local,
  isCurrent,
  onPreview,
}: {
  entry: ForeignAuthorIdEntry;
  local: { id: number; name: string } | undefined;
  isCurrent: boolean;
  onPreview: (author: HardcoverSearchItem) => void;
}): JSX.Element {
  if (local && !isCurrent) {
    return (
      <Link
        to="/library/authors/$authorId"
        params={{ authorId: String(local.id) }}
        className="hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {local.name}
      </Link>
    );
  }
  if (entry.foreignAuthorId && !isCurrent) {
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
            title: entry.name,
            subtitle: null,
            description: null,
            releaseYear: null,
            readers: null,
            coverUrl: null,
            hardcoverUrl: null,
          });
        }}
      >
        {entry.name}
      </button>
    );
  }
  return <span>{entry.name}</span>;
}

/**
 * Renders a list of authors as linked names.
 * - Local authors → Link to their author page (unless they match currentAuthorId)
 * - Non-local authors with foreignAuthorId → button that opens AuthorPreviewModal
 * - Fallback → plain text
 *
 * Pass `primaryAuthor` to prepend the book's primary author to the list.
 */
export default function AdditionalAuthors({
  foreignAuthorIds,
  resolvedAuthors,
  primaryAuthor,
  currentAuthorId,
}: AdditionalAuthorsProps): JSX.Element | null {
  const [previewAuthor, setPreviewAuthor] = useState<HardcoverSearchItem | undefined>(undefined);

  const allAuthors = useMemo(() => {
    const coAuthors = foreignAuthorIds ?? [];
    if (primaryAuthor) {
      return [primaryAuthor, ...coAuthors];
    }
    return coAuthors;
  }, [primaryAuthor, foreignAuthorIds]);

  if (allAuthors.length === 0) {
    return null;
  }

  return (
    <>
      {allAuthors.map((entry, i) => {
        const local = resolvedAuthors[entry.foreignAuthorId];
        const isCurrent = currentAuthorId !== undefined && local?.id === currentAuthorId;
        return (
          <span key={entry.foreignAuthorId}>
            {i > 0 && ", "}
            <AuthorEntry
              entry={entry}
              local={local}
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
          onOpenChange={(v) => { if (!v) { setPreviewAuthor(undefined); } }}
        />
      )}
    </>
  );
}
