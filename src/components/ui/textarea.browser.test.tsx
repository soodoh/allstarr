import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import Textarea from "./textarea";

describe("Textarea", () => {
	it("renders the textarea slot and accepts custom classes", async () => {
		await renderWithProviders(<Textarea className="custom-textarea" />);

		await expect
			.element(page.getByRole("textbox"))
			.toHaveAttribute("data-slot", "textarea");
		await expect
			.element(page.getByRole("textbox"))
			.toHaveClass("custom-textarea");
	});

	it("forwards placeholder and disabled props", async () => {
		await renderWithProviders(<Textarea disabled placeholder="Notes" />);

		await expect.element(page.getByPlaceholder("Notes")).toBeDisabled();
	});
});
