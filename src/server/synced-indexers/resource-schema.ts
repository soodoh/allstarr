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

function findFieldIndex(
	fields: Array<{ name: string; value: unknown }>,
	name: string,
): number {
	return fields.findIndex((field) => field.name === name);
}

function requireStringField(
	fields: Array<{ name: string; value: unknown }>,
	context: z.RefinementCtx,
	name: string,
	options: { required?: boolean; nonEmpty?: boolean } = {},
): void {
	const index = findFieldIndex(fields, name);
	if (index === -1) {
		if (options.required) {
			context.addIssue({
				code: "custom",
				message: `${name} is required`,
				path: ["fields"],
			});
		}
		return;
	}

	const value = fields[index]?.value;
	if (typeof value !== "string") {
		context.addIssue({
			code: "custom",
			message: `${name} must be ${options.nonEmpty ? "a non-empty string" : "a string"}`,
			path: ["fields", index, "value"],
		});
		return;
	}

	if (options.nonEmpty && value.trim().length === 0) {
		context.addIssue({
			code: "custom",
			message: `${name} must be a non-empty string`,
			path: ["fields", index, "value"],
		});
	}
}

export const readarrIndexerResourceSchema = z
	.object({
		id: z.number().int().optional(),
		name: z.string().trim().min(1, "name is required"),
		implementation: z.enum(["Newznab", "Torznab"]),
		implementationName: z.string().optional(),
		configContract: z.enum(["NewznabSettings", "TorznabSettings"]),
		infoLink: z.string().optional(),
		fields: z.array(readarrFieldSchema),
		enableRss: z.boolean().optional(),
		enableAutomaticSearch: z.boolean().optional(),
		enableInteractiveSearch: z.boolean().optional(),
		supportsRss: z.boolean().optional(),
		supportsSearch: z.boolean().optional(),
		protocol: z.enum(["usenet", "torrent"]).optional(),
		priority: z.number().int().optional(),
		tags: z.array(z.number().int()).optional(),
	})
	.superRefine((body, context) => {
		requireStringField(body.fields, context, "baseUrl", {
			required: true,
			nonEmpty: true,
		});
		requireStringField(body.fields, context, "apiPath");
		requireStringField(body.fields, context, "apiKey");

		if (
			body.implementation === "Torznab" &&
			body.configContract !== "TorznabSettings"
		) {
			context.addIssue({
				code: "custom",
				message: "Torznab indexers must use TorznabSettings",
				path: ["configContract"],
			});
		}

		if (
			body.implementation === "Newznab" &&
			body.configContract !== "NewznabSettings"
		) {
			context.addIssue({
				code: "custom",
				message: "Newznab indexers must use NewznabSettings",
				path: ["configContract"],
			});
		}

		if (body.implementation === "Torznab" && body.protocol === "usenet") {
			context.addIssue({
				code: "custom",
				message: "Torznab indexers must use torrent protocol",
				path: ["protocol"],
			});
		}

		if (body.implementation === "Newznab" && body.protocol === "torrent") {
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
