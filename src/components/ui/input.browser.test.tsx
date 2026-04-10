import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import Input from "./input";

describe("Input", () => {
	it("renders the input slot, type, and custom classes", async () => {
		await renderWithProviders(<Input className="custom-input" type="email" />);

		await expect
			.element(page.getByRole("textbox"))
			.toHaveAttribute("data-slot", "input");
		await expect
			.element(page.getByRole("textbox"))
			.toHaveAttribute("type", "email");
		await expect.element(page.getByRole("textbox")).toHaveClass("custom-input");
	});

	it("forwards disabled and placeholder props", async () => {
		await renderWithProviders(<Input disabled placeholder="Email" />);

		await expect.element(page.getByPlaceholder("Email")).toBeDisabled();
	});
});
