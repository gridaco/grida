import { UUID_FORMAT_MISMATCH, VISITORID_FORMAT_MISMATCH } from "@/k/error";
import {
  SYSTEM_GF_CUSTOMER_EMAIL_KEY,
  SYSTEM_GF_CUSTOMER_UUID_KEY,
  SYSTEM_GF_FINGERPRINT_VISITORID_KEY,
  SYSTEM_GF_KEY_STARTS_WITH,
} from "@/k/system";
import { is_uuid_v4 } from "@/utils/is";

export interface GFKeys {
  [SYSTEM_GF_FINGERPRINT_VISITORID_KEY]?: string;
  [SYSTEM_GF_CUSTOMER_UUID_KEY]?: string;
  [SYSTEM_GF_CUSTOMER_EMAIL_KEY]?: string;
}

export function parseGFKeys(
  data: URLSearchParams | Map<string, string>
): GFKeys {
  const map: GFKeys = {};
  const keys = Array.from(data.keys());
  const system_gf_keys: string[] = keys.filter((key) =>
    key.startsWith(SYSTEM_GF_KEY_STARTS_WITH)
  );

  for (const key of system_gf_keys) {
    const value = data.get(key) as string;
    switch (key) {
      case SYSTEM_GF_FINGERPRINT_VISITORID_KEY: {
        if (value.length === 32) {
          map[key] = value;
          break;
        } else {
          throw VISITORID_FORMAT_MISMATCH;
        }
      }
      case SYSTEM_GF_CUSTOMER_UUID_KEY: {
        if (is_uuid_v4(value)) {
          map[key] = value;
          break;
        } else {
          console.error("uuid format mismatch", value);
          throw UUID_FORMAT_MISMATCH;
        }
      }
      case SYSTEM_GF_CUSTOMER_EMAIL_KEY: {
        if (!value.includes("@")) {
          // TODO: more strict email validation
          map[key] = value;
          break;
        }
      }
      default:
        break;
    }
  }

  return map;
}
