import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
		const user = userEvent.setup();
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

		const { getByLabelText, getByRole } = renderWithProviders(
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

		await user.click(getByRole("button", { name: "Add Spec" }));
		await user.click(getByLabelText("Movie"));
		await user.click(getByLabelText("Include in Renaming"));
		await user.clear(getByLabelText("Name"));
		await user.type(getByLabelText("Name"), "Updated Movie Block");
		await user.clear(getByLabelText("Default Score"));
		await user.type(getByLabelText("Default Score"), "1700");
		await user.clear(getByLabelText("Description"));
		await user.type(getByLabelText("Description"), "Matched release groups");

		await user.click(getByRole("button", { name: "Save" }));

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
		const user = userEvent.setup();
		const onCancel = vi.fn();
		const onSubmit = vi.fn();

		customFormatFormMocks.validateForm.mockReturnValue({
			data: null,
			errors: { name: "Name is required" },
			success: false,
		});

		const { getByRole, getByText } = renderWithProviders(
			<CustomFormatForm
				onCancel={onCancel}
				onSubmit={onSubmit}
				serverError="Backend rejected the format"
			/>,
		);

		await user.click(getByRole("button", { name: "Save" }));

		expect(getByText("Name is required")).toBeInTheDocument();
		expect(getByText("Backend rejected the format")).toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();

		await user.click(getByRole("button", { name: "Cancel" }));

		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("disables submit while loading", () => {
		const { getByRole } = renderWithProviders(
			<CustomFormatForm loading onCancel={vi.fn()} onSubmit={vi.fn()} />,
		);

		expect(getByRole("button", { name: "Saving..." })).toBeDisabled();
	});
});
