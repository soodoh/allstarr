import type {
	PagedRecordsResponse,
	SourceConfig,
} from "src/server/imports/types";

const DEFAULT_PAGE_SIZE = 250;

function buildSourceUrl(baseUrl: string, path: string): URL {
	const base = new URL(baseUrl);
	const basePath = base.pathname.endsWith("/")
		? base.pathname.slice(0, -1)
		: base.pathname;
	const [pathname, search = ""] = path.split("?");
	const relativePath = pathname.startsWith("/") ? pathname : `/${pathname}`;

	base.pathname = `${basePath}${relativePath}` || "/";
	base.search = search ? `?${search}` : "";
	base.hash = "";

	return base;
}

export async function fetchSourceJson<T>(args: {
	baseUrl: string;
	apiKey: string;
	path: string;
}): Promise<T> {
	const response = await fetch(buildSourceUrl(args.baseUrl, args.path), {
		headers: { "X-Api-Key": args.apiKey },
	});
	if (!response.ok) {
		throw new Error(
			`Source API error: ${response.status} ${response.statusText}`,
		);
	}
	return (await response.json()) as T;
}

export async function fetchPagedRecords(
	config: SourceConfig,
	path: string,
): Promise<Array<Record<string, unknown>>> {
	const records: Array<Record<string, unknown>> = [];
	let page = 1;
	let totalRecords = 0;

	do {
		const response = await fetchSourceJson<
			PagedRecordsResponse<Record<string, unknown>>
		>({
			...config,
			path: `${path}?page=${page}&pageSize=${DEFAULT_PAGE_SIZE}`,
		});

		if (
			response.records.length === 0 &&
			records.length < response.totalRecords
		) {
			throw new Error(
				`Source API pagination stalled for ${path} on page ${page}`,
			);
		}

		records.push(...response.records);
		totalRecords = response.totalRecords;
		page += 1;
	} while (records.length < totalRecords);

	return records;
}

export async function fetchQueueRecords(
	config: SourceConfig,
	path: string,
): Promise<Array<Record<string, unknown>>> {
	return fetchPagedRecords(config, path);
}
