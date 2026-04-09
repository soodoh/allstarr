import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		const onCancel = vi.fn();

		indexerFormMocks.validateForm.mockReturnValue({
			errors: { name: "Name is required" },
			success: false,
		});

		const { getByLabelText, getByRole, getByText } = renderWithProviders(
			<IndexerForm
				implementation="Newznab"
				onCancel={onCancel}
				onSubmit={onSubmit}
				protocol="usenet"
			/>,
		);

		await user.type(getByLabelText("Name"), "Ignored");
		await user.click(getByRole("button", { name: "Save" }));

		expect(indexerFormMocks.validateForm).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				apiKey: "",
				baseUrl: "",
				downloadClientId: null,
				tag: null,
			}),
		);
		expect(getByText("Name is required")).toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(onCancel).not.toHaveBeenCalled();
	});

	it("submits the mapped form values and preserves filtered download clients", async () => {
		const user = userEvent.setup();
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

		const { getByLabelText, getByRole } = renderWithProviders(
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

		await user.type(getByLabelText("Name"), "My Indexer");
		await user.type(getByLabelText("Base URL"), "https://indexer.example.com");
		await user.type(getByLabelText("API Key"), "secret");
		await user.clear(getByLabelText("Priority"));
		await user.type(getByLabelText("Priority"), "11");
		await user.clear(getByLabelText("Request Interval (s)"));
		await user.type(getByLabelText("Request Interval (s)"), "7");
		await user.clear(getByLabelText("Daily Query Limit"));
		await user.type(getByLabelText("Daily Query Limit"), "34");
		await user.clear(getByLabelText("Daily Grab Limit"));
		await user.type(getByLabelText("Daily Grab Limit"), "12");

		expect(getByRole("combobox")).toHaveTextContent("Usenet Client");
		expect(indexerFormMocks.categoryMultiSelect).toHaveBeenCalledWith(
			expect.objectContaining({
				value: [1000, 2000],
			}),
		);

		await user.click(getByRole("button", { name: "Save" }));

		expect(onSubmit).toHaveBeenCalledWith(expected);
	});

	it("cancels using the provided label", async () => {
		const user = userEvent.setup();
		const onCancel = vi.fn();

		const { getByRole } = renderWithProviders(
			<IndexerForm
				cancelLabel="Back"
				implementation="Torznab"
				onCancel={onCancel}
				onSubmit={vi.fn()}
				protocol="torrent"
			/>,
		);

		await user.click(getByRole("button", { name: "Back" }));

		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("shows the test connection success state", async () => {
		const user = userEvent.setup();

		indexerFormMocks.validateForm.mockReturnValue({
			errors: {},
			success: true,
		});
		indexerFormMocks.testIndexerFn.mockResolvedValue({
			message: "Connection OK",
			success: true,
			version: "1.2.3",
		});

		const { getByLabelText, getByRole, getByText, findByText } =
			renderWithProviders(
				<IndexerForm
					implementation="Newznab"
					onCancel={vi.fn()}
					onSubmit={vi.fn()}
					protocol="usenet"
				/>,
			);

		await user.type(getByLabelText("Base URL"), "https://indexer.example.com");
		await user.type(getByLabelText("API Key"), "secret");
		await user.click(getByRole("button", { name: "Test Connection" }));

		expect(indexerFormMocks.testIndexerFn).toHaveBeenCalledWith({
			data: {
				apiKey: "secret",
				apiPath: "/api",
				baseUrl: "https://indexer.example.com",
			},
		});
		expect(await findByText("Connection OK")).toBeInTheDocument();
		expect(getByText("Version: 1.2.3")).toBeInTheDocument();
	});

	it("shows the test connection error state", async () => {
		const user = userEvent.setup();

		indexerFormMocks.validateForm.mockReturnValue({
			errors: {},
			success: true,
		});
		indexerFormMocks.testIndexerFn.mockRejectedValue(
			new Error("Connection failed"),
		);

		const { getByLabelText, getByRole, findByText } = renderWithProviders(
			<IndexerForm
				implementation="Newznab"
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				protocol="usenet"
			/>,
		);

		await user.type(getByLabelText("Base URL"), "https://indexer.example.com");
		await user.type(getByLabelText("API Key"), "secret");
		await user.click(getByRole("button", { name: "Test Connection" }));

		expect(await findByText("Connection failed")).toBeInTheDocument();
	});
});
