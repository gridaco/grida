export function mask(value: string, mask = "*") {
  // split tokens
  const tokens = [" ", "@", "-", ".", "_"];

  function maskString(str: string) {
    if (str.length === 0) {
      return "";
    }
    if (str.length === 1) {
      return mask;
    }
    if (str.length <= 3) {
      return str[0] + mask.repeat(str.length - 1);
    }
    return mask.repeat(str.length);
  }

  function maskPartially(str: string, startVisibleLength: number) {
    if (str.length === 0) {
      return "";
    }
    if (str.length <= startVisibleLength) {
      return str[0] + mask.repeat(str.length - 1);
    }
    return (
      str.slice(0, startVisibleLength) +
      mask.repeat(str.length - startVisibleLength)
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
