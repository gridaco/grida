export const USERNAME_REGEX = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function isValidUsername(username: string) {
  return USERNAME_REGEX.test(username);
}

export const messages = {
  available: "This name is available",
  invalid:
    "Must be lowercase alphanumeric and start with a letter, and can contain hyphens",
  taken: "This name is taken",
} as const;
