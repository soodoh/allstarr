import { z } from "zod";

export type ValidationErrorBody = {
	message: "Invalid indexer payload";
	errors: string[];
};

const readarrFieldSchema = z.object({
	name: z.string().min(1, "field name is required"),
	value: z.unknown(),
});

export const readarrIndexerResourceSchema = z
	.object({
		id: z.number().int().optional(),
		name: z.string().min(1, "name is required"),
		implementation: z.enum(["Newznab", "Torznab"]),
		implementationName: z.string().optional(),
		configContract: z.string().min(1, "configContract is required"),
		infoLink: z.string().optional(),
		fields: z.array(readarrFieldSchema),
		enableRss: z.boolean(),
		enableAutomaticSearch: z.boolean(),
		enableInteractiveSearch: z.boolean(),
		supportsRss: z.boolean().optional(),
		supportsSearch: z.boolean().optional(),
		protocol: z.enum(["usenet", "torrent"]),
		priority: z.number().int(),
		tags: z.array(z.number().int()).optional(),
	})
	.superRefine((body, context) => {
		if (!body.fields.some((field) => field.name === "baseUrl")) {
			context.addIssue({
				code: "custom",
				message: "baseUrl is required",
				path: ["fields"],
			});
		}

		if (body.implementation === "Torznab" && body.protocol !== "torrent") {
			context.addIssue({
				code: "custom",
				message: "Torznab indexers must use torrent protocol",
				path: ["protocol"],
			});
		}

		if (body.implementation === "Newznab" && body.protocol !== "usenet") {
			context.addIssue({
				code: "custom",
				message: "Newznab indexers must use usenet protocol",
				path: ["protocol"],
			});
		}
	});

export type ReadarrField = {
	name: string;
	value: unknown;
};

export type ReadarrIndexerResource = {
	id?: number;
	name: string;
	implementation: string;
	implementationName?: string;
	configContract: string;
	infoLink?: string;
	fields: ReadarrField[];
	enableRss: boolean;
	enableAutomaticSearch: boolean;
	enableInteractiveSearch: boolean;
	supportsRss?: boolean;
	supportsSearch?: boolean;
	protocol?: string;
	priority: number;
	tags?: number[];
};

export function formatIndexerPayloadError(error: z.ZodError): string[] {
	return error.issues.map((issue) => issue.message);
}

export function invalidIndexerPayloadResponse(errors: string[]): Response {
	return Response.json(
		{
			message: "Invalid indexer payload",
			errors,
		} satisfies ValidationErrorBody,
		{ status: 400 },
	);
}

export async function parseReadarrIndexerResourceRequest(
	request: Request,
): Promise<
	| { success: true; data: ReadarrIndexerResource }
	| { success: false; response: Response }
> {
	let json: unknown;

	try {
		json = await request.json();
	} catch {
		return {
			success: false,
			response: invalidIndexerPayloadResponse([
				"Request body must be valid JSON",
			]),
		};
	}

	const result = readarrIndexerResourceSchema.safeParse(json);
	if (!result.success) {
		return {
			success: false,
			response: invalidIndexerPayloadResponse(
				formatIndexerPayloadError(result.error),
			),
		};
	}

	return { success: true, data: result.data };
}
