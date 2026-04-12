import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const indexerFormMocks = vi.hoisted(() => ({
	categoryMultiSelect: vi.fn(),
	testIndexerFn: vi.fn(),
	validateForm: vi.fn(),
}));

vi.mock("src/components/shared/category-multi-select", () => ({
	default: ({
		disabled,
		onChange,
		value,
	}: {
		disabled?: boolean;
		onChange?: (value: number[]) => void;
		value: number[];
	}) => {
		indexerFormMocks.categoryMultiSelect({ disabled, onChange, value });
		return <div data-testid="category-multi-select" />;
	},
}));

vi.mock("src/lib/form-validation", () => ({
	default: (...args: unknown[]) => indexerFormMocks.validateForm(...args),
}));

vi.mock("src/server/indexers", () => ({
	testIndexerFn: (...args: unknown[]) =>
		indexerFormMocks.testIndexerFn(...args),
}));

import IndexerForm, { type IndexerFormValues } from "./indexer-form";

describe("IndexerForm", () => {
	beforeEach(() => {
		indexerFormMocks.categoryMultiSelect.mockReset();
		indexerFormMocks.testIndexerFn.mockReset();
		indexerFormMocks.validateForm.mockReset();
	});

	it("shows validation errors and does not submit when validation fails", async () => {
		const onSubmit = vi.fn();
		const onCancel = vi.fn();

		indexerFormMocks.validateForm.mockReturnValue({
			errors: { name: "Name is required" },
			success: false,
		});

		await renderWithProviders(
			<IndexerForm
				implementation="Newznab"
				onCancel={onCancel}
				onSubmit={onSubmit}
				protocol="usenet"
			/>,
		);

		await page.getByLabelText("Name").fill("Ignored");
		await page.getByRole("button", { name: "Save" }).click();

		expect(indexerFormMocks.validateForm).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				apiKey: "",
				baseUrl: "",
				downloadClientId: null,
				tag: null,
			}),
		);
		await expect
			.element(page.getByText("Name is required"))
			.toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(onCancel).not.toHaveBeenCalled();
	});

	it("submits the mapped form values and preserves filtered download clients", async () => {
		const onSubmit = vi.fn();

		indexerFormMocks.validateForm.mockReturnValue({
			errors: {},
			success: true,
		});

		const expected: IndexerFormValues = {
			apiKey: "secret",
			apiPath: "/api",
			baseUrl: "https://indexer.example.com",
			categories: [1000, 2000],
			dailyGrabLimit: 12,
			dailyQueryLimit: 34,
			downloadClientId: 2,
			enableAutomaticSearch: false,
			enableInteractiveSearch: true,
			enableRss: true,
			implementation: "Newznab",
			name: "My Indexer",
			priority: 11,
			protocol: "usenet",
			requestInterval: 7_000,
			tag: "movies",
		};

		await renderWithProviders(
			<IndexerForm
				downloadClients={[
					{ id: 2, name: "Usenet Client", protocol: "usenet" },
					{ id: 3, name: "Torrent Client", protocol: "torrent" },
				]}
				initialValues={{
					categories: [1000, 2000],
					dailyGrabLimit: 12,
					dailyQueryLimit: 34,
					downloadClientId: 2,
					enableAutomaticSearch: false,
					enableInteractiveSearch: true,
					enableRss: true,
					requestInterval: 7,
					tag: "movies",
				}}
				implementation="Newznab"
				onCancel={vi.fn()}
				onSubmit={onSubmit}
				protocol="usenet"
			/>,
		);

		await page.getByLabelText("Name").fill("My Indexer");
		await page.getByLabelText("Base URL").fill("https://indexer.example.com");
		await page.getByLabelText("API Key").fill("secret");
		await page.getByLabelText("Priority").clear();
		await page.getByLabelText("Priority").fill("11");
		await page.getByLabelText("Request Interval (s)").clear();
		await page.getByLabelText("Request Interval (s)").fill("7");
		await page.getByLabelText("Daily Query Limit").clear();
		await page.getByLabelText("Daily Query Limit").fill("34");
		await page.getByLabelText("Daily Grab Limit").clear();
		await page.getByLabelText("Daily Grab Limit").fill("12");

		await expect
			.element(page.getByRole("combobox"))
			.toHaveTextContent("Usenet Client");
		expect(indexerFormMocks.categoryMultiSelect).toHaveBeenCalledWith(
			expect.objectContaining({
				value: [1000, 2000],
			}),
		);

		await page.getByRole("button", { name: "Save" }).click();

		expect(onSubmit).toHaveBeenCalledWith(expected);
	});

	it("cancels using the provided label", async () => {
		const onCancel = vi.fn();

		await renderWithProviders(
			<IndexerForm
				cancelLabel="Back"
				implementation="Torznab"
				onCancel={onCancel}
				onSubmit={vi.fn()}
				protocol="torrent"
			/>,
		);

		await page.getByRole("button", { name: "Back" }).click();

		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("shows the test connection success state", async () => {
		indexerFormMocks.validateForm.mockReturnValue({
			errors: {},
			success: true,
		});
		indexerFormMocks.testIndexerFn.mockResolvedValue({
			message: "Connection OK",
			success: true,
			version: "1.2.3",
		});

		await renderWithProviders(
			<IndexerForm
				implementation="Newznab"
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				protocol="usenet"
			/>,
		);

		await page.getByLabelText("Base URL").fill("https://indexer.example.com");
		await page.getByLabelText("API Key").fill("secret");
		await page.getByRole("button", { name: "Test Connection" }).click();

		expect(indexerFormMocks.testIndexerFn).toHaveBeenCalledWith({
			data: {
				apiKey: "secret",
				apiPath: "/api",
				baseUrl: "https://indexer.example.com",
			},
		});
		await expect.element(page.getByText("Connection OK")).toBeInTheDocument();
		await expect.element(page.getByText("Version: 1.2.3")).toBeInTheDocument();
	});

	it("shows the test connection error state", async () => {
		indexerFormMocks.validateForm.mockReturnValue({
			errors: {},
			success: true,
		});
		indexerFormMocks.testIndexerFn.mockRejectedValue(
			new Error("Connection failed"),
		);

		await renderWithProviders(
			<IndexerForm
				implementation="Newznab"
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				protocol="usenet"
			/>,
		);

		await page.getByLabelText("Base URL").fill("https://indexer.example.com");
		await page.getByLabelText("API Key").fill("secret");
		await page.getByRole("button", { name: "Test Connection" }).click();

		await expect
			.element(page.getByText("Connection failed"))
			.toBeInTheDocument();
	});
});
