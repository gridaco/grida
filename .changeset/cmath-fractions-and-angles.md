---
"@grida/cmath": patch
---

Fix aspect-ratio rounding caused by discarding a closer fraction at the denominator limit. Wrap negative angles into the documented range of `[-180, 180)` degrees.
