/**
 * Regex for validating a username, document slug, etc.
 */
export const USERNAME_REGEX = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function isValidUsername(username: string) {
  return USERNAME_REGEX.test(username);
}

export const username_validation_messages = {
  available: "This name is available",
  invalid:
    "Must be lowercase alphanumeric and start with a letter, and can contain hyphens",
  taken: "This name is taken",
} as const;

/**
 * Regex for validating a database name, table name, schema name, etc.
 */
export const SCHEMANAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

export function isValidSchemaName(name: string) {
  return SCHEMANAME_REGEX.test(name);
}

export const schemaname_validation_messages = {
  available: "This name is available",
  invalid:
    "Must start with a letter or underscore, and can contain only letters, numbers, and underscores",
  taken: "This name is already used",
} as const;

/**
 * Regex for validating a bucket name.
 *
 * The bucket name must start with a letter or underscore,
 * followed by up to 62 characters that can be letters, digits,
 * underscores, or dashes.
 */
export const BUCKETNAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/;

export function isValidBucketName(name: string) {
  return BUCKETNAME_REGEX.test(name);
}

/**
 * Validation messages for a bucket name.
 *
 * The bucket name must start with a letter or underscore,
 * followed by up to 62 characters that can be letters, digits,
 * underscores, or dashes.
 */
export const bucket_validation_messages = {
  available: "This name is available",
  invalid:
    "Must start with a letter or underscore, and can contain only letters, numbers, underscores, or dashes",
  taken: "This name is already used",
} as const;
