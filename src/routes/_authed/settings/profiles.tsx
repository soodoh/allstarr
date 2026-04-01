import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import DownloadProfileForm from "src/components/settings/download-profiles/download-profile-form";
import DownloadProfileList from "src/components/settings/download-profiles/download-profile-list";
import PageHeader from "src/components/shared/page-header";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "src/components/ui/tabs";
import {
	useCreateDownloadProfile,
	useDeleteDownloadProfile,
	useUpdateDownloadProfile,
} from "src/hooks/mutations";
import { useBulkSetProfileCFScores } from "src/hooks/mutations/custom-formats";
import {
	downloadFormatsListQuery,
	downloadProfilesListQuery,
} from "src/lib/queries";
import { customFormatsListQuery } from "src/lib/queries/custom-formats";
import { getServerCwdFn } from "src/server/filesystem";

export const Route = createFileRoute("/_authed/settings/profiles")({
	loader: async ({ context }) => {
		const results = await Promise.all([
			context.queryClient.ensureQueryData(downloadProfilesListQuery()),
			context.queryClient.ensureQueryData(downloadFormatsListQuery()),
			context.queryClient.ensureQueryData(customFormatsListQuery()),
			getServerCwdFn(),
		]);
		return { serverCwd: results[3] };
	},
	component: ProfilesPage,
});

type ProfileValues = {
	name: string;
	icon: string;
	rootFolderPath: string;
	cutoff: number;
	items: number[][];
	upgradeAllowed: boolean;
	categories: number[];
	contentType: "ebook" | "movie" | "tv" | "audiobook" | "manga";
	language: string;
	minCustomFormatScore: number;
	upgradeUntilCustomFormatScore: number;
};

type TabValue = "all" | "movie" | "tv" | "ebook" | "audiobook" | "manga";

function ProfilesPage() {
	const { serverCwd } = Route.useLoaderData();
	const { data: profiles } = useSuspenseQuery(downloadProfilesListQuery());
	const { data: definitions } = useSuspenseQuery(downloadFormatsListQuery());

	const createProfile = useCreateDownloadProfile();
	const updateProfile = useUpdateDownloadProfile();
	const deleteProfile = useDeleteDownloadProfile();
	const bulkSetCFScores = useBulkSetProfileCFScores();

	const [activeTab, setActiveTab] = useState<TabValue>("all");
	const [profileDialogOpen, setProfileDialogOpen] = useState(false);
	const [editingProfile, setEditingProfile] = useState<
		(typeof profiles)[number] | undefined
	>(undefined);

	const filteredProfiles = useMemo(() => {
		if (activeTab === "all") {
			return profiles;
		}
		return profiles.filter((p) => p.contentType === activeTab);
	}, [profiles, activeTab]);

	const profileLoading = createProfile.isPending || updateProfile.isPending;

	const handleCreateProfile = (values: ProfileValues) => {
		createProfile.mutate(values, {
			onSuccess: () => setProfileDialogOpen(false),
		});
	};

	/** Two-step create: create profile, then bulk-insert CF scores */
	const handleCreateProfileWithCFs = (
		values: ProfileValues,
		localCFScores: Array<{ customFormatId: number; score: number }>,
	) => {
		createProfile.mutate(values, {
			onSuccess: (newProfile) => {
				if (localCFScores.length > 0) {
					bulkSetCFScores.mutate(
						{ profileId: newProfile.id, scores: localCFScores },
						{ onSuccess: () => setProfileDialogOpen(false) },
					);
				} else {
					setProfileDialogOpen(false);
				}
			},
		});
	};

	const handleUpdateProfile = (values: ProfileValues) => {
		if (!editingProfile) {
			return;
		}
		updateProfile.mutate(
			{ ...values, id: editingProfile.id },
			{
				onSuccess: () => {
					setEditingProfile(undefined);
					setProfileDialogOpen(false);
				},
			},
		);
	};

	const activeMutation = editingProfile ? updateProfile : createProfile;

	const handleEditProfile = (profile: (typeof profiles)[number]) => {
		setEditingProfile(profile);
		setProfileDialogOpen(true);
	};

	return (
		<div>
			<PageHeader
				title="Profiles"
				description="Configure format preferences per author"
				actions={
					<Button
						onClick={() => {
							setEditingProfile(undefined);
							setProfileDialogOpen(true);
						}}
					>
						Add Profile
					</Button>
				}
			/>

			<Tabs
				value={activeTab}
				onValueChange={(v) => setActiveTab(v as TabValue)}
			>
				<TabsList>
					<TabsTrigger value="all">All</TabsTrigger>
					<TabsTrigger value="movie">Movie</TabsTrigger>
					<TabsTrigger value="tv">TV</TabsTrigger>
					<TabsTrigger value="ebook">Ebook</TabsTrigger>
					<TabsTrigger value="audiobook">Audiobook</TabsTrigger>
					<TabsTrigger value="manga">Manga</TabsTrigger>
				</TabsList>
				<TabsContent value={activeTab}>
					<DownloadProfileList
						profiles={filteredProfiles}
						definitions={definitions}
						onEdit={(profile) => {
							const found = profiles.find((p) => p.id === profile.id);
							if (found) handleEditProfile(found);
						}}
						onDelete={(id) => deleteProfile.mutate(id)}
					/>
				</TabsContent>
			</Tabs>

			<Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
				<DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>
							{editingProfile ? "Edit Profile" : "Add Profile"}
						</DialogTitle>
					</DialogHeader>
					<DownloadProfileForm
						initialValues={
							editingProfile
								? {
										id: editingProfile.id,
										name: editingProfile.name,
										icon: editingProfile.icon,
										rootFolderPath: editingProfile.rootFolderPath,
										cutoff: editingProfile.cutoff,
										items: editingProfile.items,
										upgradeAllowed: editingProfile.upgradeAllowed,
										categories: editingProfile.categories,
										contentType: editingProfile.contentType as
											| "ebook"
											| "movie"
											| "tv"
											| "audiobook"
											| "manga",
										language: editingProfile.language,
										minCustomFormatScore: editingProfile.minCustomFormatScore,
										upgradeUntilCustomFormatScore:
											editingProfile.upgradeUntilCustomFormatScore,
									}
								: undefined
						}
						downloadFormats={definitions}
						serverCwd={serverCwd}
						onSubmit={
							editingProfile ? handleUpdateProfile : handleCreateProfile
						}
						onSubmitWithId={
							editingProfile ? undefined : handleCreateProfileWithCFs
						}
						onCancel={() => setProfileDialogOpen(false)}
						loading={profileLoading}
						serverError={activeMutation.error?.message}
					/>
				</DialogContent>
			</Dialog>
		</div>
	);
}
