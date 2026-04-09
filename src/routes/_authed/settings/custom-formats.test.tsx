import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const customFormatsRouteMocks = vi.hoisted(() => ({
	createCustomFormat: createMutation(),
	deleteCustomFormat: createMutation(),
	duplicateCustomFormat: createMutation(),
	exportCustomFormatsFn: vi.fn(async () => ({ customFormats: [] })),
	importCustomFormatsFn: vi.fn(async () => ({ imported: 2, skipped: 1 })),
	updateCustomFormat: createMutation(),
	customFormats: [
		{
			category: "Unwanted",
			defaultScore: -1000,
			description: "Rejects bad releases",
			contentTypes: ["movie"],
			id: 1,
			includeInRenaming: false,
			name: "Bad Rip",
			specifications: [{ name: "source", value: "cam" }],
		},
		{
			category: "Preferred",
			defaultScore: 1500,
			description: null,
			contentTypes: ["ebook", "audiobook"],
			id: 2,
			includeInRenaming: true,
			name: "Quality Audio",
			specifications: [],
		},
	],
	queryClient: {
		invalidateQueries: vi.fn(),
	},
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
	useQueryClient: vi.fn(),
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQueryClient: () => customFormatsRouteMocks.queryClient,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			customFormatsRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("sonner", () => ({
	toast: customFormatsRouteMocks.toast,
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
	DialogDescription: ({ children }: { children: ReactNode }) => (
		<p>{children}</p>
	),
	DialogFooter: ({ children }: { children: ReactNode }) => (
		<footer>{children}</footer>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		defaultValue,
		onBlur,
		onChange,
		placeholder,
		type,
		value,
	}: {
		defaultValue?: string | number;
		onBlur?: (event: { target: { value: string } }) => void;
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		type?: string;
		value?: string | number;
	}) => (
		<input
			defaultValue={defaultValue}
			onBlur={onBlur}
			onChange={onChange}
			placeholder={placeholder}
			type={type}
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

vi.mock("src/components/ui/sheet", () => ({
	Sheet: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="sheet">{children}</div> : null,
	SheetContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SheetDescription: ({ children }: { children: ReactNode }) => (
		<p>{children}</p>
	),
	SheetHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/settings/custom-formats/custom-format-form", () => ({
	default: ({
		initialValues,
		onCancel,
		onSubmit,
	}: {
		initialValues?: { id: number; name: string };
		onCancel: () => void;
		onSubmit: (values: Record<string, unknown>) => void;
	}) => (
		<div data-testid="custom-format-form">
			<div data-testid="custom-format-form-values">
				{initialValues ? initialValues.name : "new"}
			</div>
			<button
				type="button"
				onClick={() =>
					onSubmit({
						category: "Preferred",
						contentTypes: ["ebook"],
						defaultScore: 250,
						description: "Created from test",
						includeInRenaming: false,
						name: initialValues
							? `${initialValues.name} updated`
							: "Created format",
						specifications: [],
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
}));

vi.mock("src/components/settings/custom-formats/custom-format-list", () => ({
	default: ({
		customFormats,
		onDelete,
		onDuplicate,
		onEdit,
	}: {
		customFormats: Array<{ id: number; name: string }>;
		onDelete: (id: number) => void;
		onDuplicate: (id: number) => void;
		onEdit: (item: { id: number }) => void;
	}) => (
		<div data-testid="custom-format-list">
			<div data-testid="custom-format-list-count">{customFormats.length}</div>
			{customFormats.map((item) => (
				<div key={item.id}>
					<span>{item.name}</span>
					<button type="button" onClick={() => onEdit({ id: item.id })}>
						edit
					</button>
					<button type="button" onClick={() => onDuplicate(item.id)}>
						duplicate
					</button>
					<button type="button" onClick={() => onDelete(item.id)}>
						delete
					</button>
				</div>
			))}
		</div>
	),
}));

vi.mock("src/lib/query-keys", () => ({
	queryKeys: {
		customFormats: {
			all: ["custom-formats", "all"],
		},
	},
}));

vi.mock("src/lib/queries/custom-formats", () => ({
	customFormatsListQuery: () => ({ queryKey: ["custom-formats", "list"] }),
}));

vi.mock("src/hooks/mutations/custom-formats", () => ({
	useCreateCustomFormat: () => customFormatsRouteMocks.createCustomFormat,
	useDeleteCustomFormat: () => customFormatsRouteMocks.deleteCustomFormat,
	useDuplicateCustomFormat: () => customFormatsRouteMocks.duplicateCustomFormat,
	useUpdateCustomFormat: () => customFormatsRouteMocks.updateCustomFormat,
}));

vi.mock("src/server/custom-format-import-export", () => ({
	exportCustomFormatsFn: (...args: unknown[]) =>
		customFormatsRouteMocks.exportCustomFormatsFn(...(args as [])),
	importCustomFormatsFn: (...args: unknown[]) =>
		customFormatsRouteMocks.importCustomFormatsFn(...(args as [])),
}));

import { Route } from "./custom-formats";

const RouteComponent = Route as unknown as { component: () => JSX.Element };

describe("custom formats route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		customFormatsRouteMocks.useSuspenseQuery.mockReturnValue({
			data: customFormatsRouteMocks.customFormats,
		});
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			value: vi.fn(() => "blob:custom-formats"),
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			value: vi.fn(),
		});
	});

	it("loads the list query and disables export when empty", async () => {
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

		customFormatsRouteMocks.useSuspenseQuery.mockReturnValueOnce({ data: [] });

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["custom-formats", "list"],
			}),
		);

		renderWithProviders(<routeConfig.component />);

		expect(screen.getByTestId("custom-format-list-count")).toHaveTextContent(
			"0",
		);
		expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
	});

	it("handles add, edit, duplicate, delete, export, and import flows", async () => {
		renderWithProviders(<RouteComponent.component />);

		expect(screen.getByText("Bad Rip")).toBeInTheDocument();
		expect(screen.getByText("Quality Audio")).toBeInTheDocument();

		fireEvent.click(screen.getAllByRole("button", { name: "duplicate" })[0]);
		expect(
			customFormatsRouteMocks.duplicateCustomFormat.mutate,
		).toHaveBeenCalledWith(1);

		fireEvent.click(screen.getAllByRole("button", { name: "delete" })[0]);
		expect(
			customFormatsRouteMocks.deleteCustomFormat.mutate,
		).toHaveBeenCalledWith(1);

		fireEvent.click(screen.getByRole("button", { name: "Add Custom Format" }));
		expect(screen.getByTestId("sheet")).toBeInTheDocument();
		expect(screen.getByTestId("custom-format-form-values")).toHaveTextContent(
			"new",
		);
		fireEvent.click(screen.getByRole("button", { name: "submit" }));
		expect(
			customFormatsRouteMocks.createCustomFormat.mutate,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Created format",
			}),
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();

		fireEvent.click(screen.getAllByRole("button", { name: "edit" })[0]);
		expect(screen.getByTestId("custom-format-form-values")).toHaveTextContent(
			"Bad Rip",
		);
		fireEvent.click(screen.getByRole("button", { name: "submit" }));
		expect(
			customFormatsRouteMocks.updateCustomFormat.mutate,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1,
				name: "Bad Rip updated",
			}),
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(
			customFormatsRouteMocks.deleteCustomFormat.mutate,
		).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByRole("button", { name: "Export" }));
		await waitFor(() =>
			expect(
				customFormatsRouteMocks.exportCustomFormatsFn,
			).toHaveBeenCalledWith({
				data: { customFormatIds: [1, 2] },
			}),
		);
		expect(customFormatsRouteMocks.toast.success).toHaveBeenCalledWith(
			"Exported 2 custom format(s)",
		);

		const fileInput = screen
			.getByTestId("page-header")
			.parentElement?.querySelector('input[type="file"]');
		expect(fileInput).toBeTruthy();

		await fireEvent.change(fileInput as HTMLInputElement, {
			target: {
				files: [
					{
						name: "bad.json",
						text: async () => JSON.stringify({ bad: true }),
					},
				],
			},
		});
		await waitFor(() =>
			expect(customFormatsRouteMocks.toast.error).toHaveBeenCalledWith(
				"Invalid file: expected an array of custom formats",
			),
		);

		await fireEvent.change(fileInput as HTMLInputElement, {
			target: {
				files: [
					{
						name: "import.json",
						text: async () =>
							JSON.stringify({
								customFormats: [{ id: 9, name: "Imported format" }],
							}),
					},
				],
			},
		});

		await waitFor(() =>
			expect(screen.getByTestId("dialog")).toBeInTheDocument(),
		);
		fireEvent.click(screen.getByLabelText("Create copies"));
		fireEvent.click(screen.getAllByRole("button", { name: "Import" })[1]);

		await waitFor(() =>
			expect(
				customFormatsRouteMocks.importCustomFormatsFn,
			).toHaveBeenCalledWith({
				data: {
					customFormats: [{ id: 9, name: "Imported format" }],
					mode: "copy",
				},
			}),
		);
		expect(
			customFormatsRouteMocks.queryClient.invalidateQueries,
		).toHaveBeenCalledWith({
			queryKey: ["custom-formats", "all"],
		});
	});
});
