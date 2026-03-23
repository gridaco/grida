import type { ReactNode } from "react";

// TODO: /embed/v1/forms — embeddable Grida Forms viewer (full UI in-frame, not a redirect).
//       Distinct from the legacy public API route `GET /v1/embed/[id]` which 301s to `/d/e/[id]`
//       for hosted campaign forms.

export default function EmbedV1Layout({ children }: { children: ReactNode }) {
  return children;
}
