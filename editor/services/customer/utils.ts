import { FormResponseContacts } from "@grida/forms";

export const process_response_provisional_info =
  FormResponseContacts.provisional;

export function provisional<T>(clear: T | null, provisional?: T[]): T[] {
  if (clear) {
    return [clear];
  }

  return provisional || [];
}
