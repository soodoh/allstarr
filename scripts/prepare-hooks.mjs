import { spawnSync } from "node:child_process";

const hooksPathError = "core.hooksPath is set locally";

const firstAttempt = spawnSync("lefthook", ["install"], {
	encoding: "utf8",
	stdio: "pipe",
});

if (firstAttempt.status === 0) {
	process.exit(0);
}

if (firstAttempt.error) {
	throw firstAttempt.error;
}

const output = `${firstAttempt.stdout ?? ""}${firstAttempt.stderr ?? ""}`;

if (output.includes(hooksPathError)) {
	const forcedAttempt = spawnSync("lefthook", ["install", "--force"], {
		stdio: "inherit",
	});
	process.exit(forcedAttempt.status ?? 1);
}

if (firstAttempt.stdout) {
	process.stdout.write(firstAttempt.stdout);
}

if (firstAttempt.stderr) {
	process.stderr.write(firstAttempt.stderr);
}

process.exit(firstAttempt.status ?? 1);
