import type { ReadarrIndexerResource } from "./mapper";

function summarizeFieldValue(name: string, value: unknown): unknown {
	if (name === "apiKey") {
		return "[REDACTED]";
	}
	return value;
}

export function summarizeIndexerResource(body: ReadarrIndexerResource) {
	return {
		name: body.name,
		implementation: body.implementation,
		protocol: body.protocol,
		enableRss: body.enableRss,
		enableAutomaticSearch: body.enableAutomaticSearch,
		enableInteractiveSearch: body.enableInteractiveSearch,
		priority: body.priority,
		fields: body.fields?.map((field) => ({
			name: field.name,
			value: summarizeFieldValue(field.name, field.value),
		})),
	};
}
