CREATE TABLE `oidc_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`display_name` text NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text NOT NULL,
	`discovery_url` text NOT NULL,
	`scopes` text DEFAULT '["openid","profile","email"]' NOT NULL,
	`trusted` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_providers_provider_id_unique` ON `oidc_providers` (`provider_id`);