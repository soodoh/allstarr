import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import LanguageSingleSelect from "src/components/shared/language-single-select";
import PageHeader from "src/components/shared/page-header";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import Switch from "src/components/ui/switch";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "src/components/ui/tabs";
import {
	useUpdateMetadataProfile,
	useUpdateSettings,
} from "src/hooks/mutations";
import { requireAdminBeforeLoad } from "src/lib/admin-route";
import validateForm from "src/lib/form-validation";
import { metadataProfileQuery, settingsMapQuery } from "src/lib/queries";
import { metadataProfileSchema } from "src/lib/validators";

export const Route = createFileRoute("/_authed/settings/metadata")({
	beforeLoad: requireAdminBeforeLoad,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(metadataProfileQuery());
	},
	component: MetadataSettingsPage,
});

const REGION_OPTIONS = [
	{ value: "__none", label: "No filter" },
	{ value: "US", label: "United States" },
	{ value: "GB", label: "United Kingdom" },
	{ value: "CA", label: "Canada" },
	{ value: "AU", label: "Australia" },
	{ value: "DE", label: "Germany" },
	{ value: "FR", label: "France" },
	{ value: "ES", label: "Spain" },
	{ value: "IT", label: "Italy" },
	{ value: "JP", label: "Japan" },
	{ value: "KR", label: "South Korea" },
	{ value: "BR", label: "Brazil" },
	{ value: "MX", label: "Mexico" },
	{ value: "IN", label: "India" },
	{ value: "NL", label: "Netherlands" },
	{ value: "SE", label: "Sweden" },
	{ value: "DK", label: "Denmark" },
	{ value: "NO", label: "Norway" },
	{ value: "FI", label: "Finland" },
];

function MetadataSettingsPage() {
	const { data: profile } = useSuspenseQuery(metadataProfileQuery());
	const settingsQuery = useQuery(settingsMapQuery());
	const settingsMap = settingsQuery.data ?? {};
	const updateProfile = useUpdateMetadataProfile();
	const updateSettings = useUpdateSettings();

	// ── Hardcover tab state ────────────────────────────────────────────────────
	const [skipMissingReleaseDate, setSkipMissingReleaseDate] = useState(
		profile.skipMissingReleaseDate,
	);
	const [skipMissingIsbnAsin, setSkipMissingIsbnAsin] = useState(
		profile.skipMissingIsbnAsin,
	);
	const [skipCompilations, setSkipCompilations] = useState(
		profile.skipCompilations,
	);
	const [minimumPopularity, setMinimumPopularity] = useState(
		profile.minimumPopularity,
	);
	const [minimumPages, setMinimumPages] = useState(profile.minimumPages);
	const [profileErrors, setProfileErrors] = useState<Record<string, string>>(
		{},
	);

	// ── TMDB tab state ─────────────────────────────────────────────────────────
	const [tmdbLanguage, setTmdbLanguage] = useState("en");
	const [tmdbIncludeAdult, setTmdbIncludeAdult] = useState(false);
	const [tmdbRegion, setTmdbRegion] = useState("__none");
	const [tmdbDirty, setTmdbDirty] = useState(false);

	useEffect(() => {
		if (settingsQuery.status !== "success" || tmdbDirty) {
			return;
		}

		setTmdbLanguage(
			(settingsMap["metadata.tmdb.language"] as string | undefined) ?? "en",
		);
		setTmdbIncludeAdult(
			(settingsMap["metadata.tmdb.includeAdult"] as boolean | undefined) ??
				false,
		);
		setTmdbRegion(
			(settingsMap["metadata.tmdb.region"] as string | undefined) || "__none",
		);
	}, [settingsMap, settingsQuery.status, tmdbDirty]);

	// ── Save handlers ──────────────────────────────────────────────────────────
	const handleSaveHardcover = () => {
		const result = validateForm(metadataProfileSchema, {
			skipMissingReleaseDate,
			skipMissingIsbnAsin,
			skipCompilations,
			minimumPopularity,
			minimumPages,
		});
		if (!result.success) {
			setProfileErrors(result.errors);
			return;
		}
		setProfileErrors({});
		updateProfile.mutate(result.data);
	};

	const handleSaveTmdb = () => {
		updateSettings.mutate([
			{ key: "metadata.tmdb.language", value: tmdbLanguage },
			{
				key: "metadata.tmdb.includeAdult",
				value: tmdbIncludeAdult,
			},
			{
				key: "metadata.tmdb.region",
				value: tmdbRegion === "__none" ? "" : tmdbRegion,
			},
		]);
	};

	const isHardcoverSaving = updateProfile.isPending;
	const isTmdbSaving = updateSettings.isPending;
	const tmdbReady = settingsQuery.status === "success";

	return (
		<div>
			<PageHeader
				title="Metadata Settings"
				description="Configure metadata sources and import filters."
			/>

			<div className="max-w-2xl">
				<Tabs defaultValue="hardcover">
					<TabsList className="mb-6">
						<TabsTrigger value="hardcover">Hardcover</TabsTrigger>
						<TabsTrigger value="tmdb">TMDB</TabsTrigger>
					</TabsList>

					{/* ── Hardcover Tab ─────────────────────────────────────────────── */}
					<TabsContent value="hardcover" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Import Filters</CardTitle>
								<CardDescription>
									Control which books are imported when adding authors or
									refreshing metadata.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-6">
								<div className="flex items-center justify-between">
									<div className="space-y-0.5">
										<Label>Skip books with missing release date</Label>
										<p className="text-sm text-muted-foreground">
											Books without a release date will not be imported.
										</p>
									</div>
									<Switch
										checked={skipMissingReleaseDate}
										onCheckedChange={setSkipMissingReleaseDate}
									/>
								</div>

								<div className="flex items-center justify-between">
									<div className="space-y-0.5">
										<Label>Skip books with no ISBN or ASIN</Label>
										<p className="text-sm text-muted-foreground">
											Books where no edition has an ISBN or ASIN (after language
											filtering) will not be imported.
										</p>
									</div>
									<Switch
										checked={skipMissingIsbnAsin}
										onCheckedChange={setSkipMissingIsbnAsin}
									/>
								</div>

								<div className="flex items-center justify-between">
									<div className="space-y-0.5">
										<Label>Skip compilations and box sets</Label>
										<p className="text-sm text-muted-foreground">
											Books marked as compilations on Hardcover will not be
											imported.
										</p>
									</div>
									<Switch
										checked={skipCompilations}
										onCheckedChange={setSkipCompilations}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="minimum-popularity">Minimum Popularity</Label>
									<p className="text-sm text-muted-foreground">
										Books with fewer readers than this value will be skipped.
										Set to 0 to disable.
									</p>
									<Input
										id="minimum-popularity"
										type="number"
										min={0}
										value={minimumPopularity}
										onChange={(e) =>
											setMinimumPopularity(
												Number.parseInt(e.target.value, 10) || 0,
											)
										}
										className="w-32"
									/>
									{profileErrors.minimumPopularity && (
										<p className="text-sm text-destructive">
											{profileErrors.minimumPopularity}
										</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="minimum-pages">Minimum Pages</Label>
									<p className="text-sm text-muted-foreground">
										Books where no edition has at least this many pages will be
										skipped. Audiobook editions are excluded from this check.
										Set to 0 to disable.
									</p>
									<Input
										id="minimum-pages"
										type="number"
										min={0}
										value={minimumPages}
										onChange={(e) =>
											setMinimumPages(Number.parseInt(e.target.value, 10) || 0)
										}
										className="w-32"
									/>
									{profileErrors.minimumPages && (
										<p className="text-sm text-destructive">
											{profileErrors.minimumPages}
										</p>
									)}
								</div>
							</CardContent>
						</Card>

						<Button onClick={handleSaveHardcover} disabled={isHardcoverSaving}>
							{isHardcoverSaving ? "Saving..." : "Save Hardcover Settings"}
						</Button>
					</TabsContent>

					{/* ── TMDB Tab ──────────────────────────────────────────────────── */}
					<TabsContent value="tmdb" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Language & Region</CardTitle>
								<CardDescription>
									Filter TMDB results by language and region.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-6">
								<div className="space-y-2">
									<Label>Language</Label>
									<p className="text-sm text-muted-foreground">
										Preferred language for TMDB metadata results.
									</p>
									<div className="w-56">
										<LanguageSingleSelect
											value={tmdbLanguage}
											onChange={(value) => {
												setTmdbDirty(true);
												setTmdbLanguage(value);
											}}
										/>
									</div>
								</div>

								<div className="space-y-2">
									<Label htmlFor="tmdb-region">Region</Label>
									<p className="text-sm text-muted-foreground">
										Filter results to a specific country/region.
									</p>
									<Select
										value={tmdbRegion}
										onValueChange={(value) => {
											setTmdbDirty(true);
											setTmdbRegion(value);
										}}
									>
										<SelectTrigger id="tmdb-region" className="w-56">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{REGION_OPTIONS.map((opt) => (
												<SelectItem key={opt.value} value={opt.value}>
													{opt.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="flex items-center justify-between">
									<div className="space-y-0.5">
										<Label>Include Adult Content</Label>
										<p className="text-sm text-muted-foreground">
											Include adult-rated titles in TMDB search results.
										</p>
									</div>
									<Switch
										checked={tmdbIncludeAdult}
										onCheckedChange={(checked) => {
											setTmdbDirty(true);
											setTmdbIncludeAdult(checked);
										}}
									/>
								</div>
							</CardContent>
						</Card>

						<Button
							onClick={handleSaveTmdb}
							disabled={isTmdbSaving || !tmdbReady}
						>
							{isTmdbSaving ? "Saving..." : "Save TMDB Settings"}
						</Button>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
