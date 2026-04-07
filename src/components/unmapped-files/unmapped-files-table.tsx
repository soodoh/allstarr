import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Eye,
	EyeOff,
	FileQuestion,
	Link2,
	RefreshCw,
	Search,
	Trash2,
} from "lucide-react";
import type { JSX } from "react";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import EmptyState from "src/components/shared/empty-state";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import { Input } from "src/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import type { UnmappedFileHints } from "src/db/schema/unmapped-files";
import { unmappedFilesListQuery } from "src/lib/queries";
import { queryKeys } from "src/lib/query-keys";
import {
	deleteUnmappedFilesFn,
	ignoreUnmappedFilesFn,
	rescanRootFolderFn,
} from "src/server/unmapped-files";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const value = bytes / 1024 ** i;
	return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatHint(hints: UnmappedFileHints | null | undefined): string {
	if (!hints) return "";
	const parts: string[] = [];
	if (hints.title) {
		parts.push(`"${hints.title}"`);
	}
	if (hints.author) {
		parts.push(`by ${hints.author}`);
	}
	if (hints.year) {
		parts.push(`(${hints.year})`);
	}
	if (hints.season != null && hints.episode != null) {
		parts.push(
			`S${String(hints.season).padStart(2, "0")}E${String(hints.episode).padStart(2, "0")}`,
		);
	}
	return parts.join(" ");
}

function getFilename(filePath: string): string {
	return filePath.split(/[/\\]/).pop() ?? filePath;
}

type FormatColor = {
	bg: string;
	text: string;
};

function getFormatColor(format: string): FormatColor {
	const lower = format.toLowerCase();
	if (["epub", "pdf", "mobi", "azw3", "azw"].includes(lower)) {
		return { bg: "bg-blue-900/50", text: "text-blue-400" };
	}
	if (["mp3", "m4b", "flac"].includes(lower)) {
		return { bg: "bg-purple-900/50", text: "text-purple-400" };
	}
	if (["mkv", "mp4", "avi", "ts"].includes(lower)) {
		return { bg: "bg-orange-900/50", text: "text-orange-400" };
	}
	return { bg: "bg-zinc-800", text: "text-zinc-400" };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function UnmappedFilesTable(): JSX.Element {
	const queryClient = useQueryClient();

	// Filters
	const [search, setSearch] = useState("");
	const [contentType, setContentType] = useState("all");
	const [showIgnored, setShowIgnored] = useState(false);

	// Selection
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

	// Mapping placeholder state (dialog comes in Task 8)
	const [mappingFileIds, setMappingFileIds] = useState<number[] | null>(null);

	// Delete confirmation
	const [deleteConfirmIds, setDeleteConfirmIds] = useState<number[] | null>(
		null,
	);

	// Per-folder rescan loading
	const [rescanningFolders, setRescanningFolders] = useState<Set<string>>(
		new Set(),
	);

	const { data: groups = [] } = useQuery(
		unmappedFilesListQuery({
			showIgnored,
			contentType: contentType === "all" ? undefined : contentType,
			search: search || undefined,
		}),
	);

	const allFileIds = groups.flatMap((g) => g.files.map((f) => f.id));
	const allSelected =
		allFileIds.length > 0 && allFileIds.every((id) => selectedIds.has(id));

	// ─── Handlers ─────────────────────────────────────────────────────────

	const toggleFile = (id: number) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const toggleAll = () => {
		if (allSelected) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(allFileIds));
		}
	};

	const invalidateQueries = () => {
		queryClient.invalidateQueries({
			queryKey: queryKeys.unmappedFiles.all,
		});
	};

	const handleIgnore = async (ids: number[], ignored: boolean) => {
		try {
			await ignoreUnmappedFilesFn({ data: { ids, ignored } });
			invalidateQueries();
			setSelectedIds((prev) => {
				const next = new Set(prev);
				for (const id of ids) next.delete(id);
				return next;
			});
			toast.success(ignored ? "Files ignored" : "Files unignored");
		} catch {
			toast.error("Failed to update files");
		}
	};

	const handleDelete = async (ids: number[]) => {
		try {
			await deleteUnmappedFilesFn({ data: { ids } });
			invalidateQueries();
			setSelectedIds((prev) => {
				const next = new Set(prev);
				for (const id of ids) next.delete(id);
				return next;
			});
			setDeleteConfirmIds(null);
			toast.success(`${ids.length} file${ids.length > 1 ? "s" : ""} deleted`);
		} catch {
			toast.error("Failed to delete files");
		}
	};

	const handleRescanFolder = async (rootFolderPath: string) => {
		setRescanningFolders((prev) => new Set(prev).add(rootFolderPath));
		try {
			await rescanRootFolderFn({ data: { rootFolderPath } });
			invalidateQueries();
			toast.success("Rescan complete");
		} catch {
			toast.error("Rescan failed");
		} finally {
			setRescanningFolders((prev) => {
				const next = new Set(prev);
				next.delete(rootFolderPath);
				return next;
			});
		}
	};

	// ─── Empty state ──────────────────────────────────────────────────────

	if (groups.length === 0) {
		return (
			<div className="space-y-4">
				<Toolbar
					search={search}
					onSearchChange={setSearch}
					contentType={contentType}
					onContentTypeChange={setContentType}
					showIgnored={showIgnored}
					onShowIgnoredChange={setShowIgnored}
				/>
				<EmptyState
					icon={FileQuestion}
					title="No unmapped files"
					description="All files in your root folders are mapped to library entries, or no files have been scanned yet."
				/>
			</div>
		);
	}

	// ─── Render ───────────────────────────────────────────────────────────

	return (
		<div className="space-y-4">
			<Toolbar
				search={search}
				onSearchChange={setSearch}
				contentType={contentType}
				onContentTypeChange={setContentType}
				showIgnored={showIgnored}
				onShowIgnoredChange={setShowIgnored}
			/>

			{/* Select all */}
			<div className="flex items-center gap-2">
				<Checkbox checked={allSelected} onCheckedChange={toggleAll} />
				<span className="text-sm text-muted-foreground">
					{selectedIds.size > 0
						? `${selectedIds.size} selected`
						: `${allFileIds.length} files`}
				</span>
			</div>

			{/* Root folder groups */}
			{groups.map((group) => {
				const isRescanningFolder = rescanningFolders.has(group.rootFolderPath);
				return (
					<div
						key={group.rootFolderPath}
						className="rounded-lg border border-border"
					>
						{/* Group header */}
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border bg-muted/30 px-4 py-3">
							<div className="min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="font-mono text-sm font-medium truncate">
										{group.rootFolderPath}
									</span>
									{group.profileName && (
										<Badge variant="secondary">{group.profileName}</Badge>
									)}
								</div>
								<p className="text-xs text-muted-foreground mt-0.5">
									{group.files.length} file
									{group.files.length !== 1 ? "s" : ""}
								</p>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleRescanFolder(group.rootFolderPath)}
								disabled={isRescanningFolder}
							>
								<RefreshCw
									className={`mr-1 h-3.5 w-3.5 ${isRescanningFolder ? "animate-spin" : ""}`}
								/>
								Rescan
							</Button>
						</div>

						{/* File rows */}
						<div className="divide-y divide-border">
							{group.files.map((file) => {
								const color = getFormatColor(file.format);
								const hint = formatHint(file.hints as UnmappedFileHints | null);
								const isIgnored = file.ignored;

								return (
									<div
										key={file.id}
										className={`flex items-center gap-3 px-4 py-2.5 ${isIgnored ? "opacity-50" : ""}`}
									>
										<Checkbox
											checked={selectedIds.has(file.id)}
											onCheckedChange={() => toggleFile(file.id)}
										/>

										{/* Format badge */}
										<span
											className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono font-medium uppercase ${color.bg} ${color.text}`}
										>
											{file.format}
										</span>

										{/* File info */}
										<div className="min-w-0 flex-1">
											<p className="text-sm font-medium truncate">
												{getFilename(file.path)}
											</p>
											<p className="text-xs text-muted-foreground truncate">
												{file.path}
											</p>
											{hint && (
												<p className="text-xs text-muted-foreground/70 mt-0.5 italic">
													{hint}
												</p>
											)}
										</div>

										{/* Size */}
										<span className="text-xs text-muted-foreground whitespace-nowrap">
											{formatSize(file.size)}
										</span>

										{/* Actions */}
										<div className="flex items-center gap-1 shrink-0">
											<Button
												variant="ghost"
												size="icon-sm"
												title="Map to library entry"
												onClick={() => setMappingFileIds([file.id])}
											>
												<Link2 className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												title={isIgnored ? "Unignore" : "Ignore"}
												onClick={() => handleIgnore([file.id], !isIgnored)}
											>
												{isIgnored ? (
													<Eye className="h-4 w-4" />
												) : (
													<EyeOff className="h-4 w-4" />
												)}
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												title="Delete file"
												onClick={() => setDeleteConfirmIds([file.id])}
											>
												<Trash2 className="h-4 w-4 text-destructive" />
											</Button>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				);
			})}

			{/* Bulk action bar */}
			{selectedIds.size > 0 && (
				<div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-6 py-3">
					<div className="flex items-center justify-between max-w-screen-2xl mx-auto">
						<span className="text-sm font-medium">
							{selectedIds.size} file
							{selectedIds.size !== 1 ? "s" : ""} selected
						</span>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setMappingFileIds([...selectedIds])}
							>
								<Link2 className="mr-1 h-4 w-4" />
								Map Selected
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleIgnore([...selectedIds], true)}
							>
								<EyeOff className="mr-1 h-4 w-4" />
								Ignore Selected
							</Button>
							<Button
								variant="destructive"
								size="sm"
								onClick={() => setDeleteConfirmIds([...selectedIds])}
							>
								<Trash2 className="mr-1 h-4 w-4" />
								Delete Selected
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Mapping dialog placeholder (Task 8) */}
			{mappingFileIds && (
				<div className="hidden">
					{/* TODO: MappingDialog component (Task 8) */}
				</div>
			)}

			{/* Delete confirmation */}
			<ConfirmDialog
				open={deleteConfirmIds !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteConfirmIds(null);
				}}
				title="Delete files"
				description={`Permanently delete ${deleteConfirmIds?.length ?? 0} file${(deleteConfirmIds?.length ?? 0) !== 1 ? "s" : ""} from disk? This action cannot be undone.`}
				onConfirm={() => {
					if (deleteConfirmIds) handleDelete(deleteConfirmIds);
				}}
				variant="destructive"
			/>
		</div>
	);
}

// ─── Toolbar ────────────────────────────────────────────────────────────────

type ToolbarProps = {
	search: string;
	onSearchChange: (value: string) => void;
	contentType: string;
	onContentTypeChange: (value: string) => void;
	showIgnored: boolean;
	onShowIgnoredChange: (value: boolean) => void;
};

function Toolbar({
	search,
	onSearchChange,
	contentType,
	onContentTypeChange,
	showIgnored,
	onShowIgnoredChange,
}: ToolbarProps): JSX.Element {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
			<div className="relative flex-1 max-w-sm">
				<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					placeholder="Search files..."
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					className="pl-9"
				/>
			</div>

			<Select value={contentType} onValueChange={onContentTypeChange}>
				<SelectTrigger>
					<SelectValue placeholder="Content type" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Types</SelectItem>
					<SelectItem value="ebook">Ebooks</SelectItem>
					<SelectItem value="audiobook">Audiobooks</SelectItem>
					<SelectItem value="movie">Movies</SelectItem>
					<SelectItem value="tv">TV</SelectItem>
				</SelectContent>
			</Select>

			<Button
				variant={showIgnored ? "secondary" : "outline"}
				size="sm"
				onClick={() => onShowIgnoredChange(!showIgnored)}
			>
				{showIgnored ? (
					<Eye className="mr-1 h-4 w-4" />
				) : (
					<EyeOff className="mr-1 h-4 w-4" />
				)}
				{showIgnored ? "Showing Ignored" : "Show Ignored"}
			</Button>
		</div>
	);
}
