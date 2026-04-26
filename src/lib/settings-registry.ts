import { z } from "zod";

export type SettingValue = string | number | boolean | null;

type SettingDefinition<T extends SettingValue> = {
	defaultValue: T;
	schema: z.ZodType<T>;
};

const stringSetting = (defaultValue: string): SettingDefinition<string> => ({
	defaultValue,
	schema: z.string(),
});

const numberSetting = (defaultValue: number): SettingDefinition<number> => ({
	defaultValue,
	schema: z.number(),
});

const booleanSetting = (defaultValue: boolean): SettingDefinition<boolean> => ({
	defaultValue,
	schema: z.boolean(),
});

export const settingsRegistry = {
	"downloadClient.enableCompletedDownloadHandling": booleanSetting(true),
	"downloadClient.redownloadFailed": booleanSetting(true),
	"downloadClient.removeFailed": booleanSetting(true),
	"format.audiobook.defaultDuration": numberSetting(600),
	"format.ebook.defaultPageCount": numberSetting(300),
	"format.movie.defaultRuntime": numberSetting(130),
	"format.tv.defaultEpisodeRuntime": numberSetting(45),
	"general.apiKey": stringSetting(""),
	"general.logLevel": {
		defaultValue: "info",
		schema: z.enum(["trace", "debug", "info", "warn", "error"]),
	},
	"mediaManagement.book.changeFileDate": stringSetting("none"),
	"mediaManagement.book.chownGroup": stringSetting(""),
	"mediaManagement.book.createEmptyAuthorFolders": booleanSetting(false),
	"mediaManagement.book.deleteEmptyAuthorFolders": booleanSetting(false),
	"mediaManagement.book.extraFileExtensions": stringSetting(""),
	"mediaManagement.book.fileChmod": stringSetting("0644"),
	"mediaManagement.book.folderChmod": stringSetting("0755"),
	"mediaManagement.book.ignoreDeletedBooks": booleanSetting(false),
	"mediaManagement.book.importExtraFiles": booleanSetting(false),
	"mediaManagement.book.minimumFreeSpace": numberSetting(100),
	"mediaManagement.book.propersAndRepacks": stringSetting("preferAndUpgrade"),
	"mediaManagement.book.recyclingBin": stringSetting(""),
	"mediaManagement.book.recyclingBinCleanup": numberSetting(7),
	"mediaManagement.book.renameBooks": booleanSetting(false),
	"mediaManagement.book.replaceIllegalCharacters": booleanSetting(true),
	"mediaManagement.book.setPermissions": booleanSetting(false),
	"mediaManagement.book.skipFreeSpaceCheck": booleanSetting(false),
	"mediaManagement.book.useHardLinks": booleanSetting(true),
	"mediaManagement.movie.changeFileDate": stringSetting("none"),
	"mediaManagement.movie.chownGroup": stringSetting(""),
	"mediaManagement.movie.createEmptyAuthorFolders": booleanSetting(false),
	"mediaManagement.movie.deleteEmptyAuthorFolders": booleanSetting(false),
	"mediaManagement.movie.extraFileExtensions": stringSetting(""),
	"mediaManagement.movie.fileChmod": stringSetting("0644"),
	"mediaManagement.movie.folderChmod": stringSetting("0755"),
	"mediaManagement.movie.ignoreDeletedBooks": booleanSetting(false),
	"mediaManagement.movie.importExtraFiles": booleanSetting(false),
	"mediaManagement.movie.minimumFreeSpace": numberSetting(100),
	"mediaManagement.movie.propersAndRepacks": stringSetting("preferAndUpgrade"),
	"mediaManagement.movie.recyclingBin": stringSetting(""),
	"mediaManagement.movie.recyclingBinCleanup": numberSetting(7),
	"mediaManagement.movie.renameBooks": booleanSetting(false),
	"mediaManagement.movie.replaceIllegalCharacters": booleanSetting(true),
	"mediaManagement.movie.setPermissions": booleanSetting(false),
	"mediaManagement.movie.skipFreeSpaceCheck": booleanSetting(false),
	"mediaManagement.movie.useHardLinks": booleanSetting(true),
	"mediaManagement.tv.changeFileDate": stringSetting("none"),
	"mediaManagement.tv.chownGroup": stringSetting(""),
	"mediaManagement.tv.createEmptyAuthorFolders": booleanSetting(false),
	"mediaManagement.tv.deleteEmptyAuthorFolders": booleanSetting(false),
	"mediaManagement.tv.extraFileExtensions": stringSetting(""),
	"mediaManagement.tv.fileChmod": stringSetting("0644"),
	"mediaManagement.tv.folderChmod": stringSetting("0755"),
	"mediaManagement.tv.ignoreDeletedBooks": booleanSetting(false),
	"mediaManagement.tv.importExtraFiles": booleanSetting(false),
	"mediaManagement.tv.minimumFreeSpace": numberSetting(100),
	"mediaManagement.tv.propersAndRepacks": stringSetting("preferAndUpgrade"),
	"mediaManagement.tv.recyclingBin": stringSetting(""),
	"mediaManagement.tv.recyclingBinCleanup": numberSetting(7),
	"mediaManagement.tv.renameBooks": booleanSetting(false),
	"mediaManagement.tv.replaceIllegalCharacters": booleanSetting(true),
	"mediaManagement.tv.setPermissions": booleanSetting(false),
	"mediaManagement.tv.skipFreeSpaceCheck": booleanSetting(false),
	"mediaManagement.tv.useHardLinks": booleanSetting(true),
	"metadata.tmdb.includeAdult": booleanSetting(false),
	"metadata.tmdb.language": stringSetting("en"),
	"metadata.tmdb.region": stringSetting(""),
	"naming.book.audio.authorFolder": stringSetting("{Author Name}"),
	"naming.book.audio.bookFile": stringSetting(
		"{Author Name} - {Book Title} - Part {PartNumber:00}",
	),
	"naming.book.audio.bookFolder": stringSetting(
		"{Book Title} ({Release Year})",
	),
	"naming.book.ebook.authorFolder": stringSetting("{Author Name}"),
	"naming.book.ebook.bookFile": stringSetting("{Author Name} - {Book Title}"),
	"naming.book.ebook.bookFolder": stringSetting(
		"{Book Title} ({Release Year})",
	),
	"naming.movie.movieFile": stringSetting("{Movie Title} ({Year})"),
	"naming.movie.movieFolder": stringSetting("{Movie Title} ({Year})"),
	"naming.tv.animeEpisode": stringSetting(
		"{Show Title} - S{Season:00}E{Episode:00} - {Absolute:000} - {Episode Title}",
	),
	"naming.tv.dailyEpisode": stringSetting(
		"{Show Title} - {Air-Date} - {Episode Title}",
	),
	"naming.tv.seasonFolder": stringSetting("Season {Season:00}"),
	"naming.tv.showFolder": stringSetting("{Show Title} ({Year})"),
	"naming.tv.standardEpisode": stringSetting(
		"{Show Title} - S{Season:00}E{Episode:00} - {Episode Title}",
	),
} satisfies Record<string, SettingDefinition<SettingValue>>;

export type KnownSettingKey = keyof typeof settingsRegistry;

export type KnownSettingValue<K extends KnownSettingKey> = z.infer<
	(typeof settingsRegistry)[K]["schema"]
>;

export type UpdateSettingInput = {
	[K in KnownSettingKey]: {
		key: K;
		value: KnownSettingValue<K>;
	};
}[KnownSettingKey];

export type SettingsMap = Record<string, SettingValue>;

export function isKnownSettingKey(key: string): key is KnownSettingKey {
	return Object.hasOwn(settingsRegistry, key);
}

export const settingUpdateSchema = z
	.object({ key: z.string().min(1), value: z.unknown() })
	.transform((base, ctx): UpdateSettingInput => {
		if (!isKnownSettingKey(base.key)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Unknown setting key: ${base.key}`,
				path: ["key"],
			});
			return z.NEVER;
		}

		const result = settingsRegistry[base.key].schema.safeParse(base.value);
		if (!result.success) {
			for (const issue of result.error.issues) {
				ctx.addIssue({
					...issue,
					path: ["value", ...issue.path],
				});
			}
			return z.NEVER;
		}

		return { key: base.key, value: result.data } as UpdateSettingInput;
	});

export function parseSettingUpdate(input: unknown): UpdateSettingInput {
	return settingUpdateSchema.parse(input);
}

function parseStoredValue(value: unknown): unknown {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value !== "string") {
		return value;
	}

	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function asSettingValue(value: unknown): SettingValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	return null;
}

export function buildSettingsMap(
	rows: Array<{ key: string; value: unknown }>,
): SettingsMap {
	const map: SettingsMap = {};
	for (const [key, definition] of Object.entries(settingsRegistry)) {
		map[key] = definition.defaultValue;
	}

	for (const row of rows) {
		const parsedValue = parseStoredValue(row.value);
		if (!isKnownSettingKey(row.key)) {
			map[row.key] = asSettingValue(parsedValue);
			continue;
		}

		const result = settingsRegistry[row.key].schema.safeParse(parsedValue);
		if (result.success) {
			map[row.key] = result.data;
		}
	}

	return map;
}
