/// THIS IS A DUPLICATE CODE FROM ASSISTANT/APP/UTILS/DART-FORMAT
/// considering it's size, we decided to use it as a duplicate function.

import { formatCode } from "dart-style";

// formatter contains some issue. https://github.com/Dart-Code/Dart-Code/issues/2822
export function format(code: string): string {
  if (code === undefined) {
    return code;
  }
  try {
    const formatted = formatCode(code);
    return formatted.code;
  } catch (e) {
    console.error(e);
    return code;
  }
}
