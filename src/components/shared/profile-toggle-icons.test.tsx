import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import ProfileToggleIcons from "./profile-toggle-icons";

describe("ProfileToggleIcons", () => {
	it("renders active, partial, and inactive profile states and toggles them", async () => {
		const onToggle = vi.fn();

		const { container } = await renderWithProviders(
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

		const activeButton = page.getByRole("button", {
			name: 'Remove "Movies" profile',
		});
		const partialButton = page.getByRole("button", {
			name: 'Monitor all for "Shows" profile',
		});
		const inactiveButton = page.getByRole("button", {
			name: 'Add "Fallback" profile',
		});

		expect(container.firstElementChild).toHaveClass("flex-col");
		await expect.element(activeButton).toHaveClass("h-9", "w-9");
		await expect.element(partialButton).toHaveStyle({
			background:
				"linear-gradient(135deg, var(--color-muted) 50%, color-mix(in oklch, var(--color-primary) 15%, transparent) 50%)",
		});
		await expect.element(inactiveButton).toHaveClass("bg-muted");

		await activeButton.click();
		await partialButton.click();
		await inactiveButton.click();

		expect(onToggle).toHaveBeenNthCalledWith(1, 1);
		expect(onToggle).toHaveBeenNthCalledWith(2, 2);
		expect(onToggle).toHaveBeenNthCalledWith(3, 3);
	});

	it("uses the small horizontal layout by default", async () => {
		const { container } = await renderWithProviders(
			<ProfileToggleIcons
				activeProfileIds={[]}
				onToggle={vi.fn()}
				profiles={[{ icon: "film", id: 1, name: "Movies" }]}
			/>,
		);

		const button = page.getByRole("button", { name: 'Add "Movies" profile' });

		expect(container.firstElementChild).toHaveClass("flex-row");
		await expect.element(button).toHaveClass("h-6", "w-6");

		const buttonEl = await button.element();
		expect(buttonEl.querySelector("svg")).toHaveClass("h-3.5", "w-3.5");
	});
});
