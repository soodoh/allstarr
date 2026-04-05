// Browser shim for bun:sqlite — only loaded on client where the DB is never used.
// Server-side imports use the real bun:sqlite module.
class Database {
	run() {
		return { lastInsertRowid: 0, changes: 0 };
	}
	exec() {
		return { lastInsertRowid: 0, changes: 0 };
	}
	query() {
		return {
			get: () => ({}),
			all: () => [],
			run: () => ({ lastInsertRowid: 0, changes: 0 }),
			values: () => [],
		};
	}
	prepare() {
		return {
			get: () => ({}),
			all: () => [],
			run: () => ({ lastInsertRowid: 0, changes: 0 }),
			values: () => [],
		};
	}
	close() {}
	transaction() {
		return () => {};
	}
}

export { Database };
