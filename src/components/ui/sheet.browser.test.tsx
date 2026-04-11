import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "./sheet";

describe("Sheet", () => {
	it("renders content in a portal with the default right-side layout", async () => {
		await renderWithProviders(
			<Sheet open>
				<SheetContent className="custom-content">
					<SheetHeader className="custom-header">
						<SheetTitle className="custom-title">Sheet title</SheetTitle>
						<SheetDescription className="custom-description">
							Sheet description
						</SheetDescription>
					</SheetHeader>
				</SheetContent>
			</Sheet>,
		);

		expect(
			document.body.querySelector('[data-slot="sheet-overlay"]'),
		).toBeInTheDocument();
		expect(
			document.body.querySelector('[data-slot="sheet-content"]'),
		).toHaveClass(
			"custom-content",
			"inset-y-0",
			"right-0",
			"h-full",
			"w-3/4",
			"border-l",
		);
		expect(
			document.body.querySelector('[data-slot="sheet-header"]'),
		).toHaveClass("custom-header");
		expect(
			document.body.querySelector('[data-slot="sheet-title"]'),
		).toHaveClass("custom-title");
		expect(
			document.body.querySelector('[data-slot="sheet-description"]'),
		).toHaveClass("custom-description");
		expect(
			document.body.querySelector('[data-slot="sheet-content"] button'),
		).toBeInTheDocument();
	});

	it.each([
		["left", "inset-y-0", "left-0", "h-full", "w-3/4", "border-r"],
		["top", "inset-x-0", "top-0", "h-auto", "border-b"],
		["bottom", "inset-x-0", "bottom-0", "h-auto", "border-t"],
	])("applies the %s side layout classes", async (side, ...expectedClasses) => {
		await renderWithProviders(
			<Sheet open>
				<SheetContent
					side={side as "top" | "right" | "bottom" | "left"}
					showCloseButton={false}
					aria-describedby={undefined}
				>
					<SheetTitle className="sr-only">Sheet</SheetTitle>
					<p>Sheet body</p>
				</SheetContent>
			</Sheet>,
		);

		expect(
			document.body.querySelector('[data-slot="sheet-content"]'),
		).toHaveClass(...expectedClasses);
		expect(
			document.body.querySelector('[data-slot="sheet-content"] button'),
		).not.toBeInTheDocument();
	});

	it("forwards close requests when the close button is visible", async () => {
		const onOpenChange = vi.fn();

		await renderWithProviders(
			<Sheet open onOpenChange={onOpenChange}>
				<SheetContent aria-describedby={undefined}>
					<SheetTitle className="sr-only">Sheet</SheetTitle>
					<p>Sheet body</p>
				</SheetContent>
			</Sheet>,
		);

		const closeButton = document.body.querySelector(
			'[data-slot="sheet-content"] button',
		);
		expect(closeButton).toBeInTheDocument();
		await page.getByRole("button").click();

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
