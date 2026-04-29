# Allstarr

Allstarr is a self-hosted media manager focused on books, with additional movie, TV, and manga support. It uses TanStack Start, Bun, SQLite, and Better Auth.

## Local Development

1. Copy `.env.example` to `.env`.
2. Install dependencies with `bun install`.
3. Start the app with `bun run dev`.

Useful commands:

- `bun run build`
- `bun run start`
- `bun run test`
- `bun run test:coverage`
- `bun run test:coverage:full`
- `bun run lint`
- `bun run db:migrate`

Testing guidance: see [`docs/testing.md`](docs/testing.md) for which layer should own new regression coverage.

## Authentication Configuration

Allstarr supports email/password login by default. Production OIDC providers are configured with environment variables such as `OIDC_1_PROVIDER_ID`, `OIDC_1_CLIENT_ID`, `OIDC_1_CLIENT_SECRET`, and `OIDC_1_DISCOVERY_URL`. Additional providers use `OIDC_2_*`, `OIDC_3_*`, and so on.

`DISABLE_REGISTRATION=true` blocks self-service account creation after the first admin exists, except for OIDC providers with `OIDC_N_ALLOW_ACCOUNT_CREATION=true`. `DISABLE_EMAIL_PASSWORD_REGISTRATION=true` blocks email/password account creation while leaving email/password login enabled.

## Deployment

The production image path is the supported cross-platform build path:

```bash
docker build -t allstarr .
docker run --rm -p 3000:3000 allstarr
```

`sharp` is used for image resizing and is a native dependency. If you build `.output` on one OS or CPU architecture and copy it to another, the runtime can break. Build on the deployment target, or use Docker/buildx with the target platform instead of reusing locally built artifacts across platforms.

The included `Dockerfile` builds and installs production dependencies inside Alpine Linux, which avoids that mismatch when you deploy as a container.
