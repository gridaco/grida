---
title: "Untrusted SVG rendering — isolation strategies"
description: "Survey of how the web platform and peer editors render untrusted SVG without executing author script: the script-execution vector inventory, allowlist sanitization (DOMPurify, tldraw), the secure static image mode, iframe sandboxing, parse-into-model editors (Figma, Penpot, Excalidraw), and what a host CSP does and does not neutralize."
keywords:
  - svg
  - security
  - xss
  - sanitization
  - mxss
  - csp
tags:
  - internal
  - wg
  - research
  - svg
format: md
---

# Untrusted SVG rendering — isolation strategies

An SVG document is active content, not an image. Mounted into a live
web page it executes script in the embedding origin through several
distinct vectors; referenced as an image it executes nothing, by spec
mandate. This survey inventories the execution vectors, then examines
the four strategies the platform and peer editors use to render
untrusted SVG inertly, and closes with what a Content Security Policy
adds as a layer.

## The script-execution surface of SVG

Every strategy below is judged against this inventory. A scheme that
misses one row is not a hardening scheme.

- **`script` elements.** SVG is XML and supports `script` directly —
  the root cause of the recurring stored-XSS advisory class in apps
  that echo uploaded SVG (PentesterLab, OWASP).
- **Event-handler attributes** — `onload`, `onerror`, `onclick`,
  `onmouseover`, and the SMIL-specific `onbegin` / `onend` /
  `onrepeat`. PortSwigger's no-interaction payload:
  `<svg><animate onbegin=alert(1) attributeName=x dur=1s>` — fires
  when the animation timeline begins.
- **`javascript:` in URI-bearing attributes** — `href` /
  `xlink:href` on `a` and other linking elements.
- **Declarative animation retargeting an href.** An `animate` with
  `attributeName=href` and a `values` list can rewrite a sibling
  `a` / `use` href to a `javascript:` URL over time. SMIL is
  declarative animation, not script — no script-blocking control
  stops the animation itself (PortSwigger, "SVG animate XSS vector").
  The family is `animate`, `set`, `animateTransform`,
  `animateMotion`, plus SVG 2's timed-removal `discard`.
- **`foreignObject`** — embeds arbitrary HTML inside SVG (an
  `iframe` with a `javascript:` source, an `img` with `onerror`),
  opening the entire HTML XSS surface. Sanitizers must switch to
  HTML-mode or strip at this boundary.
- **`use` pulling another document** — a non-fragment `use` target
  (external or `data:` document) imports a subtree that itself
  carries any of the above.
- **Style-borne vectors** — `@import`, external `url()` in style
  content, and the legacy script-bearing CSS constructs
  (`expression()`, `-moz-binding`, `behavior:`).
- **Reparse mutation (mXSS).** Not an SVG construct but the failure
  class of string-level sanitization: serializing a sanitized tree
  and re-parsing it at mount time can mutate the tree back into
  executable form, typically via HTML/SVG/MathML namespace
  confusion. This is the documented bypass mechanism against
  DOMPurify (below).

Sources: https://portswigger.net/web-security/cross-site-scripting/cheat-sheet,
https://portswigger.net/research/svg-animate-xss-vector,
https://www.w3.org/wiki/SVG_Security,
https://pentesterlab.com/glossary/svg-xss.

## Strategy I — allowlist sanitization at the markup layer

### DOMPurify's SVG profile

- `USE_PROFILES: { svg: true, svgFilters: true }` is an allowlist:
  only elements and attributes in the SVG + SVG-filter tables
  survive; HTML and MathML do not.
- The default `svgDisallowed` set strips `script`, `foreignobject`,
  `use`, and the whole SMIL family (`animate`, `set`, `discard`, …).
  `foreignobject` is also in `FORBID_CONTENTS`, so its subtree is
  removed with it; re-enabling it requires explicit `ADD_TAGS` +
  `HTML_INTEGRATION_POINTS` configuration (a recurring friction
  point — issues #1002, #1088, hit by mermaid and Grafana).
- Event-handler attributes are stripped; URI attributes pass an
  allowlist of schemes (`http`, `https`, `mailto`, `tel`, …) —
  `javascript:` never survives.
- The bypass history is the central caution. **CVE-2020-26870**:
  serialize→parse is not idempotent; namespace confusion moving from
  SVG/MathML foreign content back to HTML let payloads survive
  sanitization. **CVE-2024-45801** (fixed 2.5.4 / 3.1.3):
  nesting-based mXSS evaded the depth-checking hardening added after
  the first round. The pattern: the sanitizer's parse and the mount
  parse disagree, and the disagreement is exploitable.
- Maintenance posture is strong (Cure53 since 2014, Trusted Types
  support), but the guarantee is operational, not structural — it
  requires staying current with releases.

Sources: https://github.com/cure53/DOMPurify,
https://www.sentinelone.com/vulnerability-database/cve-2020-26870/,
https://www.wiz.io/vulnerability-database/cve/cve-2024-45801,
https://flatt.tech/research/posts/bypassing-dompurify-with-good-old-xml/.

### tldraw's sanitizer

- Until early 2026 tldraw mounted pasted/dropped SVG unsanitized;
  issue #7876 ("Sanitize SVG content in the SDK to prevent XSS")
  tracked the exposure, and PR #7896 (merged 2026-02-23) shipped the
  fix: a custom ~643-line allowlist sanitizer with tag/attribute
  tables derived from DOMPurify's (MIT), chosen over DOMPurify
  itself ("wider scope than needed"), manual stripping
  ("error-prone"), and CSP alone ("insufficient SDK-level
  protection").
- The sanitizer walks the parsed tree and switches between SVG-mode
  and HTML-mode at `foreignObject` boundaries; documents whose root
  is not `svg` are rejected outright.
- URI hardening: `image` accepts only raster `data:` URLs; `use`
  permits only fragment (`#id`) references; `a` allows only `http:` /
  `https:` / `mailto:`. Animation elements that target `href` or
  carry event hooks are removed — directly closing the
  animate-retargets-href vector.
- CSS filtering strips `@import`, `expression()`, `-moz-binding`,
  `behavior:`, and external `url()` while preserving local
  `url(#id)` references.
- It runs at every ingestion point (paste, drop, file replace,
  custom asset creation) and is exported as a public
  `sanitizeSvg(svgText)` for SDK consumers. Notably, tldraw renders
  the sanitized SVG inline — which is exactly why an allowlist
  sanitizer was required; the image-context guarantee (Strategy II)
  was not available to a surface that needs the markup live.

Sources: https://github.com/tldraw/tldraw/issues/7876,
https://github.com/tldraw/tldraw/pull/7896.

## Strategy II — image-context isolation (secure static mode)

- When an SVG is referenced by `img`, by CSS
  (`background-image`, `list-style-image`, `content`), by SVG's own
  `image` / `feImage`, or drawn via `canvas.drawImage()`, the
  browser uses the _static image_ referencing mode, which mandates
  the **secure static processing mode** (SVG Integration spec):
  scripts must not execute, no resources may be fetched (scripts,
  stylesheets, images — anything not inlined as `data:`), animations
  do not run, and per the W3C SVG Security wiki, event listeners and
  hit testing are disabled at all times.
- The guarantee is **structural** — enforced by the rendering mode,
  independent of document content. It holds for any payload,
  including ones a sanitizer would miss.
- The costs are the flip side of the same mandate: the rendered tree
  is opaque to the host document (no DOM access, no per-node hit
  testing or geometry reads, no text editing), and any external
  reference the document legitimately depends on (fonts, images not
  inlined) silently fails to render.
- The restrictions apply only to _image_ contexts. The same document
  viewed directly or embedded via `iframe` / `object` / `embed` is a
  full document context and executes normally (MDN, "SVG as an
  image").

Sources: https://svgwg.org/specs/integration/,
https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image,
https://www.w3.org/wiki/SVG_Security,
https://bugzilla.mozilla.org/show_bug.cgi?id=628747.

## Strategy III — frame isolation (iframe sandbox)

- An empty `sandbox=""` attribute applies every restriction: script
  execution disabled, forms / popups / downloads / top-navigation
  blocked, and the content treated as a unique opaque origin that
  always fails same-origin checks.
- For untrusted content, `allow-scripts` is never granted —
  and the documented hard rule is that `allow-scripts` +
  `allow-same-origin` together let same-origin framed content remove
  its own sandbox, nullifying the mechanism (MDN).
- Unlike the image context, a sandboxed frame is a _document_
  context: SMIL and CSS animation run, the document is fully laid
  out, interactivity inside the frame works. Script vectors are dead
  because script is dead.
- The cost is the boundary itself: the host document cannot attach
  listeners to, hit-test, measure, or read computed style from nodes
  inside a cross-origin/opaque frame. Any interaction requires a
  `postMessage` bridge; an in-place editing model does not survive
  the boundary.

Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe.

## Strategy IV — parse into a native model

- **Figma** parses imported/pasted SVG into native vector nodes
  (vector networks) — source markup is never mounted. Constructs
  with no projection target in the model (script, events,
  `foreignObject`, SMIL) are simply dropped; projection _is_ the
  sanitization.
- **Penpot** converts imported SVG elements into its own shape
  records, with a residual `svg-raw` shape type for unmapped content
  (a partial exception worth noting in any threat model of that
  approach).
- **Excalidraw** treats imported SVG as an opaque image asset (a
  `data:` URL rendered through the image path) — i.e. it delegates
  to Strategy II rather than parsing the markup into shapes.
- The shared principle: parse → project onto a known schema →
  re-emit from the model. Nothing the model does not understand
  survives, so the security guarantee is structural and requires no
  per-CVE upkeep. The cost is fidelity: the projection is lossy by
  construction — unknown elements, exact byte layout, and
  unsupported features are gone, which rules the strategy out
  wherever byte-exact round-trip of the source is a requirement.

Sources: https://www.figma.com/plugin-docs/api/VectorNode/,
https://help.figma.com/hc/en-us/articles/360040450213-Vector-networks,
https://help.penpot.app/technical-guide/developer/data-model/,
https://deepwiki.com/excalidraw/excalidraw/6.3-file-and-image-management.

## What a host CSP adds

- A `script-src` (or `default-src`) directive blocks inline `script`
  elements in mounted SVG, blocks inline event-handler attributes
  (re-opened only by `'unsafe-inline'` / `'unsafe-hashes'` — hashes
  do not cover event handlers), and blocks `javascript:` URLs with
  no nonce/hash workaround.
- CSP does **not** stop SMIL: declarative animation is not script,
  so no `script-src` directive applies. An animate-retargets-href
  chain is stopped only at the final `javascript:` navigation, while
  the animation itself runs freely. CSP also offers no defense
  against mXSS — the mutation happens in the parser, before any
  policy applies.
- Practical conclusion: a strict CSP (`script-src 'self'`, no
  `'unsafe-inline'` / `'unsafe-hashes'`) is a strong second layer
  for inline-mounted SVG, but it is the _embedding page's_ policy —
  a library cannot guarantee it, and a host that needs
  `'unsafe-inline'` for unrelated reasons silently loses the layer.

Sources: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src,
https://content-security-policy.com/script-src/,
https://github.com/w3c/webappsec-csp/issues/13.

## Comparison

| Strategy                      | Script neutralization                                                                 | Fidelity loss                                                                          | Live interactivity (hit-test / computed style / in-place edit) | Cost                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| Allowlist sanitization        | Operational — complete while the allowlist is correct; documented mXSS bypass history | Low — markup mostly preserved; script / foreign content / SMIL / external refs dropped | Full — output is live host-DOM SVG                             | Allowlist + URI/CSS scrubbing + mode-switching upkeep |
| Image context (secure static) | Structural — spec-mandated, content-independent                                       | Medium — non-inlined external refs silently dropped; no animation                      | None — opaque surface                                          | Trivial                                               |
| Sandboxed frame               | Structural for script; document context otherwise                                     | Low — full layout, animation runs                                                      | None across the boundary without bridging                      | Frame plumbing + `postMessage` bridge                 |
| Parse into model              | Structural — markup never mounted                                                     | High — lossy projection by construction                                                | Full, in the editor's own terms                                | Large up-front model investment; no per-CVE upkeep    |

The strategies compose: several shipping tools use one for the live
surface and another for previews (sanitize-inline + image-context
thumbnails), and a strict host CSP layers under any of them.
