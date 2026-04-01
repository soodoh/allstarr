import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import type { JSX } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import { queryKeys } from "src/lib/query-keys";
import { applyPresetFn, getPresetsFn } from "src/server/custom-format-presets";

function scoreBadgeClass(score: number): string {
	if (score > 0) {
		return "border-green-500/40 text-green-400";
	}
	if (score < 0) {
		return "border-red-500/40 text-red-400";
	}
	return "";
}

type PresetSelectorProps = {
	profileId: number;
	contentType: string;
	onApplied?: (result: {
		minCustomFormatScore: number;
		upgradeUntilCustomFormatScore: number;
	}) => void;
};

export default function PresetSelector({
	profileId,
	contentType,
	onApplied,
}: PresetSelectorProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [applying, setApplying] = useState<string | null>(null);
	const [confirmPreset, setConfirmPreset] = useState<string | null>(null);
	const queryClient = useQueryClient();

	const { data: presets, isLoading } = useQuery({
		queryKey: ["presets", contentType],
		queryFn: () => getPresetsFn({ data: { contentType } }),
		enabled: open,
	});

	const handleApply = async (presetName: string) => {
		setApplying(presetName);
		try {
			await applyPresetFn({ data: { profileId, presetName } });

			// Find the preset to get its score thresholds
			const preset = presets?.find((p) => p.name === presetName);

			toast.success(`Applied preset "${presetName}"`);
			queryClient.invalidateQueries({
				queryKey: queryKeys.customFormats.all,
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.downloadProfiles.all,
			});

			if (onApplied && preset) {
				onApplied({
					minCustomFormatScore: preset.minCustomFormatScore,
					upgradeUntilCustomFormatScore: preset.upgradeUntilCustomFormatScore,
				});
			}

			setConfirmPreset(null);
			setOpen(false);
		} catch (error) {
			toast.error(
				`Failed to apply preset: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setApplying(null);
		}
	};

	return (
		<>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setOpen(true)}
			>
				<Sparkles className="mr-1.5 h-3.5 w-3.5" />
				Apply Preset
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Apply Custom Format Preset</DialogTitle>
						<DialogDescription>
							Choose a preset to apply pre-configured custom formats and scores
							to this profile. Presets are based on{" "}
							<a
								href="https://trash-guides.info"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary underline hover:text-primary/80"
							>
								TRaSH Guides
							</a>
							.
						</DialogDescription>
					</DialogHeader>

					<DialogBody>
						{isLoading && (
							<div className="flex items-center justify-center py-8">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						)}

						{presets && presets.length === 0 && (
							<div className="text-center py-8 text-muted-foreground">
								No presets available for this profile type.
							</div>
						)}

						{presets && presets.length > 0 && (
							<div className="grid gap-4">
								{presets.map((preset) => (
									<Card key={preset.name} className="py-4">
										<CardHeader className="pb-2">
											<div className="flex items-start justify-between">
												<div>
													<CardTitle className="text-base">
														{preset.name}
													</CardTitle>
													<CardDescription className="mt-1">
														{preset.description}
													</CardDescription>
												</div>
												<Badge variant="outline">{preset.category}</Badge>
											</div>
										</CardHeader>
										<CardContent className="pb-2">
											<div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
												<span>
													<span className="font-medium text-foreground">
														{preset.cfCount}
													</span>{" "}
													custom format{preset.cfCount === 1 ? "" : "s"}
												</span>
												<span>
													Min score:{" "}
													<span className="font-medium text-foreground">
														{preset.minCustomFormatScore}
													</span>
												</span>
												<span>
													Upgrade until:{" "}
													<span className="font-medium text-foreground">
														{preset.upgradeUntilCustomFormatScore}
													</span>
												</span>
											</div>

											{/* Show score breakdown */}
											<div className="mt-3 flex flex-wrap gap-1.5">
												{Object.entries(preset.scores).map(([name, score]) => (
													<Badge
														key={name}
														variant="secondary"
														className={scoreBadgeClass(score)}
													>
														{name}: {score > 0 ? "+" : ""}
														{score}
													</Badge>
												))}
											</div>
										</CardContent>
										<CardFooter className="pt-2">
											{confirmPreset === preset.name ? (
												<div className="flex items-center gap-2 w-full">
													<div className="flex items-center gap-1.5 text-sm text-yellow-500">
														<AlertTriangle className="h-3.5 w-3.5" />
														This will replace all current custom format scores
													</div>
													<div className="ml-auto flex items-center gap-2">
														<Button
															type="button"
															variant="outline"
															size="sm"
															onClick={() => setConfirmPreset(null)}
															disabled={applying !== null}
														>
															Cancel
														</Button>
														<Button
															type="button"
															size="sm"
															onClick={() => handleApply(preset.name)}
															disabled={applying !== null}
														>
															{applying === preset.name ? (
																<>
																	<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
																	Applying...
																</>
															) : (
																"Confirm"
															)}
														</Button>
													</div>
												</div>
											) : (
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => setConfirmPreset(preset.name)}
													disabled={applying !== null}
												>
													Apply
												</Button>
											)}
										</CardFooter>
									</Card>
								))}
							</div>
						)}
					</DialogBody>
				</DialogContent>
			</Dialog>
		</>
	);
}
