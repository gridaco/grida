export type TextToSpeechAudioTag = Readonly<{
  value: `[${string}]`;
  label: string;
  group: "Emotion" | "Delivery" | "Reaction";
}>;

export type TextToSpeechPromptInsertion = Readonly<{
  value: string;
  caret: number;
}>;

/** Pure text-editing rules for Eleven v3's inline square-bracket audio tags. */
export namespace TextToSpeechPrompt {
  export function characterCount(value: string): number {
    return Array.from(value).length;
  }

  /** A small starter set; Eleven v3 also accepts tags typed directly. */
  export const starterTags = Object.freeze([
    { value: "[excited]", label: "Excited", group: "Emotion" },
    { value: "[curious]", label: "Curious", group: "Emotion" },
    { value: "[sarcastic]", label: "Sarcastic", group: "Emotion" },
    { value: "[whispers]", label: "Whisper", group: "Delivery" },
    { value: "[laughs]", label: "Laugh", group: "Reaction" },
    { value: "[sighs]", label: "Sigh", group: "Reaction" },
  ] as const satisfies readonly TextToSpeechAudioTag[]);

  /** Insert a tag at the current selection and leave the caret ready to type. */
  export function insertTag(
    value: string,
    tag: TextToSpeechAudioTag["value"],
    selectionStart: number,
    selectionEnd: number
  ): TextToSpeechPromptInsertion {
    const start = clamp(selectionStart, 0, value.length);
    const end = clamp(selectionEnd, start, value.length);
    const before = value.slice(0, start);
    const after = value.slice(end);
    const leadingSpace = before.length > 0 && !/\s$/.test(before) ? " " : "";
    const existingTrailingWhitespace = after.match(/^\s+/)?.[0] ?? "";
    const trailingSpace = existingTrailingWhitespace ? "" : " ";
    const inserted = `${leadingSpace}${tag}${trailingSpace}`;

    return {
      value: `${before}${inserted}${after}`,
      caret:
        before.length + inserted.length + existingTrailingWhitespace.length,
    };
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}
