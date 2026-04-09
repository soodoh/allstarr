import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./dialog";

describe("Dialog", () => {
	it("renders content in a portal and applies public slots and classes", () => {
		renderWithProviders(
			<Dialog open>
				<DialogTrigger asChild>
					<button type="button">Open dialog</button>
				</DialogTrigger>
				<DialogContent className="custom-content" showCloseButton={false}>
					<DialogHeader className="custom-header">
						<DialogTitle className="custom-title">Title</DialogTitle>
						<DialogDescription className="custom-description">
							Description
						</DialogDescription>
					</DialogHeader>
					<DialogBody className="custom-body">Body</DialogBody>
				</DialogContent>
			</Dialog>,
		);

		expect(
			document.body.querySelector('[data-slot="dialog-trigger"]'),
		).toHaveTextContent("Open dialog");
		expect(
			document.body.querySelector('[data-slot="dialog-overlay"]'),
		).toBeInTheDocument();
		expect(
			document.body.querySelector('[data-slot="dialog-content"]'),
		).toHaveClass("custom-content");
		expect(
			document.body.querySelector('[data-slot="dialog-header"]'),
		).toHaveClass("custom-header");
		expect(
			document.body.querySelector('[data-slot="dialog-title"]'),
		).toHaveClass("custom-title");
		expect(
			document.body.querySelector('[data-slot="dialog-description"]'),
		).toHaveClass("custom-description");
		expect(
			document.body.querySelector('[data-slot="dialog-body"]'),
		).toHaveClass("custom-body");
		expect(
			document.body.querySelector('[data-slot="dialog-close"]'),
		).not.toBeInTheDocument();
	});

	it("renders the default close button and forwards close requests", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();

		renderWithProviders(
			<Dialog open onOpenChange={onOpenChange}>
				<DialogContent>
					<p>Dialog body</p>
				</DialogContent>
			</Dialog>,
		);

		const closeButton = document.body.querySelector(
			'[data-slot="dialog-close"]',
		);
		expect(closeButton).toBeInTheDocument();
		await user.click(closeButton as HTMLElement);

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("renders the footer close affordance when enabled", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();

		renderWithProviders(
			<Dialog open onOpenChange={onOpenChange}>
				<DialogContent showCloseButton={false}>
					<DialogFooter showCloseButton>
						<p>Footer actions</p>
					</DialogFooter>
				</DialogContent>
			</Dialog>,
		);

		const footerCloseButton = document.body.querySelector(
			'[data-slot="dialog-footer"] button',
		);
		expect(footerCloseButton).toHaveTextContent("Close");
		await user.click(footerCloseButton as HTMLElement);

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
