import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const editionsTabMocks = vi.hoisted(() => ({
	setEditionForProfile: {
		isPending: false,
		mutate: vi.fn(),
	},
	unmonitorBookProfile: {
		isPending: false,
		mutate: vi.fn(),
	},
}));

vi.mock("src/hooks/mutations", () => ({
	useSetEditionForProfile: () => editionsTabMocks.setEditionForProfile,
	useUnmonitorBookProfile: () => editionsTabMocks.unmonitorBookProfile,
}));

vi.mock("src/components/ui/tabs", () => ({
	TabsContent: ({
		children,
		value,
	}: {
		children: ReactNode;
		value: string;
	}) => <section data-value={value}>{children}</section>,
}));

vi.mock("src/components/bookshelf/books/profile-edition-card", () => ({
	default: ({
		edition,
		onChooseEdition,
		onUnmonitor,
		profile,
	}: {
		edition: { id: number; title: string } | null;
		onChooseEdition: () => void;
		onUnmonitor: () => void;
		profile: { id: number; name: string };
	}) => (
		<div data-testid={`profile-${profile.id}`}>
			<span>{profile.name}</span>
			<span>{edition ? edition.title : "No edition selected"}</span>
			<button onClick={onChooseEdition} type="button">
				Choose Edition
			</button>
			{edition && (
				<button onClick={onUnmonitor} type="button">
					Unmonitor
				</button>
			)}
		</div>
	),
}));

vi.mock("src/components/bookshelf/books/edition-selection-modal", () => ({
	default: ({
		currentEditionId,
		onConfirm,
		onOpenChange,
		open,
		profile,
	}: {
		currentEditionId?: number;
		onConfirm: (editionId: number) => void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		profile: { id: number; name: string };
	}) =>
		open ? (
			<div data-testid="edition-selection-modal">
				<span>{profile.name}</span>
				<span>{currentEditionId ?? "none"}</span>
				<button onClick={() => onConfirm(99)} type="button">
					Confirm edition
				</button>
				<button onClick={() => onOpenChange(false)} type="button">
					Close modal
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/shared/unmonitor-dialog", () => ({
	default: ({
		onConfirm,
		onOpenChange,
		open,
		profileName,
	}: {
		onConfirm: (deleteFiles: boolean) => void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		profileName: string;
	}) =>
		open ? (
			<div data-testid="unmonitor-dialog">
				<span>{profileName}</span>
				<button onClick={() => onConfirm(true)} type="button">
					Confirm unmonitor
				</button>
				<button onClick={() => onOpenChange(false)} type="button">
					Close unmonitor
				</button>
			</div>
		) : null,
}));

import EditionsTab from "./editions-tab";

describe("EditionsTab", () => {
	afterEach(() => {
		editionsTabMocks.setEditionForProfile.isPending = false;
		editionsTabMocks.setEditionForProfile.mutate.mockReset();
		editionsTabMocks.unmonitorBookProfile.isPending = false;
		editionsTabMocks.unmonitorBookProfile.mutate.mockReset();
	});

	it("shows the empty state when no profiles are assigned", async () => {
		await renderWithProviders(
			<EditionsTab
				authorDownloadProfiles={[]}
				bookCoverUrl={null}
				bookId={1}
				bookTitle="Empty"
				editions={[]}
				fileCount={0}
			/>,
		);

		await expect
			.element(page.getByText("No download profiles assigned to this author."))
			.toBeInTheDocument();
	});

	it("sorts monitored profiles first and opens the edition picker", async () => {
		editionsTabMocks.setEditionForProfile.mutate.mockImplementation(
			(_payload: unknown, options?: { onSuccess?: () => void }) => {
				options?.onSuccess?.();
			},
		);

		const { container } = await renderWithProviders(
			<EditionsTab
				authorDownloadProfiles={[
					{
						contentType: "ebook",
						icon: "book",
						id: 2,
						language: "en",
						name: "Unmonitored",
					},
					{
						contentType: "ebook",
						icon: "book",
						id: 1,
						language: "en",
						name: "Monitored",
					},
				]}
				bookCoverUrl="/cover.jpg"
				bookId={44}
				bookTitle="The Book"
				editions={[
					{
						id: 9,
						title: "Selected Edition",
						publisher: null,
						format: null,
						pageCount: null,
						audioLength: null,
						language: null,
						isbn13: null,
						isbn10: null,
						asin: null,
						usersCount: null,
						score: null,
						editionInformation: null,
						images: null,
						downloadProfileIds: [1],
					},
				]}
				fileCount={3}
			/>,
		);

		const cards = Array.from(
			container.querySelectorAll('[data-testid^="profile-"]'),
		);
		expect(cards[0]).toHaveTextContent("Monitored");
		expect(cards[1]).toHaveTextContent("Unmonitored");

		const unmonitoredCard = cards[1] as HTMLElement;
		const chooseBtn = unmonitoredCard.querySelector(
			'button[type="button"]',
		) as HTMLButtonElement;
		await chooseBtn.click();

		await expect
			.element(page.getByTestId("edition-selection-modal"))
			.toHaveTextContent("Unmonitored");
		await expect
			.element(page.getByTestId("edition-selection-modal"))
			.toHaveTextContent("none");

		const modal = await page.getByTestId("edition-selection-modal").element();
		const confirmBtn = modal.querySelector(
			'button[type="button"]',
		) as HTMLButtonElement;
		await confirmBtn.click();

		expect(editionsTabMocks.setEditionForProfile.mutate).toHaveBeenCalledWith(
			{
				editionId: 99,
				downloadProfileId: 2,
			},
			expect.any(Object),
		);
		await expect
			.element(page.getByTestId("edition-selection-modal"))
			.not.toBeInTheDocument();
	});

	it("opens the unmonitor dialog and submits the selected option", async () => {
		editionsTabMocks.unmonitorBookProfile.mutate.mockImplementation(
			(_payload: unknown, options?: { onSuccess?: () => void }) => {
				options?.onSuccess?.();
			},
		);

		await renderWithProviders(
			<EditionsTab
				authorDownloadProfiles={[
					{
						contentType: "audiobook",
						icon: "headphones",
						id: 3,
						language: "en",
						name: "Audio",
					},
				]}
				bookCoverUrl={null}
				bookId={55}
				bookTitle="Audio Book"
				editions={[
					{
						id: 4,
						title: "Audio Edition",
						publisher: null,
						format: null,
						pageCount: null,
						audioLength: null,
						language: null,
						isbn13: null,
						isbn10: null,
						asin: null,
						usersCount: null,
						score: null,
						editionInformation: null,
						images: null,
						downloadProfileIds: [3],
					},
				]}
				fileCount={1}
			/>,
		);

		await page.getByRole("button", { name: "Unmonitor" }).click();
		await expect
			.element(page.getByTestId("unmonitor-dialog"))
			.toHaveTextContent("Audio");

		await page.getByRole("button", { name: "Confirm unmonitor" }).click();
		expect(editionsTabMocks.unmonitorBookProfile.mutate).toHaveBeenCalledWith(
			{
				bookId: 55,
				downloadProfileId: 3,
				deleteFiles: true,
			},
			expect.any(Object),
		);
		await expect
			.element(page.getByTestId("unmonitor-dialog"))
			.not.toBeInTheDocument();
	});
});
