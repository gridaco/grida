/**
 * get the summary from the body html.
 *
 *
 * e.g. from
 * ```html
 * <p><b>SERVES: 1</b></p>
 * <p>Legend has it that the Ice Cream Float was invented on a particularly hot Philadelphia day by a soda vendor who had run out of ice. To cool his drinks</p>
 * ```
 *
 * => returns the second paragraph
 *
 *
 * @param body
 * @returns
 */
export function summarize(body: { html: string }): string {
  try {
    const { html } = body;

    if (!html) return undefined;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const paragraphs = doc.querySelectorAll("p");
    if (paragraphs.length) {
      // list first 3 paragraphs, get the longest one.
      const longest = Array.from(paragraphs)
        .slice(0, 3)
        .reduce(
          (acc, p) => {
            const text = p.textContent;
            if (text.length > acc.length) {
              return text;
            }
            return acc;
          },
          //
          ""
        );
      return longest.substring(0, 200);
    } else {
      // extract any text from html doc
      return doc.textContent?.substring(0, 200) ?? "";
    }
  } catch (e) {
    return "";
  }
}
