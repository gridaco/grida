import { capitalCase, snakeCase } from "change-case";

export function fmt_snake_case_to_human_text(input: string) {
  if (!input) {
    return "";
  }
  // Converts to snake_case then replaces underscores with spaces and capitalizes words
  return capitalCase(snakeCase(input)).toLowerCase();
}

export function fmt_hashed_local_id(local_id: number) {
  return "#" + local_id;
}
