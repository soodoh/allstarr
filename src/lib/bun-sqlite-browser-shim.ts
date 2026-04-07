function unsupported(): never {
	throw new Error("bun:sqlite is unavailable in the browser bundle");
}

export class Database {
	constructor(_path?: string) {
		unsupported();
	}

	run(): never {
		return unsupported();
	}

	query(): never {
		return unsupported();
	}

	prepare(): never {
		return unsupported();
	}
}
