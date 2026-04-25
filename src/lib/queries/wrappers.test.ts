import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "../query-keys";
import {
	customFormatsListQuery,
	profileCustomFormatsQuery,
} from "./custom-formats";
import { downloadClientsListQuery } from "./download-clients";
import {
	downloadFormatsListQuery,
	downloadProfilesListQuery,
} from "./download-profiles";
import { browseDirectoryQuery } from "./filesystem";
import {
	hardcoverAuthorQuery,
	hardcoverBookLanguagesQuery,
	hardcoverSeriesCompleteQuery,
	hardcoverSingleBookQuery,
} from "./hardcover";
import {
	bookReleaseStatusQuery,
	hasEnabledIndexersQuery,
	indexerStatusesQuery,
	indexersListQuery,
	syncedIndexersListQuery,
} from "./indexers";
import { metadataProfileQuery, settingsMapQuery } from "./settings";
import { systemStatusQuery } from "./system-status";
import { scheduledTasksQuery } from "./tasks";
import { tmdbSearchMoviesQuery, tmdbSearchShowsQuery } from "./tmdb";
import { userSettingsQuery } from "./user-settings";

const queryModuleMocks = vi.hoisted(() => ({
	getCustomFormatsFn: vi.fn(),
	getProfileCustomFormatsFn: vi.fn(),
	getDownloadClientsFn: vi.fn(),
	getDownloadFormatsFn: vi.fn(),
	getDownloadProfilesFn: vi.fn(),
	browseDirectoryFn: vi.fn(),
	getSeriesFromHardcoverFn: vi.fn(),
	getHardcoverAuthorFn: vi.fn(),
	getHardcoverBookDetailFn: vi.fn(),
	getHardcoverBookLanguagesFn: vi.fn(),
	getBookReleaseStatusFn: vi.fn(),
	getIndexerStatusesFn: vi.fn(),
	getIndexersFn: vi.fn(),
	getSyncedIndexersFn: vi.fn(),
	hasEnabledIndexersFn: vi.fn(),
	getMetadataProfileFn: vi.fn(),
	getSettingsFn: vi.fn(),
	getSystemStatusFn: vi.fn(),
	getScheduledTasksFn: vi.fn(),
	searchTmdbMoviesFn: vi.fn(),
	searchTmdbShowsFn: vi.fn(),
	getUserSettingsFn: vi.fn(),
}));

vi.mock("src/server/custom-formats", () => ({
	getCustomFormatsFn: queryModuleMocks.getCustomFormatsFn,
	getProfileCustomFormatsFn: queryModuleMocks.getProfileCustomFormatsFn,
}));

vi.mock("src/server/blocklist", () => ({}));
vi.mock("src/server/books", () => ({}));
vi.mock("src/server/dashboard", () => ({}));

vi.mock("src/server/download-clients", () => ({
	getDownloadClientsFn: queryModuleMocks.getDownloadClientsFn,
}));

vi.mock("src/server/download-profiles", () => ({
	getDownloadFormatsFn: queryModuleMocks.getDownloadFormatsFn,
	getDownloadProfilesFn: queryModuleMocks.getDownloadProfilesFn,
}));

vi.mock("src/server/filesystem", () => ({
	browseDirectoryFn: queryModuleMocks.browseDirectoryFn,
}));

vi.mock("src/server/history", () => ({}));

vi.mock("src/server/authors", () => ({
	getSeriesFromHardcoverFn: queryModuleMocks.getSeriesFromHardcoverFn,
}));

vi.mock("src/server/search", () => ({
	getHardcoverAuthorFn: queryModuleMocks.getHardcoverAuthorFn,
	getHardcoverBookDetailFn: queryModuleMocks.getHardcoverBookDetailFn,
	getHardcoverBookLanguagesFn: queryModuleMocks.getHardcoverBookLanguagesFn,
}));

vi.mock("src/server/indexers", () => ({
	getBookReleaseStatusFn: queryModuleMocks.getBookReleaseStatusFn,
	getIndexerStatusesFn: queryModuleMocks.getIndexerStatusesFn,
	getIndexersFn: queryModuleMocks.getIndexersFn,
	getSyncedIndexersFn: queryModuleMocks.getSyncedIndexersFn,
	hasEnabledIndexersFn: queryModuleMocks.hasEnabledIndexersFn,
}));

vi.mock("src/server/movies", () => ({}));
vi.mock("src/server/queue", () => ({}));
vi.mock("src/server/series", () => ({}));

vi.mock("src/server/settings", () => ({
	getMetadataProfileFn: queryModuleMocks.getMetadataProfileFn,
	getSettingsFn: queryModuleMocks.getSettingsFn,
}));

vi.mock("src/server/shows", () => ({}));

vi.mock("src/server/system-status", () => ({
	getSystemStatusFn: queryModuleMocks.getSystemStatusFn,
}));

vi.mock("src/server/tasks", () => ({
	getScheduledTasksFn: queryModuleMocks.getScheduledTasksFn,
}));

vi.mock("src/server/tmdb/search", () => ({
	searchTmdbMoviesFn: queryModuleMocks.searchTmdbMoviesFn,
	searchTmdbShowsFn: queryModuleMocks.searchTmdbShowsFn,
}));

vi.mock("src/server/unmapped-files", () => ({}));

vi.mock("src/server/user-settings", () => ({
	getUserSettingsFn: queryModuleMocks.getUserSettingsFn,
}));

vi.mock("./authors", () => ({}));
vi.mock("./blocklist", () => ({}));
vi.mock("./books", () => ({}));
vi.mock("./dashboard", () => ({}));
vi.mock("./history", () => ({}));
vi.mock("./imports", () => ({}));
vi.mock("./movies", () => ({}));
vi.mock("./queue", () => ({}));
vi.mock("./series", () => ({}));
vi.mock("./shows", () => ({}));
vi.mock("./unmapped-files", () => ({}));

beforeEach(() => {
	vi.clearAllMocks();
});

const runQueryFn = <T>(queryFn: unknown) => {
	if (typeof queryFn !== "function") {
		throw new Error("queryFn is missing");
	}

	return (queryFn as (context: never) => Promise<T>)({} as never);
};

describe("query wrappers", () => {
	it("builds the custom formats queries", async () => {
		queryModuleMocks.getCustomFormatsFn.mockResolvedValueOnce("formats");
		queryModuleMocks.getProfileCustomFormatsFn.mockResolvedValueOnce("scores");

		const listQuery = customFormatsListQuery();
		expect(listQuery.queryKey).toEqual(queryKeys.customFormats.lists());
		await expect(runQueryFn<string>(listQuery.queryFn)).resolves.toBe(
			"formats",
		);
		expect(queryModuleMocks.getCustomFormatsFn).toHaveBeenCalledTimes(1);

		const profileQuery = profileCustomFormatsQuery(42);
		expect(profileQuery.queryKey).toEqual(
			queryKeys.customFormats.profileScores(42),
		);
		await expect(runQueryFn<string>(profileQuery.queryFn)).resolves.toBe(
			"scores",
		);
		expect(queryModuleMocks.getProfileCustomFormatsFn).toHaveBeenCalledWith({
			data: { profileId: 42 },
		});
	});

	it("builds the download-client and download-profile queries", async () => {
		queryModuleMocks.getDownloadClientsFn.mockResolvedValueOnce("clients");
		queryModuleMocks.getDownloadProfilesFn.mockResolvedValueOnce("profiles");
		queryModuleMocks.getDownloadFormatsFn.mockResolvedValueOnce("formats");

		const clientsQuery = downloadClientsListQuery();
		expect(clientsQuery.queryKey).toEqual(queryKeys.downloadClients.lists());
		await expect(runQueryFn<string>(clientsQuery.queryFn)).resolves.toBe(
			"clients",
		);

		const profilesQuery = downloadProfilesListQuery();
		expect(profilesQuery.queryKey).toEqual(queryKeys.downloadProfiles.lists());
		await expect(runQueryFn<string>(profilesQuery.queryFn)).resolves.toBe(
			"profiles",
		);

		const formatsQuery = downloadFormatsListQuery();
		expect(formatsQuery.queryKey).toEqual(queryKeys.downloadFormats.lists());
		await expect(runQueryFn<string>(formatsQuery.queryFn)).resolves.toBe(
			"formats",
		);
	});

	it("builds filesystem browse queries with the hidden toggle and stale time", async () => {
		queryModuleMocks.browseDirectoryFn.mockResolvedValueOnce("visible");
		queryModuleMocks.browseDirectoryFn.mockResolvedValueOnce("hidden");

		const visibleQuery = browseDirectoryQuery("/media", false);
		expect(visibleQuery.queryKey).toEqual([
			...queryKeys.filesystem.browse("/media"),
			false,
		]);
		expect(visibleQuery.staleTime).toBe(5000);
		await expect(runQueryFn<string>(visibleQuery.queryFn)).resolves.toBe(
			"visible",
		);
		expect(queryModuleMocks.browseDirectoryFn).toHaveBeenCalledWith({
			data: { path: "/media", showHidden: false },
		});

		const hiddenQuery = browseDirectoryQuery("/media");
		expect(hiddenQuery.queryKey).toEqual([
			...queryKeys.filesystem.browse("/media"),
			true,
		]);
		expect(hiddenQuery.staleTime).toBe(5000);
		await expect(runQueryFn<string>(hiddenQuery.queryFn)).resolves.toBe(
			"hidden",
		);
		expect(queryModuleMocks.browseDirectoryFn).toHaveBeenCalledWith({
			data: { path: "/media", showHidden: true },
		});
	});

	it("builds hardcover queries with the expected payloads and cache hints", async () => {
		const authorParams = {
			page: 2,
			pageSize: 25,
			language: "en",
			sortBy: "title" as const,
			sortDir: "asc" as const,
		};
		queryModuleMocks.getHardcoverAuthorFn.mockResolvedValueOnce("author");
		queryModuleMocks.getHardcoverBookLanguagesFn.mockResolvedValueOnce(
			"languages",
		);
		queryModuleMocks.getHardcoverBookDetailFn.mockResolvedValueOnce("detail");
		queryModuleMocks.getSeriesFromHardcoverFn.mockResolvedValueOnce("series");

		const authorQuery = hardcoverAuthorQuery(7, authorParams);
		expect(authorQuery.queryKey).toEqual(
			queryKeys.hardcover.author(7, authorParams),
		);
		await expect(runQueryFn<string>(authorQuery.queryFn)).resolves.toBe(
			"author",
		);
		expect(queryModuleMocks.getHardcoverAuthorFn).toHaveBeenCalledWith({
			data: { foreignAuthorId: 7, ...authorParams },
		});

		const languagesQuery = hardcoverBookLanguagesQuery(11);
		expect(languagesQuery.queryKey).toEqual(
			queryKeys.hardcover.bookLanguages(11),
		);
		await expect(runQueryFn<string>(languagesQuery.queryFn)).resolves.toBe(
			"languages",
		);
		expect(queryModuleMocks.getHardcoverBookLanguagesFn).toHaveBeenCalledWith({
			data: { foreignBookId: 11 },
		});

		const detailQuery = hardcoverSingleBookQuery(13);
		expect(detailQuery.queryKey).toEqual(queryKeys.hardcover.bookDetail(13));
		await expect(runQueryFn<string>(detailQuery.queryFn)).resolves.toBe(
			"detail",
		);
		expect(queryModuleMocks.getHardcoverBookDetailFn).toHaveBeenCalledWith({
			data: { foreignBookId: 13 },
		});

		const seriesQuery = hardcoverSeriesCompleteQuery([3, 5], 9);
		expect(seriesQuery.queryKey).toEqual(
			queryKeys.hardcover.seriesComplete([3, 5], 9),
		);
		expect(seriesQuery.staleTime).toBe(1000 * 60 * 30);
		await expect(runQueryFn<string>(seriesQuery.queryFn)).resolves.toBe(
			"series",
		);
		expect(queryModuleMocks.getSeriesFromHardcoverFn).toHaveBeenCalledWith({
			data: { foreignSeriesIds: [3, 5], excludeForeignAuthorId: 9 },
		});
	});

	it("builds indexer queries with the expected status and cache flags", async () => {
		queryModuleMocks.getIndexersFn.mockResolvedValueOnce("indexers");
		queryModuleMocks.getSyncedIndexersFn.mockResolvedValueOnce("synced");
		queryModuleMocks.hasEnabledIndexersFn.mockResolvedValueOnce(true);
		queryModuleMocks.getBookReleaseStatusFn.mockResolvedValueOnce("release");
		queryModuleMocks.getIndexerStatusesFn.mockResolvedValueOnce("statuses");

		const indexersQuery = indexersListQuery();
		expect(indexersQuery.queryKey).toEqual(queryKeys.indexers.lists());
		await expect(runQueryFn<string>(indexersQuery.queryFn)).resolves.toBe(
			"indexers",
		);

		const syncedQuery = syncedIndexersListQuery();
		expect(syncedQuery.queryKey).toEqual(queryKeys.syncedIndexers.lists());
		await expect(runQueryFn<string>(syncedQuery.queryFn)).resolves.toBe(
			"synced",
		);

		const enabledQuery = hasEnabledIndexersQuery();
		expect(enabledQuery.queryKey).toEqual(queryKeys.indexers.hasEnabled());
		await expect(runQueryFn<boolean>(enabledQuery.queryFn)).resolves.toBe(true);

		const releaseQuery = bookReleaseStatusQuery(123);
		expect(releaseQuery.queryKey).toEqual(
			queryKeys.indexers.releaseStatus(123),
		);
		expect(releaseQuery.staleTime).toBe(30_000);
		await expect(runQueryFn<string>(releaseQuery.queryFn)).resolves.toBe(
			"release",
		);
		expect(queryModuleMocks.getBookReleaseStatusFn).toHaveBeenCalledWith({
			data: { bookId: 123 },
		});

		const statusesQuery = indexerStatusesQuery();
		expect(statusesQuery.queryKey).toEqual([
			...queryKeys.indexers.all,
			"statuses",
		]);
		expect(statusesQuery.staleTime).toBe(30_000);
		await expect(runQueryFn<string>(statusesQuery.queryFn)).resolves.toBe(
			"statuses",
		);
	});

	it("builds the settings, system, tasks, TMDB, and user-settings queries", async () => {
		queryModuleMocks.getSettingsFn.mockResolvedValueOnce("settings");
		queryModuleMocks.getMetadataProfileFn.mockResolvedValueOnce("metadata");
		queryModuleMocks.getSystemStatusFn.mockResolvedValueOnce("system");
		queryModuleMocks.getScheduledTasksFn.mockResolvedValueOnce("tasks");
		queryModuleMocks.searchTmdbMoviesFn.mockResolvedValueOnce("movies");
		queryModuleMocks.searchTmdbShowsFn.mockResolvedValueOnce("shows");
		queryModuleMocks.getUserSettingsFn.mockResolvedValueOnce("user-settings");

		const settingsQuery = settingsMapQuery();
		expect(settingsQuery.queryKey).toEqual(queryKeys.settings.map());
		await expect(runQueryFn<string>(settingsQuery.queryFn)).resolves.toBe(
			"settings",
		);

		const metadataQuery = metadataProfileQuery();
		expect(metadataQuery.queryKey).toEqual(queryKeys.metadataProfile.all);
		await expect(runQueryFn<string>(metadataQuery.queryFn)).resolves.toBe(
			"metadata",
		);

		const systemQuery = systemStatusQuery();
		expect(systemQuery.queryKey).toEqual(queryKeys.systemStatus.detail());
		await expect(runQueryFn<string>(systemQuery.queryFn)).resolves.toBe(
			"system",
		);

		const tasksQuery = scheduledTasksQuery();
		expect(tasksQuery.queryKey).toEqual(queryKeys.tasks.list());
		expect(tasksQuery.refetchInterval).toBe(60_000);
		await expect(runQueryFn<string>(tasksQuery.queryFn)).resolves.toBe("tasks");

		const shortMoviesQuery = tmdbSearchMoviesQuery("m");
		expect(shortMoviesQuery.queryKey).toEqual(queryKeys.tmdb.searchMovies("m"));
		expect(shortMoviesQuery.enabled).toBe(false);
		await expect(runQueryFn<string>(shortMoviesQuery.queryFn)).resolves.toBe(
			"movies",
		);
		expect(queryModuleMocks.searchTmdbMoviesFn).toHaveBeenCalledWith({
			data: { query: "m" },
		});

		const longShowsQuery = tmdbSearchShowsQuery("show");
		expect(longShowsQuery.queryKey).toEqual(queryKeys.tmdb.searchShows("show"));
		expect(longShowsQuery.enabled).toBe(true);
		await expect(runQueryFn<string>(longShowsQuery.queryFn)).resolves.toBe(
			"shows",
		);
		expect(queryModuleMocks.searchTmdbShowsFn).toHaveBeenCalledWith({
			data: { query: "show" },
		});

		const userSettings = userSettingsQuery("library-table");
		expect(userSettings.queryKey).toEqual(
			queryKeys.userSettings.byTable("library-table"),
		);
		expect(userSettings.staleTime).toBe(Number.POSITIVE_INFINITY);
		await expect(runQueryFn<string>(userSettings.queryFn)).resolves.toBe(
			"user-settings",
		);
		expect(queryModuleMocks.getUserSettingsFn).toHaveBeenCalledWith({
			data: { tableId: "library-table" },
		});
	});

	it("re-exports the targeted query wrappers from the barrel", async () => {
		vi.resetModules();
		vi.doMock("./authors", () => ({}));
		vi.doMock("./blocklist", () => ({}));
		vi.doMock("./books", () => ({}));
		vi.doMock("./custom-formats", () => ({
			customFormatsListQuery,
			profileCustomFormatsQuery,
		}));
		vi.doMock("./dashboard", () => ({}));
		vi.doMock("./download-clients", () => ({ downloadClientsListQuery }));
		vi.doMock("./download-profiles", () => ({
			downloadFormatsListQuery,
			downloadProfilesListQuery,
		}));
		vi.doMock("./filesystem", () => ({ browseDirectoryQuery }));
		vi.doMock("./hardcover", () => ({
			hardcoverAuthorQuery,
			hardcoverBookLanguagesQuery,
			hardcoverSeriesCompleteQuery,
			hardcoverSingleBookQuery,
		}));
		vi.doMock("./history", () => ({}));
		vi.doMock("./imports", () => ({}));
		vi.doMock("./indexers", () => ({
			bookReleaseStatusQuery,
			hasEnabledIndexersQuery,
			indexerStatusesQuery,
			indexersListQuery,
			syncedIndexersListQuery,
		}));
		vi.doMock("./movies", () => ({}));
		vi.doMock("./queue", () => ({}));
		vi.doMock("./series", () => ({}));
		vi.doMock("./settings", () => ({
			metadataProfileQuery,
			settingsMapQuery,
		}));
		vi.doMock("./shows", () => ({}));
		vi.doMock("./system-status", () => ({ systemStatusQuery }));
		vi.doMock("./tasks", () => ({ scheduledTasksQuery }));
		vi.doMock("./tmdb", () => ({
			tmdbSearchMoviesQuery,
			tmdbSearchShowsQuery,
		}));
		vi.doMock("./unmapped-files", () => ({}));
		vi.doMock("./user-settings", () => ({ userSettingsQuery }));

		const queryBarrel = await import("./index");

		expect(queryBarrel.downloadClientsListQuery).toBe(downloadClientsListQuery);
		expect(queryBarrel.downloadProfilesListQuery).toBe(
			downloadProfilesListQuery,
		);
		expect(queryBarrel.downloadFormatsListQuery).toBe(downloadFormatsListQuery);
		expect(queryBarrel.browseDirectoryQuery).toBe(browseDirectoryQuery);
		expect(queryBarrel.hardcoverAuthorQuery).toBe(hardcoverAuthorQuery);
		expect(queryBarrel.hardcoverBookLanguagesQuery).toBe(
			hardcoverBookLanguagesQuery,
		);
		expect(queryBarrel.hardcoverSingleBookQuery).toBe(hardcoverSingleBookQuery);
		expect(queryBarrel.hardcoverSeriesCompleteQuery).toBe(
			hardcoverSeriesCompleteQuery,
		);
		expect(queryBarrel.indexersListQuery).toBe(indexersListQuery);
		expect(queryBarrel.syncedIndexersListQuery).toBe(syncedIndexersListQuery);
		expect(queryBarrel.hasEnabledIndexersQuery).toBe(hasEnabledIndexersQuery);
		expect(queryBarrel.bookReleaseStatusQuery).toBe(bookReleaseStatusQuery);
		expect(queryBarrel.indexerStatusesQuery).toBe(indexerStatusesQuery);
		expect(queryBarrel.settingsMapQuery).toBe(settingsMapQuery);
		expect(queryBarrel.metadataProfileQuery).toBe(metadataProfileQuery);
		expect(queryBarrel.systemStatusQuery).toBe(systemStatusQuery);
		expect(queryBarrel.scheduledTasksQuery).toBe(scheduledTasksQuery);
		expect(queryBarrel.userSettingsQuery).toBe(userSettingsQuery);
	});
});
