import { renderWithProviders } from "src/test/render";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import MultiSelect from "./multi-select";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

describe("MultiSelect", () => {
	beforeAll(() => {
		HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterAll(() => {
		HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
	});

	it("adds items from the filtered list with keyboard selection", async () => {
		const onChange = vi.fn();

		renderWithProviders(
			<MultiSelect
				items={[
					{ key: "alpha", label: "Alpha", secondary: "A" },
					{ key: "beta", label: "Beta", secondary: "B" },
				]}
				onChange={onChange}
				value={[]}
			/>,
		);

		await page.getByPlaceholder("Type to search...").click();
		await userEvent.keyboard("{ArrowDown}{Enter}");

		expect(onChange).toHaveBeenCalledWith(["beta"]);
		await expect.element(page.getByText("Alpha")).toBeInTheDocument();
	});

	it("opens from typing, supports ArrowUp, and ignores enter when nothing matches", async () => {
		const onChange = vi.fn();

		renderWithProviders(
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

		await page.getByPlaceholder("Type to search...").fill("zzz");
		await userEvent.keyboard("{ArrowUp}{Enter}");

		await expect.element(page.getByText("Nothing found.")).toBeInTheDocument();
		expect(onChange).not.toHaveBeenCalled();
	});

	it("opens when the input changes while it is still closed", async () => {
		renderWithProviders(
			<MultiSelect
				emptyMessage="Nothing found."
				items={[
					{ key: "alpha", label: "Alpha" },
					{ key: "beta", label: "Beta", secondary: "Target" },
				]}
				value={[]}
			/>,
		);

		await page.getByPlaceholder("Type to search...").fill("zzz");

		await expect.element(page.getByText("Nothing found.")).toBeInTheDocument();
	});

	it("filters by search text and shows the empty message when nothing matches", async () => {
		renderWithProviders(
			<MultiSelect
				emptyMessage="Nothing found."
				items={[
					{ key: "alpha", label: "Alpha", secondary: "A" },
					{ key: "beta", label: "Beta", secondary: "B" },
				]}
				value={[]}
			/>,
		);

		await page.getByPlaceholder("Type to search...").fill("zzz");

		await expect.element(page.getByText("Nothing found.")).toBeInTheDocument();
	});

	it("matches secondary text when selecting from the filtered list", async () => {
		const onChange = vi.fn();

		renderWithProviders(
			<MultiSelect
				items={[
					{ key: "alpha", label: "Alpha", secondary: "A" },
					{ key: "gamma", label: "Gamma", secondary: "Target" },
				]}
				onChange={onChange}
				value={[]}
			/>,
		);

		await page.getByPlaceholder("Type to search...").fill("target");
		await userEvent.keyboard("{Enter}");

		expect(onChange).toHaveBeenCalledWith(["gamma"]);
	});

	it("filters items without secondary text", async () => {
		renderWithProviders(
			<MultiSelect
				emptyMessage="Nothing found."
				items={[
					{ key: "alpha", label: "Alpha" },
					{ key: "beta", label: "Beta", secondary: "Target" },
				]}
				value={[]}
			/>,
		);

		await page.getByPlaceholder("Type to search...").fill("zzz");

		await expect.element(page.getByText("Nothing found.")).toBeInTheDocument();
	});

	it("falls back to the raw key when no display map is provided", async () => {
		renderWithProviders(
			<MultiSelect items={[{ key: 42, label: "Forty Two" }]} value={[42]} />,
		);

		await expect.element(page.getByText("42")).toBeInTheDocument();
	});

	it("removes selected items and respects the minimum selection count", async () => {
		const onChange = vi.fn();

		const { container, rerender } = await renderWithProviders(
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

		await (removeButtons[0] as HTMLButtonElement).click();

		expect(onChange).toHaveBeenCalledWith(["beta"]);

		await rerender(
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
		const onChange = vi.fn();

		const { container, rerender } = await renderWithProviders(
			<MultiSelect
				items={[{ key: "alpha", label: "Alpha" }]}
				minItems={0}
				onChange={onChange}
				value={["alpha"]}
			/>,
		);

		await (
			container.querySelector("button.ml-0\\.5") as HTMLButtonElement
		).click();
		expect(onChange).toHaveBeenCalledWith([]);

		await rerender(
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
		const onChange = vi.fn();

		renderWithProviders(
			<MultiSelect
				items={[
					{ key: "alpha", label: "Alpha" },
					{ key: "beta", label: "Beta", secondary: "Target" },
				]}
				onChange={onChange}
				value={[]}
			/>,
		);

		await page.getByPlaceholder("Type to search...").click();
		await page.getByRole("button", { name: "BetaTarget" }).hover();
		await page.getByRole("button", { name: "BetaTarget" }).click();

		expect(onChange).toHaveBeenCalledWith(["beta"]);
	});

	it("closes on escape and outside clicks", async () => {
		renderWithProviders(
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

		await page.getByPlaceholder("Type to search...").click();
		await expect.element(page.getByText("Alpha")).toBeInTheDocument();

		await userEvent.keyboard("{Escape}");
		await expect.element(page.getByText("Alpha")).not.toBeInTheDocument();

		await page.getByPlaceholder("Type to search...").click();
		await expect.element(page.getByText("Alpha")).toBeInTheDocument();

		await userEvent.click(document.body);
		await expect.element(page.getByText("Alpha")).not.toBeInTheDocument();
	});

	it("stays disabled without placeholder text or an open list", async () => {
		renderWithProviders(
			<MultiSelect
				disabled
				displayMap={new Map([["alpha", "Alpha"]])}
				items={[{ key: "alpha", label: "Alpha" }]}
				value={["alpha"]}
			/>,
		);

		await expect
			.element(page.getByRole("textbox"))
			.toHaveAttribute("placeholder", "");
		await expect.element(page.getByText("Alpha")).toBeInTheDocument();
	});
});
