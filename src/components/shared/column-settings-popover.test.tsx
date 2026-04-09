import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

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

	it("renders locked and toggleable columns", () => {
		const { getAllByRole, getByText } = renderWithProviders(
			<ColumnSettingsPopover tableId="books" />,
		);

		expect(getByText("Columns")).toBeInTheDocument();
		expect(getByText("Always")).toBeInTheDocument();
		expect(getAllByRole("switch")).toHaveLength(2);
	});

	it("persists hidden column toggles for visible and hidden columns", async () => {
		const user = userEvent.setup();
		const { getAllByRole } = renderWithProviders(
			<ColumnSettingsPopover tableId="books" />,
		);

		const switches = getAllByRole("switch");
		await user.click(switches[0]);
		await user.click(switches[1]);

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

	it("persists reordering and ignores no-op drag events", () => {
		renderWithProviders(<ColumnSettingsPopover tableId="books" />);

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
		const user = userEvent.setup();
		const { getByRole } = renderWithProviders(
			<ColumnSettingsPopover tableId="books" />,
		);

		await user.click(getByRole("button", { name: "Reset to defaults" }));

		expect(resetMutate).toHaveBeenCalledWith({ tableId: "books" });
	});
});
