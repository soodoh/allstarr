import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

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
		children: React.ReactNode;
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

	it("shows the empty state when no profiles are assigned", () => {
		const { getByText } = renderWithProviders(
			<EditionsTab
				authorDownloadProfiles={[]}
				bookCoverUrl={null}
				bookId={1}
				bookTitle="Empty"
				editions={[]}
				fileCount={0}
			/>,
		);

		expect(
			getByText("No download profiles assigned to this author."),
		).toBeInTheDocument();
	});

	it("sorts monitored profiles first and opens the edition picker", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		editionsTabMocks.setEditionForProfile.mutate.mockImplementation(
			(_payload: unknown, options?: { onSuccess?: () => void }) => {
				options?.onSuccess?.();
			},
		);

		const { getByRole, getByTestId, queryByTestId } = renderWithProviders(
			<EditionsTab
				authorDownloadProfiles={[
					{ contentType: "ebook", icon: "book", id: 2, name: "Unmonitored" },
					{ contentType: "ebook", icon: "book", id: 1, name: "Monitored" },
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

		expect(
			getByTestId("profile-1").compareDocumentPosition(
				getByTestId("profile-2"),
			) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();

		await user.click(getByRole("button", { name: "Choose Edition" }));
		expect(getByTestId("edition-selection-modal")).toHaveTextContent(
			"Unmonitored",
		);
		expect(getByTestId("edition-selection-modal")).toHaveTextContent("none");

		await user.click(getByRole("button", { name: "Confirm edition" }));
		expect(editionsTabMocks.setEditionForProfile.mutate).toHaveBeenCalledWith(
			{
				editionId: 99,
				downloadProfileId: 2,
			},
			expect.any(Object),
		);
		expect(queryByTestId("edition-selection-modal")).toBeNull();
		expect(onSuccess).not.toHaveBeenCalled();
	});

	it("opens the unmonitor dialog and submits the selected option", async () => {
		const user = userEvent.setup();
		editionsTabMocks.unmonitorBookProfile.mutate.mockImplementation(
			(_payload: unknown, options?: { onSuccess?: () => void }) => {
				options?.onSuccess?.();
			},
		);

		const { getByRole, getByTestId, queryByTestId } = renderWithProviders(
			<EditionsTab
				authorDownloadProfiles={[
					{
						contentType: "audiobook",
						icon: "headphones",
						id: 3,
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

		await user.click(getByRole("button", { name: "Unmonitor" }));
		expect(getByTestId("unmonitor-dialog")).toHaveTextContent("Audio");

		await user.click(getByRole("button", { name: "Confirm unmonitor" }));
		expect(editionsTabMocks.unmonitorBookProfile.mutate).toHaveBeenCalledWith(
			{
				bookId: 55,
				downloadProfileId: 3,
				deleteFiles: true,
			},
			expect.any(Object),
		);
		expect(queryByTestId("unmonitor-dialog")).toBeNull();
	});
});
