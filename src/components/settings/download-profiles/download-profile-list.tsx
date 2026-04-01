import { ChevronRight, Equal, Pencil, Trash2 } from "lucide-react";
import type { JSX } from "react";
import { Fragment, useState } from "react";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "src/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "src/components/ui/tooltip";
import { CATEGORY_MAP } from "src/lib/categories";
import COLOR_BADGE_CLASSES from "src/lib/format-colors";
import { getProfileIcon } from "src/lib/profile-icons";

type DownloadProfile = {
	id: number;
	name: string;
	icon: string;
	rootFolderPath: string;
	cutoff: number;
	items: number[][];
	upgradeAllowed: boolean;
	categories: number[];
	contentType: string;
};

type FormatDefinition = {
	id: number;
	title: string;
	color: string;
};

type DownloadProfileListProps = {
	profiles: DownloadProfile[];
	definitions: FormatDefinition[];
	onEdit: (profile: DownloadProfile) => void;
	onDelete: (id: number) => void;
};

function contentTypeLabel(contentType: string): string {
	switch (contentType) {
		case "tv": {
			return "TV";
		}
		case "movie": {
			return "Movie";
		}
		case "ebook": {
			return "Ebook";
		}
		case "audiobook": {
			return "Audiobook";
		}
		default: {
			return contentType;
		}
	}
}

const CONTENT_TYPE_BADGE_CLASSES: Record<string, string> = {
	movie: "bg-blue-500/20 text-blue-400 border-blue-500/30",
	tv: "bg-purple-500/20 text-purple-400 border-purple-500/30",
	ebook: "bg-green-500/20 text-green-400 border-green-500/30",
	audiobook: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

export default function DownloadProfileList({
	profiles,
	definitions,
	onEdit,
	onDelete,
}: DownloadProfileListProps): JSX.Element {
	const [deleteTarget, setDeleteTarget] = useState<DownloadProfile | null>(
		null,
	);

	const defById = new Map(definitions.map((d) => [d.id, d]));

	if (profiles.length === 0) {
		return (
			<div className="text-center py-8 text-muted-foreground">
				No download profiles found. Create one to get started.
			</div>
		);
	}

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Root Folder</TableHead>
						<TableHead>Content</TableHead>
						<TableHead>Formats</TableHead>
						<TableHead>Categories</TableHead>
						<TableHead>Upgrades</TableHead>
						<TableHead className="w-24">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{profiles.map((profile) => {
						const cutoffDef = profile.cutoff
							? defById.get(profile.cutoff)
							: null;
						return (
							<TableRow key={profile.id}>
								<TableCell className="font-medium">
									{(() => {
										const Icon = getProfileIcon(profile.icon);
										return (
											<span className="flex items-center gap-2">
												<Icon className="h-4 w-4 text-muted-foreground" />
												{profile.name}
											</span>
										);
									})()}
								</TableCell>
								<TableCell className="text-muted-foreground text-sm max-w-0">
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<div className="truncate text-left font-mono" dir="rtl">
													<bdo dir="ltr">{profile.rootFolderPath || "—"}</bdo>
												</div>
											</TooltipTrigger>
											{profile.rootFolderPath && (
												<TooltipContent>
													{profile.rootFolderPath}
												</TooltipContent>
											)}
										</Tooltip>
									</TooltipProvider>
								</TableCell>
								<TableCell>
									<Badge
										variant="outline"
										className={
											CONTENT_TYPE_BADGE_CLASSES[profile.contentType] ?? ""
										}
									>
										{contentTypeLabel(profile.contentType)}
									</Badge>
								</TableCell>
								<TableCell>
									<div className="flex flex-wrap items-center gap-1">
										{profile.items.map((group, groupIdx) => {
											const isMulti = group.length > 1;
											const gKey = group.join("-");
											return (
												<Fragment key={gKey}>
													{groupIdx > 0 && (
														<ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
													)}
													{isMulti ? (
														<div className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-muted-foreground/30 px-1 py-0.5">
															<Equal className="h-3 w-3 text-muted-foreground shrink-0" />
															{group.map((id) => {
																const def = defById.get(id);
																if (!def) {
																	return null;
																}
																const isCutoff = profile.cutoff === id;
																let badgeClass = "";
																if (isCutoff) {
																	badgeClass =
																		"border-blue-500 bg-blue-500/20 text-blue-400";
																} else if (def.color) {
																	badgeClass =
																		COLOR_BADGE_CLASSES[def.color] ?? "";
																}
																return (
																	<Badge
																		key={id}
																		variant="secondary"
																		className={badgeClass}
																	>
																		{def.title}
																	</Badge>
																);
															})}
														</div>
													) : (
														group.map((id) => {
															const def = defById.get(id);
															if (!def) {
																return null;
															}
															const isCutoff = profile.cutoff === id;
															let badgeClass = "";
															if (isCutoff) {
																badgeClass =
																	"border-blue-500 bg-blue-500/20 text-blue-400";
															} else if (def.color) {
																badgeClass =
																	COLOR_BADGE_CLASSES[def.color] ?? "";
															}
															return (
																<Badge
																	key={id}
																	variant="secondary"
																	className={badgeClass}
																>
																	{def.title}
																</Badge>
															);
														})
													)}
												</Fragment>
											);
										})}
									</div>
								</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-1">
										{profile.categories.map((catId) => (
											<Badge key={catId} variant="outline">
												{CATEGORY_MAP.get(catId) ?? String(catId)}
											</Badge>
										))}
									</div>
								</TableCell>
								<TableCell>
									{(() => {
										if (!profile.upgradeAllowed) {
											return "No";
										}
										if (cutoffDef) {
											return `Until ${cutoffDef.title}`;
										}
										return "Yes";
									})()}
								</TableCell>
								<TableCell>
									<div className="flex gap-1">
										<Button
											variant="ghost"
											size="icon"
											onClick={() => onEdit(profile)}
										>
											<Pencil className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setDeleteTarget(profile)}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>

			<ConfirmDialog
				open={Boolean(deleteTarget)}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteTarget(null);
					}
				}}
				title="Delete Profile"
				description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
				onConfirm={() => {
					if (deleteTarget) {
						onDelete(deleteTarget.id);
						setDeleteTarget(null);
					}
				}}
			/>
		</>
	);
}
