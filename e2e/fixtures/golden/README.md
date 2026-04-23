# Golden Fixtures

Golden fixtures store named service states and scenario manifests for fake-server replay.

Layout:

- `services/<service>/<state>/state.json`
- `scenarios/<scenario>.json`

The current migration mixes two kinds of checked-in fixture data:

- seeded state snapshots used by the fake-server runtime
- captured response payloads written by the local capture tooling

## Scenario Selection

Playwright files can opt into a named worker-scoped scenario:

```ts
test.use({ fakeServerScenario: "imports-all-sources-mapped" });
```

Each scenario maps service names to named states in `scenarios/*.json`.

For test-scoped changes, use the checked-in state library instead of posting ad hoc
payloads:

```ts
test("uses a different state", async ({ setFakeServiceState }) => {
  await setFakeServiceState("NEWZNAB", "caps-v2");
});
```

States may contain `{{TOKEN}}` placeholders for runtime-specific values such as
temporary download paths:

```ts
await setFakeServiceState("QBITTORRENT", "single-completed-book", {
  HASH: "lifecycle-hash-1",
  SAVE_PATH: downloadDir,
});
```

## Local Capture Workflow

Use the local capture CLI to stage updated fixture candidates from real services:

```bash
bun run fixtures:capture --config .local/golden-capture.json
```

For the Docker compose-backed live services in this repo, use the compose-specific
wrapper instead of hand-assembling a manifest:

```bash
SONARR_API_KEY=... \
RADARR_API_KEY=... \
READARR_API_KEY=... \
PROWLARR_API_KEY=... \
SABNZBD_API_KEY=... \
QBITTORRENT_PASSWORD=... \
bun run fixtures:capture:compose-live
```

The compose wrapper derives the runtime-only auth values that are annoying to keep
in a static manifest:

- qBittorrent `SID` cookie
- Transmission `X-Transmission-Session-Id`
- Deluge `_session_id` cookie and connected daemon host id
- current rTorrent hash, when one exists

Required API keys should still come from the real service UIs:

- Sonarr, Radarr, Readarr, Prowlarr: `Settings -> General -> Security -> API Key`
- SABnzbd: `Config -> General -> API Key`

Defaults used by the compose wrapper:

- Deluge password: `deluge`
- NZBGet username/password: `nzbget` / `tegbzn6789`
- output root: `e2e/fixtures/golden/_captures/live-compose`

Known live-service limitation as of April 23, 2026:

- Readarr author/book creation is currently blocked by `api.bookinfo.club`
  returning `NXDOMAIN`, so the compose-live capture contains real Readarr settings,
  root folders, download clients, queue, and blocklist data, but the checked-in
  `author` and `book` payloads are source-derived placeholder rows based on the
  official Readarr API/resource code until that upstream metadata service is
  healthy again.

Example manifest:

```json
{
  "outputRoot": "e2e/fixtures/golden/_captures",
  "services": [
    {
      "service": "sonarr",
      "stateName": "mapped-library",
      "baseUrl": "http://localhost:8989",
      "endpoints": [
        {
          "method": "GET",
          "path": "/api/v3/series",
          "headers": {
            "X-Api-Key": "replace-me"
          }
        },
        {
          "method": "GET",
          "path": "/api/v3/queue",
          "headers": {
            "X-Api-Key": "replace-me"
          }
        }
      ]
    }
  ]
}
```

The capture helper scrubs secrets only:

- API keys
- passwords
- tokens
- authorization headers
- cookies
- secret query-string values embedded in paths or text bodies

It intentionally preserves non-secret payload content so fixture diffs remain representative of real upstream responses.
