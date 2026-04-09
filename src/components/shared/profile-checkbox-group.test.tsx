import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

import ProfileCheckboxGroup from "./profile-checkbox-group";

describe("ProfileCheckboxGroup", () => {
	it("renders the empty state when no profiles are available", () => {
		const { getByText, queryByRole } = renderWithProviders(
			<ProfileCheckboxGroup
				onToggle={vi.fn()}
				profiles={[]}
				selectedIds={[]}
			/>,
		);

		expect(getByText("Download Profiles")).toBeInTheDocument();
		expect(getByText("No download profiles available.")).toBeInTheDocument();
		expect(queryByRole("checkbox")).not.toBeInTheDocument();
	});

	it("renders profiles, selected extras, and toggles by id", async () => {
		const user = userEvent.setup();
		const onToggle = vi.fn();

		const { getByRole, getByText, queryByText } = renderWithProviders(
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

		expect(getByText("HD")).toBeInTheDocument();
		expect(getByText("Audio")).toBeInTheDocument();
		expect(queryByText("Extra settings for 1")).not.toBeInTheDocument();
		expect(getByText("Extra settings for 2")).toBeInTheDocument();

		await user.click(getByRole("checkbox", { name: /HD/i }));

		expect(onToggle).toHaveBeenCalledWith(1);
	});
});
