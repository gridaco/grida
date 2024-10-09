export type MarkerConfig = {
  /**
   * @default "*"
   */
  char?: string;
  /**
   * @default "text"
   */
  format?: "uuid" | "json" | "timestamp" | "text" | "email" | "phone";
};

/**
 * Data masking without additional information, solely based on the shape of the string.
 */
export function mask(value: string, config?: MarkerConfig): string {
  const char = config?.char || "*";
  const format = config?.format || "text";

  switch (format) {
    case "uuid":
      return mask_uuid(value, char);
    case "email":
      return mask_email(value, char);
  }

  // split tokens
  const tokens = [" ", "@", "-", ".", "_"];

  function maskString(str: string) {
    if (str.length === 0) {
      return "";
    }
    if (str.length === 1) {
      return char;
    }
    if (str.length <= 3) {
      return str[0] + char.repeat(str.length - 1);
    }
    return char.repeat(str.length);
  }

  function maskPartially(str: string, startVisibleLength: number) {
    if (str.length === 0) {
      return "";
    }
    if (str.length <= startVisibleLength) {
      return str[0] + char.repeat(str.length - 1);
    }
    return (
      str.slice(0, startVisibleLength) +
      char.repeat(str.length - startVisibleLength)
    );
  }

  for (let token of tokens) {
    if (value.includes(token)) {
      const parts = value.split(token);
      // Mask all parts except the first one
      const maskedParts = parts.map((part, index) =>
        index === 0 ? maskPartially(part, 1) : maskString(part)
      );
      return maskedParts.join(token);
    }
  }

  // No token found, apply simple masking rule
  return maskPartially(value, 1);
}

/**
 * `11111111-1111-1111-1111-111111111111` => `1*******-1111-1111-***1`
 *
 * transform first and last group of characters to `*`, keeping the first and last characters visible,
 * and keep the middle groups as is.
 *
 * @param value uuid string
 */
function mask_uuid(value: string, char = "*"): string {
  const parts = value.split("-");

  if (parts.length !== 5) {
    // when error case, => mask all
    return char.repeat(value.length);
  }

  const masked = `${parts[0][0]}${char.repeat(parts[0].length - 1)}-${parts[1]}-${parts[2]}-${char.repeat(parts[3].length - 1)}${parts[3][parts[3].length - 1]}`;
  return masked;
}

function mask_email(value: string, char = "*"): string {
  const parts = value.split("@");

  if (parts.length !== 2) {
    // when error case, => mask all
    return char.repeat(value.length);
  }

  const masked = `${parts[0][0]}${char.repeat(parts[0].length - 1)}@${parts[1]}`;
  return masked;
}
