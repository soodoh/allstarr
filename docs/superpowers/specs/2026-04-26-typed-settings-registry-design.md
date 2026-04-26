# Typed Settings Registry Design

## Purpose

Settings saved through the generic settings path should have a known key, an explicit value type, and a default. Boolean and numeric settings must not round-trip as strings because a route called `String(...)` before saving.

## Design

Create a typed settings registry that maps each known generic setting key to a Zod schema and default value. Repeated media-management keys should be generated from content types and field definitions so every concrete key still has a specific schema without hand-writing duplicate definitions.

`updateSettingFn` will validate the key against the registry and parse the value with that key's schema before persistence. Unknown keys and wrong value types should fail at the server-function input boundary.

`getSettingsFn` will return a settings map containing defaults for every known setting, parsed stored values for known keys, and parsed legacy unknown keys for compatibility.

`useUpdateSettings` and settings routes will accept typed values. Routes that save booleans or numbers should pass real booleans and numbers instead of stringifying them.

## Scope

- Add registry-backed key/value validation for generic settings.
- Preserve compatibility for unknown legacy stored keys when reading settings.
- Update current generic settings writers in General, Download Clients, Media Management, Metadata, and Formats.
- Add tests proving typed persistence, defaults, unknown-key rejection, wrong-type rejection, and typed route/mutation payloads.

## Non-Goals

- Do not redesign metadata profile storage.
- Do not change database schema.
- Do not refactor all settings UI structure.
- Do not remove legacy unknown stored settings from reads.
