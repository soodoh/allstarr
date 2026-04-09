import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("src/components/shared/optimized-image", () => ({
	default: ({
		alt,
		src,
		type,
	}: {
		alt: string;
		src: string | null;
		type: string;
	}) => <img alt={alt} data-type={type} src={src ?? ""} />,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		variant,
	}: PropsWithChildren<{
		onClick?: () => void;
		size?: string;
		variant?: string;
	}>) => (
		<button data-variant={variant} onClick={onClick} type="button">
			{children}
		</button>
	),
}));

vi.mock("src/lib/profile-icons", () => ({
	getProfileIcon:
		() =>
		({ className }: { className?: string }) => (
			<span className={className}>Profile Icon</span>
		),
}));

import ProfileEditionCard from "./profile-edition-card";

const profile = {
	contentType: "audiobook" as const,
	icon: "headphones",
	id: 12,
	name: "Audio",
};

const edition = {
	asin: "B000123",
	audioLength: 125,
	editionInformation: "Special release",
	format: "Audiobook",
	id: 55,
	images: [{ url: "https://covers.example/edition.jpg" }],
	isbn10: "1234567890",
	isbn13: "9781234567897",
	language: "English",
	pageCount: 0,
	publisher: "Signal Press",
	score: 97,
	title: "Monitoring the Test Suite",
	usersCount: 4200,
};

describe("ProfileEditionCard", () => {
	it("renders monitored edition details and triggers change and unmonitor actions", async () => {
		const user = userEvent.setup();
		const onChooseEdition = vi.fn();
		const onUnmonitor = vi.fn();

		const { getByAltText, getByRole, getByText } = renderWithProviders(
			<ProfileEditionCard
				bookCoverUrl="https://covers.example/fallback.jpg"
				edition={edition}
				onChooseEdition={onChooseEdition}
				onUnmonitor={onUnmonitor}
				profile={profile}
			/>,
		);

		expect(getByAltText("Monitoring the Test Suite")).toHaveAttribute(
			"src",
			"https://covers.example/edition.jpg",
		);
		expect(getByText("Signal Press")).toBeInTheDocument();
		expect(getByText("Audiobook")).toBeInTheDocument();
		expect(getByText("2h 5m")).toBeInTheDocument();
		expect(getByText("English")).toBeInTheDocument();
		expect(getByText("ISBN: 9781234567897")).toBeInTheDocument();
		expect(getByText("ASIN: B000123")).toBeInTheDocument();
		expect(getByText("4,200 readers")).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Change" }));
		await user.click(getByRole("button", { name: "Unmonitor" }));

		expect(onChooseEdition).toHaveBeenCalledTimes(1);
		expect(onUnmonitor).toHaveBeenCalledTimes(1);
	});

	it("renders the unmonitored placeholder and uses the book cover fallback", async () => {
		const user = userEvent.setup();
		const onChooseEdition = vi.fn();
		const onUnmonitor = vi.fn();

		const { getByRole, queryByAltText, queryByText } = renderWithProviders(
			<ProfileEditionCard
				bookCoverUrl="https://covers.example/fallback.jpg"
				edition={null}
				onChooseEdition={onChooseEdition}
				onUnmonitor={onUnmonitor}
				profile={{ ...profile, contentType: "ebook" }}
			/>,
		);

		expect(queryByAltText("Monitoring the Test Suite")).toBeNull();
		expect(getByRole("button", { name: "Choose Edition" })).toBeInTheDocument();
		expect(queryByText("Unmonitor")).toBeNull();
		expect(queryByText("No edition selected")).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Choose Edition" }));
		expect(onChooseEdition).toHaveBeenCalledTimes(1);
		expect(onUnmonitor).not.toHaveBeenCalled();
	});

	it("formats short audio durations without hours", () => {
		const shortEdition = {
			...edition,
			audioLength: 45,
			images: null,
			usersCount: 0,
		};

		const { getByAltText, getByText, queryByText } = renderWithProviders(
			<ProfileEditionCard
				bookCoverUrl="https://covers.example/fallback.jpg"
				edition={shortEdition}
				onChooseEdition={vi.fn()}
				onUnmonitor={vi.fn()}
				profile={profile}
			/>,
		);

		expect(getByAltText("Monitoring the Test Suite")).toHaveAttribute(
			"src",
			"https://covers.example/fallback.jpg",
		);
		expect(getByText("45m")).toBeInTheDocument();
		expect(queryByText("readers")).toBeNull();
	});
});
