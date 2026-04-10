import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("src/components/ui/popover", () => ({
	Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	PopoverContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	PopoverTrigger: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
}));

vi.mock("src/components/ui/command", () => ({
	Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CommandEmpty: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	CommandGroup: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	CommandInput: ({ placeholder }: { placeholder?: string }) => (
		<input aria-label={placeholder} placeholder={placeholder} />
	),
	CommandItem: ({
		children,
		onSelect,
		value,
	}: {
		children: ReactNode;
		onSelect?: (value: string) => void;
		value: string;
	}) => (
		<button type="button" onClick={() => onSelect?.(value)}>
			{children}
		</button>
	),
	CommandList: ({ children, id }: { children: ReactNode; id?: string }) => (
		<div id={id}>{children}</div>
	),
}));

import LanguageSingleSelect from "./language-single-select";

describe("LanguageSingleSelect", () => {
	it("shows the selected language label when the code is known", async () => {
		renderWithProviders(<LanguageSingleSelect onChange={vi.fn()} value="en" />);

		await expect
			.element(page.getByRole("combobox"))
			.toHaveTextContent("English");
	});

	it("falls back to the placeholder when the code is unknown", async () => {
		renderWithProviders(<LanguageSingleSelect onChange={vi.fn()} value="zz" />);

		await expect
			.element(page.getByRole("combobox"))
			.toHaveTextContent("Select language");
	});

	it("calls onChange with the selected language code", async () => {
		const onChange = vi.fn();

		renderWithProviders(
			<LanguageSingleSelect onChange={onChange} value="en" />,
		);

		await page.getByRole("button", { name: /French/i }).click();

		expect(onChange).toHaveBeenCalledWith("fr");
	});
});
