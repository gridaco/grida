import { validate, version } from "uuid";

export function is_uuid_v4(value: string): boolean {
  try {
    return validate(value) && version(value) === 4;
  } catch (e) {
    return false;
  }
}
