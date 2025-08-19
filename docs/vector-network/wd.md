# Grida's VectorNetwork Implementation.

> see [PR #408](https://github.com/gridaco/grida/pull/408)

**Core**

- [x] Vector Network storage-effective TF (schema change)
- [x] rectangle > network
- [x] ellipse > network
- [ ] ellipse (with arc data) > network
- [x] line > network
- [x] star > network
- [x] polygon > network
- [x] `corner_radius` for `VectorNode`
- [ ] `corner_radius` for each vertex
- [x] `acrive` NodeTrait
- [ ] stroke > path (`outline stroke` `⎇⌘O`)
- [ ] region model
- [ ] fill model
- [ ] stroke model
- [x] vne - optimize (deduplicate / simplify)
- [x] vne - union
- [ ] vne - planarize
- [ ] Variable width profile (pressure points profile) & rendering variable width fills
  - [ ] schema
  - [ ] rendering

**WASM API**

- [x] stroke geometry overlay api `highlight_strokes`
- [x] get accurate bounding box for `VectorNode`
- [ ] get primitive -> vector (mostly for ArcRing shape)
- [ ] get path data -> for complex surface ui display

**UX Features**

- [x] flatten
  - [x] `cmd+e` flatten selection
  - [x] flatten-as-union
  - [x] flatten of mixed selection of flatten-supported and non-supported nodes
  - [x] flatten with group-by-sibling
- [x] revert (or virtual vector node) mechanism - to revert to original (non vector) node when no changes were made
- [x] clean vector network when commit (end gesture) (merge verticies / segments in to simplified version - requires snap feature to work)
- [x] vertex control
  - [x] hover vertex
  - [x] move vertex
  - [x] move multiple vertex
  - [x] delete vertex
- [x] tangent control
  - [x] hover ta/tb
  - [x] move ta/tb
  - [x] move multiple ta/tb
  - [x] move with mirroring mode
  - [x] delete (set 0) ta/tb
- [ ] segment control
  - [x] hover segment
  - [x] move segment
  - [x] move multiple segment
  - [ ] delete segment
  - [x] mark active
- [ ] region control
  - [x] hover region
  - [ ] move region
- [x] mixed selection
  - [x] move mixed selection (vertex, tangent, segment)
- [x] path tool
  - [x] connect vertex (close)
  - [x] reset tool state when close
  - [x] continue path tool (p)
  - [x] `curve-a` start with curved
  - [x] `curve-b` end with curved
- [x] split / subdivide
  - [x] half/middle (`t=0.5`) point projection (have point vertex projection for non-curved segment)
  - [x] segment `t` snap
  - [x] split segment at `t`
  - [x] start from `t`
  - [x] conclude with `t`
- [x] vertex snap
  - [x] snap to verticies
- [ ] tangent snap
  - [x] snap to verticies
  - [ ] snap to original angle
- [ ] movement snap to vertex (projection)
  - [x] snap to verticies
- [ ] vertex properties panel
  - [x] xy
  - [x] xy delta
  - [x] xy mixed
  - [x] xy mixed delta
  - [ ] mirroring mode
  - [ ] align
- [ ] bend tool
  - [x] bend tool - click vertex - bend corner
  - [ ] bend tool - drag vertex - bend corner
  - [ ] bend tool - click segment - bend segment
  - [x] bend tool - drag segment - bend segment
- [ ] measurement
  - [x] measure vertex ↔️ curve-parametric-point
  - [x] measure verticies (as bbox) ↔️ curve-parametric-point
  - [ ] measure region (as bbox) ↔️ region (as bbox)
  - [ ] measure vertex ↔️ region (as bbox)
  - [ ] measure verticies (as bbox) ↔️ region (as bbox)
- [ ] context menu (common context menu items are disabled for vector edit mode)
  - [ ] copy vector selection
  - [ ] paste vector selection
- [ ] variable width tool (not planned)
- [x] lasso-marquee selection
  - [x] `Q` lasso tool
  - [x] lasso ui https://canary.grida.co/ui/lasso
  - [x] lasso point-in-polygon
  - [x] lasso selection
  - [x] marqee selection
  - [x] additive selection (shift)
- [ ] paint bucket tool
- [ ] a11y
  - [x] nudge `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`
  - [x] delete (or reset) `Delete` `Backspace`
  - [x] break mirroring `Alt`, `Option`
  - [x] with mirroring `Meta`
  - [x] `Shift` (multiple selection)
  - [x] copy (with key)
  - [ ] copy (with alt)

### References

- https://www.borisdalstein.com/research/phd/phd_boris_dalstein_2017_web.pdf
- https://alexharri.com/blog/vector-networks

**`[cg259]` Pt.1 Primitives to network - rectangle / ellipse**

https://github.com/user-attachments/assets/4d2c817f-cff0-463f-a3e0-7c5485d67cae

**`[cg260]` Pt.2 Middle point projection / move by segment**

https://github.com/user-attachments/assets/8d12c745-2124-4fbf-83c6-9eaa4cdf9cde

**`[cf261]` Pt.3 Lasso tool - https://canary.grida.co/ui/lasso**

https://github.com/user-attachments/assets/45b3ea85-59a2-4017-92e0-6580769586e0

**`[cf262]` Pt.4 mixed multiple control points selection and translation by constraints with lasso-marquee tool**

https://github.com/user-attachments/assets/0c2e92d6-60bf-4530-86fc-28446df2c965

**`[cf263]` Pt.5 Connecting the dots with path tool**

https://github.com/user-attachments/assets/3609f749-a666-4432-9d21-551e96c461b9

**`[cf264]` Pt.6 Vertex Snapping and Simplify (clean) Network**

https://github.com/user-attachments/assets/d30443ab-2e50-4db5-bee2-9312000452e4

**`[cf265]` Pt.7 Region loop translation**

https://github.com/user-attachments/assets/4730cb8e-1412-4495-af00-e38332181d80

**`[cf266]` Pt.8 Bend Tool**

https://github.com/user-attachments/assets/e64ada26-7f10-41a0-90c7-7086a3f50a48

**`[cf267]` Pt.9 Measurement**

https://github.com/user-attachments/assets/630afe5c-abd0-4336-a5b3-5d7f5e034bc4

**`[cf268]` Pt.10 Split segment (subdivide curve at `t`)**

https://github.com/user-attachments/assets/c30ed5b4-000c-43b0-b0d3-a54af1a2dade

**`[cf269]` Pt.11 Planarization**

https://github.com/user-attachments/assets/48754c88-c3c9-4b05-b9ab-10929e756379

**`[cf270]` Pt.12 Variable Width**

https://github.com/user-attachments/assets/139b5a40-66d1-4266-9e20-236230c44f83

**`[cf271]` Pt.13 Boolean Path Ops**

https://github.com/user-attachments/assets/e62b3e8f-0f49-4844-95e8-c0439b9dc508
