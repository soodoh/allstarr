import { beforeEach, describe, expect, it, vi } from "vitest";

const imageRouteMocks = vi.hoisted(() => {
	function createPipeline() {
		const pipeline = {
			avif: vi.fn(() => pipeline),
			jpeg: vi.fn(() => pipeline),
			png: vi.fn(() => pipeline),
			resize: vi.fn(() => pipeline),
			toBuffer: vi.fn(async () => Buffer.from("transformed")),
			webp: vi.fn(() => pipeline),
		};

		return pipeline;
	}

	return {
		existsSync: vi.fn(),
		pipeline: createPipeline(),
		readFile: vi.fn(async () => Buffer.from("original")),
		readdirSync: vi.fn(),
		resolveImagePath: vi.fn(),
		sharp: vi.fn(),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("node:fs", () => ({
	existsSync: imageRouteMocks.existsSync,
	readdirSync: imageRouteMocks.readdirSync,
}));

vi.mock("node:fs/promises", () => ({
	readFile: imageRouteMocks.readFile,
}));

vi.mock("sharp", () => ({
	default: imageRouteMocks.sharp,
}));

vi.mock("src/server/image-cache", () => ({
	resolveImagePath: imageRouteMocks.resolveImagePath,
}));

import { Route as ImagesRoute } from "./$";

describe("image api route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		imageRouteMocks.pipeline = {
			avif: vi.fn(() => imageRouteMocks.pipeline),
			jpeg: vi.fn(() => imageRouteMocks.pipeline),
			png: vi.fn(() => imageRouteMocks.pipeline),
			resize: vi.fn(() => imageRouteMocks.pipeline),
			toBuffer: vi.fn(async () => Buffer.from("transformed")),
			webp: vi.fn(() => imageRouteMocks.pipeline),
		};
		imageRouteMocks.sharp.mockReturnValue(imageRouteMocks.pipeline);
		imageRouteMocks.readFile.mockResolvedValue(Buffer.from("original"));
		imageRouteMocks.readdirSync.mockReturnValue([]);
	});

	function getHandler() {
		return (
			ImagesRoute as unknown as {
				server: {
					handlers: {
						GET: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.GET;
	}

	it("returns 404 when the image path is missing", async () => {
		const response = await getHandler()({
			request: new Request("https://example.com/api/images/"),
		});

		expect(response.status).toBe(404);
		await expect(response.text()).resolves.toBe("Not found");
		expect(imageRouteMocks.resolveImagePath).not.toHaveBeenCalled();
	});

	it("returns 400 when the image path cannot be resolved", async () => {
		imageRouteMocks.resolveImagePath.mockRejectedValue(new Error("bad path"));

		const response = await getHandler()({
			request: new Request("https://example.com/api/images/poster"),
		});

		expect(response.status).toBe(400);
		await expect(response.text()).resolves.toBe("Invalid path");
	});

	it("returns 404 when no file exists for the resolved path", async () => {
		imageRouteMocks.resolveImagePath.mockResolvedValue("/cache/poster");
		imageRouteMocks.existsSync.mockReturnValue(false);

		const response = await getHandler()({
			request: new Request("https://example.com/api/images/poster"),
		});

		expect(response.status).toBe(404);
		await expect(response.text()).resolves.toBe("Not found");
	});

	it("serves the original file when no transform is requested", async () => {
		imageRouteMocks.resolveImagePath.mockResolvedValue("/cache/poster.png");
		imageRouteMocks.existsSync.mockImplementation(
			(candidate: string) => candidate === "/cache/poster.png",
		);

		const response = await getHandler()({
			request: new Request("https://example.com/api/images/poster.png"),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/png");
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
		await expect(response.arrayBuffer()).resolves.toEqual(
			Buffer.from("original").buffer.slice(
				Buffer.from("original").byteOffset,
				Buffer.from("original").byteOffset + Buffer.from("original").byteLength,
			),
		);
		expect(imageRouteMocks.readFile).toHaveBeenCalledWith("/cache/poster.png");
		expect(imageRouteMocks.sharp).not.toHaveBeenCalled();
	});

	it("serves a discovered extension match with its source mime type", async () => {
		imageRouteMocks.resolveImagePath.mockResolvedValue("/cache/poster");
		imageRouteMocks.existsSync.mockImplementation(
			(candidate: string) => candidate === "/cache/poster.jpg",
		);

		const response = await getHandler()({
			request: new Request("https://example.com/api/images/poster"),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/jpeg");
		expect(imageRouteMocks.readFile).toHaveBeenCalledWith("/cache/poster.jpg");
	});

	it("falls back to scanning the directory for a matching file name", async () => {
		imageRouteMocks.resolveImagePath.mockResolvedValue("/cache/poster");
		imageRouteMocks.existsSync.mockImplementation(
			(candidate: string) => candidate === "/cache",
		);
		imageRouteMocks.readdirSync.mockReturnValue(["poster.custom"]);

		const response = await getHandler()({
			request: new Request("https://example.com/api/images/poster"),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"application/octet-stream",
		);
		expect(imageRouteMocks.readFile).toHaveBeenCalledWith(
			"/cache/poster.custom",
		);
	});

	it("resizes and encodes a transformed image as avif", async () => {
		imageRouteMocks.resolveImagePath.mockResolvedValue("/cache/poster.png");
		imageRouteMocks.existsSync.mockImplementation(
			(candidate: string) => candidate === "/cache/poster.png",
		);

		const response = await getHandler()({
			request: new Request(
				"https://example.com/api/images/poster.png?w=320&h=200&q=55&format=avif",
			),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/avif");
		expect(imageRouteMocks.sharp).toHaveBeenCalledWith("/cache/poster.png");
		expect(imageRouteMocks.pipeline.resize).toHaveBeenCalledWith(320, 200, {
			fit: "cover",
		});
		expect(imageRouteMocks.pipeline.avif).toHaveBeenCalledWith({ quality: 55 });
		expect(imageRouteMocks.pipeline.toBuffer).toHaveBeenCalledTimes(1);
	});

	it("encodes transformed images as jpeg for jpg requests", async () => {
		imageRouteMocks.resolveImagePath.mockResolvedValue("/cache/poster.png");
		imageRouteMocks.existsSync.mockImplementation(
			(candidate: string) => candidate === "/cache/poster.png",
		);

		const response = await getHandler()({
			request: new Request(
				"https://example.com/api/images/poster.png?format=jpg&q=70",
			),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/jpeg");
		expect(imageRouteMocks.pipeline.jpeg).toHaveBeenCalledWith({ quality: 70 });
	});

	it("encodes transformed images as png when requested", async () => {
		imageRouteMocks.resolveImagePath.mockResolvedValue("/cache/poster.jpg");
		imageRouteMocks.existsSync.mockImplementation(
			(candidate: string) => candidate === "/cache/poster.jpg",
		);

		const response = await getHandler()({
			request: new Request(
				"https://example.com/api/images/poster.jpg?format=png",
			),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/png");
		expect(imageRouteMocks.pipeline.png).toHaveBeenCalledTimes(1);
	});

	it("falls back to webp for unknown output formats", async () => {
		imageRouteMocks.resolveImagePath.mockResolvedValue("/cache/poster.png");
		imageRouteMocks.existsSync.mockImplementation(
			(candidate: string) => candidate === "/cache/poster.png",
		);

		const response = await getHandler()({
			request: new Request(
				"https://example.com/api/images/poster.png?format=unexpected",
			),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/webp");
		expect(imageRouteMocks.pipeline.webp).toHaveBeenCalledWith({ quality: 80 });
	});
});
