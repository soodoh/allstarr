import { describe, expect, it } from "vitest";
import {
	matchesProfileFormat,
	pickBestEdition,
	pickBestEditionForProfile,
} from "./editions";

const editions = [
	{
		format: "E-Book",
		id: 1,
		isDefaultCover: true,
		languageCode: "en",
		score: 10,
		usersCount: 5,
	},
	{
		format: "Audiobook",
		id: 2,
		isDefaultCover: false,
		languageCode: "en",
		score: 8,
		usersCount: 10,
	},
	{
		format: "E-Book",
		id: 3,
		isDefaultCover: false,
		languageCode: "fr",
		score: 9,
		usersCount: 7,
	},
	{
		format: null,
		id: 4,
		isDefaultCover: false,
		languageCode: "en",
		score: 6,
		usersCount: 2,
	},
];

describe("editions helpers", () => {
	it("matches profile formats by media type", () => {
		expect(matchesProfileFormat("Audiobook", "audio")).toBe(true);
		expect(matchesProfileFormat("E-Book", "audio")).toBe(false);
		expect(matchesProfileFormat("Physical Book", "ebook")).toBe(true);
		expect(matchesProfileFormat(null, "ebook")).toBe(true);
	});

	it("picks the default cover when language is all or canonical", () => {
		expect(pickBestEdition(editions, "all")?.id).toBe(1);
		expect(pickBestEdition(editions, "en")?.id).toBe(1);
	});

	it("falls back correctly when a language or default cover is missing", () => {
		expect(pickBestEdition(editions, "fr")?.id).toBe(3);
		expect(
			pickBestEdition(
				editions.map((edition) => ({ ...edition, isDefaultCover: false })),
				"en",
			)?.id,
		).toBe(1);
		expect(pickBestEdition([], "en")).toBeUndefined();
	});

	it("picks the best profile-aware edition using format, language, and popularity", () => {
		expect(
			pickBestEditionForProfile(editions, {
				contentType: "ebook",
				language: "en",
			})?.id,
		).toBe(1);
		expect(
			pickBestEditionForProfile(editions, {
				contentType: "audiobook",
				language: "en",
			})?.id,
		).toBe(2);
		expect(
			pickBestEditionForProfile(editions, {
				contentType: "ebook",
				language: "fr",
			})?.id,
		).toBe(3);
	});

	it("falls back to the best available edition when no format match exists", () => {
		expect(
			pickBestEditionForProfile(
				editions.map((edition) => ({
					...edition,
					format: "Comic",
				})),
				{
					contentType: "ebook",
					language: "en",
				},
			)?.id,
		).toBe(1);

		expect(
			pickBestEditionForProfile([], {
				contentType: "ebook",
				language: "en",
			}),
		).toBeUndefined();
	});
});
