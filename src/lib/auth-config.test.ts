import { describe, expect, it } from "vitest";
import {
	getProviderAccountCreationPolicy,
	parseAuthConfig,
} from "./auth-config";

describe("parseAuthConfig", () => {
	it("returns defaults when no OIDC providers are configured", () => {
		const config = parseAuthConfig({});

		expect(config.registrationDisabled).toBe(false);
		expect(config.emailPasswordRegistrationDisabled).toBe(false);
		expect(config.oidcProviders).toEqual([]);
		expect(config.publicOidcProviders).toEqual([]);
		expect(config.allowOidcAccountCreation("authentik")).toBe(false);
	});

	it("parses one complete OIDC provider", () => {
		const config = parseAuthConfig({
			OIDC_1_PROVIDER_ID: "authentik",
			OIDC_1_DISPLAY_NAME: "Authentik",
			OIDC_1_CLIENT_ID: "client-id",
			OIDC_1_CLIENT_SECRET: "client-secret",
			OIDC_1_DISCOVERY_URL:
				"https://auth.example.com/.well-known/openid-configuration",
		});

		expect(config.oidcProviders).toEqual([
			{
				providerId: "authentik",
				displayName: "Authentik",
				clientId: "client-id",
				clientSecret: "client-secret",
				discoveryUrl:
					"https://auth.example.com/.well-known/openid-configuration",
				scopes: ["openid", "profile", "email"],
				allowAccountCreation: false,
			},
		]);
		expect(config.publicOidcProviders).toEqual([
			{ providerId: "authentik", displayName: "Authentik" },
		]);
	});

	it("parses multiple providers and custom scopes", () => {
		const config = parseAuthConfig({
			OIDC_1_PROVIDER_ID: "authentik",
			OIDC_1_DISPLAY_NAME: "Authentik",
			OIDC_1_CLIENT_ID: "authentik-client",
			OIDC_1_CLIENT_SECRET: "authentik-secret",
			OIDC_1_DISCOVERY_URL:
				"https://auth.example.com/.well-known/openid-configuration",
			OIDC_1_SCOPES: "openid, profile, email, groups",
			OIDC_2_PROVIDER_ID: "authelia",
			OIDC_2_DISPLAY_NAME: "Authelia",
			OIDC_2_CLIENT_ID: "authelia-client",
			OIDC_2_CLIENT_SECRET: "authelia-secret",
			OIDC_2_DISCOVERY_URL:
				"https://login.example.com/.well-known/openid-configuration",
		});

		expect(config.oidcProviders.map((provider) => provider.providerId)).toEqual(
			["authentik", "authelia"],
		);
		expect(config.oidcProviders[0]?.scopes).toEqual([
			"openid",
			"profile",
			"email",
			"groups",
		]);
		expect(config.oidcProviders[1]?.scopes).toEqual([
			"openid",
			"profile",
			"email",
		]);
	});

	it("parses registration flags and explicit OIDC account creation", () => {
		const config = parseAuthConfig({
			DISABLE_REGISTRATION: "true",
			DISABLE_EMAIL_PASSWORD_REGISTRATION: "true",
			OIDC_1_PROVIDER_ID: "authentik",
			OIDC_1_DISPLAY_NAME: "Authentik",
			OIDC_1_CLIENT_ID: "client-id",
			OIDC_1_CLIENT_SECRET: "client-secret",
			OIDC_1_DISCOVERY_URL:
				"https://auth.example.com/.well-known/openid-configuration",
			OIDC_1_ALLOW_ACCOUNT_CREATION: "true",
		});

		expect(config.registrationDisabled).toBe(true);
		expect(config.emailPasswordRegistrationDisabled).toBe(true);
		expect(config.allowOidcAccountCreation("authentik")).toBe(true);
		expect(config.allowOidcAccountCreation("authelia")).toBe(false);
		expect(getProviderAccountCreationPolicy(config, "authentik")).toBe(true);
	});

	it("defaults OIDC account creation to false", () => {
		const config = parseAuthConfig({
			OIDC_1_PROVIDER_ID: "authentik",
			OIDC_1_DISPLAY_NAME: "Authentik",
			OIDC_1_CLIENT_ID: "client-id",
			OIDC_1_CLIENT_SECRET: "client-secret",
			OIDC_1_DISCOVERY_URL:
				"https://auth.example.com/.well-known/openid-configuration",
		});

		expect(config.allowOidcAccountCreation("authentik")).toBe(false);
		expect(getProviderAccountCreationPolicy(config, "authentik")).toBe(false);
	});

	it("throws a useful error for partial provider configuration", () => {
		expect(() =>
			parseAuthConfig({
				OIDC_1_PROVIDER_ID: "authentik",
				OIDC_1_CLIENT_ID: "client-id",
			}),
		).toThrow(
			"OIDC_1 is missing required environment variables: OIDC_1_DISPLAY_NAME, OIDC_1_CLIENT_SECRET, OIDC_1_DISCOVERY_URL",
		);
	});
});
