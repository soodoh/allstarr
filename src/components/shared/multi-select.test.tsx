import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import MultiSelect from "./multi-select";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

describe("MultiSelect", () => {
	beforeAll(() => {
		HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterAll(() => {
		HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("adds items from the filtered list with keyboard selection", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();

		const { getByPlaceholderText, getByText } = renderWithProviders(
			<MultiSelect
				items={[
					{ key: "alpha", label: "Alpha", secondary: "A" },
					{ key: "beta", label: "Beta", secondary: "B" },
				]}
				onChange={onChange}
				value={[]}
			/>,
		);

		const input = getByPlaceholderText("Type to search...");
		await user.click(input);
		await user.keyboard("{ArrowDown}{Enter}");

		expect(onChange).toHaveBeenCalledWith(["beta"]);
		expect(getByText("Alpha")).toBeInTheDocument();
	});

	it("opens from typing, supports ArrowUp, and ignores enter when nothing matches", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();

		const { getByPlaceholderText, getByText } = renderWithProviders(
			<MultiSelect
				emptyMessage="Nothing found."
				items={[
					{ key: "alpha", label: "Alpha" },
					{ key: "beta", label: "Beta", secondary: "Target" },
				]}
				onChange={onChange}
				value={[]}
			/>,
		);

		const input = getByPlaceholderText("Type to search...");
		await user.type(input, "zzz");
		await user.keyboard("{ArrowUp}{Enter}");

		expect(getByText("Nothing found.")).toBeInTheDocument();
		expect(onChange).not.toHaveBeenCalled();
	});

	it("opens when the input changes while it is still closed", () => {
		const { getByPlaceholderText, getByText } = renderWithProviders(
			<MultiSelect
				emptyMessage="Nothing found."
				items={[
					{ key: "alpha", label: "Alpha" },
					{ key: "beta", label: "Beta", secondary: "Target" },
				]}
				value={[]}
			/>,
		);

		const input = getByPlaceholderText("Type to search...");
		fireEvent.change(input, { target: { value: "zzz" } });

		expect(getByText("Nothing found.")).toBeInTheDocument();
	});

	it("filters by search text and shows the empty message when nothing matches", async () => {
		const user = userEvent.setup();

		const { getByPlaceholderText, getByText } = renderWithProviders(
			<MultiSelect
				emptyMessage="Nothing found."
				items={[
					{ key: "alpha", label: "Alpha", secondary: "A" },
					{ key: "beta", label: "Beta", secondary: "B" },
				]}
				value={[]}
			/>,
		);

		const input = getByPlaceholderText("Type to search...");
		await user.type(input, "zzz");

		expect(getByText("Nothing found.")).toBeInTheDocument();
	});

	it("matches secondary text when selecting from the filtered list", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();

		const { getByPlaceholderText } = renderWithProviders(
			<MultiSelect
				items={[
					{ key: "alpha", label: "Alpha", secondary: "A" },
					{ key: "gamma", label: "Gamma", secondary: "Target" },
				]}
				onChange={onChange}
				value={[]}
			/>,
		);

		const input = getByPlaceholderText("Type to search...");
		await user.type(input, "target");
		await user.keyboard("{Enter}");

		expect(onChange).toHaveBeenCalledWith(["gamma"]);
	});

	it("filters items without secondary text", async () => {
		const user = userEvent.setup();

		const { getByPlaceholderText, getByText } = renderWithProviders(
			<MultiSelect
				emptyMessage="Nothing found."
				items={[
					{ key: "alpha", label: "Alpha" },
					{ key: "beta", label: "Beta", secondary: "Target" },
				]}
				value={[]}
			/>,
		);

		const input = getByPlaceholderText("Type to search...");
		await user.type(input, "zzz");

		expect(getByText("Nothing found.")).toBeInTheDocument();
	});

	it("falls back to the raw key when no display map is provided", () => {
		const { getByText } = renderWithProviders(
			<MultiSelect items={[{ key: 42, label: "Forty Two" }]} value={[42]} />,
		);

		expect(getByText("42")).toBeInTheDocument();
	});

	it("removes selected items and respects the minimum selection count", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();

		const { container, rerender } = renderWithProviders(
			<MultiSelect
				displayMap={
					new Map([
						["alpha", "Alpha"],
						["beta", "Beta"],
					])
				}
				items={[
					{ key: "alpha", label: "Alpha" },
					{ key: "beta", label: "Beta" },
				]}
				minItems={1}
				onChange={onChange}
				value={["alpha", "beta"]}
			/>,
		);

		const removeButtons = container.querySelectorAll("button.ml-0\\.5");
		expect(removeButtons).toHaveLength(2);

		await user.click(removeButtons[0] as HTMLButtonElement);

		expect(onChange).toHaveBeenCalledWith(["beta"]);

		rerender(
			<MultiSelect
				displayMap={new Map([["beta", "Beta"]])}
				items={[{ key: "beta", label: "Beta" }]}
				minItems={1}
				onChange={onChange}
				value={["beta"]}
			/>,
		);

		expect(container.querySelector("button.ml-0\\.5")).toBeNull();
	});

	it("emits remove events only when the minimum selection count allows it", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();

		const { container, rerender } = renderWithProviders(
			<MultiSelect
				items={[{ key: "alpha", label: "Alpha" }]}
				minItems={0}
				onChange={onChange}
				value={["alpha"]}
			/>,
		);

		await user.click(
			container.querySelector("button.ml-0\\.5") as HTMLButtonElement,
		);
		expect(onChange).toHaveBeenCalledWith([]);

		rerender(
			<MultiSelect
				items={[{ key: "alpha", label: "Alpha" }]}
				minItems={1}
				onChange={onChange}
				value={["alpha"]}
			/>,
		);

		expect(container.querySelector("button.ml-0\\.5")).toBeNull();
	});

	it("uses the mouse handlers when a visible option is selected", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();

		const { getByPlaceholderText, getByRole } = renderWithProviders(
			<MultiSelect
				items={[
					{ key: "alpha", label: "Alpha" },
					{ key: "beta", label: "Beta", secondary: "Target" },
				]}
				onChange={onChange}
				value={[]}
			/>,
		);

		const input = getByPlaceholderText("Type to search...");
		await user.click(input);
		await user.hover(getByRole("button", { name: "BetaTarget" }));
		await user.click(getByRole("button", { name: "BetaTarget" }));

		expect(onChange).toHaveBeenCalledWith(["beta"]);
	});

	it("closes on escape and outside clicks", async () => {
		const user = userEvent.setup();

		const { getByPlaceholderText, queryByText } = renderWithProviders(
			<div>
				<MultiSelect
					items={[
						{ key: "alpha", label: "Alpha" },
						{ key: "beta", label: "Beta" },
					]}
					value={[]}
				/>
				<button type="button">Outside</button>
			</div>,
		);

		const input = getByPlaceholderText("Type to search...");
		await user.click(input);
		expect(queryByText("Alpha")).toBeInTheDocument();

		await user.keyboard("{Escape}");
		expect(queryByText("Alpha")).not.toBeInTheDocument();

		await user.click(input);
		expect(queryByText("Alpha")).toBeInTheDocument();

		await user.click(document.body);
		expect(queryByText("Alpha")).not.toBeInTheDocument();
	});

	it("stays disabled without placeholder text or an open list", () => {
		const { getByRole, queryByText } = renderWithProviders(
			<MultiSelect
				disabled
				displayMap={new Map([["alpha", "Alpha"]])}
				items={[{ key: "alpha", label: "Alpha" }]}
				value={["alpha"]}
			/>,
		);

		expect(getByRole("textbox")).toHaveAttribute("placeholder", "");
		expect(queryByText("Alpha")).toBeInTheDocument();
	});
});
