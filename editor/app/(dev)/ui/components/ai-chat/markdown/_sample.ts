/**
 * Single markdown fixture for the AI response markdown demo.
 *
 * Literal backticks are escaped (\`) because the sample is a template string.
 */

export const MARKDOWN_SAMPLE = `# Markdown kitchen sink

A quick tour of the common shapes an AI response can render.

## Headings

### Heading level 3

#### Heading level 4

##### Heading level 5

###### Heading level 6

## Text & emphasis

This paragraph mixes **bold**, _italic_, **_bold italic_**, ~~strikethrough~~,
and \`inline code\`. Here is an [external link](https://grida.co) and a bare
autolink https://grida.co that should be clickable.

> Single-level quote with **emphasis** inside.
>
> > Nested quote, second level.

## Lists

- First item
- Second item
  - Nested item
  - Another nested item
    - Third level
- Third item

1. Step one
2. Step two
   1. Sub-step a
   2. Sub-step b
3. Step three

- [x] Move renderer into \`kits/agent-chat\`
- [ ] Tune markdown styles

## Code

Inline \`const x = 1\` and a fenced block:

\`\`\`ts
import { Streamdown } from "streamdown";

export function render(markdown: string) {
  const compact = markdown.trim();
  return compact;
}
\`\`\`

## Table

| Field   | Type   | Notes                |
| ------- | ------ | -------------------- |
| \`id\`    | string | **required**, unique |
| \`label\` | string | shown in the picker  |
| \`href\`  | string | see [routing](https://grida.co) |

---

A long inline URL:
https://grida.co/very/deeply/nested/path/to/a/component/logo-artboard.tsx?with=query&and=more&params=here
`;
