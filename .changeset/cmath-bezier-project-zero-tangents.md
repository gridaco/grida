---
"@grida/cmath": patch
---

`cmath.bezier.project` no longer snaps to an endpoint for a cursor near but not at the end of a long zero-tangent (straight) segment. Such segments are projected onto the chord and mapped back to the cubic parameter.
