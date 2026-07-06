# Lucide icon font (vendored)

`lucide.ttf` is the official [Lucide](https://lucide.dev) icon font,
embedded into the `grida_editor` shell binary for the egui dev chrome
(see `src/shell/icon.rs`).

- **Version:** 1.23.0 (pinned)
- **Source:** `https://unpkg.com/lucide-static@1.23.0/font/lucide.ttf`
- **License:** ISC

```text
ISC License

Copyright (c) 2020, Lucide Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

To update the pinned version: replace `lucide.ttf`, bump the version
here, and re-verify the codepoints in `src/shell/icon.rs` (the glyph
slugs are stable, but their Private-Use-Area codepoints can shift between
releases — the `icon_font` test guards against a stale mapping).
