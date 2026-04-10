import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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
		const onCancel = vi.fn();
		const onSelect = vi.fn();

		await renderWithProviders(
			<ImplementationSelect onCancel={onCancel} onSelect={onSelect} />,
		);

		await expect.element(page.getByText("Torrent Clients")).toBeInTheDocument();
		await expect.element(page.getByText("Usenet Clients")).toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "qBittorrentWeb API v2" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "BlackholeWatch folder" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "SABnzbdHTTP API" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "NZBGetJSON-RPC" }))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "BlackholeWatch folder" }).click();
		await page.getByRole("button", { name: "NZBGetJSON-RPC" }).click();
		await page.getByRole("button", { name: "Cancel" }).click();

		expect(onSelect).toHaveBeenNthCalledWith(1, "Blackhole");
		expect(onSelect).toHaveBeenNthCalledWith(2, "NZBGet");
		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
