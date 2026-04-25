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

const DEFAULT_OIDC_SCOPES = ["openid", "profile", "email"];

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
			(key) => env[`${prefix}_${key}`] === undefined,
		);

		if (missingKeys.length > 0) {
			throw new Error(
				`${prefix} is missing required environment variables: ${missingKeys
					.map((key) => `${prefix}_${key}`)
					.join(", ")}`,
			);
		}

		providers.push({
			providerId: env[`${prefix}_PROVIDER_ID`] as string,
			displayName: env[`${prefix}_DISPLAY_NAME`] as string,
			clientId: env[`${prefix}_CLIENT_ID`] as string,
			clientSecret: env[`${prefix}_CLIENT_SECRET`] as string,
			discoveryUrl: env[`${prefix}_DISCOVERY_URL`] as string,
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

function parseScopes(scopes: string | undefined): string[] {
	if (scopes === undefined) {
		return DEFAULT_OIDC_SCOPES;
	}

	return scopes
		.split(",")
		.map((scope) => scope.trim())
		.filter(Boolean);
}

export const authConfig = parseAuthConfig();
