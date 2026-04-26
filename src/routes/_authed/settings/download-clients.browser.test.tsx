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

const downloadClientsRouteMocks = vi.hoisted(() => ({
	createDownloadClient: createMutation(),
	deleteDownloadClient: createMutation(),
	settingsMap: {
		"downloadClient.enableCompletedDownloadHandling": true,
		"downloadClient.redownloadFailed": true,
		"downloadClient.removeFailed": true,
	},
	updateDownloadClient: createMutation(),
	updateSettings: createMutation(),
	clients: [
		{
			apiKey: null,
			category: "books",
			enabled: true,
			host: "localhost",
			id: 1,
			implementation: "qBittorrent",
			name: "Main Client",
			password: null,
			port: 8080,
			priority: 1,
			protocol: "torrent",
			removeCompletedDownloads: true,
			settings: null,
			tag: null,
			urlBase: null,
			useSsl: false,
			username: null,
		},
	],
	queryClient: {
		invalidateQueries: vi.fn(),
	},
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			downloadClientsRouteMocks.useSuspenseQuery(...args),
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

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
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

vi.mock("src/components/ui/label", () => ({
	default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("src/components/ui/switch", () => ({
	default: ({
		checked,
		onCheckedChange,
	}: {
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
	}) => (
		<button
			data-checked={String(checked)}
			onClick={() => onCheckedChange(!checked)}
			type="button"
		>
			switch
		</button>
	),
}));

vi.mock(
	"src/components/settings/download-clients/download-client-form",
	() => ({
		default: ({
			initialValues,
			onCancel,
			onSubmit,
		}: {
			initialValues?: { implementation: string; name?: string };
			onCancel: () => void;
			onSubmit: (values: Record<string, unknown>) => void;
		}) => (
			<div data-testid="download-client-form">
				<div data-testid="download-client-form-implementation">
					{initialValues?.implementation ?? "new"}
				</div>
				<button
					type="button"
					onClick={() =>
						onSubmit({
							apiKey: "api",
							category: "books",
							enabled: true,
							host: "example.com",
							implementation: initialValues?.implementation ?? "qBittorrent",
							password: "",
							port: 8080,
							priority: 5,
							protocol: "torrent",
							removeCompletedDownloads: true,
							settings: null,
							tag: "",
							urlBase: "",
							username: "",
							useSsl: false,
							watchFolder: "watch",
							name: initialValues?.name ?? "Added client",
						})
					}
				>
					submit
				</button>
				<button type="button" onClick={onCancel}>
					cancel
				</button>
			</div>
		),
	}),
);

vi.mock(
	"src/components/settings/download-clients/download-client-list",
	() => ({
		default: ({
			clients,
			onDelete,
			onEdit,
		}: {
			clients: Array<{ id: number; name: string }>;
			onDelete: (id: number) => void;
			onEdit: (client: {
				id: number;
				implementation: string;
				name: string;
			}) => void;
		}) => (
			<div data-testid="download-client-list">
				{clients.map((client) => (
					<div key={client.id}>
						<span>{client.name}</span>
						<button
							type="button"
							onClick={() =>
								onEdit({
									id: client.id,
									implementation: "qBittorrent",
									name: client.name,
								})
							}
						>
							edit
						</button>
						<button type="button" onClick={() => onDelete(client.id)}>
							delete
						</button>
					</div>
				))}
			</div>
		),
	}),
);

vi.mock(
	"src/components/settings/download-clients/implementation-select",
	() => ({
		default: ({
			onCancel,
			onSelect,
		}: {
			onCancel: () => void;
			onSelect: (implementation: string) => void;
		}) => (
			<div data-testid="implementation-select">
				<button type="button" onClick={() => onSelect("qBittorrent")}>
					qBittorrent
				</button>
				<button type="button" onClick={() => onSelect("SABnzbd")}>
					SABnzbd
				</button>
				<button type="button" onClick={onCancel}>
					cancel
				</button>
			</div>
		),
	}),
);

vi.mock("src/hooks/mutations", () => ({
	useCreateDownloadClient: () => downloadClientsRouteMocks.createDownloadClient,
	useDeleteDownloadClient: () => downloadClientsRouteMocks.deleteDownloadClient,
	useUpdateDownloadClient: () => downloadClientsRouteMocks.updateDownloadClient,
	useUpdateSettings: () => downloadClientsRouteMocks.updateSettings,
}));

vi.mock("src/lib/queries", () => ({
	downloadClientsListQuery: () => ({ queryKey: ["download-clients", "list"] }),
	settingsMapQuery: () => ({ queryKey: ["settings", "map"] }),
}));

import { Route } from "./download-clients";

const RouteComponent = Route as unknown as { component: () => JSX.Element };

describe("download clients route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		downloadClientsRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey?: string[] }) => {
				if (query.queryKey?.[0] === "download-clients") {
					return { data: downloadClientsRouteMocks.clients };
				}
				return { data: downloadClientsRouteMocks.settingsMap };
			},
		);
	});

	it("loads both queries and saves settings from the current switches", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown>;
			component: () => JSX.Element;
		};

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["download-clients", "list"] }),
		);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["settings", "map"] }),
		);

		await renderWithProviders(<routeConfig.component />);

		await expect
			.element(page.getByTestId("page-header"))
			.toHaveTextContent("Download Clients");
		await expect
			.element(page.getByTestId("download-client-list"))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "switch" }).first().click();
		await page.getByRole("button", { name: "Save Settings" }).click();

		expect(
			downloadClientsRouteMocks.updateSettings.mutate,
		).toHaveBeenCalledWith([
			{
				key: "downloadClient.enableCompletedDownloadHandling",
				value: false,
			},
			{ key: "downloadClient.redownloadFailed", value: true },
			{ key: "downloadClient.removeFailed", value: true },
		]);
	});

	it("handles add, edit, and delete client flows", async () => {
		await renderWithProviders(<RouteComponent.component />);

		await page.getByRole("button", { name: "Add Client" }).click();
		await expect
			.element(page.getByTestId("implementation-select"))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "qBittorrent" }).click();
		await expect
			.element(page.getByTestId("download-client-form-implementation"))
			.toHaveTextContent("qBittorrent");
		await page.getByRole("button", { name: "submit" }).click();
		expect(
			downloadClientsRouteMocks.createDownloadClient.mutate,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Added client",
				settings: { watchFolder: "watch" },
				urlBase: null,
				username: null,
				password: null,
				apiKey: "api",
				tag: null,
			}),
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		await expect.element(page.getByTestId("dialog")).not.toBeInTheDocument();

		await page.getByRole("button", { name: "edit" }).click();
		await expect
			.element(page.getByTestId("download-client-form-implementation"))
			.toHaveTextContent("qBittorrent");
		await page.getByRole("button", { name: "submit" }).click();
		expect(
			downloadClientsRouteMocks.updateDownloadClient.mutate,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1,
				name: "Main Client",
				settings: { watchFolder: "watch" },
			}),
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		await expect.element(page.getByTestId("dialog")).not.toBeInTheDocument();

		await page.getByRole("button", { name: "delete" }).click();
		expect(
			downloadClientsRouteMocks.deleteDownloadClient.mutate,
		).toHaveBeenCalledWith(1);
	});
});
