import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import ProfileCheckboxGroup from "./profile-checkbox-group";

describe("ProfileCheckboxGroup", () => {
	it("renders the empty state when no profiles are available", async () => {
		renderWithProviders(
			<ProfileCheckboxGroup
				onToggle={vi.fn()}
				profiles={[]}
				selectedIds={[]}
			/>,
		);

		await expect
			.element(page.getByText("Download Profiles", { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("No download profiles available."))
			.toBeInTheDocument();
		await expect.element(page.getByRole("checkbox")).not.toBeInTheDocument();
	});

	it("renders profiles, selected extras, and toggles by id", async () => {
		const onToggle = vi.fn();

		renderWithProviders(
			<ProfileCheckboxGroup
				onToggle={onToggle}
				profiles={[
					{ id: 1, name: "HD", icon: "monitor" },
					{ id: 2, name: "Audio", icon: "audioLines" },
				]}
				renderExtra={(profileId) => <p>Extra settings for {profileId}</p>}
				selectedIds={[2]}
			/>,
		);

		await expect.element(page.getByText("HD")).toBeInTheDocument();
		await expect.element(page.getByText("Audio")).toBeInTheDocument();
		await expect
			.element(page.getByText("Extra settings for 1"))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByText("Extra settings for 2"))
			.toBeInTheDocument();

		await page.getByRole("checkbox", { name: /HD/i }).click();

		expect(onToggle).toHaveBeenCalledWith(1);
	});
});
