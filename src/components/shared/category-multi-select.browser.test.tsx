import { CATEGORY_MAP, INDEXER_CATEGORIES } from "src/lib/categories";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const { multiSelectSpy } = vi.hoisted(() => ({
	multiSelectSpy: vi.fn(),
}));

vi.mock("src/components/shared/multi-select", () => ({
	default: (props: unknown) => {
		multiSelectSpy(props);
		return <div data-testid="mock-multi-select" />;
	},
}));

import CategoryMultiSelect from "./category-multi-select";

describe("CategoryMultiSelect", () => {
	it("passes the expected category items and defaults to MultiSelect", async () => {
		const onChange = vi.fn();

		renderWithProviders(
			<CategoryMultiSelect onChange={onChange} value={[1000, 2000]} />,
		);

		await expect
			.element(page.getByTestId("mock-multi-select"))
			.toBeInTheDocument();
		expect(multiSelectSpy).toHaveBeenCalledTimes(1);

		const props = multiSelectSpy.mock.calls[0]?.[0] as {
			disabled: boolean;
			displayMap: typeof CATEGORY_MAP;
			emptyMessage: string;
			items: Array<{ key: number; label: string; secondary: string }>;
			onChange: typeof onChange;
			placeholder: string;
			value: number[];
		};

		expect(props.value).toEqual([1000, 2000]);
		expect(props.onChange).toBe(onChange);
		expect(props.disabled).toBe(false);
		expect(props.displayMap).toBe(CATEGORY_MAP);
		expect(props.placeholder).toBe("Type to search categories...");
		expect(props.emptyMessage).toBe("No categories found.");
		expect(props.items).toHaveLength(INDEXER_CATEGORIES.length);
		expect(props.items[0]).toEqual({
			key: 1000,
			label: "Console",
			secondary: "1000",
		});
	});

	it("forwards the disabled state", async () => {
		multiSelectSpy.mockClear();
		await renderWithProviders(<CategoryMultiSelect disabled value={[]} />);

		const props = multiSelectSpy.mock.calls.at(-1)?.[0] as {
			disabled: boolean;
		};
		expect(props.disabled).toBe(true);
	});
});
