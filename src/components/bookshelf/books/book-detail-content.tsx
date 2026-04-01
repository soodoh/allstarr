import { ChevronDown } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { useMemo } from "react";
import type { BookAuthorEntry } from "src/components/bookshelf/books/additional-authors";
import AdditionalAuthors from "src/components/bookshelf/books/additional-authors";
import OptimizedImage from "src/components/shared/optimized-image";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "src/components/ui/popover";
import { getCoverUrl } from "src/lib/utils";

type AuthorLink = {
	id: number;
	name: string;
};

export type BookLanguageEntry = {
	name: string;
	code: string;
};

export type BookDetailData = {
	title: string;
	coverUrl: string | null;
	images: Array<{ url: string; coverType: string }>;
	author: AuthorLink | null;
	authorName: string | null;
	bookAuthors: BookAuthorEntry[];
	releaseDate: string | null;
	availableLanguages: BookLanguageEntry[] | null;
	series: Array<{ title: string; position: string | null }> | null;
	rating: number | null;
	ratingVotes: number | null;
	readers: number | null;
	overview: string | null;
	hardcoverUrl: string | null;
};

type BookDetailContentProps = {
	book: BookDetailData;
	children?: ReactNode;
};

export default function BookDetailContent({
	book,
	children,
}: BookDetailContentProps): JSX.Element {
	const coverImages = useMemo(() => {
		if (book.images.length > 0) {
			return book.images;
		}
		if (book.coverUrl) {
			return [{ url: book.coverUrl, coverType: "cover" }];
		}
		return [];
	}, [book.images, book.coverUrl]);

	const displayAuthor = book.author?.name ?? book.authorName;

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-[auto_1fr] gap-6">
				<OptimizedImage
					src={getCoverUrl(coverImages)}
					alt={`${book.title} cover`}
					type="book"
					width={160}
					height={240}
					className="aspect-[2/3] w-40"
				/>
				<div className="flex flex-col justify-end space-y-3 text-sm min-w-0">
					{(displayAuthor || book.bookAuthors.length > 0) && (
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground shrink-0">Author: </span>
							<span>
								<AdditionalAuthors bookAuthors={book.bookAuthors} />
							</span>
						</div>
					)}
					{book.releaseDate && (
						<div>
							<span className="text-muted-foreground">Release Date: </span>
							{book.releaseDate}
						</div>
					)}
					{book.series && book.series.length > 0 && (
						<div>
							<span className="text-muted-foreground">Series: </span>
							{book.series
								.map((s) =>
									s.position ? `${s.title} #${s.position}` : s.title,
								)
								.join(", ")}
						</div>
					)}
					{book.rating !== null && (
						<div>
							<span className="text-muted-foreground">Rating: </span>
							{book.rating.toFixed(1)}/5
							{book.ratingVotes !== null && book.ratingVotes > 0 && (
								<span className="text-muted-foreground ml-1">
									({book.ratingVotes.toLocaleString()}{" "}
									{book.ratingVotes === 1 ? "vote" : "votes"})
								</span>
							)}
						</div>
					)}
					{book.readers !== null && book.readers > 0 && (
						<div>
							<span className="text-muted-foreground">Readers: </span>
							{book.readers.toLocaleString()}
						</div>
					)}
					{book.availableLanguages && book.availableLanguages.length > 0 && (
						<div>
							<span className="text-muted-foreground">Languages: </span>
							<Popover>
								<PopoverTrigger className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
									{book.availableLanguages.length === 1
										? book.availableLanguages[0].name
										: `${book.availableLanguages[0].name} and ${book.availableLanguages.length - 1} other${book.availableLanguages.length - 1 === 1 ? "" : "s"}`}
									{book.availableLanguages.length > 1 && (
										<ChevronDown className="h-3 w-3" />
									)}
								</PopoverTrigger>
								{book.availableLanguages.length > 1 && (
									<PopoverContent align="start" className="w-48 p-0">
										<ul className="max-h-64 overflow-y-auto py-1">
											{book.availableLanguages.map((l) => (
												<li key={l.code} className="px-3 py-1.5 text-sm">
													{l.name}
												</li>
											))}
										</ul>
									</PopoverContent>
								)}
							</Popover>
						</div>
					)}
					{book.hardcoverUrl && (
						<div>
							<a
								href={book.hardcoverUrl}
								target="_blank"
								rel="noreferrer"
								className="text-muted-foreground hover:text-foreground hover:underline"
							>
								View on Hardcover
							</a>
						</div>
					)}
				</div>
			</div>
			{book.overview && (
				<div className="text-sm">
					<h4 className="text-muted-foreground font-medium mb-1">
						Description
					</h4>
					<p className="leading-relaxed">{book.overview}</p>
				</div>
			)}
			{children}
		</div>
	);
}
