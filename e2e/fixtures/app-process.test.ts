import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { startAppServer, stopAppServer } from "./app-process";
import type { AppServerSpawnConfig } from "./app-runtime";

async function freePort(): Promise<number> {
	const server = createServer();
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Expected a TCP port");
	}
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	return address.port;
}

function config(script: string, port: number): AppServerSpawnConfig {
	return {
		command: process.execPath,
		args: ["-e", script],
		cwd: process.cwd(),
		url: `http://127.0.0.1:${port}`,
		env: { ...process.env, PORT: String(port) },
	};
}

describe("app server lifecycle", () => {
	it("waits for /login and forwards process output and readiness diagnostics", async () => {
		const port = await freePort();
		const onOutput = vi.fn();
		const onDiagnostic = vi.fn();
		const proc = await startAppServer(
			config(
				"require('node:http').createServer((req, res) => res.end('login')).listen(process.env.PORT, '127.0.0.1', () => { console.log('ready'); console.error('diagnostic'); });",
				port,
			),
			{ onOutput, onDiagnostic, intervalMs: 5 },
		);
		try {
			expect(proc.exitCode).toBeNull();
			expect(onOutput.mock.calls.map(([stream]) => stream)).toContain("stdout");
			expect(onOutput.mock.calls.map(([stream]) => stream)).toContain("stderr");
			expect(onDiagnostic).toHaveBeenCalledWith(
				expect.objectContaining({ event: "ready", status: "ok" }),
			);
		} finally {
			await stopAppServer(proc);
		}
		expect(proc.exitCode !== null || proc.signalCode !== null).toBe(true);
		await expect(stopAppServer(proc)).resolves.toBeUndefined();
	});

	it("fails immediately when the app exits instead of waiting for the readiness timeout", async () => {
		const onDiagnostic = vi.fn();
		await expect(
			startAppServer(config("process.exit(23)", await freePort()), {
				onDiagnostic,
			}),
		).rejects.toThrow(/exited.*code=23/);
		expect(onDiagnostic).toHaveBeenCalledWith(
			expect.objectContaining({ event: "ready", status: "error" }),
		);
	});

	it("reports executable spawn failures", async () => {
		await expect(
			startAppServer({
				...config("", await freePort()),
				command: "/nonexistent/allstarr-test-command",
			}),
		).rejects.toThrow(/ENOENT/);
	});

	it("times out on non-successful readiness responses and reaps the child", async () => {
		await expect(
			startAppServer(
				config(
					"require('node:http').createServer((req, res) => { res.statusCode = 503; res.end(); }).listen(process.env.PORT, '127.0.0.1');",
					await freePort(),
				),
				{ timeoutMs: 300, intervalMs: 5 },
			),
		).rejects.toThrow(/did not start within 300ms/);
	});

	it("kills and awaits a child that ignores SIGTERM", async () => {
		const proc = spawn(
			process.execPath,
			[
				"-e",
				"process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000);",
			],
			{ stdio: "pipe" },
		);
		await once(proc.stdout, "data");
		await stopAppServer(proc, 25);
		expect(proc.signalCode).toBe("SIGKILL");
	});
});
