/**
 * Non-author contributor roles to exclude from book listings and imports.
 * The `contribution` field is `null` for primary authors; these are the
 * known secondary roles where the person did not originate the content.
 *
 * Used both in GraphQL queries (_nin filter) and in post-fetch filtering.
 */
export const NON_AUTHOR_ROLES = new Set([
  // Editorial
  "Editor",
  "editor",
  "Series Editor",
  "Editor and Contributor",
  "Editor/Introduction",
  // Translation / adaptation
  "Translator",
  "Adapted by",
  "Adapter",
  "Adaptor",
  // Art / production
  "Illustrator",
  "illustrator",
  "Cover artist",
  "Cover design",
  "Photographer",
  // Audio
  "Narrator",
  "Reader",
  // Supplementary content
  "Introduction",
  "Foreword",
  "Afterword",
  // Other non-originating
  "Compiler",
  "Pseudonym",
  "pseudonym",
  "Compilation",
  'as "Anonymous"',
]);

/**
 * GraphQL filter fragment: matches only author-role contributions.
 * Includes null (primary author) and excludes NON_AUTHOR_ROLES via _nin.
 */
export const AUTHOR_ROLE_FILTER = `_or: [{ contribution: { _is_null: true } }, { contribution: { _nin: [${[...NON_AUTHOR_ROLES].map((r) => JSON.stringify(r)).join(", ")}] } }]`;
