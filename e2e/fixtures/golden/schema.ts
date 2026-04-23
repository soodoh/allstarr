export type GoldenScenarioManifest = {
	name: string;
	services: Record<string, string>;
};

export type GoldenServiceStateFile = {
	name: string;
	seed: Record<string, unknown>;
	service: string;
};
