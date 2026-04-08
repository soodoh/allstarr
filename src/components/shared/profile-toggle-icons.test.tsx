import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

import ProfileToggleIcons from "./profile-toggle-icons";

describe("ProfileToggleIcons", () => {
	it("renders active, partial, and inactive profile states and toggles them", async () => {
		const user = userEvent.setup();
		const onToggle = vi.fn();

		const { container, getByRole } = renderWithProviders(
			<ProfileToggleIcons
				activeProfileIds={[1]}
				direction="vertical"
				onToggle={onToggle}
				partialProfileIds={[2]}
				profiles={[
					{ icon: "film", id: 1, name: "Movies" },
					{ icon: "tv", id: 2, name: "Shows" },
					{ icon: "unknown-icon", id: 3, name: "Fallback" },
				]}
				size="lg"
			/>,
		);

		const activeButton = getByRole("button", {
			name: 'Remove "Movies" profile',
		});
		const partialButton = getByRole("button", {
			name: 'Monitor all for "Shows" profile',
		});
		const inactiveButton = getByRole("button", {
			name: 'Add "Fallback" profile',
		});

		expect(container.firstElementChild).toHaveClass("flex-col");
		expect(activeButton).toHaveClass("h-9", "w-9");
		expect(partialButton).toHaveStyle({
			background:
				"linear-gradient(135deg, var(--color-muted) 50%, color-mix(in oklch, var(--color-primary) 15%, transparent) 50%)",
		});
		expect(inactiveButton).toHaveClass("bg-muted");

		await user.click(activeButton);
		await user.click(partialButton);
		await user.click(inactiveButton);

		expect(onToggle).toHaveBeenNthCalledWith(1, 1);
		expect(onToggle).toHaveBeenNthCalledWith(2, 2);
		expect(onToggle).toHaveBeenNthCalledWith(3, 3);
	});

	it("uses the small horizontal layout by default", () => {
		const { container, getByRole } = renderWithProviders(
			<ProfileToggleIcons
				activeProfileIds={[]}
				onToggle={vi.fn()}
				profiles={[{ icon: "film", id: 1, name: "Movies" }]}
			/>,
		);

		const button = getByRole("button", { name: 'Add "Movies" profile' });

		expect(container.firstElementChild).toHaveClass("flex-row");
		expect(button).toHaveClass("h-6", "w-6");
		expect(button.querySelector("svg")).toHaveClass("h-3.5", "w-3.5");
	});
});
