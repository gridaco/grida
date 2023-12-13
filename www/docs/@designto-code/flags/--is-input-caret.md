---
title: Is InputCaret flag
id: "--is-input-caret"
locale: en
stage:
  - proposal
  - draft
  - experimental
  - not-ready
---

# Input caret indication

We often tend to include interactive snapshot of the state, for example, a caret of text field on focused state. Designers often use vertical line, vertical slim rectangle or a text `"|"` to represent a input caret.

Well of course, this should be ignored on the code.

You can simply provide `--is-input-caret` flag on the caret design layer, so that the text field design can safely be interpreted and converted to a text field component code.
