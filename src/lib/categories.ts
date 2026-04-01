/**
 * Newznab/Torznab standard categories available for indexer configuration.
 * Complete list from Prowlarr's NewznabStandardCategory.cs.
 */

export type IndexerCategory = {
	id: number;
	name: string;
};

export const INDEXER_CATEGORIES: IndexerCategory[] = [
	// Parent category: Console
	{ id: 1000, name: "Console" },
	{ id: 1010, name: "Console/NDS" },
	{ id: 1020, name: "Console/PSP" },
	{ id: 1030, name: "Console/Wii" },
	{ id: 1040, name: "Console/XBox" },
	{ id: 1050, name: "Console/XBox 360" },
	{ id: 1060, name: "Console/Wiiware" },
	{ id: 1070, name: "Console/XBox 360 DLC" },
	{ id: 1080, name: "Console/PS3" },
	{ id: 1090, name: "Console/Other" },
	{ id: 1110, name: "Console/3DS" },
	{ id: 1120, name: "Console/PS Vita" },
	{ id: 1130, name: "Console/WiiU" },
	{ id: 1140, name: "Console/XBox One" },
	{ id: 1180, name: "Console/PS4" },
	// Parent category: Movies
	{ id: 2000, name: "Movies" },
	{ id: 2010, name: "Movies/Foreign" },
	{ id: 2020, name: "Movies/Other" },
	{ id: 2030, name: "Movies/SD" },
	{ id: 2040, name: "Movies/HD" },
	{ id: 2045, name: "Movies/UHD" },
	{ id: 2050, name: "Movies/BluRay" },
	{ id: 2060, name: "Movies/3D" },
	{ id: 2070, name: "Movies/DVD" },
	{ id: 2080, name: "Movies/WEB-DL" },
	{ id: 2090, name: "Movies/x265" },
	// Parent category: Audio
	{ id: 3000, name: "Audio" },
	{ id: 3010, name: "Audio/MP3" },
	{ id: 3020, name: "Audio/Video" },
	{ id: 3030, name: "Audio/Audiobook" },
	{ id: 3040, name: "Audio/Lossless" },
	{ id: 3050, name: "Audio/Other" },
	{ id: 3060, name: "Audio/Foreign" },
	// Parent category: PC
	{ id: 4000, name: "PC" },
	{ id: 4010, name: "PC/0day" },
	{ id: 4020, name: "PC/ISO" },
	{ id: 4030, name: "PC/Mac" },
	{ id: 4040, name: "PC/Mobile-Other" },
	{ id: 4050, name: "PC/Games" },
	{ id: 4060, name: "PC/Mobile-iOS" },
	{ id: 4070, name: "PC/Mobile-Android" },
	// TV
	{ id: 5000, name: "TV" },
	{ id: 5010, name: "TV/WEB-DL" },
	{ id: 5020, name: "TV/Foreign" },
	{ id: 5030, name: "TV/SD" },
	{ id: 5040, name: "TV/HD" },
	{ id: 5045, name: "TV/UHD" },
	{ id: 5050, name: "TV/Other" },
	{ id: 5060, name: "TV/Sport" },
	{ id: 5070, name: "TV/Anime" },
	{ id: 5080, name: "TV/Documentary" },
	{ id: 5090, name: "TV/x265" },
	// Parent category: XXX
	{ id: 6000, name: "XXX" },
	{ id: 6010, name: "XXX/DVD" },
	{ id: 6020, name: "XXX/WMV" },
	{ id: 6030, name: "XXX/XviD" },
	{ id: 6040, name: "XXX/x264" },
	{ id: 6045, name: "XXX/UHD" },
	{ id: 6050, name: "XXX/Pack" },
	{ id: 6060, name: "XXX/ImageSet" },
	{ id: 6070, name: "XXX/Other" },
	{ id: 6080, name: "XXX/SD" },
	{ id: 6090, name: "XXX/WEB-DL" },
	// Parent category: Books
	{ id: 7000, name: "Books" },
	{ id: 7010, name: "Books/Mags" },
	{ id: 7020, name: "Books/EBook" },
	{ id: 7030, name: "Books/Comics" },
	{ id: 7040, name: "Books/Technical" },
	{ id: 7050, name: "Books/Other" },
	{ id: 7060, name: "Books/Foreign" },
	// Parent category: Other
	{ id: 8000, name: "Other" },
	{ id: 8010, name: "Other/Misc" },
	{ id: 8020, name: "Other/Hashed" },
];

export const CATEGORY_MAP = new Map(
	INDEXER_CATEGORIES.map((c) => [c.id, c.name]),
);
