import { useNavigate } from "@tanstack/react-router";
import type { JSX, ReactNode } from "react";
import { useMemo } from "react";
import type { BookAuthorEntry } from "src/components/bookshelf/books/additional-authors";
import type {
	BookTableRow,
	ColumnKey,
} from "src/components/bookshelf/books/base-book-table";
import BaseBookTable from "src/components/bookshelf/books/base-book-table";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import { useTableColumns } from "src/hooks/use-table-columns";

type Book = {
	id: number;
	title: string;
	coverUrl: string | null;
	bookAuthors: BookAuthorEntry[];
	authorName: string | null;
	releaseDate: string | null;
	rating: number | null;
	ratingsCount: number | null;
	usersCount: number | null;
	series: Array<{ title: string; position: string | null }>;
	downloadProfileIds?: number[];
	authorDownloadProfileIds?: number[];
};

type DownloadProfile = {
	id: number;
	name: string;
	icon: string;
};

type BookTableProps = {
	books: Book[];
	sortKey?: string;
	sortDir?: "asc" | "desc";
	onSort?: (key: string) => void;
	downloadProfiles?: DownloadProfile[];
	onToggleProfile?: (editionId: number, profileId: number) => void;
	children?: ReactNode;
};

function mapBookToRow(book: Book): BookTableRow {
	return {
		key: book.id,
		bookId: book.id,
		title: book.title,
		coverUrl: book.coverUrl,
		bookAuthors: book.bookAuthors,
		authorName: book.authorName,
		releaseDate: book.releaseDate,
		usersCount: book.usersCount,
		rating: book.rating,
		ratingsCount: book.ratingsCount,
		format: null,
		pageCount: null,
		audioLength: null,
		isbn10: null,
		isbn13: null,
		asin: null,
		score: null,
		publisher: null,
		editionInformation: null,
		language: null,
		country: null,
		series: book.series,
		monitored: (book.downloadProfileIds ?? []).length > 0,
		downloadProfileIds: book.downloadProfileIds ?? [],
	};
}

export default function BookTable({
	books,
	sortKey,
	sortDir,
	onSort,
	downloadProfiles,
	onToggleProfile,
	children,
}: BookTableProps): JSX.Element {
	const navigate = useNavigate();
	const { visibleColumns } = useTableColumns("books");

	const columns = useMemo(
		() =>
			visibleColumns.map((col) => ({
				key: col.key as ColumnKey,
				sortable:
					col.key === "title" ||
					col.key === "author" ||
					col.key === "releaseDate" ||
					col.key === "series" ||
					col.key === "readers" ||
					col.key === "rating",
			})),
		[visibleColumns],
	);

	const rows = useMemo(() => books.map(mapBookToRow), [books]);

	// Build a lookup of authorDownloadProfileIds by bookId for leading cell
	const authorProfilesMap = useMemo(() => {
		const map = new Map<number, number[]>();
		for (const book of books) {
			if (book.authorDownloadProfileIds) {
				map.set(book.id, book.authorDownloadProfileIds);
			}
		}
		return map;
	}, [books]);

	const renderLeadingCell =
		downloadProfiles && onToggleProfile
			? (row: BookTableRow) => {
					// Filter profiles: only show profiles the author is linked to
					const authorProfileIds = authorProfilesMap.get(row.bookId) ?? [];
					const visibleProfiles =
						authorProfileIds.length > 0
							? downloadProfiles.filter((p) => authorProfileIds.includes(p.id))
							: downloadProfiles;
					return (
						<ProfileToggleIcons
							profiles={visibleProfiles}
							activeProfileIds={row.downloadProfileIds}
							onToggle={(profileId) => onToggleProfile(row.bookId, profileId)}
						/>
					);
				}
			: undefined;

	return (
		<BaseBookTable
			rows={rows}
			columns={columns}
			sortKey={sortKey}
			sortDir={sortDir}
			onSort={onSort}
			renderLeadingCell={renderLeadingCell}
			onRowClick={(row) =>
				navigate({
					to: "/books/$bookId",
					params: { bookId: String(row.bookId) },
				})
			}
		>
			{children}
		</BaseBookTable>
	);
}
