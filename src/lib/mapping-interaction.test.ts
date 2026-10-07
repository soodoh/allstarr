import { describe, expect, it } from "vitest";
import {
	type MappingAsset,
	type MappingFile,
	MappingInteraction,
	type MappingOptions,
} from "./mapping-interaction";

const files: MappingFile[] = [
	{ id: 1, path: "/incoming/Book.epub", hints: { title: "A Book" } },
	{ id: 2, path: "/incoming/Other.epub", hints: null },
];
const options: MappingOptions = {
	profileId: "3",
	moveRelatedFiles: false,
	deleteDeselectedRelatedFiles: false,
	previewPending: false,
};
const asset: MappingAsset = {
	kind: "file",
	ownershipReason: "direct",
	relativeSourcePath: "cover.jpg",
	selected: true,
	sourcePath: "/incoming/cover.jpg",
};
function selected(contentType = "ebook", input = files) {
	return input.reduce(
		(state, file) =>
			state.transition({
				type: "target",
				fileId: file.id,
				value: 10 + file.id,
			}),
		MappingInteraction.start(contentType, input),
	);
}
function result(
	id: number,
	title: string,
	entityType: "book" | "movie" | "episode" = "book",
) {
	return { id, title, entityType, subtitle: "" };
}

describe("Mapping interaction interface", () => {
	it("keeps empty-title search defaults specific to TV versus book/movie Mapping", () => {
		const emptyTitle = [
			{ id: 1, path: "/incoming/File.epub", hints: { title: "" } },
		];
		expect(
			MappingInteraction.start("ebook", emptyTitle).rows[0]?.rowState.search,
		).toBe("File.epub");
		expect(
			MappingInteraction.start("tv", emptyTitle).rows[0]?.rowState.search,
		).toBe("");
	});
	it("starts a fresh interaction when the content type changes", () => {
		const state = selected();
		const movie = state.transition({
			type: "files",
			contentType: "movie",
			files,
		});
		expect(
			movie.rows.every((row) => row.rowState.selectedEntityId === null),
		).toBe(true);
		const submission = movie
			.transition({ type: "target", fileId: 1, value: 1 })
			.transition({ type: "target", fileId: 2, value: 2 })
			.submission(options);
		if (!submission.ok) throw new Error(submission.message);
		expect(
			submission.data.rows.every((row) => row.entityType === "movie"),
		).toBe(true);
	});
	it("keeps manual TV selection and search ahead of late suggestions without changing another row", () => {
		const initial = MappingInteraction.start("tv", files);
		const manual = initial
			.transition({ type: "target", fileId: 1, value: 77 })
			.transition({ type: "search", fileId: 1, value: "My search" });
		const suggested = manual.transition({
			type: "suggestions",
			suggestions: [
				{
					fileId: 1,
					subtitle: "Automatic",
					suggestedEpisodeId: 44,
					title: "Suggestion",
				},
				{ fileId: 2, subtitle: "Other", suggestedEpisodeId: 55 },
			],
		});
		expect(suggested.rows[0]?.rowState).toMatchObject({
			selectedEntityId: 77,
			search: "My search",
		});
		expect(suggested.rows[1]?.rowState.selectedEntityId).toBe(55);
		expect(initial.rows[0]?.rowState.selectedEntityId).toBeNull();
		const cleared = suggested.transition({
			type: "target",
			fileId: 2,
			value: null,
		});
		expect(
			cleared.transition({
				type: "suggestions",
				suggestions: [{ fileId: 2, subtitle: "Late", suggestedEpisodeId: 88 }],
			}).rows[1]?.rowState.selectedEntityId,
		).toBeNull();
	});
	it("keeps stable suggestions and ignored asynchronous inputs as no-op transitions", () => {
		const suggestion = { fileId: 1, subtitle: "", suggestedEpisodeId: null };
		const state = MappingInteraction.start("tv", files).transition({
			type: "suggestions",
			suggestions: [suggestion],
		});
		expect(
			state.transition({ type: "suggestions", suggestions: [suggestion] }),
		).toBe(state);
		expect(
			state.transition({
				type: "results",
				fileId: 1,
				results: [result(1, "Book")],
			}),
		).toBe(state);
		expect(state.transition({ type: "target", fileId: 999, value: 1 })).toBe(
			state,
		);
		expect(
			MappingInteraction.start("ebook", files).transition({
				type: "suggestions",
				suggestions: [suggestion],
			}).rows[0]?.rowState.selectedEntityId,
		).toBeNull();
	});
	it("uses a suggestion title for a TV row without hinted or filename search text", () => {
		const state = MappingInteraction.start("tv", [
			{ id: 1, path: "", hints: null },
		]);
		expect(
			state.transition({
				type: "suggestions",
				suggestions: [
					{ fileId: 1, subtitle: "", suggestedEpisodeId: 1, title: "Title" },
				],
			}).rows[0]?.rowState.search,
		).toBe("Title");
		expect(
			state.transition({ type: "suggestions", suggestions: [] }).rows[0]
				?.rowState.search,
		).toBe("");
	});
	it("chooses hinted, search-matched and first-result targets while filtering the media type", () => {
		const state = MappingInteraction.start("ebook", files);
		const hinted = state.transition({
			type: "results",
			fileId: 1,
			results: [
				result(9, "Wrong", "movie"),
				result(8, "First"),
				result(7, "a-book"),
			],
		});
		expect(hinted.rows[0]?.rowState.selectedEntityId).toBe(7);
		const searched = state
			.transition({ type: "search", fileId: 2, value: "Match" })
			.transition({
				type: "results",
				fileId: 2,
				results: [result(8, "First"), result(7, "match")],
			});
		expect(searched.rows[1]?.rowState.selectedEntityId).toBe(7);
		expect(
			state.transition({
				type: "results",
				fileId: 2,
				results: [result(8, "First")],
			}).rows[1]?.rowState.selectedEntityId,
		).toBe(8);
		expect(state.transition({ type: "results", fileId: 2, results: [] })).toBe(
			state,
		);
		const movie = MappingInteraction.start("movie", files).transition({
			type: "results",
			fileId: 1,
			results: [result(7, "a-book", "movie")],
		});
		expect(movie.rows[0]?.rowState.selectedEntityId).toBe(7);
	});
	it("preserves selected and explicitly cleared targets when new search results arrive", () => {
		const state = selected().transition({
			type: "results",
			fileId: 1,
			results: [result(99, "A Book")],
		});
		expect(state.rows[0]?.rowState.selectedEntityId).toBe(11);
		const cleared = state.transition({
			type: "target",
			fileId: 1,
			value: null,
		});
		expect(
			cleared.transition({
				type: "results",
				fileId: 1,
				results: [result(99, "A Book")],
			}),
		).toBe(cleared);
	});
	it("preserves asset choices across refreshes and separates row/group changes", () => {
		const nested = {
			...asset,
			ownershipReason: "nested" as const,
			sourcePath: "/incoming/nested.jpg",
		};
		let state = selected().transition({
			type: "assets",
			rows: [
				{ fileId: 1, assets: [asset, nested] },
				{ fileId: 2, assets: [asset] },
			],
		});
		state = state
			.transition({ type: "expanded", fileId: 1, value: true })
			.transition({
				type: "group",
				fileId: 1,
				ownershipReason: "direct",
				value: false,
			});
		expect(state.rows[0]?.rowState.assets.map((item) => item.selected)).toEqual(
			[false, true],
		);
		expect(state.rows[1]?.rowState.assets[0]?.selected).toBe(true);
		const changed = state.transition({
			type: "asset",
			fileId: 1,
			sourcePath: nested.sourcePath,
			value: false,
		});
		const refreshed = changed.transition({
			type: "assets",
			rows: [{ fileId: 1, assets: [asset, nested] }],
		});
		expect(refreshed).toBe(changed);
		expect(refreshed.rows[0]?.rowState).toMatchObject({ assetsExpanded: true });
		expect(refreshed.transition({ type: "assets", rows: [] })).toBe(refreshed);
	});
	it.each(["ebook", "movie", "tv"])(
		"builds %s Mapping requests through the same submission interface",
		(contentType) => {
			const state = selected(contentType).transition({
				type: "assets",
				rows: [
					{
						fileId: 1,
						assets: [
							asset,
							{ ...asset, sourcePath: "/incoming/extra.jpg", selected: false },
						],
					},
				],
			});
			const submission = state.submission({
				...options,
				moveRelatedFiles: true,
				deleteDeselectedRelatedFiles: true,
			});
			expect(submission.ok).toBe(true);
			if (!submission.ok) throw new Error(submission.message);
			expect(submission.data.rows[0]).toMatchObject({
				entityId: 11,
				entityType:
					contentType === "tv"
						? "episode"
						: contentType === "movie"
							? "movie"
							: "book",
				unmappedFileId: 1,
			});
			expect(
				submission.data.rows[0]?.assets.map((item) => item.action),
			).toEqual(["move", "delete"]);
			const ignored = state.submission(options);
			if (!ignored.ok) throw new Error(ignored.message);
			expect(
				ignored.data.rows[0]?.assets.every((item) => item.action === "ignore"),
			).toBe(true);
			const kept = state.submission({ ...options, moveRelatedFiles: true });
			if (!kept.ok) throw new Error(kept.message);
			expect(kept.data.rows[0]?.assets.map((item) => item.action)).toEqual([
				"move",
				"ignore",
			]);
		},
	);
	it("gates readiness on profile, resolved rows, asset loading and running submissions", () => {
		const state = selected();
		expect(state.submission({ ...options, profileId: "" })).toMatchObject({
			ok: false,
			message: "Please select a download profile first",
		});
		expect(
			MappingInteraction.start("ebook", files).submission(options),
		).toMatchObject({ ok: false, message: "Please resolve all rows first" });
		expect(
			MappingInteraction.start("tv", files).submission(options),
		).toMatchObject({ ok: false, message: "Please resolve all TV rows first" });
		expect(
			state.submission({ ...options, previewPending: true }),
		).toMatchObject({ ok: true });
		expect(
			state.submission({
				...options,
				moveRelatedFiles: true,
				previewPending: true,
			}),
		).toMatchObject({
			ok: false,
			message: "Please wait for related files to finish loading",
		});
		expect(
			state.submission({
				...options,
				deleteDeselectedRelatedFiles: true,
				previewPending: true,
			}),
		).toMatchObject({ ok: false });
		const running = state.transition({ type: "started" });
		expect(running.mapping).toBe(true);
		expect(running.submission(options)).toMatchObject({
			ok: false,
			message: "Mapping is already in progress",
		});
		expect(
			running.transition({ type: "failed" }).submission(options),
		).toMatchObject({ ok: true });
		expect(
			MappingInteraction.start("ebook", []).submission(options),
		).toMatchObject({ ok: false, message: "No files to map" });
	});
	it("keeps only failed rows for retry and does not revive successful rows when props refresh", () => {
		let state = selected().transition({ type: "started" });
		state = state.transition({
			type: "completed",
			result: {
				mappedCount: 1,
				success: true,
				failures: [
					{
						unmappedFileId: 2,
						entityType: "book",
						sourcePath: files[1].path,
						message: "Disk full",
					},
				],
			},
		});
		expect(state.mapping).toBe(false);
		expect(state.rows.map((row) => row.file.id)).toEqual([2]);
		expect(state.rows[0]?.rowState.errorMessage).toBe("Disk full");
		expect(state.transition({ type: "files", files })).toBe(state);
		const refreshed = state.transition({
			type: "files",
			files: files.map((file) => ({ ...file })),
		});
		expect(refreshed.rows.map((row) => row.file.id)).toEqual([2]);
		const retry = refreshed.transition({ type: "started" });
		expect(retry.rows[0]?.rowState.errorMessage).toBeNull();
		expect(
			retry.transition({
				type: "completed",
				result: { mappedCount: 1, success: true },
			}).mapping,
		).toBe(false);
		expect(
			refreshed.transition({ type: "search", fileId: 2, value: "Try again" })
				.rows[0]?.rowState.errorMessage,
		).toBeNull();
		expect(
			refreshed.transition({ type: "target", fileId: 2, value: 3 }).rows[0]
				?.rowState.errorMessage,
		).toBeNull();
	});
	it("reconciles added and removed input files while preserving surviving edits", () => {
		const state = selected().transition({
			type: "search",
			fileId: 1,
			value: "Edited",
		});
		const newFiles = [
			files[0],
			{ id: 3, path: "/incoming/Third", hints: null },
		];
		const next = state.transition({ type: "files", files: newFiles });
		expect(next.rows.map((row) => row.file.id)).toEqual([1, 3]);
		expect(next.rows[0]?.rowState.search).toBe("Edited");
		expect(next.rows[1]?.rowState.selectedEntityId).toBeNull();
	});
});
