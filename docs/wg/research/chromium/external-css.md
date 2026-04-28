---
title: "Chromium External CSS — `@import` and `<link rel=stylesheet>`"
description: "How Blink fetches external stylesheets, surfaces them to the parser, prevents cycles, and orders imported rules during cascade build."
keywords:
  [
    chromium,
    blink,
    css,
    import,
    stylesheet,
    ResourceFetcher,
    StyleRuleImport,
    CSSStyleSheetResource,
  ]
tags: [research, chromium, css]
format: md
---

# Chromium External CSS — Lifecycle & Architecture

How Blink loads and integrates external stylesheets — `<link rel="stylesheet">`,
`@import` rules inside `<style>` blocks, and SVG's `<?xml-stylesheet?>`
processing instructions.

For the broader resource pipeline (images, fonts, fetch states), see
[external-resource-loading.md](./external-resource-loading.md).

---

## Architecture: Three Layers

Blink's external-CSS path cleanly separates three concerns:

```text
┌─────────────────────────────────────────────────────────────────┐
│ 1. Parser layer (CSS tokenizer / AST)                           │
│    CSSParserImpl::ConsumeImportRule                             │
│    → produces a StyleRuleImport node, no I/O                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (registered with owning sheet)
┌─────────────────────────────────────────────────────────────────┐
│ 2. Owner layer (sheet state machine)                            │
│    StyleSheetContents::ParserAppendRule  →                      │
│    StyleRuleImport::RequestStyleSheet                           │
│    – cycle check, URL resolution                                │
│    – holds an `ImportedStyleSheetClient` (ResourceClient)       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (FetchParameters)
┌─────────────────────────────────────────────────────────────────┐
│ 3. Resource layer (network / disk cache, async)                 │
│    CSSStyleSheetResource (subclass of TextResource)             │
│    ↳ ResourceFetcher::RequestResource                           │
│    – cache lookup, network request, decode                      │
│    – on completion: ResourceClient::NotifyFinished              │
└─────────────────────────────────────────────────────────────────┘
```

The cleanest lesson for an embedder: **the parser does not fetch.** It
emits an AST node carrying only the URL string. A separate, owning
object decides whether and how to fetch.

---

## Key Types

| Type                               | File                                                   | Role                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StyleRuleImport`                  | `core/css/style_rule_import.{h,cc}`                    | AST node + per-import state machine. Owns the URL string, the loaded child `StyleSheetContents`, and the `ImportedStyleSheetClient` that listens for fetch completion. |
| `ImportedStyleSheetClient`         | nested in `style_rule_import.h`                        | `ResourceClient` impl that bridges fetch-finished callbacks back to the rule.                                                                                          |
| `StyleSheetContents`               | `core/css/style_sheet_contents.{h,cc}`                 | The owning sheet — holds `import_rules_`, `child_rules_`, parses input, walks parent chain for cycles, drives `LoadCompleted()`.                                       |
| `CSSStyleSheetResource`            | `core/loader/resource/css_style_sheet_resource.{h,cc}` | The cached/decoded resource. Holds `decoded_sheet_text_` and an optional `parsed_style_sheet_cache_` for cross-document reuse.                                         |
| `CSSParserImpl::ConsumeImportRule` | `core/css/parser/css_parser_impl.cc:1086`              | Tokenizes `@import` syntax. Returns `StyleRuleImport*` or nullptr.                                                                                                     |
| `ResourceFetcher`                  | `core/loader/resource_fetcher.{h,cc}`                  | Per-document fetch coordinator. Honors cache, MIME, CORS, integrity.                                                                                                   |

---

## The `@import` Lifecycle

### 1. Parser emits a `StyleRuleImport`

`CSSParserImpl::ConsumeImportRule` (`core/css/parser/css_parser_impl.cc:1086-1200`)
parses the prelude — URL, optional `layer(...)`, `supports(...)`,
media query list — and returns:

```cpp
return MakeGarbageCollected<StyleRuleImport>(
    uri, std::move(layer), style_scope,
    supported == CSSSupportsParser::Result::kSupported,
    supports_string.ToString(), media_query_set, ...);
```

The rule carries **only the bare URL string** (`str_href_`). Resolution
to an absolute URL and any I/O are deferred.

### 2. Owner registers + immediately requests

When the top-level parser surfaces a rule, `StyleSheetContents::ParserAppendRule`
sees it's an import:

```cpp
// style_sheet_contents.cc:193-204
if (auto* import_rule = DynamicTo<StyleRuleImport>(rule)) {
  // Parser enforces that @import rules come before anything else other than
  // empty layer statements
  DCHECK(child_rules_.empty());
  ...
  import_rules_.push_back(import_rule);
  import_rules_.back()->SetParentStyleSheet(this);
  import_rules_.back()->RequestStyleSheet();
  return;
}
```

Two invariants here:

- **Position-locked** — `DCHECK(child_rules_.empty())` enforces
  CSS spec: `@import` must appear before any rule (layer statements
  excepted). The parser rejects late imports earlier.
- **Eager fetch** — the request is dispatched immediately on parser
  append, not deferred to layout/cascade build.

### 3. Cycle detection

`StyleRuleImport::RequestStyleSheet` walks the parent-sheet chain
before issuing any request:

```cpp
// style_rule_import.cc:178-187
StyleSheetContents* root_sheet = parent_style_sheet_;
for (StyleSheetContents* sheet = parent_style_sheet_; sheet;
     sheet = sheet->ParentStyleSheet()) {
  if (EqualIgnoringFragmentIdentifier(abs_url, sheet->BaseURL()) ||
      EqualIgnoringFragmentIdentifier(
          abs_url, document->CompleteURL(sheet->OriginalURL()))) {
    return;
  }
  root_sheet = sheet;
}
```

Two URL forms are checked: the parent sheet's `BaseURL()` (the resolved
URL it was fetched from) and the document-relative `OriginalURL()`. If
either matches, the import is silently dropped. There is **no depth cap
beyond cycle detection** — a chain of distinct sheets can be arbitrarily
deep.

### 4. Fetch via the standard resource pipeline

The resolved URL is stuffed into a `FetchParameters` and passed to:

```cpp
// style_rule_import.cc:232
CSSStyleSheetResource::Fetch(params, fetcher, style_sheet_client_);
```

`CSSStyleSheetResource::Fetch` is one entry point shared with
`<link rel="stylesheet">` (`core/loader/link_loader.cc:200`),
SVG/XML processing instructions (`core/dom/processing_instruction.cc:420`),
preload helpers, and DevTools. All three external-CSS surfaces converge
on the same resource type and cache.

The `style_sheet_client_` (an `ImportedStyleSheetClient`, a tiny
`ResourceClient` glued back to the rule) receives `NotifyFinished`
when the fetch completes.

### 5. On fetch completion

`StyleRuleImport::NotifyFinished` (`core/css/style_rule_import.cc:78-148`):

- Reports failures via `AuditsIssue::ReportStylesheetLoadingRequestFailedIssue`.
- If integrity metadata is set and fails, marks the resource as load-error.
- Otherwise, builds a fresh `CSSParserContext` and a child
  `StyleSheetContents` rooted at this rule, then re-parses the imported
  text recursively:

  ```cpp
  style_sheet_ = MakeGarbageCollected<StyleSheetContents>(
      context, cached_style_sheet->Url(), this);
  style_sheet_->ParseAuthorStyleSheet(cached_style_sheet);
  ```

  The recursive `ParseAuthorStyleSheet` is what handles imports of
  imports — each `@import` it encounters runs through the same
  cycle-check + fetch loop.

- Toggles `loading_ = false`, walks back up via
  `parent_style_sheet_->NotifyLoadedSheet(...)` and `CheckLoaded()` to
  fire load events on owning `<link>` / `<style>` nodes.

### 6. `IsLoading` / `LoadCompleted` propagate up the chain

```cpp
// style_sheet_contents.cc:474-481
bool StyleSheetContents::IsLoading() const {
  for (unsigned i = 0; i < import_rules_.size(); ++i) {
    if (import_rules_[i]->IsLoading()) {
      return true;
    }
  }
  return false;
}
```

A sheet is "loading" iff any of its imports is still in flight.
`StyleRuleImport::IsLoading()` further recurses into the child sheet's
own imports — so the entire transitive subtree must be quiescent
before the root reports loaded.

Combined with `CheckLoaded()` walking to `RootStyleSheet()`, the model
yields a single "all reachable CSS is in" signal at the root, which
gates style-resolver runs and document `load` events.

---

## How Imported Rules Enter the Cascade

`RuleSet::AddRulesFromSheet` (`core/css/rule_set.cc:1318-1343`) walks
imports **before** the importing sheet's own rules:

```cpp
const HeapVector<Member<StyleRuleImport>>& import_rules = sheet->ImportRules();
for (unsigned i = 0; i < import_rules.size(); ++i) {
  StyleRuleImport* import_rule = import_rules[i].Get();
  if (!import_rule->IsSupported()) continue;
  if (!MatchMediaForAddRules(medium, import_rule->MediaQueries())) continue;
  CascadeLayer* import_layer = cascade_layer;
  if (import_rule->IsLayered()) {
    import_layer = GetOrAddSubLayer(cascade_layer, import_rule->GetLayerName());
  }
  if (import_rule->GetStyleSheet()) {
    AddRulesFromSheet(import_rule->GetStyleSheet(), medium, mixins,
                      import_layer, import_rule->GetScope());
  }
}
// then:
AddChildRules(/*parent_rule=*/nullptr, sheet->ChildRules(), ...);
```

This implements the CSS Cascade rule that imported sheets contribute
rules **at the position of the `@import`** — and since `@import` must
precede all other rules in a sheet, imported rules effectively
_prepend_. Specificity / source order ties resolve in favor of the
later (importing) sheet because its rules are added second.

The same recursion handles imports-of-imports, with optional
`@layer` mapping and media-query gating on each hop.

---

## All External-CSS Entry Points Funnel Through One Resource

The grep below shows every Blink call to `CSSStyleSheetResource::Fetch`:

```text
core/css/style_rule_import.cc:232              @import inside any <style>/.css
core/loader/link_loader.cc:200                 <link rel="stylesheet">, prefetch
core/loader/preload_helper.cc:1128             <link rel="preload" as="style">
core/dom/processing_instruction.cc:420         <?xml-stylesheet ?> in XML/SVG
core/inspector/inspector_resource_content_loader.cc:150  DevTools
```

That convergence on a single resource type is significant: the parser
cache (`parsed_style_sheet_cache_` on `CSSStyleSheetResource`) lets
two documents importing the same CSS share a parsed `StyleSheetContents`,
not just the raw bytes.

---

## SVG Specifics

For SVG documents Blink reuses the same machinery — there is no
SVG-specific stylesheet path:

- **Inline `<style>` inside `<svg>`** — `style_element.cc` (the
  cross-element shared base) parses the text directly with
  `StyleSheetContents::ParseAuthorStyleSheet`. Any `@import` it
  contains goes through the standard `StyleRuleImport` path described
  above.
- **`<?xml-stylesheet href="…" ?>`** at the document root —
  `processing_instruction.cc:420` calls `CSSStyleSheetResource::Fetch`
  via the same FetchParameters path. The `ProcessingInstruction` itself
  is the `ResourceClient`.
- **`<link>`** is HTML-only; doesn't apply inside SVG documents.

The SVG reftest fixture
`structure/style/external-CSS.svg` exercises path 1 (inline `<style>`
with `@import`).

---

## Constants & Heuristics

| Concept                       | Value                                                                 | Source                             |
| ----------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| Cycle detection               | URL equality (ignoring fragment) against ancestor sheets              | `style_rule_import.cc:181-187`     |
| Recursion depth cap           | None (cycle check is the only termination)                            | —                                  |
| `@import` position constraint | Must precede all rules except `@layer` statements; enforced by parser | `style_sheet_contents.cc:196`      |
| Cache scope                   | Per-fetcher decoded text + optional cross-document parsed-sheet cache | `css_style_sheet_resource.h:96-98` |
| Render-blocking               | Inherited from the root sheet's `GetRenderBlockingBehavior()`         | `style_rule_import.cc:229`         |

---

## Source References

- `third_party/blink/renderer/core/css/style_rule_import.{h,cc}` — `StyleRuleImport`, `RequestStyleSheet`, `NotifyFinished`
- `third_party/blink/renderer/core/css/style_sheet_contents.{h,cc}` — owning sheet, `ParserAppendRule`, `IsLoading`, `LoadCompleted`, `CheckLoaded`
- `third_party/blink/renderer/core/css/parser/css_parser_impl.cc:1086-1200` — `CSSParserImpl::ConsumeImportRule`
- `third_party/blink/renderer/core/loader/resource/css_style_sheet_resource.{h,cc}` — fetched resource type
- `third_party/blink/renderer/core/css/rule_set.cc:1318-1343` — cascade build prepends imports
- `third_party/blink/renderer/core/dom/processing_instruction.cc:380-422` — `<?xml-stylesheet?>`
- `third_party/blink/renderer/core/loader/link_loader.cc` — `<link rel="stylesheet">`
