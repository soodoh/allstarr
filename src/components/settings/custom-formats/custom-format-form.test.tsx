import { renderWithProviders } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type { Spec } from "./specification-builder";

const customFormatFormMocks = vi.hoisted(() => ({
	specificationBuilder: vi.fn(),
	validateForm: vi.fn(),
}));

vi.mock("src/components/settings/custom-formats/specification-builder", () => ({
	default: ({
		onChange,
		value,
	}: {
		onChange: (specs: unknown[]) => void;
		value: unknown[];
	}) => {
		customFormatFormMocks.specificationBuilder({ onChange, value });
		return (
			<button
				onClick={() =>
					onChange([
						...value,
						{
							name: "Release Group",
							negate: false,
							required: true,
							type: "releaseGroup",
							value: "TRaSH",
						},
					])
				}
				type="button"
			>
				Add Spec
			</button>
		);
	},
}));

vi.mock("src/lib/form-validation", () => ({
	default: (...args: unknown[]) => customFormatFormMocks.validateForm(...args),
}));

import CustomFormatForm from "./custom-format-form";

describe("CustomFormatForm", () => {
	beforeEach(() => {
		customFormatFormMocks.specificationBuilder.mockReset();
		customFormatFormMocks.validateForm.mockReset();
	});

	afterEach(() => {
		customFormatFormMocks.specificationBuilder.mockReset();
		customFormatFormMocks.validateForm.mockReset();
	});

	it("submits the validated payload with the edited fields", async () => {
		const onCancel = vi.fn();
		const onSubmit = vi.fn();

		customFormatFormMocks.validateForm.mockImplementation(
			(_schema, values: Record<string, unknown>) => ({
				data: values,
				errors: null,
				success: true,
			}),
		);

		const initialSpec = {
			name: "Release Title",
			negate: false,
			required: true,
			type: "releaseTitle",
			value: "foo",
		} satisfies Spec;

		await renderWithProviders(
			<CustomFormatForm
				initialValues={{
					category: "Unwanted",
					contentTypes: ["ebook"],
					defaultScore: 1_500,
					description: null,
					id: 7,
					includeInRenaming: false,
					name: "Movie Block",
					specifications: [initialSpec],
				}}
				onCancel={onCancel}
				onSubmit={onSubmit}
			/>,
		);

		expect(customFormatFormMocks.specificationBuilder).toHaveBeenCalledWith(
			expect.objectContaining({
				value: [initialSpec],
			}),
		);

		await page.getByRole("button", { name: "Add Spec" }).click();
		await page.getByLabelText("Movie").click();
		await page.getByLabelText("Include in Renaming").click();
		await page.getByLabelText("Name").clear();
		await page.getByLabelText("Name").fill("Updated Movie Block");
		await page.getByLabelText("Default Score").clear();
		await page.getByLabelText("Default Score").fill("1700");
		await page.getByLabelText("Description").clear();
		await page.getByLabelText("Description").fill("Matched release groups");

		await page.getByRole("button", { name: "Save" }).click();

		expect(customFormatFormMocks.validateForm).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				category: "Unwanted",
				contentTypes: ["ebook", "movie"],
				defaultScore: 1_700,
				description: "Matched release groups",
				includeInRenaming: true,
				name: "Updated Movie Block",
				specifications: [
					initialSpec,
					expect.objectContaining({
						name: "Release Group",
						negate: false,
						required: true,
						type: "releaseGroup",
						value: "TRaSH",
					}),
				],
			}),
		);
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				category: "Unwanted",
				contentTypes: ["ebook", "movie"],
				defaultScore: 1_700,
				description: "Matched release groups",
				includeInRenaming: true,
				name: "Updated Movie Block",
			}),
		);
		expect(onCancel).not.toHaveBeenCalled();
	});

	it("shows validation errors and server errors without submitting", async () => {
		const onCancel = vi.fn();
		const onSubmit = vi.fn();

		customFormatFormMocks.validateForm.mockReturnValue({
			data: null,
			errors: { name: "Name is required" },
			success: false,
		});

		await renderWithProviders(
			<CustomFormatForm
				onCancel={onCancel}
				onSubmit={onSubmit}
				serverError="Backend rejected the format"
			/>,
		);

		await page.getByRole("button", { name: "Save" }).click();

		await expect
			.element(page.getByText("Name is required"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Backend rejected the format"))
			.toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();

		await page.getByRole("button", { name: "Cancel" }).click();

		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("disables submit while loading", async () => {
		await renderWithProviders(
			<CustomFormatForm loading onCancel={vi.fn()} onSubmit={vi.fn()} />,
		);

		await expect
			.element(page.getByRole("button", { name: "Saving..." }))
			.toBeDisabled();
	});
});
