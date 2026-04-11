import { renderWithProviders } from "src/test/render";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "./command";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

describe("Command", () => {
	beforeAll(() => {
		HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterAll(() => {
		HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
	});

	it("renders the shell and input wrapper data slots", async () => {
		const { container } = await renderWithProviders(
			<Command className="custom-command">
				<CommandInput placeholder="Search commands" />
				<CommandList>
					<CommandGroup heading="Actions">
						<CommandItem value="refresh">Refresh</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>,
		);

		expect(container.querySelector('[data-slot="command"]')).toHaveClass(
			"custom-command",
		);
		expect(
			container.querySelector('[data-slot="command-input-wrapper"]'),
		).toBeInTheDocument();
		expect(
			container.querySelector('[data-slot="command-input"]'),
		).toHaveAttribute("placeholder", "Search commands");
		expect(
			container.querySelector('[data-slot="command-list"]'),
		).toBeInTheDocument();
		expect(
			container.querySelector('[data-slot="command-group"]'),
		).toBeInTheDocument();
		expect(
			container.querySelector('[data-slot="command-item"]'),
		).toHaveTextContent("Refresh");
	});

	it("renders the empty state helper when nothing matches", async () => {
		await renderWithProviders(
			<Command>
				<CommandInput placeholder="Search commands" />
				<CommandList>
					<CommandEmpty>No results.</CommandEmpty>
					<CommandGroup heading="Actions">
						<CommandItem value="refresh">Refresh</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>,
		);

		await page.getByPlaceholder("Search commands").fill("zzz");

		await expect
			.element(page.getByText("No results."))
			.toHaveAttribute("data-slot", "command-empty");
	});

	it("marks an item as selected when it is chosen", async () => {
		const onSelect = vi.fn();

		await renderWithProviders(
			<Command>
				<CommandInput placeholder="Search commands" />
				<CommandList>
					<CommandGroup heading="Actions">
						<CommandItem value="refresh" onSelect={onSelect}>
							Refresh
						</CommandItem>
						<CommandItem value="archive">Archive</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>,
		);

		await page.getByPlaceholder("Search commands").click();
		await page.getByText("Refresh").click();

		const refreshItem = page
			.getByRole("option", { name: "Refresh" })
			.filter({ hasText: "Refresh" });
		await expect.element(refreshItem).toHaveAttribute("data-selected", "true");
		expect(onSelect).toHaveBeenCalledWith("refresh");
	});
});
