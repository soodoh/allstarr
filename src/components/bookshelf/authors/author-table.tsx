import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { useState } from "react";
import OptimizedImage from "src/components/shared/optimized-image";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "src/components/ui/table";
import { useTableColumns } from "src/hooks/use-table-columns";

type Author = {
	id: number;
	name: string;
	sortName: string;
	status: string;
	bookCount: number;
	totalReaders: number;
	images: Array<{ url: string; coverType: string }>;
};

type AuthorTableProps = {
	authors: Author[];
	children?: ReactNode;
};

type ColumnDef = {
	label: string;
	render: (author: Author) => ReactNode;
	sortKey?: keyof Author;
	cellClassName?: string;
};

const COLUMN_REGISTRY: Record<string, ColumnDef> = {
	name: {
		label: "Name",
		sortKey: "name",
		render: () => null, // Handled inline (Link component needs author context)
	},
	bookCount: {
		label: "Books",
		sortKey: "bookCount",
		render: (author) => author.bookCount,
	},
	totalReaders: {
		label: "Readers",
		sortKey: "totalReaders",
		render: (author) => author.totalReaders.toLocaleString(),
	},
};

export default function AuthorTable({
	authors,
	children,
}: AuthorTableProps): JSX.Element {
	const navigate = useNavigate();
	const { visibleColumns } = useTableColumns("authors");
	const [sortKey, setSortKey] = useState<keyof Author | undefined>(
		"totalReaders",
	);
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

	const handleSort = (key: keyof Author) => {
		if (sortKey === key) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("asc");
		}
	};

	const sorted = sortKey
		? [...authors].toSorted((a, b) => {
				const av = a[sortKey];
				const bv = b[sortKey];
				let cmp = 0;
				if (typeof av === "string" && typeof bv === "string") {
					cmp = av.localeCompare(bv);
				} else if (typeof av === "number" && typeof bv === "number") {
					cmp = av - bv;
				} else if (typeof av === "boolean" && typeof bv === "boolean") {
					cmp = Number(av) - Number(bv);
				}
				if (cmp === 0 && sortKey !== "totalReaders") {
					cmp = (b.totalReaders ?? 0) - (a.totalReaders ?? 0);
				}
				return sortDir === "asc" ? cmp : -cmp;
			})
		: authors;

	const SortIcon = ({ col }: { col: keyof Author }) => {
		if (sortKey !== col) {
			return (
				<ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />
			);
		}
		return sortDir === "asc" ? (
			<ChevronUp className="ml-1 h-3.5 w-3.5 inline" />
		) : (
			<ChevronDown className="ml-1 h-3.5 w-3.5 inline" />
		);
	};

	return (
		<div>
			<Table>
				<colgroup>
					{visibleColumns.map((col) => (
						<col
							key={col.key}
							className={col.key === "cover" ? "w-14" : undefined}
						/>
					))}
				</colgroup>
				<TableHeader>
					<TableRow>
						{visibleColumns.map((col) => {
							if (col.key === "cover") {
								return <TableHead key={col.key} />;
							}
							const def = COLUMN_REGISTRY[col.key];
							const colSortKey = def?.sortKey;
							if (colSortKey) {
								return (
									<TableHead
										key={col.key}
										className="cursor-pointer select-none hover:text-foreground"
										onClick={() => handleSort(colSortKey)}
									>
										{def.label}
										<SortIcon col={colSortKey} />
									</TableHead>
								);
							}
							return (
								<TableHead key={col.key}>{def?.label ?? col.label}</TableHead>
							);
						})}
					</TableRow>
				</TableHeader>
				<TableBody>
					{sorted.map((author) => {
						const authorImage = author.images?.[0]?.url;
						return (
							<TableRow
								key={author.id}
								className="cursor-pointer hover:bg-accent/50 transition-colors"
								onClick={() =>
									navigate({
										to: "/authors/$authorId",
										params: { authorId: String(author.id) },
									})
								}
							>
								{visibleColumns.map((col) => {
									if (col.key === "cover") {
										return (
											<TableCell key={col.key}>
												<OptimizedImage
													src={authorImage}
													alt={author.name}
													type="author"
													width={56}
													height={56}
													className="aspect-square w-full rounded-full"
												/>
											</TableCell>
										);
									}
									if (col.key === "name") {
										return (
											<TableCell key={col.key}>
												<Link
													to="/authors/$authorId"
													params={{ authorId: String(author.id) }}
													className="font-medium hover:underline"
													onClick={(e) => e.stopPropagation()}
												>
													{author.name}
												</Link>
											</TableCell>
										);
									}
									const def = COLUMN_REGISTRY[col.key];
									return (
										<TableCell key={col.key} className={def?.cellClassName}>
											{def?.render(author)}
										</TableCell>
									);
								})}
							</TableRow>
						);
					})}
					{children}
				</TableBody>
			</Table>
		</div>
	);
}
