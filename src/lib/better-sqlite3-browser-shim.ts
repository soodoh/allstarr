// oxlint-disable no-empty-function, explicit-module-boundary-types -- Intentional no-op shim
// Browser shim for better-sqlite3 — only loaded on client where the DB is never used.
// Server-side imports use the real better-sqlite3 via ssr.external.
function Database(): void {
  // no-op: browser shim
}
Database.prototype.pragma = function (): void {
  // no-op
};
Database.prototype.exec = function (): void {
  // no-op
};
export default Database;
