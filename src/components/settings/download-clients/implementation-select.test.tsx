import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

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

import ImplementationSelect from "./implementation-select";

describe("ImplementationSelect", () => {
	it("renders the torrent and usenet options and wires selection plus cancel", async () => {
		const user = userEvent.setup();
		const onCancel = vi.fn();
		const onSelect = vi.fn();

		const { getByRole, getByText } = renderWithProviders(
			<ImplementationSelect onCancel={onCancel} onSelect={onSelect} />,
		);

		expect(getByText("Torrent Clients")).toBeInTheDocument();
		expect(getByText("Usenet Clients")).toBeInTheDocument();
		expect(
			getByRole("button", { name: "qBittorrentWeb API v2" }),
		).toBeInTheDocument();
		expect(
			getByRole("button", { name: "BlackholeWatch folder" }),
		).toBeInTheDocument();
		expect(
			getByRole("button", { name: "SABnzbdHTTP API" }),
		).toBeInTheDocument();
		expect(getByRole("button", { name: "NZBGetJSON-RPC" })).toBeInTheDocument();

		await user.click(getByRole("button", { name: "BlackholeWatch folder" }));
		await user.click(getByRole("button", { name: "NZBGetJSON-RPC" }));
		await user.click(getByRole("button", { name: "Cancel" }));

		expect(onSelect).toHaveBeenNthCalledWith(1, "Blackhole");
		expect(onSelect).toHaveBeenNthCalledWith(2, "NZBGet");
		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
