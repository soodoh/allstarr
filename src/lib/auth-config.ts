export type Env = Record<string, string | undefined>;

export type OidcProviderConfig = {
	providerId: string;
	displayName: string;
	clientId: string;
	clientSecret: string;
	discoveryUrl: string;
	scopes: string[];
	allowAccountCreation: boolean;
};

export type PublicOidcProvider = Pick<
	OidcProviderConfig,
	"displayName" | "providerId"
>;

export type AuthConfig = {
	registrationDisabled: boolean;
	emailPasswordRegistrationDisabled: boolean;
	oidcProviders: OidcProviderConfig[];
	publicOidcProviders: PublicOidcProvider[];
	allowOidcAccountCreation: (providerId: string) => boolean;
};

type RequiredProviderEnvKey =
	| "PROVIDER_ID"
	| "DISPLAY_NAME"
	| "CLIENT_ID"
	| "CLIENT_SECRET"
	| "DISCOVERY_URL";

const DEFAULT_OIDC_SCOPES = ["openid", "profile", "email"] as const;

const REQUIRED_PROVIDER_ENV_KEYS: RequiredProviderEnvKey[] = [
	"PROVIDER_ID",
	"DISPLAY_NAME",
	"CLIENT_ID",
	"CLIENT_SECRET",
	"DISCOVERY_URL",
];

const PROVIDER_ENV_KEYS = [
	...REQUIRED_PROVIDER_ENV_KEYS,
	"SCOPES",
	"ALLOW_ACCOUNT_CREATION",
];

export function parseAuthConfig(env: Env = process.env): AuthConfig {
	const oidcProviders = parseOidcProviders(env);
	const publicOidcProviders = oidcProviders.map(
		({ displayName, providerId }) => ({
			displayName,
			providerId,
		}),
	);

	const config: AuthConfig = {
		registrationDisabled: env.DISABLE_REGISTRATION === "true",
		emailPasswordRegistrationDisabled:
			env.DISABLE_EMAIL_PASSWORD_REGISTRATION === "true",
		oidcProviders,
		publicOidcProviders,
		allowOidcAccountCreation: (providerId) =>
			getProviderAccountCreationPolicy(config, providerId),
	};

	return config;
}

export function getProviderAccountCreationPolicy(
	config: AuthConfig,
	providerId: string,
): boolean {
	return (
		config.oidcProviders.find((provider) => provider.providerId === providerId)
			?.allowAccountCreation ?? false
	);
}

function parseOidcProviders(env: Env): OidcProviderConfig[] {
	const providers: OidcProviderConfig[] = [];

	for (let index = 1; ; index += 1) {
		const prefix = `OIDC_${index}`;

		if (isProviderIndexEmpty(env, prefix)) {
			break;
		}

		const missingKeys = REQUIRED_PROVIDER_ENV_KEYS.filter(
			(key) => getRequiredProviderValue(env, prefix, key) === undefined,
		);

		if (missingKeys.length > 0) {
			throw new Error(
				`${prefix} is missing required environment variables: ${missingKeys
					.map((key) => `${prefix}_${key}`)
					.join(", ")}`,
			);
		}

		const providerId = requireProviderValue(env, prefix, "PROVIDER_ID");
		const displayName = requireProviderValue(env, prefix, "DISPLAY_NAME");
		const clientId = requireProviderValue(env, prefix, "CLIENT_ID");
		const clientSecret = requireProviderValue(env, prefix, "CLIENT_SECRET");
		const discoveryUrl = requireProviderValue(env, prefix, "DISCOVERY_URL");

		providers.push({
			providerId,
			displayName,
			clientId,
			clientSecret,
			discoveryUrl,
			scopes: parseScopes(env[`${prefix}_SCOPES`]),
			allowAccountCreation: env[`${prefix}_ALLOW_ACCOUNT_CREATION`] === "true",
		});
	}

	return providers;
}

function isProviderIndexEmpty(env: Env, prefix: string): boolean {
	return PROVIDER_ENV_KEYS.every(
		(key) => env[`${prefix}_${key}`] === undefined,
	);
}

function getRequiredProviderValue(
	env: Env,
	prefix: string,
	key: RequiredProviderEnvKey,
): string | undefined {
	const value = env[`${prefix}_${key}`]?.trim();

	return value === "" ? undefined : value;
}

function requireProviderValue(
	env: Env,
	prefix: string,
	key: RequiredProviderEnvKey,
): string {
	const value = getRequiredProviderValue(env, prefix, key);

	if (value === undefined) {
		throw new Error(`Expected ${prefix}_${key} to be validated before parsing`);
	}

	return value;
}

function parseScopes(scopes: string | undefined): string[] {
	if (scopes === undefined) {
		return [...DEFAULT_OIDC_SCOPES];
	}

	return scopes
		.split(",")
		.map((scope) => scope.trim())
		.filter(Boolean);
}

export const authConfig = parseAuthConfig();
