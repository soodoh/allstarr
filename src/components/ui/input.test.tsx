import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import Input from "./input";

describe("Input", () => {
	it("renders the input slot, type, and custom classes", () => {
		const { getByRole } = renderWithProviders(
			<Input className="custom-input" type="email" />,
		);

		expect(getByRole("textbox")).toHaveAttribute("data-slot", "input");
		expect(getByRole("textbox")).toHaveAttribute("type", "email");
		expect(getByRole("textbox")).toHaveClass("custom-input");
	});

	it("forwards disabled and placeholder props", () => {
		const { getByPlaceholderText } = renderWithProviders(
			<Input disabled placeholder="Email" />,
		);

		expect(getByPlaceholderText("Email")).toBeDisabled();
	});
});
