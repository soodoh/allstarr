import { type ChildProcess, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import type { DiagnosticEvent } from "../helpers/diagnostics";
import type { AppServerSpawnConfig } from "./app-runtime";

type StartupOptions = {
	timeoutMs?: number;
	intervalMs?: number;
	onOutput?: (stream: "stdout" | "stderr", chunk: Buffer) => void;
	onDiagnostic?: (event: DiagnosticEvent) => void;
};

/** Wait for termination, escalating if Bun's graceful shutdown leaves the app alive. */
export async function stopAppServer(
	proc: ChildProcess,
	timeoutMs = 1_000,
): Promise<void> {
	if (!proc.pid || proc.exitCode !== null || proc.signalCode !== null) {
		return;
	}
	await new Promise<void>((resolve) => {
		const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
		proc.once("exit", () => {
			clearTimeout(timer);
			resolve();
		});
		proc.kill("SIGTERM");
	});
}

/** Own startup failures and cleanup so a missing build cannot cost a minute per test. */
export async function startAppServer(
	config: AppServerSpawnConfig,
	options: StartupOptions = {},
): Promise<ChildProcess> {
	const timeoutMs = options.timeoutMs ?? 60_000;
	const intervalMs = options.intervalMs ?? 500;
	const startedAt = Date.now();
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort(
			new Error(`Server at ${config.url} did not start within ${timeoutMs}ms`),
		);
	}, timeoutMs);
	const proc = spawn(config.command, config.args, {
		cwd: config.cwd,
		env: config.env,
		stdio: "pipe",
	});
	proc.stdout?.on("data", (chunk: Buffer) =>
		options.onOutput?.("stdout", chunk),
	);
	proc.stderr?.on("data", (chunk: Buffer) =>
		options.onOutput?.("stderr", chunk),
	);

	const { promise: exited, reject: rejectExit } =
		Promise.withResolvers<never>();
	const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
		rejectExit(
			new Error(
				`App at ${config.url} exited before readiness: code=${code} signal=${signal}`,
			),
		);
	};
	proc.once("error", rejectExit);
	proc.once("exit", onExit);

	let attempts = 0;
	let lastError = "not ready";
	async function waitForServer(): Promise<void> {
		while (!controller.signal.aborted) {
			attempts += 1;
			try {
				const response = await fetch(`${config.url}/login`, {
					signal: controller.signal,
				});
				// Drain readiness bodies so repeated probes do not hold sockets open.
				await response.arrayBuffer();
				if (response.ok) {
					return;
				}
				lastError = `${response.status} ${response.statusText}`;
			} catch (error) {
				lastError = error instanceof Error ? error.message : String(error);
			}
			await delay(intervalMs, undefined, { signal: controller.signal });
		}
		throw controller.signal.reason;
	}

	try {
		await Promise.race([waitForServer(), exited]);
		options.onDiagnostic?.({
			scope: "app",
			event: "ready",
			status: "ok",
			elapsedMs: Date.now() - startedAt,
			fields: { url: config.url, endpoint: "/login", attempts },
		});
		return proc;
	} catch (error) {
		const startupError = controller.signal.aborted
			? controller.signal.reason
			: error;
		options.onDiagnostic?.({
			scope: "app",
			event: "ready",
			status: "error",
			elapsedMs: Date.now() - startedAt,
			fields: {
				url: config.url,
				endpoint: "/login",
				attempts,
				error:
					startupError instanceof Error
						? startupError.message
						: String(startupError),
				lastError,
			},
		});
		await stopAppServer(proc);
		throw startupError;
	} finally {
		clearTimeout(timeout);
		controller.abort();
		proc.off("error", rejectExit);
		proc.off("exit", onExit);
	}
}
