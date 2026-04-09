import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const downloadClientFormMocks = vi.hoisted(() => ({
	testDownloadClientFn: vi.fn(),
	useMutation: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useMutation: (...args: Parameters<typeof actual.useMutation>) =>
			downloadClientFormMocks.useMutation(...args),
	};
});

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type = "button",
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button" | "submit" | "reset";
	}) => (
		<button disabled={disabled} onClick={onClick} type={type}>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		disabled,
		id,
		max,
		min,
		onChange,
		placeholder,
		type = "text",
		value,
	}: {
		disabled?: boolean;
		id?: string;
		max?: number;
		min?: number;
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		type?: string;
		value?: string | number;
	}) => (
		<input
			disabled={disabled}
			id={id}
			max={max}
			min={min}
			onChange={onChange}
			placeholder={placeholder}
			type={type}
			value={value}
		/>
	),
}));

vi.mock("src/components/ui/label", () => ({
	default: ({
		children,
		htmlFor,
	}: {
		children: ReactNode;
		htmlFor?: string;
	}) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("src/components/ui/switch", () => ({
	default: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id?: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			checked={checked}
			id={id}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			type="checkbox"
		/>
	),
}));

vi.mock("src/server/download-clients", () => ({
	testDownloadClientFn: downloadClientFormMocks.testDownloadClientFn,
}));

import DownloadClientForm from "./download-client-form";

describe("DownloadClientForm", () => {
	afterEach(() => {
		downloadClientFormMocks.testDownloadClientFn.mockReset();
		downloadClientFormMocks.useMutation.mockReset();
	});

	function mockMutation() {
		downloadClientFormMocks.useMutation.mockImplementation(
			({ mutationFn }: { mutationFn: () => unknown }) => ({
				data: undefined,
				error: null,
				isPending: false,
				mutate: () => mutationFn(),
			}),
		);
	}

	it("validates required fields before submitting", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		mockMutation();

		const { getByRole, getByText } = renderWithProviders(
			<DownloadClientForm onCancel={vi.fn()} onSubmit={onSubmit} />,
		);

		await user.click(getByRole("button", { name: "Save" }));

		expect(onSubmit).not.toHaveBeenCalled();
		expect(getByText("Name is required")).toBeInTheDocument();
	});

	it("hides host fields for Blackhole, tests the connection payload, and submits the watch-folder config", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		mockMutation();

		const { getByLabelText, getByRole, queryByLabelText } = renderWithProviders(
			<DownloadClientForm
				initialValues={{
					implementation: "Blackhole",
					name: "Watch folder",
					removeCompletedDownloads: false,
					watchFolder: "/data/watch",
				}}
				onCancel={vi.fn()}
				onSubmit={onSubmit}
			/>,
		);

		expect(queryByLabelText("Host")).not.toBeInTheDocument();
		expect(queryByLabelText("Port")).not.toBeInTheDocument();
		expect(queryByLabelText("SSL")).not.toBeInTheDocument();
		expect(queryByLabelText("Category")).not.toBeInTheDocument();
		expect(queryByLabelText("Tag (optional)")).not.toBeInTheDocument();
		expect(getByLabelText("Watch Folder")).toHaveValue("/data/watch");

		await user.click(getByRole("button", { name: "Test Connection" }));

		expect(downloadClientFormMocks.testDownloadClientFn).toHaveBeenCalledWith({
			data: {
				apiKey: null,
				implementation: "Blackhole",
				host: "localhost",
				password: null,
				port: 1,
				settings: {
					watchFolder: "/data/watch",
				},
				urlBase: null,
				useSsl: false,
				username: null,
			},
		});

		await user.click(getByRole("button", { name: "Save" }));

		expect(onSubmit).toHaveBeenCalledWith({
			apiKey: "",
			category: "allstarr",
			enabled: true,
			host: "localhost",
			implementation: "Blackhole",
			name: "Watch folder",
			password: "",
			port: 0,
			priority: 1,
			protocol: "torrent",
			removeCompletedDownloads: false,
			tag: "",
			useSsl: false,
			urlBase: "",
			username: "",
			watchFolder: "/data/watch",
		});
	});

	it("respects the loading state and custom cancel label", () => {
		mockMutation();

		const { getByRole } = renderWithProviders(
			<DownloadClientForm
				cancelLabel="Back"
				loading
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
			/>,
		);

		expect(getByRole("button", { name: "Saving..." })).toBeDisabled();
		expect(getByRole("button", { name: "Back" })).toBeInTheDocument();
	});
});
