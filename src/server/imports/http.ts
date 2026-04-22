import type {
	PagedRecordsResponse,
	SourceConfig,
} from "src/server/imports/types";

const DEFAULT_PAGE_SIZE = 250;

export async function fetchSourceJson<T>(args: {
	baseUrl: string;
	apiKey: string;
	path: string;
}): Promise<T> {
	const response = await fetch(new URL(args.path, args.baseUrl), {
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
