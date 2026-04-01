import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Plus } from "lucide-react";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import OptimizedImage from "src/components/shared/optimized-image";
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
import Skeleton from "src/components/ui/skeleton";
import { useImportHardcoverAuthor } from "src/hooks/mutations";
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
import {
	authorExistsQuery,
	downloadProfilesListQuery,
	hardcoverAuthorQuery,
} from "src/lib/queries";
import type {
	HardcoverAuthorDetail,
	HardcoverSearchItem,
} from "src/server/search";

const DEFAULT_PARAMS = {
	page: 1,
	pageSize: 1,
	language: "en",
	sortBy: "readers" as const,
	sortDir: "desc" as const,
};

// ── Add-to-bookshelf inline form ────────────────────────────────────────────────

type AddFormProps = {
	fullAuthor: HardcoverAuthorDetail;
	onSuccess: () => void;
	onCancel: () => void;
	addDefaults?: Record<string, unknown> | null;
};

function AddForm({
	fullAuthor,
	onSuccess,
	onCancel,
	addDefaults,
}: AddFormProps) {
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
	const [monitorOption, setMonitorOption] = useState(
		() => (addDefaults?.monitorOption as string | undefined) ?? "all",
	);
	const [monitorNewBooks, setMonitorNewBooks] = useState(
		() => (addDefaults?.monitorNewBooks as string | undefined) ?? "all",
	);
	const [searchOnAdd, setSearchOnAdd] = useState(
		() => (addDefaults?.searchOnAdd as boolean | undefined) ?? false,
	);
	const importAuthor = useImportHardcoverAuthor();
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
		importAuthor.mutate({
			foreignAuthorId: Number(fullAuthor.id),
			downloadProfileIds,
			monitorOption,
			monitorNewBooks,
			searchOnAdd,
		});
		onSuccess();
	};

	return (
		<div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
			<p className="text-sm font-medium">Add to Bookshelf</p>

			<div className="space-y-2">
				<Label>Monitor</Label>
				<Select value={monitorOption} onValueChange={setMonitorOption}>
					<SelectTrigger className="w-full">
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

			<div className="space-y-2">
				<Label>Monitor New Books</Label>
				<Select value={monitorNewBooks} onValueChange={setMonitorNewBooks}>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Books</SelectItem>
						<SelectItem value="new">New Books Only</SelectItem>
						<SelectItem value="none">None</SelectItem>
					</SelectContent>
				</Select>
			</div>

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
				<Label htmlFor="search-on-add">Start search for missing books</Label>
			</div>

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

// ── Bio section ───────────────────────────────────────────────────────────────

function BioSection({
	loading,
	bio,
}: {
	loading: boolean;
	bio: string | null;
}) {
	if (loading) {
		return (
			<div className="space-y-1.5">
				<Skeleton className="h-3.5 w-full" />
				<Skeleton className="h-3.5 w-full" />
				<Skeleton className="h-3.5 w-3/4" />
			</div>
		);
	}
	if (!bio) {
		return null;
	}
	return (
		<p className="text-sm text-muted-foreground leading-relaxed line-clamp-5">
			{bio}
		</p>
	);
}

// ── Main modal ────────────────────────────────────────────────────────────────

type AuthorPreviewModalProps = {
	author: HardcoverSearchItem;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	addDefaults?: Record<string, unknown> | null;
};

export default function AuthorPreviewModal({
	author,
	open,
	onOpenChange,
	addDefaults,
}: AuthorPreviewModalProps): JSX.Element {
	const authorId = author.id ? Number(author.id) : 0;

	const { data: fullAuthor, isLoading: authorLoading } = useQuery({
		...hardcoverAuthorQuery(authorId, DEFAULT_PARAMS),
		enabled: open && authorId > 0,
	});

	const { data: existingAuthor } = useQuery({
		...authorExistsQuery(fullAuthor?.id ?? author.id),
		enabled: open && Boolean(fullAuthor?.id ?? author.id),
	});

	const [addOpen, setAddOpen] = useState(false);

	const inLibrary = Boolean(existingAuthor);

	const lifespan =
		fullAuthor?.bornYear || fullAuthor?.deathYear
			? `${fullAuthor.bornYear ?? "?"}–${fullAuthor.deathYear ?? "Present"}`
			: null;

	const displayName = fullAuthor?.name ?? author.title;
	const displayImage = fullAuthor?.imageUrl ?? author.coverUrl ?? null;
	const displayBio = fullAuthor?.bio ?? author.description ?? null;
	const displayBooksCount = fullAuthor?.booksCount;
	const hardcoverUrl = fullAuthor?.hardcoverUrl ?? author.hardcoverUrl;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
				<DialogHeader>
					<DialogTitle className="sr-only">{displayName}</DialogTitle>
				</DialogHeader>

				<DialogBody>
					{/* ── Author identity ── */}
					<div className="flex gap-4">
						<div className="shrink-0">
							{authorLoading ? (
								<Skeleton className="h-20 w-20 rounded-full" />
							) : (
								<OptimizedImage
									src={displayImage}
									alt={`${displayName} photo`}
									type="author"
									width={80}
									height={80}
									className="h-20 w-20 rounded-full"
								/>
							)}
						</div>
						<div className="min-w-0 flex-1 space-y-1 pt-1">
							{authorLoading ? (
								<>
									<Skeleton className="h-5 w-40" />
									<Skeleton className="h-4 w-24" />
								</>
							) : (
								<>
									<h2 className="text-lg font-semibold leading-tight">
										{displayName}
									</h2>
									<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
										{lifespan && <span>{lifespan}</span>}
										{displayBooksCount !== null &&
											displayBooksCount !== undefined && (
												<span>
													{displayBooksCount}{" "}
													{displayBooksCount === 1 ? "book" : "books"}
												</span>
											)}
									</div>
								</>
							)}
						</div>
					</div>

					{/* ── Bio ── */}
					<BioSection loading={authorLoading} bio={displayBio} />

					{/* ── Actions ── */}
					{!inLibrary && !addOpen && (
						<div className="flex items-center gap-2 pt-1">
							<Button
								className="flex-1"
								onClick={() => setAddOpen(true)}
								disabled={authorLoading || !fullAuthor}
							>
								<Plus className="mr-2 h-4 w-4" />
								Add to Bookshelf
							</Button>
							{hardcoverUrl && (
								<Button variant="outline" size="icon" asChild>
									<a
										href={hardcoverUrl}
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
							<Button variant="secondary" className="flex-1" asChild>
								<Link
									to="/authors/$authorId"
									params={{ authorId: String(existingAuthor?.id ?? "") }}
									onClick={() => onOpenChange(false)}
								>
									View on bookshelf
								</Link>
							</Button>
							{hardcoverUrl && (
								<Button variant="outline" size="icon" asChild>
									<a
										href={hardcoverUrl}
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

					{addOpen && !inLibrary && fullAuthor && (
						<AddForm
							fullAuthor={fullAuthor}
							onSuccess={() => onOpenChange(false)}
							onCancel={() => setAddOpen(false)}
							addDefaults={addDefaults}
						/>
					)}
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
