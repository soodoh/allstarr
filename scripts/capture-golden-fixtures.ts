import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	captureFixtureSet,
	parseCaptureCliArgs,
	type CaptureConfig,
} from "../e2e/fixtures/golden/capture";

type CaptureManifest = {
	outputRoot: string;
	services: CaptureConfig[];
};

async function main(): Promise<void> {
	const { configPath } = parseCaptureCliArgs(process.argv.slice(2));
	const manifestPath = resolve(process.cwd(), configPath);
	const manifest = JSON.parse(
		readFileSync(manifestPath, "utf8"),
	) as CaptureManifest;

	mkdirSync(resolve(process.cwd(), manifest.outputRoot), { recursive: true });

	for (const service of manifest.services) {
		await captureFixtureSet({
			...service,
			outputRoot: resolve(process.cwd(), manifest.outputRoot),
		});
	}
}

await main();
