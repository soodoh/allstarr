import type { PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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
		const onChooseEdition = vi.fn();
		const onUnmonitor = vi.fn();

		await renderWithProviders(
			<ProfileEditionCard
				bookCoverUrl="https://covers.example/fallback.jpg"
				edition={edition}
				onChooseEdition={onChooseEdition}
				onUnmonitor={onUnmonitor}
				profile={profile}
			/>,
		);

		await expect
			.element(page.getByAltText("Monitoring the Test Suite"))
			.toHaveAttribute("src", "https://covers.example/edition.jpg");
		await expect.element(page.getByText("Signal Press")).toBeInTheDocument();
		await expect.element(page.getByText("Audiobook")).toBeInTheDocument();
		await expect.element(page.getByText("2h 5m")).toBeInTheDocument();
		await expect.element(page.getByText("English")).toBeInTheDocument();
		await expect
			.element(page.getByText("ISBN: 9781234567897"))
			.toBeInTheDocument();
		await expect.element(page.getByText("ASIN: B000123")).toBeInTheDocument();
		await expect.element(page.getByText("4,200 readers")).toBeInTheDocument();

		await page.getByRole("button", { name: "Change" }).click();
		await page.getByRole("button", { name: "Unmonitor" }).click();

		expect(onChooseEdition).toHaveBeenCalledTimes(1);
		expect(onUnmonitor).toHaveBeenCalledTimes(1);
	});

	it("renders the unmonitored placeholder and uses the book cover fallback", async () => {
		const onChooseEdition = vi.fn();
		const onUnmonitor = vi.fn();

		await renderWithProviders(
			<ProfileEditionCard
				bookCoverUrl="https://covers.example/fallback.jpg"
				edition={null}
				onChooseEdition={onChooseEdition}
				onUnmonitor={onUnmonitor}
				profile={{ ...profile, contentType: "ebook" }}
			/>,
		);

		await expect
			.element(page.getByAltText("Monitoring the Test Suite"))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Choose Edition" }))
			.toBeInTheDocument();
		await expect.element(page.getByText("Unmonitor")).not.toBeInTheDocument();
		await expect
			.element(page.getByText("No edition selected"))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Choose Edition" }).click();
		expect(onChooseEdition).toHaveBeenCalledTimes(1);
		expect(onUnmonitor).not.toHaveBeenCalled();
	});

	it("formats short audio durations without hours", async () => {
		const shortEdition = {
			...edition,
			audioLength: 45,
			images: null,
			usersCount: 0,
		};

		await renderWithProviders(
			<ProfileEditionCard
				bookCoverUrl="https://covers.example/fallback.jpg"
				edition={shortEdition}
				onChooseEdition={vi.fn()}
				onUnmonitor={vi.fn()}
				profile={profile}
			/>,
		);

		await expect
			.element(page.getByAltText("Monitoring the Test Suite"))
			.toHaveAttribute("src", "https://covers.example/fallback.jpg");
		await expect.element(page.getByText("45m")).toBeInTheDocument();
		await expect.element(page.getByText("readers")).not.toBeInTheDocument();
	});
});
