import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import ActionButtonGroup from "src/components/shared/action-button-group";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import OptimizedImage from "src/components/shared/optimized-image";
import PageHeader from "src/components/shared/page-header";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import {
	useDeleteManga,
	useRefreshMangaMetadata,
	useUpdateManga,
} from "src/hooks/mutations/manga";

type Chapter = {
	id: number;
	chapterNumber: string;
	hasFile: boolean | null;
	monitored: boolean | null;
};

type Volume = {
	id: number;
	volumeNumber: number | null;
	chapters: Chapter[];
};

type MangaDetail = {
	id: number;
	title: string;
	overview: string;
	sourceId: string;
	sourceMangaUrl: string;
	type: string;
	year: string | null;
	status: string;
	latestChapter: number | null;
	posterUrl: string;
	genres: string[] | null;
	monitorNewChapters: string;
	path: string;
	volumes: Volume[];
};

type MangaDetailHeaderProps = {
	manga: MangaDetail;
};

const STATUS_COLORS: Record<string, string> = {
	ongoing: "bg-green-600",
	complete: "bg-blue-600",
	hiatus: "bg-yellow-600",
	cancelled: "bg-red-600",
};

const TYPE_LABELS: Record<string, string> = {
	manga: "Manga",
	manhwa: "Manhwa",
	manhua: "Manhua",
};

function statusLabel(status: string): string {
	return status.charAt(0).toUpperCase() + status.slice(1);
}

function getDescription(year: string | null, type: string): string | undefined {
	const typeLabel = type === "manga" ? "" : (TYPE_LABELS[type] ?? type);
	if (year && typeLabel) {
		return `${year} - ${typeLabel}`;
	}
	if (year) {
		return year;
	}
	if (typeLabel) {
		return typeLabel;
	}
	return undefined;
}

type EditMangaDialogProps = {
	manga: MangaDetail;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function EditMangaDialog({
	manga,
	open,
	onOpenChange,
}: EditMangaDialogProps): JSX.Element {
	const router = useRouter();
	const updateManga = useUpdateManga();
	const [monitorNewChapters, setMonitorNewChapters] = useState(
		manga.monitorNewChapters ?? "all",
	);
	const [path, setPath] = useState(manga.path ?? "");

	// Reset state when dialog opens
	useEffect(() => {
		if (open) {
			setMonitorNewChapters(manga.monitorNewChapters ?? "all");
			setPath(manga.path ?? "");
		}
	}, [open, manga.path, manga.monitorNewChapters]);

	const handleSave = () => {
		updateManga.mutate(
			{
				id: manga.id,
				monitorNewChapters: monitorNewChapters as
					| "all"
					| "future"
					| "missing"
					| "none",
				path: path || undefined,
			},
			{
				onSuccess: () => {
					onOpenChange(false);
					router.invalidate();
				},
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Edit Manga</DialogTitle>
				</DialogHeader>

				<DialogBody>
					{/* Monitor New Chapters */}
					<div className="space-y-2">
						<Label>Monitor New Chapters</Label>
						<Select
							value={monitorNewChapters}
							onValueChange={setMonitorNewChapters}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Chapters</SelectItem>
								<SelectItem value="future">Future Chapters Only</SelectItem>
								<SelectItem value="missing">Missing Chapters Only</SelectItem>
								<SelectItem value="none">None</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Path */}
					<div className="space-y-2">
						<Label>Path</Label>
						<Input
							value={path}
							onChange={(e) => setPath(e.target.value)}
							placeholder="/path/to/manga"
						/>
					</div>
				</DialogBody>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={updateManga.isPending}>
						{updateManga.isPending ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default function MangaDetailHeader({
	manga,
}: MangaDetailHeaderProps): JSX.Element {
	const navigate = useNavigate();
	const router = useRouter();
	const deleteManga = useDeleteManga();
	const refreshMetadata = useRefreshMangaMetadata();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);

	const handleRefreshMetadata = () => {
		refreshMetadata.mutate(manga.id, {
			onSuccess: () => router.invalidate(),
		});
	};

	// Compute chapter counts across all volumes
	const allChapters = manga.volumes.flatMap((v) => v.chapters);
	const chapterCount = allChapters.length;
	const chapterFileCount = allChapters.filter((ch) => ch.hasFile).length;

	const handleDelete = () => {
		deleteManga.mutate(
			{ id: manga.id, deleteFiles: true },
			{
				onSuccess: () => {
					setDeleteOpen(false);
					navigate({ to: "/manga" });
				},
			},
		);
	};

	return (
		<>
			{/* Back link + action buttons */}
			<div className="flex items-center justify-between">
				<Link
					to="/manga"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to Manga
				</Link>
				<ActionButtonGroup
					onRefreshMetadata={handleRefreshMetadata}
					isRefreshing={refreshMetadata.isPending}
					onEdit={() => setEditOpen(true)}
					onDelete={() => setDeleteOpen(true)}
				/>
			</div>

			{/* Page header */}
			<div className="flex items-start gap-3">
				<div className="flex-1 min-w-0">
					<PageHeader
						title={manga.title}
						description={getDescription(manga.year, manga.type)}
					/>
				</div>
			</div>

			{/* Three-column layout */}
			<div className="flex flex-col gap-6 xl:flex-row">
				{/* Left: Poster */}
				<OptimizedImage
					src={manga.posterUrl || null}
					alt={`${manga.title} poster`}
					type="manga"
					width={224}
					height={336}
					priority
					className="aspect-[2/3] w-full max-w-56 xl:w-44 shrink-0"
				/>

				{/* Center: Details */}
				<Card className="w-full xl:w-72 xl:shrink-0">
					<CardHeader>
						<CardTitle>Details</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="space-y-3 text-sm">
							{manga.year && (
								<div className="flex justify-between gap-4">
									<dt className="text-muted-foreground">Year</dt>
									<dd>{manga.year}</dd>
								</div>
							)}
							<div className="flex justify-between gap-4">
								<dt className="text-muted-foreground">Type</dt>
								<dd>
									<Badge variant="outline" className="text-xs">
										{TYPE_LABELS[manga.type] ?? manga.type}
									</Badge>
								</dd>
							</div>
							<div className="flex justify-between gap-4">
								<dt className="text-muted-foreground">Status</dt>
								<dd>
									<Badge
										className={`text-xs ${STATUS_COLORS[manga.status] ?? "bg-zinc-600"}`}
									>
										{statusLabel(manga.status)}
									</Badge>
								</dd>
							</div>
							<div className="flex justify-between gap-4">
								<dt className="text-muted-foreground">Source</dt>
								<dd>
									<Badge variant="outline" className="text-xs">
										{manga.sourceId}
									</Badge>
								</dd>
							</div>
							{manga.genres && manga.genres.length > 0 && (
								<div className="flex justify-between gap-4">
									<dt className="text-muted-foreground">Genres</dt>
									<dd className="text-right">{manga.genres.join(", ")}</dd>
								</div>
							)}
							{manga.latestChapter !== null && (
								<div className="flex justify-between gap-4">
									<dt className="text-muted-foreground">Latest Chapter</dt>
									<dd>{manga.latestChapter}</dd>
								</div>
							)}
							<div className="flex justify-between gap-4">
								<dt className="text-muted-foreground">Chapters</dt>
								<dd>
									{chapterFileCount}/{chapterCount} chapters
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>

				{/* Right: Description */}
				<Card className="w-full xl:flex-1">
					<CardHeader>
						<CardTitle>Description</CardTitle>
					</CardHeader>
					<CardContent>
						{manga.overview ? (
							<div className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none">
								<Markdown>{manga.overview}</Markdown>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								No description available.
							</p>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Edit dialog */}
			<EditMangaDialog
				manga={manga}
				open={editOpen}
				onOpenChange={setEditOpen}
			/>

			{/* Delete confirmation dialog */}
			<ConfirmDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title="Delete Manga"
				description={`Are you sure you want to delete "${manga.title}"? This will also remove any downloaded files.`}
				onConfirm={handleDelete}
				loading={deleteManga.isPending}
				variant="destructive"
			/>
		</>
	);
}
