import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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
