import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { RotateCcw, X } from "lucide-react";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "src/components/ui/table";
import {
	useAddCategoryToProfile,
	useRemoveProfileCFs,
	useSetProfileCFScore,
} from "src/hooks/mutations/custom-formats";
import {
	customFormatsListQuery,
	profileCustomFormatsQuery,
} from "src/lib/queries/custom-formats";
import { cn } from "src/lib/utils";
import { customFormatCategories } from "src/lib/validators";
import PresetSelector from "./preset-selector";

type CFScoreSectionProps = {
	profileId?: number;
	contentType: string;
	minCustomFormatScore: number;
	upgradeUntilCustomFormatScore: number;
	onMinScoreChange: (score: number) => void;
	onUpgradeUntilScoreChange: (score: number) => void;
	localScores?: Array<{ customFormatId: number; score: number }>;
	onLocalScoresChange?: (
		scores: Array<{ customFormatId: number; score: number }>,
	) => void;
};

type CFRow = {
	customFormatId: number;
	name: string;
	category: string;
	defaultScore: number;
	score: number;
};

function CFSearchDropdown({
	allCFs,
	assignedIds,
	onAdd,
}: {
	allCFs: Array<{
		id: number;
		name: string;
		category: string;
		defaultScore: number;
	}>;
	assignedIds: Set<number>;
	onAdd: (cf: {
		id: number;
		name: string;
		category: string;
		defaultScore: number;
	}) => void;
}): JSX.Element {
	const [search, setSearch] = useState("");
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [highlightIndex, setHighlightIndex] = useState(0);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const dropdownContainerRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const availableItems = useMemo(() => {
		return allCFs.filter((cf) => {
			if (assignedIds.has(cf.id)) {
				return false;
			}
			if (!search) {
				return true;
			}
			return cf.name.toLowerCase().includes(search.toLowerCase());
		});
	}, [allCFs, assignedIds, search]);

	useEffect(() => {
		setHighlightIndex(0);
	}, []);

	useEffect(() => {
		if (!dropdownOpen || !listRef.current) {
			return;
		}
		const els = listRef.current.querySelectorAll("[data-item]");
		const target = els[highlightIndex];
		if (target) {
			target.scrollIntoView({ block: "nearest" });
		}
	}, [highlightIndex, dropdownOpen]);

	useEffect(() => {
		const handleClick = (e: MouseEvent) => {
			if (
				dropdownContainerRef.current &&
				!dropdownContainerRef.current.contains(e.target as Node)
			) {
				setDropdownOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, []);

	const addItem = (cf: {
		id: number;
		name: string;
		category: string;
		defaultScore: number;
	}) => {
		onAdd(cf);
		setSearch("");
		setHighlightIndex(0);
		searchInputRef.current?.focus();
	};

	const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setHighlightIndex((i) => Math.min(i + 1, availableItems.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setHighlightIndex((i) => Math.max(i - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (availableItems[highlightIndex]) {
				addItem(availableItems[highlightIndex]);
			}
		} else if (e.key === "Escape") {
			setDropdownOpen(false);
			searchInputRef.current?.blur();
		}
	};

	const allAdded = allCFs.length > 0 && allCFs.length === assignedIds.size;

	return (
		<div ref={dropdownContainerRef} className="relative">
			<input
				ref={searchInputRef}
				value={search}
				onChange={(e) => {
					setSearch(e.target.value);
					if (!dropdownOpen) {
						setDropdownOpen(true);
					}
				}}
				onFocus={() => setDropdownOpen(true)}
				onKeyDown={handleSearchKeyDown}
				placeholder={allAdded ? "All formats added" : "Add a custom format..."}
				disabled={allAdded}
				className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
			/>

			{dropdownOpen && availableItems.length > 0 && (
				<div
					ref={listRef}
					className="absolute z-50 mt-1 max-h-[200px] w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
				>
					{availableItems.map((cf, i) => (
						<button
							key={cf.id}
							type="button"
							data-item
							className={cn(
								"flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm cursor-default",
								i === highlightIndex
									? "bg-accent text-accent-foreground"
									: "hover:bg-accent/50",
							)}
							onMouseEnter={() => setHighlightIndex(i)}
							onMouseDown={(e) => {
								e.preventDefault();
								addItem(cf);
							}}
						>
							<span>{cf.name}</span>
							<span className="text-xs text-muted-foreground ml-2">
								{cf.category}
							</span>
						</button>
					))}
				</div>
			)}

			{dropdownOpen && search && availableItems.length === 0 && (
				<div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-center text-sm text-muted-foreground shadow-md">
					No custom formats found.
				</div>
			)}
		</div>
	);
}

function CategoryDropdown({
	categories,
	onSelect,
}: {
	categories: ReadonlyArray<string>;
	onSelect: (category: string) => void;
}): JSX.Element {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClick = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, []);

	return (
		<div ref={containerRef} className="relative">
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setOpen((prev) => !prev)}
			>
				Add Category
			</Button>
			{open && (
				<div className="absolute z-50 mt-1 max-h-[200px] w-[200px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
					{categories.map((cat) => (
						<button
							key={cat}
							type="button"
							className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm cursor-default hover:bg-accent/50"
							onMouseDown={(e) => {
								e.preventDefault();
								onSelect(cat);
								setOpen(false);
							}}
						>
							{cat}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export default function CFScoreSection({
	profileId,
	contentType,
	minCustomFormatScore,
	upgradeUntilCustomFormatScore,
	onMinScoreChange,
	onUpgradeUntilScoreChange,
	localScores,
	onLocalScoresChange,
}: CFScoreSectionProps): JSX.Element {
	// Load all custom formats
	const { data: allCustomFormats } = useSuspenseQuery(customFormatsListQuery());

	// For existing profiles, load assigned CF scores
	const { data: profileCFs, refetch: refetchProfileCFs } = useQuery({
		...profileCustomFormatsQuery(profileId ?? 0),
		enabled: profileId !== undefined,
	});

	// Mutations for existing profiles
	const setScore = useSetProfileCFScore();
	const removeCFs = useRemoveProfileCFs();
	const addCategory = useAddCategoryToProfile();

	// Filter CFs by profile content type
	const filteredCFs = useMemo(() => {
		return allCustomFormats.filter(
			(cf) =>
				Array.isArray(cf.contentTypes) && cf.contentTypes.includes(contentType),
		);
	}, [allCustomFormats, contentType]);

	// Build rows from either server data (existing profile) or local state (new profile)
	const rows: CFRow[] = useMemo(() => {
		if (profileId !== undefined && profileCFs) {
			return profileCFs.map((pcf) => ({
				customFormatId: pcf.customFormatId,
				name: pcf.name,
				category: pcf.category,
				defaultScore: pcf.defaultScore,
				score: pcf.score,
			}));
		}
		if (localScores) {
			return localScores.map((ls) => {
				const cf = allCustomFormats.find((c) => c.id === ls.customFormatId);
				return {
					customFormatId: ls.customFormatId,
					name: cf?.name ?? `CF #${ls.customFormatId}`,
					category: cf?.category ?? "",
					defaultScore: cf?.defaultScore ?? 0,
					score: ls.score,
				};
			});
		}
		return [];
	}, [profileId, profileCFs, localScores, allCustomFormats]);

	const assignedIds = useMemo(
		() => new Set(rows.map((r) => r.customFormatId)),
		[rows],
	);

	// ---------- handlers for existing profiles (immediate mutation) ----------

	const handleAddFormat = useCallback(
		(cf: {
			id: number;
			name: string;
			category: string;
			defaultScore: number;
		}) => {
			if (profileId !== undefined) {
				setScore.mutate(
					{ profileId, customFormatId: cf.id, score: cf.defaultScore },
					{ onSuccess: () => refetchProfileCFs() },
				);
			} else if (onLocalScoresChange && localScores) {
				onLocalScoresChange([
					...localScores,
					{ customFormatId: cf.id, score: cf.defaultScore },
				]);
			}
		},
		[profileId, setScore, refetchProfileCFs, localScores, onLocalScoresChange],
	);

	const handleAddCategory = useCallback(
		(category: string) => {
			if (profileId !== undefined) {
				addCategory.mutate(
					{ profileId, category },
					{ onSuccess: () => refetchProfileCFs() },
				);
			} else if (onLocalScoresChange && localScores) {
				const cfsInCategory = filteredCFs.filter(
					(cf) => cf.category === category,
				);
				const existingIds = new Set(localScores.map((ls) => ls.customFormatId));
				const newScores = cfsInCategory
					.filter((cf) => !existingIds.has(cf.id))
					.map((cf) => ({ customFormatId: cf.id, score: cf.defaultScore }));
				if (newScores.length > 0) {
					onLocalScoresChange([...localScores, ...newScores]);
				}
			}
		},
		[
			profileId,
			addCategory,
			refetchProfileCFs,
			localScores,
			onLocalScoresChange,
			filteredCFs,
		],
	);

	const handleRemoveAll = useCallback(() => {
		if (profileId !== undefined) {
			const ids = rows.map((r) => r.customFormatId);
			if (ids.length === 0) {
				return;
			}
			removeCFs.mutate(
				{ profileId, customFormatIds: ids },
				{ onSuccess: () => refetchProfileCFs() },
			);
		} else if (onLocalScoresChange) {
			onLocalScoresChange([]);
		}
	}, [profileId, rows, removeCFs, refetchProfileCFs, onLocalScoresChange]);

	const handleRemoveOne = useCallback(
		(customFormatId: number) => {
			if (profileId !== undefined) {
				removeCFs.mutate(
					{ profileId, customFormatIds: [customFormatId] },
					{ onSuccess: () => refetchProfileCFs() },
				);
			} else if (onLocalScoresChange && localScores) {
				onLocalScoresChange(
					localScores.filter((ls) => ls.customFormatId !== customFormatId),
				);
			}
		},
		[profileId, removeCFs, refetchProfileCFs, localScores, onLocalScoresChange],
	);

	const handleScoreChange = useCallback(
		(customFormatId: number, newScore: number) => {
			if (profileId !== undefined) {
				setScore.mutate(
					{ profileId, customFormatId, score: newScore },
					{ onSuccess: () => refetchProfileCFs() },
				);
			} else if (onLocalScoresChange && localScores) {
				onLocalScoresChange(
					localScores.map((ls) =>
						ls.customFormatId === customFormatId
							? { ...ls, score: newScore }
							: ls,
					),
				);
			}
		},
		[profileId, setScore, refetchProfileCFs, localScores, onLocalScoresChange],
	);

	const handleResetScore = useCallback(
		(customFormatId: number, defaultScore: number) => {
			handleScoreChange(customFormatId, defaultScore);
		},
		[handleScoreChange],
	);

	return (
		<div className="space-y-4">
			<Label className="text-base font-semibold">Custom Formats</Label>

			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="min-cf-score">Minimum Custom Format Score</Label>
					<Input
						id="min-cf-score"
						type="number"
						value={minCustomFormatScore}
						onChange={(e) => onMinScoreChange(Number(e.target.value))}
					/>
					<p className="text-xs text-muted-foreground">
						Releases below this score will be rejected
					</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor="upgrade-until-cf-score">Upgrade Until Score</Label>
					<Input
						id="upgrade-until-cf-score"
						type="number"
						value={upgradeUntilCustomFormatScore}
						onChange={(e) => onUpgradeUntilScoreChange(Number(e.target.value))}
					/>
					<p className="text-xs text-muted-foreground">
						Stop upgrading when this CF score is reached
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2">
				<CFSearchDropdown
					allCFs={filteredCFs}
					assignedIds={assignedIds}
					onAdd={handleAddFormat}
				/>
				<CategoryDropdown
					categories={customFormatCategories}
					onSelect={handleAddCategory}
				/>
				{profileId !== undefined && (
					<PresetSelector
						profileId={profileId}
						contentType={contentType}
						onApplied={({
							minCustomFormatScore: min,
							upgradeUntilCustomFormatScore: upgrade,
						}) => {
							onMinScoreChange(min);
							onUpgradeUntilScoreChange(upgrade);
							refetchProfileCFs();
						}}
					/>
				)}
				{rows.length > 0 && (
					<Button
						type="button"
						variant="destructive"
						size="sm"
						onClick={handleRemoveAll}
					>
						Remove All
					</Button>
				)}
			</div>

			{rows.length > 0 && (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Category</TableHead>
							<TableHead className="text-right">Default</TableHead>
							<TableHead className="text-right">Score</TableHead>
							<TableHead className="w-[100px]" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => {
							const isModified = row.score !== row.defaultScore;
							return (
								<TableRow key={row.customFormatId}>
									<TableCell className="font-medium">
										<div className="flex items-center gap-2">
											{row.name}
											{isModified && (
												<Badge
													variant="outline"
													className="text-yellow-500 border-yellow-500/40"
												>
													Modified
												</Badge>
											)}
										</div>
									</TableCell>
									<TableCell>
										<Badge variant="secondary">{row.category}</Badge>
									</TableCell>
									<TableCell className="text-right text-muted-foreground">
										{row.defaultScore}
									</TableCell>
									<TableCell className="text-right">
										<input
											type="number"
											value={row.score}
											onChange={(e) =>
												handleScoreChange(
													row.customFormatId,
													Number(e.target.value),
												)
											}
											className="w-20 rounded-md border border-input bg-transparent px-2 py-1 text-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										/>
									</TableCell>
									<TableCell>
										<div className="flex items-center justify-end gap-1">
											{isModified && (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="h-7 w-7"
													onClick={() =>
														handleResetScore(
															row.customFormatId,
															row.defaultScore,
														)
													}
													title="Reset to default score"
												>
													<RotateCcw className="h-3.5 w-3.5" />
												</Button>
											)}
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="h-7 w-7 text-destructive hover:text-destructive"
												onClick={() => handleRemoveOne(row.customFormatId)}
												title="Remove"
											>
												<X className="h-3.5 w-3.5" />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			)}

			{rows.length === 0 && (
				<p className="text-sm text-muted-foreground py-4 text-center">
					No custom formats assigned. Use the controls above to add formats.
				</p>
			)}
		</div>
	);
}
