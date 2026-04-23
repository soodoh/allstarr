import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	GoldenScenarioManifest,
	GoldenServiceStateFile,
} from "./schema";

const GOLDEN_ROOT = import.meta.dirname;
const SCENARIOS_ROOT = join(GOLDEN_ROOT, "scenarios");
const SERVICES_ROOT = join(GOLDEN_ROOT, "services");

function readJsonFile<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadGoldenScenario(name: string): GoldenScenarioManifest {
	const path = join(SCENARIOS_ROOT, `${name}.json`);
	if (!existsSync(path)) {
		throw new Error(`Golden scenario "${name}" not found at ${path}`);
	}

	return readJsonFile<GoldenScenarioManifest>(path);
}

export function loadGoldenServiceState(
	service: string,
	stateName: string,
): GoldenServiceStateFile {
	const path = join(SERVICES_ROOT, service, stateName, "state.json");
	if (!existsSync(path)) {
		throw new Error(
			`Golden service state "${service}/${stateName}" not found at ${path}`,
		);
	}

	return readJsonFile<GoldenServiceStateFile>(path);
}
