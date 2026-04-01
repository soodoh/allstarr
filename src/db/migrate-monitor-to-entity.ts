import { eq } from "drizzle-orm";
import { db } from "./index";
import {
	authorDownloadProfiles,
	authors,
	showDownloadProfiles,
	shows,
} from "./schema";

function migrateShows(): void {
	const allShows = db.select({ id: shows.id }).from(shows).all();
	for (const show of allShows) {
		const profiles = db
			.select({ monitorNewSeasons: showDownloadProfiles.monitorNewSeasons })
			.from(showDownloadProfiles)
			.where(eq(showDownloadProfiles.showId, show.id))
			.all();
		if (profiles.length === 0) {
			continue;
		}
		const values = new Set(profiles.map((p) => p.monitorNewSeasons));
		const value = values.size === 1 ? [...values][0] : "all";
		db.update(shows)
			.set({ monitorNewSeasons: value })
			.where(eq(shows.id, show.id))
			.run();
	}
	process.stdout.write(
		`Migrated monitorNewSeasons for ${allShows.length} shows\n`,
	);
}

function migrateAuthors(): void {
	const allAuthors = db.select({ id: authors.id }).from(authors).all();
	for (const author of allAuthors) {
		const profiles = db
			.select({ monitorNewBooks: authorDownloadProfiles.monitorNewBooks })
			.from(authorDownloadProfiles)
			.where(eq(authorDownloadProfiles.authorId, author.id))
			.all();
		if (profiles.length === 0) {
			continue;
		}
		const values = new Set(profiles.map((p) => p.monitorNewBooks));
		const value = values.size === 1 ? [...values][0] : "all";
		db.update(authors)
			.set({ monitorNewBooks: value })
			.where(eq(authors.id, author.id))
			.run();
	}
	process.stdout.write(
		`Migrated monitorNewBooks for ${allAuthors.length} authors\n`,
	);
}

migrateShows();
migrateAuthors();
process.stdout.write("Migration complete\n");
