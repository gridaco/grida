export namespace NativeChatTitle {
  export const capability = "co.grida/session/initial-title";

  /** One line of the person's message, capped at 50 Unicode code points. */
  export function excerpt(text: string): string | undefined {
    const line = text.replace(/[\s\p{Cc}]+/gu, " ").trim();
    if (!line) return undefined;
    const characters: string[] = [];
    for (const character of line) {
      if (characters.length === 50)
        return `${characters.slice(0, -1).join("").trimEnd()}…`;
      characters.push(character);
    }
    return line;
  }
}
