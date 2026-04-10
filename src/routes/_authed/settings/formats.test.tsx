import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

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

const formatsRouteMocks = vi.hoisted(() => ({
	createDownloadFormat: createMutation(),
	deleteDownloadFormat: createMutation(),
	queryClient: {
		invalidateQueries: vi.fn(),
	},
	settingsMap: {
		"format.audiobook.defaultDuration": 600,
		"format.ebook.defaultPageCount": 300,
		"format.movie.defaultRuntime": 130,
		"format.tv.defaultEpisodeRuntime": 45,
	},
	updateDownloadFormat: createMutation(),
	updateSettingFn: vi.fn(async () => undefined),
	useQueryClient: vi.fn(),
	useSuspenseQuery: vi.fn(),
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
		{
			color: "green",
			contentTypes: ["ebook"],
			defaultScore: 5,
			description: "Book releases",
			id: 2,
			includeInRenaming: true,
			maxSize: 0,
			minSize: 0,
			noMaxLimit: 1,
			noPreferredLimit: 0,
			preferredSize: 0,
			resolution: 0,
			source: null,
			title: "Epub",
			weight: 50,
		},
	],
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQueryClient: () => formatsRouteMocks.queryClient,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			formatsRouteMocks.useSuspenseQuery(...args),
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

vi.mock("src/components/ui/input", () => ({
	default: ({
		defaultValue,
		id,
		onBlur,
		onChange,
		placeholder,
		value,
	}: {
		defaultValue?: string | number;
		id?: string;
		onBlur?: (event: { target: { value: string } }) => void;
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		value?: string | number;
	}) => (
		<input
			defaultValue={defaultValue}
			id={id}
			onBlur={onBlur}
			onChange={onChange}
			placeholder={placeholder}
			value={value}
		/>
	),
}));

vi.mock("src/components/ui/label", () => ({
	default: ({
		children,
		htmlFor,
	}: {
		children: ReactNode;
		htmlFor?: string;
	}) => <label htmlFor={htmlFor}>{children}</label>,
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
	"src/components/settings/download-formats/download-format-form",
	() => ({
		default: ({
			defaultContentTypes,
			initialValues,
			onCancel,
			onSubmit,
		}: {
			defaultContentTypes: string[];
			initialValues?: { id?: number; title?: string };
			onCancel: () => void;
			onSubmit: (values: Record<string, unknown>) => void;
		}) => (
			<div data-testid="download-format-form">
				<div data-testid="download-format-form-defaults">
					{(defaultContentTypes ?? []).join(",")}
				</div>
				<div data-testid="download-format-form-initial">
					{initialValues?.title ?? "new"}
				</div>
				<button
					type="button"
					onClick={() =>
						onSubmit({
							color: "gray",
							contentTypes: defaultContentTypes,
							maxSize: 10,
							minSize: 0,
							noMaxLimit: 0,
							noPreferredLimit: 0,
							preferredSize: 5,
							resolution: 1080,
							source: "Bluray",
							title: initialValues?.title ?? "Created format",
							weight: 100,
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
	"src/components/settings/download-formats/download-format-list",
	() => ({
		default: ({
			definitions,
			onDelete,
			onEdit,
		}: {
			definitions: Array<{ id: number; title: string }>;
			onDelete: (id: number) => void;
			onEdit: (definition: { id: number; title: string }) => void;
		}) => (
			<div data-testid="download-format-list">
				{definitions.map((definition) => (
					<div key={definition.id}>
						<span>{definition.title}</span>
						<button type="button" onClick={() => onEdit(definition)}>
							edit
						</button>
						<button type="button" onClick={() => onDelete(definition.id)}>
							delete
						</button>
					</div>
				))}
			</div>
		),
	}),
);

vi.mock("src/hooks/mutations", () => ({
	useCreateDownloadFormat: () => formatsRouteMocks.createDownloadFormat,
	useDeleteDownloadFormat: () => formatsRouteMocks.deleteDownloadFormat,
	useUpdateDownloadFormat: () => formatsRouteMocks.updateDownloadFormat,
}));

vi.mock("src/lib/queries", () => ({
	downloadFormatsListQuery: () => ({ queryKey: ["download-formats", "list"] }),
	settingsMapQuery: () => ({ queryKey: ["settings", "map"] }),
}));

vi.mock("src/lib/query-keys", () => ({
	queryKeys: {
		settings: {
			all: ["settings", "all"],
		},
	},
}));

vi.mock("src/server/settings", () => ({
	updateSettingFn: (...args: unknown[]) =>
		formatsRouteMocks.updateSettingFn(...(args as [])),
}));

import { Route } from "./formats";

const RouteComponent = Route as unknown as { component: () => JSX.Element };

describe("formats route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		activeTabsValue = "all";
		activeTabsChange = undefined;
		formatsRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey?: string[] }) => {
				if (query.queryKey?.[0] === "download-formats") {
					return { data: formatsRouteMocks.definitions };
				}
				return { data: formatsRouteMocks.settingsMap };
			},
		);
	});

	it("loads both queries, filters by tab and search, and updates defaults", async () => {
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
			expect.objectContaining({ queryKey: ["download-formats", "list"] }),
		);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["settings", "map"] }),
		);

		await renderWithProviders(<routeConfig.component />);

		await expect.element(page.getByText("Bluray")).toBeInTheDocument();
		await expect.element(page.getByText("Epub")).toBeInTheDocument();

		await page.getByPlaceholder("Search formats...").fill("ep");
		await expect.element(page.getByText("Bluray")).not.toBeInTheDocument();
		await expect.element(page.getByText("Epub")).toBeInTheDocument();

		await page.getByPlaceholder("Search formats...").clear();
		await page.getByRole("button", { name: "Movie" }).click();
		await expect
			.element(page.getByTestId("download-format-list"))
			.toHaveTextContent("Bluray");
		await expect.element(page.getByText("Epub")).not.toBeInTheDocument();

		const movieDefaultLocator = page.getByLabelText("Default Movie Runtime");
		await userEvent.clear(movieDefaultLocator);
		await userEvent.type(movieDefaultLocator, "131");
		await userEvent.tab();
		await expect
			.poll(() => formatsRouteMocks.updateSettingFn)
			.toHaveBeenCalledWith({
				data: { key: "format.movie.defaultRuntime", value: 131 },
			});
		expect(
			formatsRouteMocks.queryClient.invalidateQueries,
		).toHaveBeenCalledWith({
			queryKey: ["settings", "all"],
		});
	});

	it("opens add and edit dialogs with the expected content types", async () => {
		await renderWithProviders(<RouteComponent.component />);

		await page.getByRole("button", { name: "Add Format" }).click();
		await expect
			.element(page.getByTestId("download-format-form-defaults"))
			.toHaveTextContent("ebook");
		await page.getByRole("button", { name: "submit" }).click();
		expect(formatsRouteMocks.createDownloadFormat.mutate).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Created format",
			}),
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		await expect.element(page.getByTestId("dialog")).not.toBeInTheDocument();

		await page.getByRole("button", { name: "edit" }).first().click();
		await expect
			.element(page.getByTestId("download-format-form-initial"))
			.toHaveTextContent("Bluray");
		await page.getByRole("button", { name: "submit" }).click();
		expect(formatsRouteMocks.updateDownloadFormat.mutate).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1,
				title: "Bluray",
			}),
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		await expect.element(page.getByTestId("dialog")).not.toBeInTheDocument();

		await page.getByRole("button", { name: "delete" }).first().click();
		expect(formatsRouteMocks.deleteDownloadFormat.mutate).toHaveBeenCalledWith(
			1,
		);
	});
});
