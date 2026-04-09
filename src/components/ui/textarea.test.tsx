import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import Textarea from "./textarea";

describe("Textarea", () => {
	it("renders the textarea slot and accepts custom classes", () => {
		const { getByRole } = renderWithProviders(
			<Textarea className="custom-textarea" />,
		);

		expect(getByRole("textbox")).toHaveAttribute("data-slot", "textarea");
		expect(getByRole("textbox")).toHaveClass("custom-textarea");
	});

	it("forwards placeholder and disabled props", () => {
		const { getByPlaceholderText } = renderWithProviders(
			<Textarea disabled placeholder="Notes" />,
		);

		expect(getByPlaceholderText("Notes")).toBeDisabled();
	});
});
