import type { DragEndEvent } from "@dnd-kit/core";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const tierGroupListMocks = vi.hoisted(() => ({
	dndContext: vi.fn(),
}));

vi.mock("@dnd-kit/core", () => ({
	DndContext: ({
		children,
		...props
	}: {
		children: ReactNode;
		onDragEnd?: (event: DragEndEvent) => void;
	}) => {
		tierGroupListMocks.dndContext(props);
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
	arrayMove: <T,>(items: T[], from: number, to: number) => {
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

vi.mock("src/components/ui/tooltip", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TooltipContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	TooltipProvider: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import TierGroupList from "./tier-group-list";

const downloadFormats = [
	{ contentTypes: ["ebook"], id: 1, title: "EPUB" },
	{ contentTypes: ["ebook"], id: 2, title: "PDF" },
	{ contentTypes: ["ebook"], id: 3, title: "MOBI" },
];

describe("TierGroupList", () => {
	afterEach(() => {
		tierGroupListMocks.dndContext.mockClear();
	});

	it("shows the empty state when no groups exist", () => {
		const { getByText } = renderWithProviders(
			<TierGroupList
				cutoff={0}
				downloadFormats={downloadFormats}
				items={[]}
				onChange={vi.fn()}
				onRemoveFormat={vi.fn()}
				upgradeAllowed={false}
			/>,
		);

		expect(
			getByText("No formats added. Use the search above to add formats."),
		).toBeInTheDocument();
	});

	it("supports splitting, merging, removing, cutoff labeling, and drag reordering", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		const onRemoveFormat = vi.fn();
		const { container, getByText } = renderWithProviders(
			<TierGroupList
				cutoff={2}
				downloadFormats={downloadFormats}
				items={[[1, 2], [3]]}
				onChange={onChange}
				onRemoveFormat={onRemoveFormat}
				upgradeAllowed
			/>,
		);

		const rows = container.querySelectorAll("div.rounded-md.border.px-3.py-2");
		expect(rows).toHaveLength(2);
		expect(getByText("Cutoff")).toBeInTheDocument();

		const firstRowButtons = within(rows[0] as HTMLDivElement).getAllByRole(
			"button",
		);
		const secondRowButtons = within(rows[1] as HTMLDivElement).getAllByRole(
			"button",
		);

		await user.click(firstRowButtons[1]);
		expect(onRemoveFormat).toHaveBeenCalledWith(1);

		await user.click(firstRowButtons[firstRowButtons.length - 1]);
		expect(onChange).toHaveBeenLastCalledWith([[1], [2], [3]]);

		await user.click(secondRowButtons[1]);
		expect(onChange).toHaveBeenLastCalledWith([[1, 2, 3]]);

		await user.click(secondRowButtons[2]);
		expect(onRemoveFormat).toHaveBeenLastCalledWith(3);

		const dndProps = tierGroupListMocks.dndContext.mock.calls.at(-1)?.[0] as {
			onDragEnd: (event: DragEndEvent) => void;
		};
		dndProps.onDragEnd({
			active: { id: "group-1-2" },
			over: { id: "group-3" },
		} as DragEndEvent);

		expect(onChange).toHaveBeenLastCalledWith([[3], [1, 2]]);
	});
});
