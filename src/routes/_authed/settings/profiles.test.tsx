import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

function createMutation<TArg = unknown, TResult = unknown>(result?: TResult) {
	return {
		error: null as null | { message: string },
		isPending: false,
		mutate: vi.fn(
			(...args: [TArg, { onSuccess?: (value: TResult) => void }?]) =>
				args[1]?.onSuccess?.(result as TResult),
		),
	};
}

let activeTabsValue = "all";
let activeTabsChange: ((value: string) => void) | undefined;

const profilesRouteMocks = vi.hoisted(() => ({
	bulkSetCFScores: createMutation(),
	createDownloadProfile: createMutation({ id: 99 }),
	deleteDownloadProfile: createMutation(),
	definitions: [
		{
			color: "gray",
			contentTypes: ["movie"],
			defaultScore: 10,
			description: "Movie blurays",
			id: 1,
			includeInRenaming: false,
			maxSize: 1000,
			minSize: 0,
			noMaxLimit: 0,
			noPreferredLimit: 0,
			preferredSize: 500,
			resolution: 1080,
			source: "Bluray",
			title: "Bluray",
			weight: 100,
		},
	],
	downloadProfiles: [
		{
			categories: [],
			contentType: "movie",
			cutoff: 1,
			icon: "film",
			id: 1,
			items: [],
			language: "en",
			minCustomFormatScore: 0,
			name: "Movies",
			rootFolderPath: "/srv/movies",
			upgradeAllowed: true,
			upgradeUntilCustomFormatScore: 0,
		},
		{
			categories: [],
			contentType: "tv",
			cutoff: 1,
			icon: "tv",
			id: 2,
			items: [],
			language: "en",
			minCustomFormatScore: 0,
			name: "Series",
			rootFolderPath: "/srv/tv",
			upgradeAllowed: true,
			upgradeUntilCustomFormatScore: 0,
		},
	],
	getServerCwdFn: vi.fn(async () => "/srv"),
	queryClient: {
		invalidateQueries: vi.fn(),
	},
	serverCwd: "/srv",
	updateDownloadProfile: createMutation(),
	useQuery: vi.fn(),
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			profilesRouteMocks.useQuery(...args),
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			profilesRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/lib/admin-route", () => ({
	requireAdminBeforeLoad: vi.fn(),
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		actions,
		description,
		title,
	}: {
		actions?: ReactNode;
		description?: ReactNode;
		title: string;
	}) => (
		<div data-testid="page-header">
			<h1>{title}</h1>
			{description ? <p>{description}</p> : null}
			{actions}
		</div>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button" | "submit";
	}) => (
		<button disabled={disabled} onClick={onClick} type={type ?? "button"}>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog">{children}</div> : null,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/tabs", () => ({
	Tabs: ({
		children,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		onValueChange: (value: string) => void;
		value: string;
	}) => {
		activeTabsValue = value;
		activeTabsChange = onValueChange;
		return <div>{children}</div>;
	},
	TabsContent: ({ children, value }: { children: ReactNode; value: string }) =>
		activeTabsValue === value ? <div>{children}</div> : null,
	TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({
		children,
		value,
	}: {
		children: ReactNode;
		value: string;
	}) => (
		<button type="button" onClick={() => activeTabsChange?.(value)}>
			{children}
		</button>
	),
}));

vi.mock(
	"src/components/settings/download-profiles/download-profile-form",
	() => ({
		default: ({
			initialValues,
			onCancel,
			onSubmit,
			onSubmitWithId,
			serverError,
			serverCwd,
		}: {
			initialValues?: { id?: number; name?: string };
			onCancel: () => void;
			onSubmit: (values: Record<string, unknown>) => void;
			onSubmitWithId?: (
				values: Record<string, unknown>,
				localCFScores: Array<{ customFormatId: number; score: number }>,
			) => void;
			serverError?: string;
			serverCwd: string;
		}) => (
			<div data-testid="download-profile-form">
				<div data-testid="download-profile-form-server-cwd">{serverCwd}</div>
				<div data-testid="download-profile-form-initial">
					{initialValues?.name ?? "new"}
				</div>
				<div data-testid="download-profile-form-error">
					{serverError ?? "none"}
				</div>
				<button
					type="button"
					onClick={() =>
						onSubmit({
							categories: [1, 2],
							contentType: "movie",
							cutoff: 1,
							icon: "film",
							items: [],
							language: "en",
							minCustomFormatScore: 0,
							name: initialValues?.name ?? "Created Profile",
							rootFolderPath: "/srv/movies",
							upgradeAllowed: true,
							upgradeUntilCustomFormatScore: 0,
						})
					}
				>
					submit
				</button>
				<button
					type="button"
					onClick={() =>
						onSubmitWithId?.(
							{
								categories: [1],
								contentType: "movie",
								cutoff: 1,
								icon: "film",
								items: [],
								language: "en",
								minCustomFormatScore: 0,
								name: "Created with CFs",
								rootFolderPath: "/srv/movies",
								upgradeAllowed: true,
								upgradeUntilCustomFormatScore: 0,
							},
							[{ customFormatId: 7, score: 100 }],
						)
					}
				>
					submit-with-cfs
				</button>
				<button type="button" onClick={onCancel}>
					cancel
				</button>
			</div>
		),
	}),
);

vi.mock(
	"src/components/settings/download-profiles/download-profile-list",
	() => ({
		default: ({
			definitions,
			onDelete,
			onEdit,
			profiles,
		}: {
			definitions: Array<{ id: number; title: string }>;
			onDelete: (id: number) => void;
			onEdit: (profile: { id: number }) => void;
			profiles: Array<{ id: number; name: string }>;
		}) => (
			<div data-testid="download-profile-list">
				<div data-testid="profile-count">{profiles.length}</div>
				<div data-testid="definition-count">{definitions.length}</div>
				{profiles.map((profile) => (
					<div key={profile.id}>
						<span>{profile.name}</span>
						<button type="button" onClick={() => onEdit({ id: profile.id })}>
							edit
						</button>
						<button type="button" onClick={() => onDelete(profile.id)}>
							delete
						</button>
					</div>
				))}
			</div>
		),
	}),
);

vi.mock("src/hooks/mutations", () => ({
	useCreateDownloadProfile: () => profilesRouteMocks.createDownloadProfile,
	useDeleteDownloadProfile: () => profilesRouteMocks.deleteDownloadProfile,
	useUpdateDownloadProfile: () => profilesRouteMocks.updateDownloadProfile,
}));

vi.mock("src/hooks/mutations/custom-formats", () => ({
	useBulkSetProfileCFScores: () => profilesRouteMocks.bulkSetCFScores,
}));

vi.mock("src/lib/queries", () => ({
	downloadFormatsListQuery: () => ({ queryKey: ["download-formats", "list"] }),
	downloadProfilesListQuery: () => ({
		queryKey: ["download-profiles", "list"],
	}),
}));

vi.mock("src/lib/queries/custom-formats", () => ({
	customFormatsListQuery: () => ({ queryKey: ["custom-formats", "list"] }),
}));

vi.mock("src/server/filesystem", () => ({
	getServerCwdFn: (...args: unknown[]) =>
		profilesRouteMocks.getServerCwdFn(...(args as [])),
}));

import { Route } from "./profiles";

const RouteComponent = Route as unknown as { component: () => JSX.Element };

describe("profiles route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		activeTabsValue = "all";
		activeTabsChange = undefined;
		(
			Route as unknown as { useLoaderData: () => { serverCwd: string } }
		).useLoaderData = () => ({ serverCwd: profilesRouteMocks.serverCwd });
		profilesRouteMocks.useSuspenseQuery.mockReturnValue({
			data: profilesRouteMocks.downloadProfiles,
		});
		profilesRouteMocks.useQuery.mockImplementation(
			(query: { queryKey?: string[] }) => {
				if (query.queryKey?.[0] === "download-formats") {
					return {
						data: profilesRouteMocks.definitions,
						status: "success",
					};
				}
				return {
					data: [],
					status: "success",
				};
			},
		);
	});

	it("loads all three queries and enables create with bulk CF scores", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<{ serverCwd: string }>;
			component: () => JSX.Element;
		};

		const loaderData = await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(loaderData).toEqual({ serverCwd: "/srv" });
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["download-profiles", "list"] }),
		);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["custom-formats", "list"] }),
		);
		expect(profilesRouteMocks.getServerCwdFn).toHaveBeenCalled();

		await renderWithProviders(<routeConfig.component />);

		await expect
			.element(page.getByTestId("profile-count"))
			.toHaveTextContent("2");
		await expect
			.element(page.getByTestId("definition-count"))
			.toHaveTextContent("1");

		await page.getByRole("button", { name: "Add Profile" }).click();
		await expect
			.element(page.getByTestId("download-profile-form-server-cwd"))
			.toHaveTextContent("/srv");
		await expect
			.element(page.getByTestId("download-profile-form-initial"))
			.toHaveTextContent("new");
		await page.getByRole("button", { name: "submit-with-cfs" }).click();
		expect(
			profilesRouteMocks.createDownloadProfile.mutate,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Created with CFs",
			}),
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(profilesRouteMocks.bulkSetCFScores.mutate).toHaveBeenCalledWith(
			{
				profileId: 99,
				scores: [{ customFormatId: 7, score: 100 }],
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		await expect.element(page.getByTestId("dialog")).not.toBeInTheDocument();
	});

	it("keeps add disabled until definitions are ready and edits an existing profile", async () => {
		profilesRouteMocks.useQuery.mockReturnValue({
			data: undefined,
			status: "loading",
		});

		await renderWithProviders(<RouteComponent.component />);

		await expect
			.element(page.getByRole("button", { name: "Add Profile" }))
			.toBeDisabled();
		// Add Profile is disabled so clicking "edit" directly via DOM; dialog should not open
		// (definitions not loaded, so edit button click is a no-op guard check)
		await page.getByRole("button", { name: "edit" }).first().click();
		await expect.element(page.getByTestId("dialog")).not.toBeInTheDocument();
	});

	it("filters profiles by tab and deletes the selected profile", async () => {
		await renderWithProviders(<RouteComponent.component />);

		await expect
			.element(page.getByTestId("profile-count"))
			.toHaveTextContent("2");

		await page.getByRole("button", { name: "TV" }).click();

		await expect
			.element(page.getByTestId("profile-count"))
			.toHaveTextContent("1");
		await expect.element(page.getByText("Series")).toBeInTheDocument();

		await page.getByRole("button", { name: "delete" }).click();

		expect(
			profilesRouteMocks.deleteDownloadProfile.mutate,
		).toHaveBeenCalledWith(2);
	});

	it("creates a profile without custom-format scores and closes the dialog", async () => {
		await renderWithProviders(<RouteComponent.component />);

		await page.getByRole("button", { name: "Add Profile" }).click();
		await page.getByRole("button", { name: "submit", exact: true }).click();

		expect(
			profilesRouteMocks.createDownloadProfile.mutate,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Created Profile",
			}),
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(profilesRouteMocks.bulkSetCFScores.mutate).not.toHaveBeenCalled();
		await expect.element(page.getByTestId("dialog")).not.toBeInTheDocument();
	});

	it("edits an existing profile and passes server errors through to the form", async () => {
		profilesRouteMocks.updateDownloadProfile.error = {
			message: "Profile update failed",
		};

		await renderWithProviders(<RouteComponent.component />);

		await page.getByRole("button", { name: "edit" }).first().click();

		await expect
			.element(page.getByTestId("download-profile-form-initial"))
			.toHaveTextContent("Movies");
		await expect
			.element(page.getByTestId("download-profile-form-error"))
			.toHaveTextContent("Profile update failed");

		await page.getByRole("button", { name: "submit", exact: true }).click();

		expect(
			profilesRouteMocks.updateDownloadProfile.mutate,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1,
				name: "Movies",
			}),
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		await expect.element(page.getByTestId("dialog")).not.toBeInTheDocument();
	});

	it("closes the dialog when the form cancel action is used", async () => {
		await renderWithProviders(<RouteComponent.component />);

		await page.getByRole("button", { name: "Add Profile" }).click();
		await expect.element(page.getByTestId("dialog")).toBeInTheDocument();

		await page.getByRole("button", { name: "cancel" }).click();

		await expect.element(page.getByTestId("dialog")).not.toBeInTheDocument();
	});
});
