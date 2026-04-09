import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createContext, type JSX, type ReactNode, useContext } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Query = {
	queryKey?: readonly unknown[];
};

const mediaManagementRouteMocks = vi.hoisted(() => ({
	profiles: [] as Array<{
		contentType: string;
		name: string;
		rootFolderPath: string;
	}>,
	settingsMap: {} as Record<string, unknown>,
	updateSettings: {
		isPending: false,
		mutate: vi.fn(),
	},
	downloadProfilesListQuery: vi.fn(() => ({
		queryKey: ["downloadProfilesList"],
	})),
	settingsMapQuery: vi.fn(() => ({
		queryKey: ["settingsMap"],
	})),
	useSuspenseQuery: vi.fn((query: Query) => {
		if (query.queryKey?.[0] === "settingsMap") {
			return { data: mediaManagementRouteMocks.settingsMap };
		}

		return { data: mediaManagementRouteMocks.profiles };
	}),
}));

const TabsContext = createContext<{
	value: string;
	onValueChange?: (value: string) => void;
} | null>(null);

const SelectContext = createContext<{
	disabled?: boolean;
	onValueChange?: (value: string) => void;
	value: string;
} | null>(null);

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: unknown[]) =>
			mediaManagementRouteMocks.useSuspenseQuery(args[0] as Query),
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to }: { children: ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
	}) => (
		<button disabled={disabled} onClick={onClick} type="button">
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	CardHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		disabled,
		onChange,
		placeholder,
		type,
		value,
	}: {
		disabled?: boolean;
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		type?: string;
		value?: string | number;
	}) => (
		<input
			aria-label={placeholder}
			disabled={disabled}
			onChange={onChange}
			placeholder={placeholder}
			type={type}
			value={value}
		/>
	),
}));

vi.mock("src/components/ui/label", () => ({
	default: ({
		children,
		htmlFor,
	}: {
		children: ReactNode;
		htmlFor?: string;
	}) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("src/components/ui/select", () => {
	function Select({
		children,
		disabled,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onValueChange?: (value: string) => void;
		value: string;
	}) {
		return (
			<SelectContext.Provider value={{ disabled, onValueChange, value }}>
				<div>{children}</div>
			</SelectContext.Provider>
		);
	}

	function SelectContent({ children }: { children: ReactNode }) {
		return <div>{children}</div>;
	}

	function SelectItem({
		children,
		value,
	}: {
		children: ReactNode;
		value: string;
	}) {
		const context = useContext(SelectContext);

		return (
			<button
				disabled={context?.disabled}
				onClick={() => context?.onValueChange?.(value)}
				type="button"
			>
				{children}
			</button>
		);
	}

	function SelectTrigger({ children }: { children: ReactNode }) {
		const context = useContext(SelectContext);

		return (
			<button disabled={context?.disabled} type="button">
				{children}
			</button>
		);
	}

	function SelectValue() {
		const context = useContext(SelectContext);

		return <span>{context?.value}</span>;
	}

	return {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger,
		SelectValue,
	};
});

vi.mock("src/components/ui/switch", () => ({
	default: ({
		checked,
		onCheckedChange,
	}: {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			checked={checked}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			type="checkbox"
		/>
	),
}));

vi.mock("src/components/ui/tabs", () => {
	function Tabs({
		children,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		onValueChange?: (value: string) => void;
		value: string;
	}) {
		return (
			<TabsContext.Provider value={{ onValueChange, value }}>
				<div>{children}</div>
			</TabsContext.Provider>
		);
	}

	function TabsList({ children }: { children: ReactNode }) {
		return <div>{children}</div>;
	}

	function TabsTrigger({
		children,
		value,
	}: {
		children: ReactNode;
		value: string;
	}) {
		const context = useContext(TabsContext);

		return (
			<button onClick={() => context?.onValueChange?.(value)} type="button">
				{children}
			</button>
		);
	}

	function TabsContent({
		children,
		value,
	}: {
		children: ReactNode;
		value: string;
	}) {
		const context = useContext(TabsContext);

		return context?.value === value ? <div>{children}</div> : null;
	}

	return {
		Tabs,
		TabsContent,
		TabsList,
		TabsTrigger,
	};
});

vi.mock("src/hooks/mutations", () => ({
	useUpdateSettings: () => mediaManagementRouteMocks.updateSettings,
}));

vi.mock("src/lib/admin-route", () => ({
	requireAdminBeforeLoad: vi.fn(),
}));

vi.mock("src/lib/queries", () => ({
	downloadProfilesListQuery: () =>
		mediaManagementRouteMocks.downloadProfilesListQuery(),
	settingsMapQuery: () => mediaManagementRouteMocks.settingsMapQuery(),
}));

import { Route } from "./media-management";

function createSettings(overrides: Record<string, unknown> = {}) {
	return {
		"mediaManagement.book.changeFileDate": "none",
		"mediaManagement.book.createEmptyAuthorFolders": true,
		"mediaManagement.book.deleteEmptyAuthorFolders": false,
		"mediaManagement.book.extraFileExtensions": ".jpg,.opf",
		"mediaManagement.book.fileChmod": "0644",
		"mediaManagement.book.folderChmod": "0755",
		"mediaManagement.book.chownGroup": "media",
		"mediaManagement.book.ignoreDeletedBooks": false,
		"mediaManagement.book.importExtraFiles": true,
		"mediaManagement.book.minimumFreeSpace": 100,
		"mediaManagement.book.propersAndRepacks": "preferAndUpgrade",
		"mediaManagement.book.recyclingBin": "/trash",
		"mediaManagement.book.recyclingBinCleanup": 30,
		"mediaManagement.book.renameBooks": true,
		"mediaManagement.book.replaceIllegalCharacters": false,
		"mediaManagement.book.setPermissions": true,
		"mediaManagement.book.skipFreeSpaceCheck": true,
		"mediaManagement.book.useHardLinks": false,
		"mediaManagement.movie.changeFileDate": "none",
		"mediaManagement.movie.chownGroup": "",
		"mediaManagement.movie.createEmptyAuthorFolders": false,
		"mediaManagement.movie.deleteEmptyAuthorFolders": false,
		"mediaManagement.movie.extraFileExtensions": "",
		"mediaManagement.movie.fileChmod": "0644",
		"mediaManagement.movie.folderChmod": "0755",
		"mediaManagement.movie.ignoreDeletedBooks": false,
		"mediaManagement.movie.importExtraFiles": false,
		"mediaManagement.movie.minimumFreeSpace": 100,
		"mediaManagement.movie.propersAndRepacks": "preferAndUpgrade",
		"mediaManagement.movie.recyclingBin": "",
		"mediaManagement.movie.recyclingBinCleanup": 7,
		"mediaManagement.movie.renameBooks": true,
		"mediaManagement.movie.replaceIllegalCharacters": true,
		"mediaManagement.movie.setPermissions": false,
		"mediaManagement.movie.skipFreeSpaceCheck": false,
		"mediaManagement.movie.useHardLinks": true,
		"mediaManagement.tv.animeEpisode": "Anime",
		"mediaManagement.tv.changeFileDate": "releaseDate",
		"mediaManagement.tv.chownGroup": "",
		"mediaManagement.tv.createEmptyAuthorFolders": false,
		"mediaManagement.tv.dailyEpisode": "Daily",
		"mediaManagement.tv.deleteEmptyAuthorFolders": false,
		"mediaManagement.tv.extraFileExtensions": "",
		"mediaManagement.tv.fileChmod": "0644",
		"mediaManagement.tv.folderChmod": "0755",
		"mediaManagement.tv.ignoreDeletedBooks": false,
		"mediaManagement.tv.importExtraFiles": false,
		"mediaManagement.tv.minimumFreeSpace": 100,
		"mediaManagement.tv.propersAndRepacks": "preferAndUpgrade",
		"mediaManagement.tv.recyclingBin": "",
		"mediaManagement.tv.recyclingBinCleanup": 7,
		"mediaManagement.tv.renameBooks": true,
		"mediaManagement.tv.replaceIllegalCharacters": true,
		"mediaManagement.tv.setPermissions": false,
		"mediaManagement.tv.showFolder": "Shows",
		"mediaManagement.tv.skipFreeSpaceCheck": false,
		"mediaManagement.tv.standardEpisode": "Standard",
		"mediaManagement.tv.useHardLinks": true,
		"naming.book.audio.authorFolder": "{Author Name}",
		"naming.book.audio.bookFile":
			"{Author Name} - {Book Title} - Part {PartNumber:00}",
		"naming.book.audio.bookFolder": "{Book Title} ({Release Year})",
		"naming.book.ebook.authorFolder": "{Author Name}",
		"naming.book.ebook.bookFile": "{Author Name} - {Book Title}",
		"naming.book.ebook.bookFolder": "{Book Title} ({Release Year})",
		"naming.movie.movieFile": "{Movie Title} ({Year})",
		"naming.movie.movieFolder": "{Movie Title} ({Year})",
		"naming.tv.animeEpisode": "{Show Title} - S{Season:00}E{Episode:00}",
		"naming.tv.dailyEpisode": "{Show Title} - {Air-Date}",
		"naming.tv.seasonFolder": "Season {Season:00}",
		"naming.tv.showFolder": "{Show Title} ({Year})",
		"naming.tv.standardEpisode": "{Show Title} - S{Season:00}E{Episode:00}",
		...overrides,
	};
}

describe("media-management route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mediaManagementRouteMocks.updateSettings.isPending = false;
	});

	it("ensures both loader queries are prefetched", async () => {
		const ensureQueryData = vi.fn();
		const route = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown> | unknown;
		};

		await route.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(mediaManagementRouteMocks.settingsMapQuery).toHaveBeenCalledTimes(1);
		expect(
			mediaManagementRouteMocks.downloadProfilesListQuery,
		).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["settingsMap"] }),
		);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["downloadProfilesList"] }),
		);
	});

	it("renders book validation and empty root-folder state when profiles are missing", () => {
		mediaManagementRouteMocks.settingsMap = createSettings({
			"naming.book.audio.bookFile": "Audio template without book title",
			"naming.book.ebook.bookFile": "Ebook template without book title",
		});
		mediaManagementRouteMocks.profiles = [];

		const route = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = route.component;
		const view = renderWithProviders(<Component />);

		expect(
			view.getByRole("heading", { name: "Media Management" }),
		).toBeInTheDocument();
		expect(
			view.getAllByText("Template must include {Book Title}"),
		).toHaveLength(2);
		expect(
			view.getByText(
				"No book root folders configured. Add a root folder path in your book download profiles.",
			),
		).toBeInTheDocument();
		expect(view.getByRole("button", { name: "Save Settings" })).toBeDisabled();
	});

	it("saves book and movie settings for the active tab", async () => {
		const user = userEvent.setup();
		mediaManagementRouteMocks.settingsMap = createSettings({
			"naming.movie.movieFile": "{Movie Title} ({Year}) - Original",
			"naming.movie.movieFolder": "{Movie Title} ({Year})",
			"naming.book.audio.bookFile":
				"{Author Name} - {Book Title} - Part {PartNumber:00}",
			"naming.book.ebook.bookFile": "{Author Name} - {Book Title}",
		});
		mediaManagementRouteMocks.profiles = [
			{
				contentType: "ebook",
				name: "eBooks",
				rootFolderPath: "/library/books",
			},
			{
				contentType: "audiobook",
				name: "AudioBooks",
				rootFolderPath: "/library/books",
			},
			{
				contentType: "movie",
				name: "Movies",
				rootFolderPath: "/library/movies",
			},
		];

		const route = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = route.component;
		const view = renderWithProviders(<Component />);
		const ebookBookFileInput = view.getByDisplayValue(
			"{Author Name} - {Book Title}",
		) as HTMLInputElement;
		const audiobookBookFileInput = view.getByDisplayValue(
			"{Author Name} - {Book Title} - Part {PartNumber:00}",
		) as HTMLInputElement;
		const extraExtensionsInput = view.getByDisplayValue(
			".jpg,.opf",
		) as HTMLInputElement;
		const fileChmodInput = view.getByDisplayValue("0644") as HTMLInputElement;
		const folderChmodInput = view.getByDisplayValue("0755") as HTMLInputElement;
		const chownGroupInput = view.getByDisplayValue("media") as HTMLInputElement;

		fireEvent.change(ebookBookFileInput, {
			target: { value: "{Author Name} - {Book Title} (Updated)" },
		});
		fireEvent.change(audiobookBookFileInput, {
			target: {
				value: "{Author Name} - {Book Title} - Part {PartNumber:00} (Updated)",
			},
		});
		await user.click(view.getByRole("button", { name: "Do Not Upgrade" }));
		await user.click(view.getByRole("button", { name: "Release Date" }));
		fireEvent.change(extraExtensionsInput, { target: { value: ".jpg,.epub" } });
		fireEvent.change(fileChmodInput, { target: { value: "0600" } });
		fireEvent.change(folderChmodInput, { target: { value: "0700" } });
		fireEvent.change(chownGroupInput, { target: { value: "books" } });

		await user.click(view.getByRole("button", { name: "Save Settings" }));

		expect(
			mediaManagementRouteMocks.updateSettings.mutate,
		).toHaveBeenCalledTimes(1);
		expect(
			mediaManagementRouteMocks.updateSettings.mutate,
		).toHaveBeenCalledWith(
			expect.arrayContaining([
				{
					key: "naming.book.ebook.bookFile",
					value: "{Author Name} - {Book Title} (Updated)",
				},
				{
					key: "naming.book.audio.bookFile",
					value:
						"{Author Name} - {Book Title} - Part {PartNumber:00} (Updated)",
				},
				{
					key: "mediaManagement.book.propersAndRepacks",
					value: "doNotUpgrade",
				},
				{ key: "mediaManagement.book.changeFileDate", value: "releaseDate" },
				{
					key: "mediaManagement.book.extraFileExtensions",
					value: ".jpg,.epub",
				},
				{ key: "mediaManagement.book.fileChmod", value: "0600" },
				{ key: "mediaManagement.book.folderChmod", value: "0700" },
				{ key: "mediaManagement.book.chownGroup", value: "books" },
			]),
		);
		expect(view.getByText("/library/books")).toBeInTheDocument();
		expect(view.getByText("eBooks, AudioBooks")).toBeInTheDocument();

		await user.click(view.getByRole("button", { name: "Movies" }));
		const movieFileInput = view.getByDisplayValue(
			"{Movie Title} ({Year}) - Original",
		) as HTMLInputElement;
		fireEvent.change(movieFileInput, {
			target: { value: "{Movie Title} ({Year}) - Remastered" },
		});
		await user.click(view.getByRole("button", { name: "Save Settings" }));

		expect(
			mediaManagementRouteMocks.updateSettings.mutate,
		).toHaveBeenCalledTimes(2);
		expect(
			mediaManagementRouteMocks.updateSettings.mutate,
		).toHaveBeenNthCalledWith(
			2,
			expect.arrayContaining([
				{
					key: "naming.movie.movieFile",
					value: "{Movie Title} ({Year}) - Remastered",
				},
				{ key: "mediaManagement.movie.renameBooks", value: "true" },
				{ key: "mediaManagement.movie.useHardLinks", value: "true" },
			]),
		);
	});
});
