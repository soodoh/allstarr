import type { ComponentProps } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const downloadFormatFormMocks = vi.hoisted(() => ({
	validateForm: vi.fn(),
}));

vi.mock("src/lib/form-validation", () => ({
	default: (...args: unknown[]) =>
		downloadFormatFormMocks.validateForm(...args),
}));

import DownloadFormatForm from "./download-format-form";

type DownloadFormatFormProps = ComponentProps<typeof DownloadFormatForm>;
type DownloadFormatValues = NonNullable<
	DownloadFormatFormProps["initialValues"]
>;

const baseValues = {
	title: "Video Cut",
	weight: 3,
	color: "blue",
	minSize: 5,
	maxSize: 55,
	preferredSize: 25,
	noMaxLimit: 1,
	noPreferredLimit: 0,
	contentTypes: ["movie"],
	source: "Web",
	resolution: 720,
} satisfies DownloadFormatValues;

function makeValues(
	overrides: Partial<DownloadFormatValues> = {},
): DownloadFormatValues {
	return {
		...baseValues,
		...overrides,
		contentTypes: overrides.contentTypes ?? baseValues.contentTypes,
	};
}

describe("DownloadFormatForm", () => {
	afterEach(() => {
		downloadFormatFormMocks.validateForm.mockReset();
	});

	it("shows video-only fields and submits the validated payload", async () => {
		const onCancel = vi.fn();
		const onSubmit = vi.fn();
		downloadFormatFormMocks.validateForm.mockReturnValue({
			success: true,
			data: null,
			errors: null,
		} as never);

		await renderWithProviders(
			<DownloadFormatForm
				defaultContentTypes={["ebook"]}
				initialValues={makeValues()}
				onCancel={onCancel}
				onSubmit={onSubmit}
			/>,
		);

		await expect.element(page.getByLabelText("Source")).toBeInTheDocument();
		await expect.element(page.getByLabelText("Resolution")).toBeInTheDocument();

		const spinbuttons = await page.getByRole("spinbutton").elements();
		const maxLimitInput = spinbuttons[3];
		expect(maxLimitInput).toHaveValue(55);
		expect(maxLimitInput).toBeDisabled();

		await page.getByLabelText("No Limit").click();

		expect(maxLimitInput).toHaveValue(1000);
		expect(maxLimitInput).toBeEnabled();

		await page.getByRole("button", { name: "Save" }).click();

		expect(downloadFormatFormMocks.validateForm).toHaveBeenCalledTimes(1);
		expect(
			downloadFormatFormMocks.validateForm.mock.calls[0]?.[1],
		).toMatchObject({
			title: "Video Cut",
			weight: 3,
			color: "blue",
			minSize: 5,
			maxSize: 1000,
			preferredSize: 25,
			noMaxLimit: 0,
			noPreferredLimit: 0,
			contentTypes: ["movie"],
			source: "Web",
			resolution: 720,
		});
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Video Cut",
				maxSize: 1000,
				noMaxLimit: 0,
				source: "Web",
				resolution: 720,
			}),
		);
		expect(onCancel).not.toHaveBeenCalled();
	});

	it("renders validation errors and blocks submission", async () => {
		const onSubmit = vi.fn();
		downloadFormatFormMocks.validateForm.mockReturnValue({
			success: false,
			data: null,
			errors: { title: "Title is required" },
		} as never);

		await renderWithProviders(
			<DownloadFormatForm
				defaultContentTypes={["ebook"]}
				onCancel={vi.fn()}
				onSubmit={onSubmit}
			/>,
		);

		await page.getByRole("button", { name: "Save" }).click();

		expect(downloadFormatFormMocks.validateForm).toHaveBeenCalledTimes(1);
		expect(onSubmit).not.toHaveBeenCalled();
		await expect
			.element(page.getByText("Title is required"))
			.toBeInTheDocument();
	});

	it("calls onCancel when the dialog is dismissed", async () => {
		const onCancel = vi.fn();

		await renderWithProviders(
			<DownloadFormatForm
				defaultContentTypes={["ebook"]}
				onCancel={onCancel}
				onSubmit={vi.fn()}
			/>,
		);

		await page.getByRole("button", { name: "Cancel" }).click();

		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
