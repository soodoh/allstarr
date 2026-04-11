import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
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
import type { UnmappedFileHints } from "src/db/schema/unmapped-files";
import { useDebounce } from "src/hooks/use-debounce";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";
import { queryKeys } from "src/lib/query-keys";
import { mapUnmappedFileFn, searchLibraryFn } from "src/server/unmapped-files";

// ─── Types ──────────────────────────────────────────────────────────────────

type MappingDialogProps = {
	fileIds: number[];
	contentType: string;
	hints: UnmappedFileHints | null;
	onClose: () => void;
};

type LibraryResult = {
	id: number;
	title: string;
	subtitle: string;
	entityType: "book" | "movie" | "episode";
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function MappingDialog({
	fileIds,
	contentType,
	hints,
	onClose,
}: MappingDialogProps): JSX.Element {
	const queryClient = useQueryClient();

	// Build initial search from hints
	const initialSearch = useMemo(() => {
		if (!hints) return "";
		const parts: string[] = [];
		if (hints.title) parts.push(hints.title);
		if (hints.author) parts.push(hints.author);
		return parts.join(" ");
	}, [hints]);

	const [search, setSearch] = useState(initialSearch);
	const [selectedProfileId, setSelectedProfileId] = useState<string>("");
	const [mapping, setMapping] = useState(false);

	const debouncedSearch = useDebounce(search, 300);

	// ─── Profiles ───────────────────────────────────────────────────────────

	const { data: allProfiles = [] } = useQuery(downloadProfilesListQuery());

	const filteredProfiles = useMemo(() => {
		return allProfiles.filter((p) => p.contentType === contentType);
	}, [allProfiles, contentType]);

	// Auto-select the first matching profile
	const effectiveProfileId = useMemo(() => {
		if (selectedProfileId) return selectedProfileId;
		if (filteredProfiles.length > 0) return String(filteredProfiles[0].id);
		return "";
	}, [selectedProfileId, filteredProfiles]);

	// ─── Library search ─────────────────────────────────────────────────────

	const { data: searchResults, isLoading: isSearching } = useQuery({
		queryKey: ["unmappedFiles", "search", debouncedSearch, contentType],
		queryFn: () =>
			searchLibraryFn({ data: { query: debouncedSearch, contentType } }),
		enabled: debouncedSearch.length >= 2,
	});

	// ─── Map handler ────────────────────────────────────────────────────────

	const handleMap = async (result: LibraryResult) => {
		const profileId = Number(effectiveProfileId);
		if (!profileId) {
			toast.error("Please select a download profile first");
			return;
		}

		setMapping(true);
		try {
			await mapUnmappedFileFn({
				data: {
					unmappedFileIds: fileIds,
					entityType: result.entityType,
					entityId: result.id,
					downloadProfileId: profileId,
				},
			});

			queryClient.invalidateQueries({
				queryKey: queryKeys.unmappedFiles.all,
			});

			toast.success(
				`${fileIds.length} file${fileIds.length !== 1 ? "s" : ""} mapped to "${result.title}"`,
			);
			onClose();
		} catch {
			toast.error("Failed to map files");
		} finally {
			setMapping(false);
		}
	};

	// ─── Render ─────────────────────────────────────────────────────────────

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle>
						Map {fileIds.length} file{fileIds.length !== 1 ? "s" : ""}
					</DialogTitle>
				</DialogHeader>

				<DialogBody className="space-y-4">
					{/* Profile selector */}
					<div className="space-y-1.5">
						<Label>Download Profile</Label>
						{filteredProfiles.length > 0 ? (
							<Select
								value={effectiveProfileId}
								onValueChange={setSelectedProfileId}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a profile" />
								</SelectTrigger>
								<SelectContent>
									{filteredProfiles.map((p) => (
										<SelectItem key={p.id} value={String(p.id)}>
											{p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<p className="text-sm text-muted-foreground">
								No {contentType} profiles available. Create one in Settings &gt;
								Profiles.
							</p>
						)}
					</div>

					{/* Search */}
					<div className="space-y-1.5">
						<Label htmlFor="unmapped-file-library-search">Search Library</Label>
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								id="unmapped-file-library-search"
								placeholder="Search by title..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className="pl-9"
							/>
						</div>
					</div>

					{/* Results */}
					<div className="min-h-[200px] max-h-[320px] overflow-y-auto rounded-md border border-border">
						{debouncedSearch.length < 2 ? (
							<div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
								Type at least 2 characters to search
							</div>
						) : isSearching ? (
							<div className="flex items-center justify-center h-[200px]">
								<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
							</div>
						) : searchResults?.library.length === 0 ? (
							<div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
								No results found in your library
							</div>
						) : (
							<div className="divide-y divide-border">
								{searchResults?.library.map((result) => (
									<div
										key={`${result.entityType}-${result.id}`}
										className="flex items-center justify-between gap-3 px-3 py-2.5"
									>
										<div className="min-w-0 flex-1">
											<p className="text-sm font-medium truncate">
												{result.title}
											</p>
											{result.subtitle && (
												<p className="text-xs text-muted-foreground truncate">
													{result.subtitle}
												</p>
											)}
										</div>
										<Button
											variant="outline"
											size="sm"
											disabled={mapping || !effectiveProfileId}
											onClick={() => handleMap(result)}
										>
											{mapping ? (
												<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
											) : null}
											Map Here
										</Button>
									</div>
								))}
							</div>
						)}
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
