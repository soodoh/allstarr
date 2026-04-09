import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

	it("renders the shell and input wrapper data slots", () => {
		const { container } = renderWithProviders(
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
		const user = userEvent.setup();

		const { getByPlaceholderText, getByText } = renderWithProviders(
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

		await user.type(getByPlaceholderText("Search commands"), "zzz");

		expect(getByText("No results.")).toHaveAttribute(
			"data-slot",
			"command-empty",
		);
	});

	it("marks an item as selected when it is chosen", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();

		const { getByPlaceholderText, getByText } = renderWithProviders(
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

		await user.click(getByPlaceholderText("Search commands"));
		await user.click(getByText("Refresh"));

		expect(
			getByText("Refresh").closest('[data-slot="command-item"]'),
		).toHaveAttribute("data-selected", "true");
		expect(onSelect).toHaveBeenCalledWith("refresh");
	});
});
