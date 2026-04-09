import { useState } from "react";
import { renderWithProviders } from "src/test/render";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "./select";

const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
const originalReleasePointerCapture =
	HTMLElement.prototype.releasePointerCapture;
const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

function SelectFixture({
	onValueChange,
}: {
	onValueChange?: (value: string) => void;
}) {
	const [value, setValue] = useState("beta");

	return (
		<Select
			onValueChange={(nextValue) => {
				setValue(nextValue);
				onValueChange?.(nextValue);
			}}
			value={value}
		>
			<SelectTrigger className="custom-trigger" size="sm">
				<SelectValue placeholder="Choose one" />
			</SelectTrigger>
			<SelectContent className="custom-content" position="popper">
				<SelectGroup>
					<SelectLabel className="custom-label">Letters</SelectLabel>
					<SelectItem value="alpha">Alpha</SelectItem>
					<SelectSeparator className="custom-separator" />
					<SelectItem value="beta">Beta</SelectItem>
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

describe("Select", () => {
	beforeAll(() => {
		HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
		HTMLElement.prototype.releasePointerCapture = vi.fn();
		HTMLElement.prototype.setPointerCapture = vi.fn();
		HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterAll(() => {
		HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
		HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
		HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
		HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
	});

	it("renders the trigger data slot and size variant", async () => {
		const { container } = await renderWithProviders(
			<Select>
				<SelectTrigger size="sm">
					<SelectValue placeholder="Choose one" />
				</SelectTrigger>
			</Select>,
		);

		expect(
			container.querySelector('[data-slot="select-trigger"]'),
		).toHaveAttribute("data-size", "sm");
	});

	it("renders content in a portal and updates the selected item", async () => {
		const onValueChange = vi.fn();

		const { container } = await renderWithProviders(
			<SelectFixture onValueChange={onValueChange} />,
		);

		await page.getByRole("combobox").click();
		await expect
			.element(page.getByRole("option", { name: "Alpha" }))
			.toBeInTheDocument();

		expect(container.querySelector('[data-slot="select-content"]')).toBeNull();
		expect(
			document.body.querySelector('[data-slot="select-content"]'),
		).toHaveClass("custom-content");
		expect(
			document.body.querySelector('[data-slot="select-group"]'),
		).toBeInTheDocument();
		expect(
			document.body.querySelector('[data-slot="select-label"]'),
		).toHaveClass("custom-label");
		expect(
			document.body.querySelector('[data-slot="select-separator"]'),
		).toHaveClass("custom-separator");
		expect(
			document.body.querySelector(
				'[data-slot="select-item"][data-state="checked"]',
			),
		).toHaveTextContent("Beta");

		await page.getByRole("option", { name: "Alpha" }).click();

		expect(onValueChange).toHaveBeenCalledWith("alpha");
		await expect.element(page.getByRole("combobox")).toHaveTextContent("Alpha");
		expect(
			document.body.querySelector('[data-slot="select-content"]'),
		).toBeNull();
	});
});
