import type { ComponentProps, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

const downloadProfileFormMocks = vi.hoisted(() => ({
	categoryMultiSelect: vi.fn(),
	cfScoreSection: vi.fn(),
	countProfileFilesFn: vi.fn(),
	directoryBrowserDialog: vi.fn(),
	languageSingleSelect: vi.fn(),
	tierGroupList: vi.fn(),
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
	validateForm: vi.fn(),
	moveProfileFilesFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error: (...args: unknown[]) => downloadProfileFormMocks.toastError(...args),
		success: (...args: unknown[]) =>
			downloadProfileFormMocks.toastSuccess(...args),
	},
}));

vi.mock("src/lib/form-validation", () => ({
	default: (...args: unknown[]) =>
		downloadProfileFormMocks.validateForm(...args),
}));

vi.mock("src/server/download-profiles", () => ({
	countProfileFilesFn: (...args: unknown[]) =>
		downloadProfileFormMocks.countProfileFilesFn(...args),
	moveProfileFilesFn: (...args: unknown[]) =>
		downloadProfileFormMocks.moveProfileFilesFn(...args),
}));

vi.mock("src/components/settings/custom-formats/cf-score-section", () => ({
	default: ({
		localScores,
		onLocalScoresChange,
	}: {
		localScores?: Array<{ customFormatId: number; score: number }>;
		onLocalScoresChange?: (
			scores: Array<{ customFormatId: number; score: number }>,
		) => void;
	}) => {
		downloadProfileFormMocks.cfScoreSection({
			localScores,
			onLocalScoresChange,
		});

		return (
			<div data-testid="cf-score-section">
				<div>
					{localScores
						? `local-scores:${localScores.length}`
						: "no-local-scores"}
				</div>
				<button
					type="button"
					onClick={() =>
						onLocalScoresChange?.([{ customFormatId: 88, score: 11 }])
					}
				>
					Seed CF scores
				</button>
			</div>
		);
	},
}));

vi.mock("src/components/shared/category-multi-select", () => ({
	default: ({
		onChange,
		value,
	}: {
		onChange: (value: number[]) => void;
		value: number[];
	}) => {
		downloadProfileFormMocks.categoryMultiSelect({ onChange, value });
		return <div data-testid="category-multi-select">{value.join(",")}</div>;
	},
}));

vi.mock("src/components/shared/directory-browser-dialog", () => ({
	default: ({
		initialPath,
		onSelect,
		open,
	}: {
		initialPath: string;
		onSelect: (path: string) => void;
		open: boolean;
	}) => {
		downloadProfileFormMocks.directoryBrowserDialog({ initialPath, open });
		return open ? (
			<div data-testid="directory-browser-dialog">
				<button type="button" onClick={() => onSelect("/library/new")}>
					Choose path
				</button>
			</div>
		) : null;
	},
}));

vi.mock("src/components/shared/language-single-select", () => ({
	default: ({
		onChange,
		value,
	}: {
		onChange: (value: string) => void;
		value: string;
	}) => {
		downloadProfileFormMocks.languageSingleSelect({ onChange, value });
		return <div data-testid="language-single-select">{value}</div>;
	},
}));

vi.mock("src/components/settings/download-profiles/tier-group-list", () => ({
	default: (props: {
		cutoff: number;
		downloadFormats: Array<{
			id: number;
			title: string;
			contentTypes: string[];
		}>;
		items: number[][];
		onChange: (items: number[][]) => void;
		onRemoveFormat: (formatId: number) => void;
		upgradeAllowed: boolean;
	}) => {
		downloadProfileFormMocks.tierGroupList(props);
		return (
			<div data-testid="tier-group-list">
				{props.downloadFormats.map((format) => format.title).join(",")}
				<button type="button" onClick={() => props.onRemoveFormat(1)}>
					Remove EPUB
				</button>
				<button type="button" onClick={() => props.onChange([[2]])}>
					Keep PDF only
				</button>
			</div>
		);
	},
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => (
		<div>{open ? children : null}</div>
	),
	DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: { children: ReactNode }) => (
		<p>{children}</p>
	),
	DialogFooter: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SelectValue: ({
		children,
		placeholder,
	}: {
		children?: ReactNode;
		placeholder?: string;
	}) => <div>{children ?? placeholder}</div>,
}));

vi.mock("src/components/ui/switch", () => ({
	default: ({
		checked,
		onCheckedChange,
	}: {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<button
			aria-checked={checked}
			role="switch"
			type="button"
			onClick={() => onCheckedChange?.(!checked)}
		/>
	),
}));

import DownloadProfileForm from "./download-profile-form";

const ebookFormats = [
	{ contentTypes: ["ebook"], id: 1, title: "EPUB" },
	{ contentTypes: ["ebook"], id: 2, title: "PDF" },
];

const mixedFormats = [
	...ebookFormats,
	{ contentTypes: ["movie"], id: 3, title: "WEBRip" },
];

describe("DownloadProfileForm", () => {
	afterEach(() => {
		downloadProfileFormMocks.categoryMultiSelect.mockReset();
		downloadProfileFormMocks.cfScoreSection.mockReset();
		downloadProfileFormMocks.countProfileFilesFn.mockReset();
		downloadProfileFormMocks.directoryBrowserDialog.mockReset();
		downloadProfileFormMocks.languageSingleSelect.mockReset();
		downloadProfileFormMocks.moveProfileFilesFn.mockReset();
		downloadProfileFormMocks.tierGroupList.mockReset();
		downloadProfileFormMocks.toastError.mockReset();
		downloadProfileFormMocks.toastSuccess.mockReset();
		downloadProfileFormMocks.validateForm.mockReset();
	});

	it("submits new profiles with local custom format scores and filtered qualities", async () => {
		const onSubmit = vi.fn();
		const onSubmitWithId = vi.fn();

		downloadProfileFormMocks.validateForm.mockReturnValue({
			data: {
				categories: [],
				contentType: "ebook",
				cutoff: 0,
				icon: "book",
				language: "en",
				minCustomFormatScore: 0,
				name: "New Profile",
				items: [[1], [2], [3]],
				rootFolderPath: "/library/books",
				upgradeAllowed: false,
				upgradeUntilCustomFormatScore: 0,
			},
			success: true,
		});

		await renderWithProviders(
			<DownloadProfileForm
				downloadFormats={mixedFormats}
				onCancel={vi.fn()}
				onSubmit={onSubmit}
				onSubmitWithId={onSubmitWithId}
				serverCwd="/srv"
				serverError="Unable to save profile"
			/>,
		);

		expect(downloadProfileFormMocks.cfScoreSection).toHaveBeenCalledWith(
			expect.objectContaining({
				localScores: [],
			}),
		);
		expect(downloadProfileFormMocks.tierGroupList).toHaveBeenCalledWith(
			expect.objectContaining({
				downloadFormats: ebookFormats,
			}),
		);

		await page.getByLabelText("Name").fill("New Profile");
		await page.getByLabelText("Root Folder").fill("/library/books");
		await page.getByRole("button", { name: "Seed CF scores" }).click();
		await page.getByRole("button", { name: "Save" }).click();

		expect(downloadProfileFormMocks.validateForm).toHaveBeenCalledTimes(1);
		expect(downloadProfileFormMocks.validateForm.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				contentType: "ebook",
				name: "New Profile",
				rootFolderPath: "/library/books",
			}),
		);
		expect(onSubmitWithId).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "New Profile",
				rootFolderPath: "/library/books",
			}),
			[{ customFormatId: 88, score: 11 }],
		);
		expect(onSubmit).not.toHaveBeenCalled();
		await expect
			.element(page.getByText("Unable to save profile"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Root folder already exists"))
			.not.toBeInTheDocument();
	});

	it("shows validation errors without submitting", async () => {
		const onSubmit = vi.fn();
		const onSubmitWithId = vi.fn();

		downloadProfileFormMocks.validateForm.mockReturnValue({
			errors: {
				items: "Choose at least one format",
				name: "Name is required",
				rootFolderPath: "Root folder is required",
			},
			success: false,
		});

		await renderWithProviders(
			<DownloadProfileForm
				downloadFormats={ebookFormats}
				onCancel={vi.fn()}
				onSubmit={onSubmit}
				onSubmitWithId={onSubmitWithId}
				serverCwd="/srv"
			/>,
		);

		await page.getByRole("button", { name: "Save" }).click();

		await expect
			.element(page.getByText("Name is required"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Root folder is required"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Choose at least one format"))
			.toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(onSubmitWithId).not.toHaveBeenCalled();
	});

	it("saves root folder changes directly when file counting returns zero", async () => {
		const onSubmit = vi.fn();

		downloadProfileFormMocks.validateForm.mockReturnValue({
			data: {
				categories: [1000],
				contentType: "ebook",
				cutoff: 0,
				icon: "book",
				language: "en",
				minCustomFormatScore: 5,
				name: "Existing Profile",
				items: [[1], [2]],
				rootFolderPath: "/library/new",
				upgradeAllowed: false,
				upgradeUntilCustomFormatScore: 7,
			},
			success: true,
		});
		downloadProfileFormMocks.countProfileFilesFn.mockResolvedValueOnce({
			count: 0,
		});

		const initialValues = {
			categories: [1000],
			contentType: "ebook",
			cutoff: 0,
			icon: "book",
			id: 7,
			items: [[1], [2]],
			language: "en",
			minCustomFormatScore: 5,
			name: "Existing Profile",
			rootFolderPath: "/library/old",
			upgradeAllowed: false,
			upgradeUntilCustomFormatScore: 7,
		} satisfies ComponentProps<typeof DownloadProfileForm>["initialValues"];

		await renderWithProviders(
			<DownloadProfileForm
				downloadFormats={ebookFormats}
				initialValues={initialValues}
				onCancel={vi.fn()}
				onSubmit={onSubmit}
				serverCwd="/srv"
			/>,
		);

		await page.getByLabelText("Root Folder").fill("/library/new");
		await page.getByRole("button", { name: "Save" }).click();
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({ rootFolderPath: "/library/new" }),
		);
		await expect.element(page.getByText("Move Files?")).not.toBeInTheDocument();

		expect(downloadProfileFormMocks.moveProfileFilesFn).not.toHaveBeenCalled();
	});

	it("can skip moving files after a root folder change", async () => {
		const onSubmit = vi.fn();

		downloadProfileFormMocks.validateForm.mockReturnValue({
			data: {
				categories: [1000],
				contentType: "ebook",
				cutoff: 0,
				icon: "book",
				language: "en",
				minCustomFormatScore: 5,
				name: "Existing Profile",
				items: [[1], [2]],
				rootFolderPath: "/library/new",
				upgradeAllowed: false,
				upgradeUntilCustomFormatScore: 7,
			},
			success: true,
		});
		downloadProfileFormMocks.countProfileFilesFn.mockResolvedValue({
			count: 2,
		});

		await renderWithProviders(
			<DownloadProfileForm
				downloadFormats={ebookFormats}
				initialValues={{
					categories: [1000],
					contentType: "ebook",
					cutoff: 0,
					icon: "book",
					id: 7,
					items: [[1], [2]],
					language: "en",
					minCustomFormatScore: 5,
					name: "Existing Profile",
					rootFolderPath: "/library/old",
					upgradeAllowed: false,
					upgradeUntilCustomFormatScore: 7,
				}}
				onCancel={vi.fn()}
				onSubmit={onSubmit}
				serverCwd="/srv"
			/>,
		);

		await page.getByLabelText("Root Folder").fill("/library/new");
		await page.getByRole("button", { name: "Save" }).click();
		await expect
			.element(page.getByText("2 files will be moved."))
			.toBeInTheDocument();
		await page.getByRole("button", { name: "Don't Move" }).click();

		expect(downloadProfileFormMocks.moveProfileFilesFn).not.toHaveBeenCalled();
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({ rootFolderPath: "/library/new" }),
		);
		await expect.element(page.getByText("Move Files?")).not.toBeInTheDocument();
	});

	it("adds, removes, and filters file formats from the combobox", async () => {
		const onSubmit = vi.fn();
		downloadProfileFormMocks.validateForm.mockReturnValue({
			data: {
				categories: [],
				contentType: "ebook",
				cutoff: 0,
				icon: "book",
				language: "en",
				minCustomFormatScore: 0,
				name: "Existing Profile",
				items: [[2]],
				rootFolderPath: "/library/books",
				upgradeAllowed: false,
				upgradeUntilCustomFormatScore: 0,
			},
			success: true,
		});

		await renderWithProviders(
			<DownloadProfileForm
				downloadFormats={ebookFormats}
				initialValues={{
					categories: [],
					contentType: "ebook",
					cutoff: 1,
					icon: "book",
					id: 9,
					items: [[1]],
					language: "en",
					minCustomFormatScore: 0,
					name: "Existing Profile",
					rootFolderPath: "/library/books",
					upgradeAllowed: true,
					upgradeUntilCustomFormatScore: 0,
				}}
				onCancel={vi.fn()}
				onSubmit={onSubmit}
				serverCwd="/srv"
			/>,
		);

		await page.getByPlaceholder("Add a format...").click();
		await page.getByRole("button", { name: "PDF", exact: true }).click();
		expect(downloadProfileFormMocks.tierGroupList).toHaveBeenLastCalledWith(
			expect.objectContaining({ items: [[1], [2]] }),
		);
		await expect
			.element(page.getByPlaceholder("All formats added"))
			.toBeDisabled();

		await page.getByRole("button", { name: "Remove EPUB" }).click();
		expect(downloadProfileFormMocks.tierGroupList).toHaveBeenLastCalledWith(
			expect.objectContaining({ cutoff: 0, items: [[2]] }),
		);
		await page.getByRole("button", { name: "Keep PDF only" }).click();
		expect(downloadProfileFormMocks.tierGroupList).toHaveBeenLastCalledWith(
			expect.objectContaining({ items: [[2]] }),
		);

		await page.getByRole("button", { name: "Save" }).click();
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({ items: [[2]] }),
		);
	});

	it("supports keyboard selection, outside click closing, and folder browsing", async () => {
		await renderWithProviders(
			<DownloadProfileForm
				downloadFormats={[
					...ebookFormats,
					{ contentTypes: ["ebook"], id: 3, title: "MOBI" },
				]}
				initialValues={{
					categories: [],
					contentType: "ebook",
					cutoff: 0,
					icon: "book",
					id: 10,
					items: [[1]],
					language: "en",
					minCustomFormatScore: 0,
					name: "Existing Profile",
					rootFolderPath: "",
					upgradeAllowed: false,
					upgradeUntilCustomFormatScore: 0,
				}}
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				serverCwd="/srv"
			/>,
		);

		const searchInput = page.getByPlaceholder("Add a format...");
		await searchInput.click();
		await userEvent.keyboard("{ArrowDown}{Enter}");
		expect(downloadProfileFormMocks.tierGroupList).toHaveBeenLastCalledWith(
			expect.objectContaining({ items: [[1], [3]] }),
		);

		await page.getByRole("button", { name: "Remove EPUB" }).click();
		await page.getByPlaceholder("Add a format...").click();
		expect(document.querySelectorAll("[data-item]")).toHaveLength(1);
		document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		await new Promise((resolve) => requestAnimationFrame(resolve));
		expect(document.querySelectorAll("[data-item]")).toHaveLength(0);

		const rootFolder = page.getByLabelText("Root Folder");
		await expect.element(rootFolder).toHaveValue("");
		const browseButton = document.querySelector(
			"#root-folder + button",
		) as HTMLButtonElement | null;
		if (!browseButton) {
			throw new Error("Browse button not found");
		}
		await page.elementLocator(browseButton).click();
		expect(
			downloadProfileFormMocks.directoryBrowserDialog,
		).toHaveBeenLastCalledWith(
			expect.objectContaining({ initialPath: "/srv", open: true }),
		);
		await page.getByRole("button", { name: "Choose path" }).click();
		await expect.element(rootFolder).toHaveValue("/library/new");
	});

	it("shows an empty combobox result when no file format matches", async () => {
		await renderWithProviders(
			<DownloadProfileForm
				downloadFormats={ebookFormats}
				initialValues={{
					categories: [],
					contentType: "ebook",
					cutoff: 0,
					icon: "book",
					id: 10,
					items: [[1]],
					language: "en",
					minCustomFormatScore: 0,
					name: "Existing Profile",
					rootFolderPath: "/library/books",
					upgradeAllowed: false,
					upgradeUntilCustomFormatScore: 0,
				}}
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				serverCwd="/srv"
			/>,
		);

		await page.getByPlaceholder("Add a format...").fill("mobi");
		await expect
			.element(page.getByText("No formats found."))
			.toBeInTheDocument();
	});

	it("can cancel a root-folder move prompt without submitting", async () => {
		const onSubmit = vi.fn();
		downloadProfileFormMocks.validateForm.mockReturnValue({
			data: {
				categories: [1000],
				contentType: "ebook",
				cutoff: 0,
				icon: "book",
				language: "en",
				minCustomFormatScore: 5,
				name: "Existing Profile",
				items: [[1]],
				rootFolderPath: "/library/new",
				upgradeAllowed: false,
				upgradeUntilCustomFormatScore: 7,
			},
			success: true,
		});
		downloadProfileFormMocks.countProfileFilesFn.mockResolvedValue({
			count: 3,
		});

		await renderWithProviders(
			<DownloadProfileForm
				downloadFormats={ebookFormats}
				initialValues={{
					categories: [1000],
					contentType: "ebook",
					cutoff: 0,
					icon: "book",
					id: 7,
					items: [[1]],
					language: "en",
					minCustomFormatScore: 5,
					name: "Existing Profile",
					rootFolderPath: "/library/old",
					upgradeAllowed: false,
					upgradeUntilCustomFormatScore: 7,
				}}
				onCancel={vi.fn()}
				onSubmit={onSubmit}
				serverCwd="/srv"
			/>,
		);

		await page.getByLabelText("Root Folder").fill("/library/new");
		await page.getByRole("button", { name: "Save" }).click();
		await expect.element(page.getByText("Move Files?")).toBeInTheDocument();
		await page.getByRole("button", { name: "Cancel" }).last().click();

		await expect.element(page.getByText("Move Files?")).not.toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("reports move failures but still saves the validated profile", async () => {
		const onSubmit = vi.fn();
		downloadProfileFormMocks.validateForm.mockReturnValue({
			data: {
				categories: [1000],
				contentType: "ebook",
				cutoff: 0,
				icon: "book",
				language: "en",
				minCustomFormatScore: 5,
				name: "Existing Profile",
				items: [[1]],
				rootFolderPath: "/library/new",
				upgradeAllowed: false,
				upgradeUntilCustomFormatScore: 7,
			},
			success: true,
		});
		downloadProfileFormMocks.countProfileFilesFn.mockResolvedValue({
			count: 2,
		});
		downloadProfileFormMocks.moveProfileFilesFn.mockRejectedValue(
			new Error("disk locked"),
		);

		await renderWithProviders(
			<DownloadProfileForm
				downloadFormats={ebookFormats}
				initialValues={{
					categories: [1000],
					contentType: "ebook",
					cutoff: 0,
					icon: "book",
					id: 7,
					items: [[1]],
					language: "en",
					minCustomFormatScore: 5,
					name: "Existing Profile",
					rootFolderPath: "/library/old",
					upgradeAllowed: false,
					upgradeUntilCustomFormatScore: 7,
				}}
				onCancel={vi.fn()}
				onSubmit={onSubmit}
				serverCwd="/srv"
			/>,
		);

		await page.getByLabelText("Root Folder").fill("/library/new");
		await page.getByRole("button", { name: "Save" }).click();
		await expect
			.element(page.getByText("2 files will be moved."))
			.toBeInTheDocument();
		await page.getByRole("button", { name: "Move Files" }).click();

		expect(downloadProfileFormMocks.toastError).toHaveBeenCalledWith(
			"Failed to move files: disk locked",
		);
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({ rootFolderPath: "/library/new" }),
		);
	});

	it("prompts to move files when the root folder changes and submits after moving", async () => {
		const onSubmit = vi.fn();

		downloadProfileFormMocks.validateForm.mockReturnValue({
			data: {
				categories: [1000],
				contentType: "ebook",
				cutoff: 0,
				icon: "book",
				language: "en",
				minCustomFormatScore: 5,
				name: "Existing Profile",
				items: [[1], [2]],
				rootFolderPath: "/library/new",
				upgradeAllowed: false,
				upgradeUntilCustomFormatScore: 7,
			},
			success: true,
		});
		downloadProfileFormMocks.countProfileFilesFn.mockResolvedValue({
			count: 1,
		});
		downloadProfileFormMocks.moveProfileFilesFn.mockResolvedValue({
			errors: ["could not move one file"],
			movedCount: 1,
		});

		await renderWithProviders(
			<DownloadProfileForm
				downloadFormats={ebookFormats}
				initialValues={{
					categories: [1000],
					contentType: "ebook",
					cutoff: 0,
					icon: "book",
					id: 7,
					items: [[1, 999], [2], []],
					language: "en",
					minCustomFormatScore: 5,
					name: "Existing Profile",
					rootFolderPath: "/library/old",
					upgradeAllowed: false,
					upgradeUntilCustomFormatScore: 7,
				}}
				onCancel={vi.fn()}
				onSubmit={onSubmit}
				serverCwd="/srv"
				serverError="Root folder already exists"
			/>,
		);

		expect(downloadProfileFormMocks.tierGroupList).toHaveBeenCalledWith(
			expect.objectContaining({
				items: [[1], [2]],
			}),
		);

		await page.getByLabelText("Root Folder").fill("/library/new");
		await page.getByRole("button", { name: "Save" }).click();

		expect(downloadProfileFormMocks.countProfileFilesFn).toHaveBeenCalledWith({
			data: { profileId: 7 },
		});
		await expect
			.element(page.getByText("Root folder already exists"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Move Files?")).toBeInTheDocument();
		await expect
			.element(page.getByText("1 file will be moved."))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Move Files" }).click();

		expect(downloadProfileFormMocks.moveProfileFilesFn).toHaveBeenCalledWith({
			data: {
				newRootFolder: "/library/new",
				oldRootFolder: "/library/old",
				profileId: 7,
			},
		});
		expect(downloadProfileFormMocks.toastSuccess).toHaveBeenCalledWith(
			"Moved 1 file with 1 error",
		);
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				rootFolderPath: "/library/new",
			}),
		);
	});
});
