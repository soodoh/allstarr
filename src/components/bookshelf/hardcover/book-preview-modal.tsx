import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Plus } from "lucide-react";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import BookDetailContent from "src/components/bookshelf/books/book-detail-content";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import Label from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import { useImportHardcoverBook } from "src/hooks/mutations";
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
import {
	authorExistsQuery,
	booksExistQuery,
	downloadProfilesListQuery,
	hardcoverBookLanguagesQuery,
	hardcoverSingleBookQuery,
} from "src/lib/queries";
import type {
	BookLanguage,
	HardcoverBookDetail,
	HardcoverSearchItem,
} from "src/server/search";

// ── Add-to-bookshelf inline form ──────────────────────────────────────────────

type MonitorOption =
	| "all"
	| "future"
	| "missing"
	| "existing"
	| "first"
	| "latest"
	| "none";

type MonitorNewBooks = "all" | "none" | "new";

type AddBookFormProps = {
	book: HardcoverSearchItem;
	bookDetail: HardcoverBookDetail | undefined;
	authorExists: boolean;
	onSuccess: () => void;
	onCancel: () => void;
	addDefaults?: Record<string, unknown> | null;
};

function AddBookForm({
	book,
	bookDetail,
	authorExists,
	onSuccess,
	onCancel,
	addDefaults,
}: AddBookFormProps) {
	const { data: allProfiles = [] } = useQuery(downloadProfilesListQuery());
	const downloadProfiles = useMemo(
		() =>
			allProfiles.filter(
				(p) => p.contentType === "ebook" || p.contentType === "audiobook",
			),
		[allProfiles],
	);

	const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>(
		() => (addDefaults?.downloadProfileIds as number[] | undefined) ?? [],
	);
	const [monitorOption, setMonitorOption] = useState<MonitorOption>(
		() => (addDefaults?.monitorOption as MonitorOption | undefined) ?? "all",
	);
	const [monitorNewBooks, setMonitorNewBooks] = useState<MonitorNewBooks>(
		() =>
			(addDefaults?.monitorNewBooks as MonitorNewBooks | undefined) ?? "all",
	);
	const [searchOnAdd, setSearchOnAdd] = useState(
		() => (addDefaults?.searchOnAdd as boolean | undefined) ?? false,
	);
	const [monitorSeries, setMonitorSeries] = useState(false);

	const importBook = useImportHardcoverBook();
	const upsertSettings = useUpsertUserSettings();

	const toggleProfile = (id: number) => {
		setDownloadProfileIds((prev) =>
			prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
		);
	};

	const handleSubmit = () => {
		upsertSettings.mutate({
			tableId: "books",
			addDefaults: {
				downloadProfileIds,
				monitorOption,
				monitorNewBooks,
				searchOnAdd,
			},
		});
		importBook.mutate({
			foreignBookId: Number(book.id),
			downloadProfileIds,
			monitorOption,
			monitorNewBooks,
			searchOnAdd,
			monitorSeries,
		});
		onSuccess();
	};

	return (
		<div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
			<p className="text-sm font-medium">
				{authorExists ? "Monitor Book" : "Add Author & Monitor Book"}
			</p>
			{!authorExists && (
				<p className="text-xs text-muted-foreground">
					The author and all their books will be added to your bookshelf. This
					book will be monitored.
				</p>
			)}

			{!authorExists && (
				<div className="space-y-1">
					<Label className="text-xs text-muted-foreground">Monitor</Label>
					<Select
						value={monitorOption}
						onValueChange={(v) => setMonitorOption(v as MonitorOption)}
					>
						<SelectTrigger className="h-8 w-48 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Books</SelectItem>
							<SelectItem value="future">Future Books</SelectItem>
							<SelectItem value="missing">Missing Books</SelectItem>
							<SelectItem value="existing">Existing Books</SelectItem>
							<SelectItem value="first">First Book</SelectItem>
							<SelectItem value="latest">Latest Book</SelectItem>
							<SelectItem value="none">None</SelectItem>
						</SelectContent>
					</Select>
				</div>
			)}

			{!authorExists && (
				<div className="space-y-1">
					<Label className="text-xs text-muted-foreground">
						Monitor New Books
					</Label>
					<Select
						value={monitorNewBooks}
						onValueChange={(v) => setMonitorNewBooks(v as MonitorNewBooks)}
					>
						<SelectTrigger className="h-8 w-48 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Books</SelectItem>
							<SelectItem value="new">New Books Only</SelectItem>
							<SelectItem value="none">None</SelectItem>
						</SelectContent>
					</Select>
				</div>
			)}

			<ProfileCheckboxGroup
				profiles={downloadProfiles}
				selectedIds={downloadProfileIds}
				onToggle={toggleProfile}
			/>

			<div className="flex items-center gap-2">
				<Checkbox
					id="search-on-add"
					checked={searchOnAdd}
					onCheckedChange={(checked) => setSearchOnAdd(Boolean(checked))}
				/>
				<Label htmlFor="search-on-add" className="text-sm cursor-pointer">
					Start search for new book
				</Label>
			</div>

			{bookDetail?.series && bookDetail.series.length > 0 && (
				<div className="flex items-center gap-2">
					<Checkbox
						id="monitor-series"
						checked={monitorSeries}
						onCheckedChange={(checked) => setMonitorSeries(Boolean(checked))}
					/>
					<Label htmlFor="monitor-series" className="text-sm cursor-pointer">
						Monitor series ({bookDetail.series.map((s) => s.title).join(", ")})
					</Label>
				</div>
			)}

			<div className="flex gap-2">
				<Button variant="outline" className="flex-1" onClick={onCancel}>
					Cancel
				</Button>
				<Button className="flex-1" onClick={handleSubmit}>
					Confirm
				</Button>
			</div>
		</div>
	);
}

function getHardcoverOverrides(
	book: HardcoverSearchItem,
	hcBook: HardcoverBookDetail | undefined,
) {
	return {
		coverUrl: hcBook?.coverUrl ?? book.coverUrl ?? null,
		releaseDate:
			hcBook?.releaseDate ??
			(book.releaseYear ? String(book.releaseYear) : null),
		series:
			hcBook?.series.map((s) => ({
				title: s.title,
				position: s.position ?? null,
			})) ?? null,
		rating: hcBook?.rating ?? null,
		ratingVotes: hcBook?.ratingsCount ?? null,
		readers: hcBook?.usersCount ?? book.readers ?? null,
		overview: hcBook?.description ?? book.description ?? null,
		hardcoverUrl: book.hardcoverUrl ?? null,
	};
}

function buildBookDetailData(
	book: HardcoverSearchItem,
	hcBook: HardcoverBookDetail | undefined,
	languages: BookLanguage[] | undefined,
	primaryAuthor: string | null,
	bookAuthors: Array<{
		authorId: null;
		foreignAuthorId: string;
		authorName: string;
		isPrimary: boolean;
	}>,
) {
	return {
		title: book.title,
		images: [] as Array<{ url: string; coverType: string }>,
		author: null as { id: number; name: string } | null,
		authorName: primaryAuthor,
		bookAuthors,
		availableLanguages: languages ?? null,
		...getHardcoverOverrides(book, hcBook),
	};
}

// ── Main modal ──────────────────────────────────────────────────────────────

type BookPreviewModalProps = {
	book: HardcoverSearchItem;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	addDefaults?: Record<string, unknown> | null;
};

export default function BookPreviewModal({
	book,
	open,
	onOpenChange,
	addDefaults,
}: BookPreviewModalProps): JSX.Element {
	const foreignBookIds = book.id ? [book.id] : [];

	// ── Check if book already on bookshelf ──
	const { data: existingBooks = [] } = useQuery({
		...booksExistQuery(foreignBookIds),
		enabled: open && foreignBookIds.length > 0,
	});
	const localBook = existingBooks.length > 0 ? existingBooks[0] : undefined;

	const navigate = useNavigate();

	const [addOpen, setAddOpen] = useState(false);

	const inLibrary = Boolean(localBook);

	// ── Fetch book detail + languages from Hardcover ──
	const foreignBookId = book.id ? Number(book.id) : 0;

	const { data: hcBook } = useQuery({
		...hardcoverSingleBookQuery(foreignBookId),
		enabled: open && foreignBookId > 0,
	});

	const { data: languages } = useQuery({
		...hardcoverBookLanguagesQuery(foreignBookId),
		enabled: open && foreignBookId > 0,
	});

	// ── Build rich book detail from Hardcover data ──
	const { primaryAuthor, bookAuthors, primaryAuthorForeignId } = useMemo(() => {
		const contributors = hcBook?.contributors ?? [];
		return {
			primaryAuthor:
				contributors.length > 0
					? contributors[0].name
					: (book.subtitle ?? null),
			primaryAuthorForeignId:
				contributors.length > 0 ? String(contributors[0].id) : null,
			bookAuthors: contributors.map((c, i) => ({
				authorId: null,
				foreignAuthorId: String(c.id),
				authorName: c.name,
				isPrimary: i === 0,
			})),
		};
	}, [hcBook?.contributors, book.subtitle]);

	// ── Check if the book's primary author already exists in library ──
	const { data: existingPrimaryAuthor } = useQuery({
		...authorExistsQuery(primaryAuthorForeignId ?? ""),
		enabled: open && Boolean(primaryAuthorForeignId),
	});
	const authorExists = Boolean(existingPrimaryAuthor);

	const bookDetailData = useMemo(
		() =>
			buildBookDetailData(book, hcBook, languages, primaryAuthor, bookAuthors),
		[book, hcBook, languages, primaryAuthor, bookAuthors],
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl" onClick={(e) => e.stopPropagation()}>
				<DialogHeader>
					<DialogTitle className="sr-only">{book.title}</DialogTitle>
				</DialogHeader>

				<DialogBody>
					<BookDetailContent book={bookDetailData}>
						{/* ── Actions ── */}
						{!inLibrary && !addOpen && (
							<div className="flex items-center gap-2 pt-1">
								<Button className="flex-1" onClick={() => setAddOpen(true)}>
									<Plus className="mr-2 h-4 w-4" />
									Add Author & Monitor Book
								</Button>
								{book.hardcoverUrl && (
									<Button variant="outline" size="icon" asChild>
										<a
											href={book.hardcoverUrl}
											target="_blank"
											rel="noreferrer"
											aria-label="Open on Hardcover"
										>
											<ExternalLink className="h-4 w-4" />
										</a>
									</Button>
								)}
							</div>
						)}

						{inLibrary && (
							<div className="flex items-center gap-2 pt-1">
								<Button
									variant="secondary"
									className="flex-1"
									onClick={() => {
										onOpenChange(false);
										if (localBook) {
											navigate({
												to: "/books/$bookId",
												params: { bookId: String(localBook.id) },
											});
										}
									}}
								>
									View on Bookshelf
								</Button>
								{book.hardcoverUrl && (
									<Button variant="outline" size="icon" asChild>
										<a
											href={book.hardcoverUrl}
											target="_blank"
											rel="noreferrer"
											aria-label="Open on Hardcover"
										>
											<ExternalLink className="h-4 w-4" />
										</a>
									</Button>
								)}
							</div>
						)}

						{addOpen && !inLibrary && (
							<AddBookForm
								book={book}
								bookDetail={hcBook}
								authorExists={authorExists}
								onSuccess={() => onOpenChange(false)}
								onCancel={() => setAddOpen(false)}
								addDefaults={addDefaults}
							/>
						)}
					</BookDetailContent>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
