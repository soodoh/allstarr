import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
import {
	type MappingAction,
	type MappingFile,
	MappingInteraction,
} from "src/lib/mapping-interaction";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";
import { userSettingsQuery } from "src/lib/queries/user-settings";
import { queryKeys } from "src/lib/query-keys";
import {
	mapUnmappedFileFn,
	previewUnmappedImportAssetsFn,
	suggestUnmappedTvMappingsFn,
} from "src/server/unmapped-files";

export function useMappingInteraction(
	contentType: string,
	files: MappingFile[],
	onClose: () => void,
) {
	const queryClient = useQueryClient();
	const upsertUserSettings = useUpsertUserSettings();
	const [interaction, setInteraction] = useState(() =>
		MappingInteraction.start(contentType, files),
	);
	const [selectedProfileId, setSelectedProfileId] = useState("");
	const [moveRelatedFiles, setMoveRelatedFiles] = useState(false);
	const [deleteDeselectedRelatedFiles, setDeleteDeselectedRelatedFiles] =
		useState(false);
	const [defaultsHydrated, setDefaultsHydrated] = useState(false);
	const isTv = contentType === "tv";
	const visibleFiles = interaction.rows.map((row) => row.file);
	const dispatch = useCallback(
		(action: MappingAction) =>
			setInteraction((current) => current.transition(action)),
		[],
	);

	const { data: userSettings, isFetched: isUserSettingsFetched } = useQuery(
		userSettingsQuery("unmapped-files"),
	);
	useEffect(() => {
		if (!isUserSettingsFetched || defaultsHydrated) return;
		setMoveRelatedFiles(
			Boolean(
				userSettings?.addDefaults?.moveRelatedFiles ??
					userSettings?.addDefaults?.moveRelatedSidecars ??
					false,
			),
		);
		setDeleteDeselectedRelatedFiles(
			Boolean(userSettings?.addDefaults?.deleteDeselectedRelatedFiles ?? false),
		);
		setDefaultsHydrated(true);
	}, [defaultsHydrated, isUserSettingsFetched, userSettings]);
	const { data: allProfiles = [] } = useQuery(downloadProfilesListQuery());
	const filteredProfiles = allProfiles.filter(
		(profile) => profile.contentType === contentType,
	);
	const effectiveProfileId =
		selectedProfileId ||
		(filteredProfiles.length ? String(filteredProfiles[0].id) : "");
	const { data: suggestions } = useQuery({
		queryKey: [
			"unmappedFiles",
			"tv-suggestions",
			contentType,
			visibleFiles.map((file) => file.id).join(","),
		],
		queryFn: () =>
			suggestUnmappedTvMappingsFn({
				data: {
					rows: visibleFiles.map((file) => ({
						contentType: "tv" as const,
						fileId: file.id,
						hints: file.hints,
						path: file.path,
					})),
				},
			}),
		enabled: isTv && visibleFiles.length > 0,
	});

	const assetPreview = useQuery({
		queryKey: [
			"unmappedFiles",
			"asset-preview",
			contentType,
			visibleFiles.map((file) => file.id).join(","),
		],
		queryFn: () =>
			previewUnmappedImportAssetsFn({
				data: {
					rows: visibleFiles.map((file) => ({
						contentType:
							contentType === "ebook"
								? ("book" as const)
								: (contentType as "audiobook" | "book" | "movie" | "tv"),
						fileId: file.id,
						path: file.path,
					})),
				},
			}),
		enabled: visibleFiles.length > 0,
	});
	useEffect(() => {
		setInteraction((current) => {
			const reconciled = current.transition({
				type: "files",
				files,
				contentType,
			});
			const suggested = isTv
				? reconciled.transition({
						type: "suggestions",
						suggestions: (suggestions?.rows ?? []).map((row) => ({
							...row,
							title:
								"title" in row && typeof row.title === "string"
									? row.title
									: undefined,
						})),
					})
				: reconciled;
			return suggested.transition({
				type: "assets",
				rows: assetPreview.data?.rows ?? [],
			});
		});
	}, [assetPreview.data?.rows, contentType, files, isTv, suggestions?.rows]);

	const options = {
		profileId: effectiveProfileId,
		moveRelatedFiles,
		deleteDeselectedRelatedFiles,
		previewPending: Boolean(assetPreview.isLoading || assetPreview.isFetching),
	};
	const submit = async () => {
		const submission = interaction.submission(options);
		if (!submission.ok) {
			toast.error(submission.message);
			return;
		}
		dispatch({ type: "started" });
		try {
			const result = await mapUnmappedFileFn({ data: submission.data });
			queryClient.invalidateQueries({ queryKey: queryKeys.unmappedFiles.all });
			upsertUserSettings.mutate({
				addDefaults: { deleteDeselectedRelatedFiles, moveRelatedFiles },
				tableId: "unmapped-files",
			});
			dispatch({ type: "completed", result });
			const failedCount = result.failedCount ?? result.failures?.length ?? 0;
			if (failedCount > 0) {
				toast.error(
					`${failedCount} file${failedCount !== 1 ? "s" : ""} failed to map`,
				);
				return;
			}
			toast.success(
				`${result.mappedCount} file${result.mappedCount !== 1 ? "s" : ""} mapped`,
			);
			onClose();
		} catch {
			dispatch({ type: "failed" });
			toast.error("Failed to map files");
		}
	};
	return {
		isTv,
		rows: interaction.rows,
		mapping: interaction.mapping,
		filteredProfiles,
		effectiveProfileId,
		setSelectedProfileId,
		moveRelatedFiles,
		setMoveRelatedFiles,
		deleteDeselectedRelatedFiles,
		setDeleteDeselectedRelatedFiles,
		disableSubmit: !interaction.submission(options).ok,
		dispatch,
		submit,
	};
}
