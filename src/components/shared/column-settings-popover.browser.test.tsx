import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const { dndContextSpy, resetMutate, tableColumnsState, upsertMutate } =
	vi.hoisted(() => ({
		dndContextSpy: vi.fn(),
		resetMutate: vi.fn(),
		tableColumnsState: {
			allColumns: [
				{ key: "title", label: "Title", locked: true },
				{ key: "author", label: "Author" },
				{ key: "series", label: "Series" },
			],
			columnOrder: ["title", "author", "series"],
			hiddenColumnKeys: ["series"],
			hiddenKeys: new Set(["series"]),
			visibleColumns: [
				{ key: "title", label: "Title", locked: true },
				{ key: "author", label: "Author" },
			],
		},
		upsertMutate: vi.fn(),
	}));

vi.mock("@dnd-kit/core", () => ({
	DndContext: ({
		children,
		...props
	}: {
		children: ReactNode;
		onDragEnd?: (event: {
			active: { id: string };
			over: { id: string } | null;
		}) => void;
	}) => {
		dndContextSpy(props);
		return <div>{children}</div>;
	},
	KeyboardSensor: function KeyboardSensor() {},
	PointerSensor: function PointerSensor() {},
	closestCenter: vi.fn(),
	useSensor: vi.fn(() => ({})),
	useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
	SortableContext: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	arrayMove: (items: string[], from: number, to: number) => {
		const next = [...items];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		return next;
	},
	sortableKeyboardCoordinates: vi.fn(),
	useSortable: ({ id }: { id: string }) => ({
		attributes: { "data-sortable-id": id },
		isDragging: false,
		listeners: {},
		setNodeRef: vi.fn(),
		transform: null,
		transition: undefined,
	}),
	verticalListSortingStrategy: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
	CSS: {
		Transform: {
			toString: () => undefined,
		},
	},
}));

vi.mock("src/components/ui/popover", () => ({
	Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	PopoverContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	PopoverHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	PopoverTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
	PopoverTrigger: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
}));

vi.mock("src/components/ui/switch", () => ({
	default: ({
		checked,
		onCheckedChange,
	}: {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<button
			aria-checked={checked}
			onClick={() => onCheckedChange?.(!checked)}
			role="switch"
			type="button"
		/>
	),
}));

vi.mock("src/hooks/use-table-columns", () => ({
	useTableColumns: () => tableColumnsState,
}));

vi.mock("src/hooks/mutations/user-settings", () => ({
	useResetColumnSettings: () => ({
		mutate: resetMutate,
	}),
	useUpsertUserSettings: () => ({
		mutate: upsertMutate,
	}),
}));

import ColumnSettingsPopover from "./column-settings-popover";

describe("ColumnSettingsPopover", () => {
	afterEach(() => {
		dndContextSpy.mockClear();
		resetMutate.mockClear();
		upsertMutate.mockClear();
		tableColumnsState.allColumns = [
			{ key: "title", label: "Title", locked: true },
			{ key: "author", label: "Author" },
			{ key: "series", label: "Series" },
		];
		tableColumnsState.columnOrder = ["title", "author", "series"];
		tableColumnsState.hiddenColumnKeys = ["series"];
		tableColumnsState.hiddenKeys = new Set(["series"]);
		tableColumnsState.visibleColumns = [
			{ key: "title", label: "Title", locked: true },
			{ key: "author", label: "Author" },
		];
	});

	it("renders locked and toggleable columns", async () => {
		renderWithProviders(<ColumnSettingsPopover tableId="books" />);

		await expect.element(page.getByText("Columns")).toBeInTheDocument();
		await expect.element(page.getByText("Always")).toBeInTheDocument();
		expect(await page.getByRole("switch").all()).toHaveLength(2);
	});

	it("persists hidden column toggles for visible and hidden columns", async () => {
		await renderWithProviders(<ColumnSettingsPopover tableId="books" />);

		// Wait for the component to be rendered before collecting all switches
		await expect.element(page.getByText("Columns")).toBeInTheDocument();
		const switches = await page.getByRole("switch").all();
		await switches[0].click();
		await switches[1].click();

		expect(upsertMutate).toHaveBeenNthCalledWith(1, {
			columnOrder: ["title", "author", "series"],
			hiddenColumns: ["series", "author"],
			tableId: "books",
		});
		expect(upsertMutate).toHaveBeenNthCalledWith(2, {
			columnOrder: ["title", "author", "series"],
			hiddenColumns: [],
			tableId: "books",
		});
	});

	it("persists reordering and ignores no-op drag events", async () => {
		await renderWithProviders(<ColumnSettingsPopover tableId="books" />);

		const props = dndContextSpy.mock.calls.at(-1)?.[0] as {
			onDragEnd: (event: {
				active: { id: string };
				over: { id: string } | null;
			}) => void;
		};

		props.onDragEnd({
			active: { id: "title" },
			over: { id: "author" },
		});
		props.onDragEnd({
			active: { id: "author" },
			over: { id: "author" },
		});
		props.onDragEnd({
			active: { id: "author" },
			over: null,
		});

		expect(upsertMutate).toHaveBeenCalledTimes(1);
		expect(upsertMutate).toHaveBeenCalledWith({
			columnOrder: ["author", "title", "series"],
			hiddenColumns: ["series"],
			tableId: "books",
		});
	});

	it("resets column settings", async () => {
		renderWithProviders(<ColumnSettingsPopover tableId="books" />);

		await page.getByRole("button", { name: "Reset to defaults" }).click();

		expect(resetMutate).toHaveBeenCalledWith({ tableId: "books" });
	});
});
