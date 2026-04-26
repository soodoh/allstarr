import { z } from "zod";

export type ValidationErrorBody = {
	message: "Invalid indexer payload";
	errors: string[];
};

const readarrFieldSchema = z
	.object({
		name: z.string().trim().min(1, "field name is required"),
	})
	.passthrough()
	.superRefine((field, context) => {
		if (!Object.hasOwn(field, "value")) {
			context.addIssue({
				code: "custom",
				message: "field value is required",
				path: ["value"],
			});
		}
	})
	.transform((field) => ({
		name: field.name,
		value: field.value,
	}));

export const readarrIndexerResourceSchema = z
	.object({
		id: z.number().int().optional(),
		name: z.string().trim().min(1, "name is required"),
		implementation: z.enum(["Newznab", "Torznab"]),
		implementationName: z.string().optional(),
		configContract: z.string().trim().min(1, "configContract is required"),
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

export type ReadarrField = z.infer<typeof readarrFieldSchema>;
export type ReadarrIndexerResource = z.infer<
	typeof readarrIndexerResourceSchema
>;

export function formatIndexerPayloadError(error: z.ZodError): string[] {
	return error.issues.map((issue) => {
		if (issue.path.length === 0) {
			return issue.message;
		}

		return `${issue.path.join(".")}: ${issue.message}`;
	});
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
