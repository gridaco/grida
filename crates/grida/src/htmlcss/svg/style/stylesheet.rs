//! Minimal CSS stylesheet matcher for `<style>` blocks inside SVG.
//!
//! This is a focused, in-tree matcher — not a full Stylo cascade. It
//! handles the selector forms exercised by the resvg-test-suite
//! `structure/style/` fixtures:
//!
//! - universal `*`
//! - type `tag`
//! - id `#id`
//! - class `.cls`
//! - attribute `[attr]` and `[attr=val]`
//! - compound `tag.cls#id`
//! - descendant ` ` (whitespace) and child `>` combinators
//! - `!important`
//!
//! Specificity is computed per CSS Selectors L3 §3 (a, b, c) where
//! a = id count, b = class+attr+pseudo count, c = type count. Pseudo
//! classes are not supported; encountering one disqualifies the rule.
//!
//! Cascade order applied at lookup time:
//!   1. !important author rules (sheet)
//!   2. inline `style="…"` attribute
//!   3. presentation attribute (e.g. `fill="…"`)
//!   4. matched author rules (sheet) by specificity, then order
//!
//! `<style>` content can be wrapped in a `<![CDATA[ … ]]>` section;
//! we read whatever raw text is in the element's first child.
//!
//! Blink anchor: this duplicates a tiny slice of `core/css/parser/`.

use csscascade::dom::{DemoDom, DemoNode, DemoNodeData};
use rustc_hash::FxHashSet;

use crate::htmlcss::svg::dom::element::get_attr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub struct Specificity {
    pub a: u16, // id count
    pub b: u16, // class + attr count
    pub c: u16, // type count
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum AttrTest {
    Present,
    Equals(String),
}

#[derive(Debug, Clone, Default)]
struct CompoundSelector {
    tag: Option<String>,
    id: Option<String>,
    classes: Vec<String>,
    attrs: Vec<(String, AttrTest)>,
    universal: bool,
}

impl CompoundSelector {
    fn specificity(&self) -> Specificity {
        Specificity {
            a: self.id.is_some() as u16,
            b: (self.classes.len() + self.attrs.len()) as u16,
            c: self.tag.is_some() as u16,
        }
    }

    fn matches(&self, node: &DemoNode) -> bool {
        let DemoNodeData::Element(data) = &node.data else {
            return false;
        };
        if self.universal
            && self.tag.is_none()
            && self.id.is_none()
            && self.classes.is_empty()
            && self.attrs.is_empty()
        {
            return true;
        }
        if let Some(t) = &self.tag {
            if !data.name.local.as_ref().eq_ignore_ascii_case(t) {
                return false;
            }
        }
        if let Some(want_id) = &self.id {
            match get_attr(node, "id") {
                Some(v) if v == want_id => {}
                _ => return false,
            }
        }
        if !self.classes.is_empty() {
            let class_attr = get_attr(node, "class").unwrap_or("");
            for c in &self.classes {
                if !class_attr.split_ascii_whitespace().any(|w| w == c) {
                    return false;
                }
            }
        }
        for (name, test) in &self.attrs {
            match get_attr(node, name) {
                Some(v) => match test {
                    AttrTest::Present => {}
                    AttrTest::Equals(want) => {
                        if v != want {
                            return false;
                        }
                    }
                },
                None => return false,
            }
        }
        true
    }
}

#[derive(Debug, Clone, Copy)]
enum Combinator {
    Descendant,
    Child,
}

#[derive(Debug, Clone)]
struct Selector {
    /// Compound selectors, ordered subject (last) → root (first).
    /// `combinators[i]` joins `compounds[i]` to `compounds[i+1]`.
    compounds: Vec<CompoundSelector>,
    combinators: Vec<Combinator>,
}

impl Selector {
    fn specificity(&self) -> Specificity {
        let mut total = Specificity::default();
        for c in &self.compounds {
            let s = c.specificity();
            total.a += s.a;
            total.b += s.b;
            total.c += s.c;
        }
        total
    }

    fn matches(&self, dom: &DemoDom, subject_node: &DemoNode) -> bool {
        let last = self.compounds.last();
        let Some(subject) = last else { return false };
        if !subject.matches(subject_node) {
            return false;
        }
        // Walk up matching the rest.
        let mut current_parent = subject_node.parent;
        let total = self.compounds.len();
        for i in (0..total - 1).rev() {
            let combinator = self.combinators[i];
            let target = &self.compounds[i];
            match combinator {
                Combinator::Child => {
                    let Some(pid) = current_parent else {
                        return false;
                    };
                    if !target.matches(dom.node(pid)) {
                        return false;
                    }
                    current_parent = dom.node(pid).parent;
                }
                Combinator::Descendant => {
                    let mut found = None;
                    let mut cur = current_parent;
                    while let Some(pid) = cur {
                        if target.matches(dom.node(pid)) {
                            found = Some(pid);
                            break;
                        }
                        cur = dom.node(pid).parent;
                    }
                    let Some(matched) = found else { return false };
                    current_parent = dom.node(matched).parent;
                }
            }
        }
        true
    }
}

#[derive(Debug, Clone)]
struct Declaration {
    name: String,
    value: String,
    important: bool,
}

#[derive(Debug, Clone)]
struct Rule {
    selectors: Vec<Selector>,
    decls: Vec<Declaration>,
    /// Source order — later rules win ties on specificity.
    order: u32,
}

#[derive(Debug, Default, Clone)]
pub struct Stylesheet {
    rules: Vec<Rule>,
}

impl Stylesheet {
    pub fn collect(dom: &DemoDom, css: &dyn crate::htmlcss::svg::CssLoader) -> Self {
        let mut rules = Vec::new();
        let mut order: u32 = 0;
        for id in dom.all_node_ids() {
            let node = dom.node(id);
            let DemoNodeData::Element(data) = &node.data else {
                continue;
            };
            if !data.name.local.as_ref().eq_ignore_ascii_case("style") {
                continue;
            }
            // SVG 2 §6.6: only `text/css` style elements are honored.
            // Default (omitted `type`) is `text/css`; any other value
            // means the sheet is in an unknown language and is ignored.
            if let Some(t) = get_attr(node, "type") {
                if !t.trim().eq_ignore_ascii_case("text/css") {
                    continue;
                }
            }
            let mut text = String::new();
            for &cid in &node.children {
                let child = dom.node(cid);
                if let DemoNodeData::Text(t) = &child.data {
                    text.push_str(t)
                }
            }
            // Strip CDATA wrapper if present.
            let text = text
                .trim()
                .trim_start_matches("<![CDATA[")
                .trim_end_matches("]]>");
            // Collect rules, resolving any `@import "…"` against the
            // host-supplied `CssLoader`. CSS spec: imports prepend
            // their rules to the importing stylesheet, so we recurse
            // depth-first and append.
            collect_rules(text, css, &mut rules, &mut order, &mut FxHashSet::default());
        }
        Self { rules }
    }

    /// Look up the cascaded value of `name` for `node`. Returns the
    /// winning value and whether it came from an `!important`
    /// declaration. Caller is expected to merge this with the inline
    /// `style=` attribute and presentation attributes per CSS cascade.
    pub fn match_property(
        &self,
        dom: &DemoDom,
        node: &DemoNode,
        name: &str,
    ) -> Option<(String, Specificity, bool, u32)> {
        let mut best: Option<(String, Specificity, bool, u32)> = None;
        for rule in &self.rules {
            // Find any matching selector, take the highest specificity.
            let mut sel_spec: Option<Specificity> = None;
            for sel in &rule.selectors {
                if sel.matches(dom, node) {
                    let s = sel.specificity();
                    sel_spec = Some(match sel_spec {
                        Some(prev) if prev >= s => prev,
                        _ => s,
                    });
                }
            }
            let Some(spec) = sel_spec else { continue };
            for decl in &rule.decls {
                if !decl.name.eq_ignore_ascii_case(name) {
                    continue;
                }
                let candidate = (decl.value.clone(), spec, decl.important, rule.order);
                best = Some(match best {
                    None => candidate,
                    Some(prev) => {
                        let prev_key = (prev.2, prev.1, prev.3);
                        let cand_key = (candidate.2, candidate.1, candidate.3);
                        if cand_key > prev_key {
                            candidate
                        } else {
                            prev
                        }
                    }
                });
            }
        }
        best
    }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

enum ParsedRule {
    Style {
        selectors: Vec<Selector>,
        decls: Vec<Declaration>,
    },
    Import(String),
}

/// Hard cap on `@import` recursion. The `seen` set already breaks
/// trivial `a → a` cycles, but it keys on the *unresolved* URL string
/// — so a host that hands `./a.css` and `a.css` to two different
/// importers would defeat it. The cap turns the worst case from
/// "infinite recursion" into "32 imports walked then stopped". Hosts
/// that want stronger guarantees should canonicalise paths inside
/// their `CssLoader` (the reftest harness does — see
/// `docs/wg/research/chromium/external-css.md` §"What we do
/// differently").
const MAX_IMPORT_DEPTH: usize = 32;

/// Walk a stylesheet's parsed items, recursively splicing imports.
///
/// Per CSS Cascade L5, `@import` rules contribute their imported
/// sheet's rules at the import location — and `@import` is required
/// to appear before any other rule, so imported rules effectively
/// prepend. We push rules to `rules` in source order; specificity /
/// later-wins ties are resolved at lookup time in [`Stylesheet::match_property`].
///
/// Mirrors Blink's three-layer split (parser / owner / resource) but
/// collapsed to one sync pass: the parser surfaces
/// [`ParsedRule::Import`], we walk it here, the host
/// [`crate::htmlcss::svg::CssLoader`] supplies bytes (Blink's
/// `CSSStyleSheetResource::Fetch` equivalent).
/// See `docs/wg/research/chromium/external-css.md`.
fn collect_rules(
    text: &str,
    css: &dyn crate::htmlcss::svg::CssLoader,
    rules: &mut Vec<Rule>,
    order: &mut u32,
    seen: &mut FxHashSet<String>,
) {
    if seen.len() >= MAX_IMPORT_DEPTH {
        return;
    }
    for item in parse_stylesheet(text) {
        match item {
            ParsedRule::Style { selectors, decls } => {
                rules.push(Rule {
                    selectors,
                    decls,
                    order: *order,
                });
                *order += 1;
            }
            ParsedRule::Import(url) => {
                if !seen.insert(url.clone()) {
                    continue;
                }
                // Clone: `collect_rules` recurses with `&dyn CssLoader`,
                // which (in principle) could invalidate the borrow
                // returned by `css.get(&url)` while the recursion runs.
                if let Some(body) = css.get(&url).map(str::to_string) {
                    collect_rules(&body, css, rules, order, seen);
                }
                seen.remove(&url);
            }
        }
    }
}

fn parse_stylesheet(input: &str) -> Vec<ParsedRule> {
    let stripped = strip_css_comments(input);
    let mut out = Vec::new();
    let mut rest = stripped.as_str();
    // Per CSS Cascade L5 §6.4 / Syntax §3, `@import` is only valid
    // before any non-import rule (`@charset` and bare `@layer`
    // statements excepted, which we don't support anyway). Once we
    // see a style rule, late imports are dropped silently.
    let mut imports_still_allowed = true;
    while !rest.trim().is_empty() {
        let trimmed = rest.trim_start();
        if trimmed.starts_with('@') {
            if let Some((url, consumed)) = parse_at_import(trimmed) {
                if imports_still_allowed {
                    out.push(ParsedRule::Import(url));
                }
                rest = &trimmed[consumed..];
                continue;
            }
            // Unknown / unsupported at-rule — skip its prelude + any
            // block. This still counts as a non-import rule for the
            // ordering check below.
            imports_still_allowed = false;
            let semi = trimmed.find(';').unwrap_or(trimmed.len());
            let brace = trimmed.find('{');
            match brace {
                Some(b) if b < semi => {
                    if let Some(end) = find_matching_brace(&trimmed[b..]) {
                        rest = &trimmed[b + end + 1..];
                    } else {
                        return out;
                    }
                }
                _ => {
                    rest = &trimmed[semi.min(trimmed.len())..];
                    rest = rest.strip_prefix(';').unwrap_or(rest);
                }
            }
            continue;
        }
        let Some(brace) = trimmed.find('{') else {
            break;
        };
        let selector_text = &trimmed[..brace];
        let after = &trimmed[brace + 1..];
        let Some(end) = after.find('}') else { break };
        let body = &after[..end];
        rest = &after[end + 1..];
        let Some(selectors) = parse_selector_list(selector_text) else {
            continue;
        };
        let decls = parse_declaration_block(body);
        if !decls.is_empty() && !selectors.is_empty() {
            out.push(ParsedRule::Style { selectors, decls });
            imports_still_allowed = false;
        }
    }
    out
}

/// Parse an `@import` rule starting at the `@` character. Returns
/// `(url, bytes consumed past the rule)` or `None` if the at-rule
/// isn't a valid `@import`. Supports `@import "path"` and
/// `@import url(path)`, single- or double-quoted, with an optional
/// trailing `;`.
fn parse_at_import(s: &str) -> Option<(String, usize)> {
    let after_at = s.strip_prefix('@')?;
    // Case-insensitive keyword match per CSS Syntax §3. The byte
    // following the keyword must be CSS whitespace — anything else
    // (including alphanumerics that would form a longer ident like
    // `@imports` or `@importurl`) means this isn't `@import`.
    if after_at.len() < 6 || !after_at[..6].eq_ignore_ascii_case("import") {
        return None;
    }
    let next = after_at.as_bytes().get(6).copied();
    if !matches!(next, Some(b) if b.is_ascii_whitespace()) {
        return None;
    }
    let after_keyword = &after_at[6..];
    let body = after_keyword.trim_start();
    let leading_ws = after_keyword.len() - body.len();
    let (url, url_len) = parse_import_url(body)?;
    let tail = &body[url_len..];
    let trailing_ws = tail.len() - tail.trim_start().len();
    let semi_len = if tail[trailing_ws..].starts_with(';') {
        1
    } else {
        0
    };
    let consumed = 1 + 6 + leading_ws + url_len + trailing_ws + semi_len;
    Some((url, consumed))
}

/// Pull the url string out of the body of an `@import` rule (the
/// portion after the keyword + whitespace). Returns `(url, bytes
/// consumed)`. Shared between [`parse_at_import`] (which needs the
/// length to advance) and the public [`scan_imports`] helper.
///
/// `url(` is matched case-insensitively per CSS Syntax §4.3 (token
/// keywords are ASCII-case-insensitive).
fn parse_import_url(body: &str) -> Option<(String, usize)> {
    let starts_with_url = body.len() >= 4 && body[..4].eq_ignore_ascii_case("url(");
    if starts_with_url {
        let rest = &body[4..];
        let close = rest.find(')')?;
        let raw = rest[..close].trim().trim_matches(|c| c == '\'' || c == '"');
        Some((raw.to_string(), 4 + close + 1))
    } else if let Some(rest) = body.strip_prefix('"') {
        let close = rest.find('"')?;
        Some((rest[..close].to_string(), 1 + close + 1))
    } else if let Some(rest) = body.strip_prefix('\'') {
        let close = rest.find('\'')?;
        Some((rest[..close].to_string(), 1 + close + 1))
    } else {
        None
    }
}

/// Scan a CSS source string for the URL of every `@import` rule.
/// Used by hosts (CLI, reftest harness) that need to preload imported
/// stylesheet bodies into a [`crate::htmlcss::svg::CssLoader`] before
/// invoking the renderer. Comments are stripped first so commented-
/// out imports (`/* @import "x"; */`) are not preloaded.
pub fn scan_imports(text: &str) -> Vec<String> {
    let stripped = strip_css_comments(text);
    let mut out = Vec::new();
    // `@import` matches case-insensitively per CSS Syntax §4.3. We
    // scan a lowercase copy for keyword positions and slice the
    // original-case `stripped` for the URL (positions match because
    // ASCII case-folding preserves byte indices).
    let lower = stripped.to_ascii_lowercase();
    let mut cursor = 0usize;
    while let Some(rel) = lower[cursor..].find("@import") {
        let idx = cursor + rel;
        let after = &stripped[idx + "@import".len()..];
        let boundary_ok = after
            .as_bytes()
            .first()
            .map(|b| b.is_ascii_whitespace())
            .unwrap_or(false);
        if boundary_ok {
            if let Some((url, _)) = parse_import_url(after.trim_start()) {
                out.push(url);
            }
        }
        cursor = idx + "@import".len();
    }
    out
}

fn find_matching_brace(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth = 0i32;
    for (i, &b) in bytes.iter().enumerate() {
        match b {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_selector_list(s: &str) -> Option<Vec<Selector>> {
    let mut out = Vec::new();
    for part in s.split(',') {
        if let Some(sel) = parse_selector(part.trim()) {
            out.push(sel);
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn parse_selector(s: &str) -> Option<Selector> {
    // Tokenize on whitespace and `>` combinators.
    let mut tokens: Vec<&str> = Vec::new();
    let mut buf_start = 0usize;
    let mut in_brackets = false;
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c == b'[' {
            in_brackets = true;
        } else if c == b']' {
            in_brackets = false;
        } else if !in_brackets && c.is_ascii_whitespace() {
            if buf_start < i {
                tokens.push(&s[buf_start..i]);
            }
            // collapse whitespace
            while i + 1 < bytes.len() && bytes[i + 1].is_ascii_whitespace() {
                i += 1;
            }
            tokens.push(" ");
            buf_start = i + 1;
        } else if !in_brackets && c == b'>' {
            if buf_start < i {
                tokens.push(&s[buf_start..i]);
            }
            tokens.push(">");
            buf_start = i + 1;
        }
        i += 1;
    }
    if buf_start < bytes.len() {
        tokens.push(&s[buf_start..]);
    }
    // Collapse: drop leading/trailing whitespace tokens, and any
    // whitespace adjacent to `>` (so `svg > rect` becomes `svg`,
    // `>`, `rect`).
    let mut clean: Vec<&str> = Vec::new();
    let mut idx = 0;
    while idx < tokens.len() {
        let t = tokens[idx];
        match t {
            " " => {
                let next_is_combinator = idx + 1 < tokens.len() && tokens[idx + 1] == ">";
                if next_is_combinator || clean.is_empty() {
                    idx += 1;
                    continue;
                }
                clean.push(" ");
                idx += 1;
            }
            ">" => {
                if clean.last() == Some(&" ") {
                    clean.pop();
                }
                clean.push(">");
                idx += 1;
                // Skip any whitespace immediately after the combinator.
                while idx < tokens.len() && tokens[idx] == " " {
                    idx += 1;
                }
            }
            _ => {
                clean.push(t);
                idx += 1;
            }
        }
    }
    if let Some(&" ") = clean.last() {
        clean.pop();
    }
    if clean.is_empty() {
        return None;
    }
    let mut compounds = Vec::new();
    let mut combinators = Vec::new();
    let mut iter = clean.into_iter().peekable();
    while let Some(t) = iter.next() {
        let comp = parse_compound(t)?;
        compounds.push(comp);
        match iter.peek() {
            Some(&" ") => {
                iter.next();
                combinators.push(Combinator::Descendant);
            }
            Some(&">") => {
                iter.next();
                combinators.push(Combinator::Child);
            }
            _ => {}
        }
    }
    Some(Selector {
        compounds,
        combinators,
    })
}

fn parse_compound(s: &str) -> Option<CompoundSelector> {
    let mut comp = CompoundSelector::default();
    let bytes = s.as_bytes();
    let mut i = 0;
    // Optional leading tag name or `*`.
    if i < bytes.len() && (bytes[i].is_ascii_alphabetic() || bytes[i] == b'*') {
        if bytes[i] == b'*' {
            comp.universal = true;
            i += 1;
        } else {
            let start = i;
            while i < bytes.len()
                && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'-' || bytes[i] == b'_')
            {
                i += 1;
            }
            comp.tag = Some(s[start..i].to_lowercase());
        }
    }
    // Parse modifiers: `.cls`, `#id`, `[attr]`, `[attr=val]`. Reject
    // anything else (`:pseudo`, `::pseudo-elt`).
    while i < bytes.len() {
        let c = bytes[i];
        match c {
            b'.' => {
                i += 1;
                let start = i;
                while i < bytes.len()
                    && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'-' || bytes[i] == b'_')
                {
                    i += 1;
                }
                if start == i {
                    return None;
                }
                comp.classes.push(s[start..i].to_string());
            }
            b'#' => {
                i += 1;
                let start = i;
                while i < bytes.len()
                    && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'-' || bytes[i] == b'_')
                {
                    i += 1;
                }
                if start == i {
                    return None;
                }
                comp.id = Some(s[start..i].to_string());
            }
            b'[' => {
                let close = s[i..].find(']')? + i;
                let inner = &s[i + 1..close];
                if let Some((k, v)) = inner.split_once('=') {
                    let v = v
                        .trim()
                        .trim_matches(|ch| ch == '"' || ch == '\'')
                        .to_string();
                    comp.attrs.push((k.trim().to_string(), AttrTest::Equals(v)));
                } else {
                    comp.attrs
                        .push((inner.trim().to_string(), AttrTest::Present));
                }
                i = close + 1;
            }
            _ => return None,
        }
    }
    if comp.tag.is_none()
        && comp.id.is_none()
        && comp.classes.is_empty()
        && comp.attrs.is_empty()
        && !comp.universal
    {
        return None;
    }
    Some(comp)
}

fn parse_declaration_block(body: &str) -> Vec<Declaration> {
    let mut out = Vec::new();
    for decl in body.split(';') {
        let decl = decl.trim();
        if decl.is_empty() {
            continue;
        }
        let Some((k, v)) = decl.split_once(':') else {
            continue;
        };
        let mut value = v.trim().to_string();
        let important = if let Some(stripped) = value
            .to_ascii_lowercase()
            .strip_suffix("!important")
            .map(|s| s.trim_end().len())
        {
            value.truncate(stripped);
            value = value.trim_end().to_string();
            true
        } else {
            false
        };
        out.push(Declaration {
            name: k.trim().to_string(),
            value,
            important,
        });
    }
    out
}

fn strip_css_comments(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find("/*") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        match after.find("*/") {
            Some(end) => rest = &after[end + 2..],
            None => return out,
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn style_rule(item: &ParsedRule) -> (&Vec<Selector>, &Vec<Declaration>) {
        match item {
            ParsedRule::Style { selectors, decls } => (selectors, decls),
            ParsedRule::Import(_) => panic!("expected style rule, got @import"),
        }
    }

    #[test]
    fn parses_simple_class_rule() {
        let rules = parse_stylesheet(".fil { fill: green; }");
        assert_eq!(rules.len(), 1);
        let (selectors, decls) = style_rule(&rules[0]);
        assert_eq!(selectors[0].compounds[0].classes, vec!["fil".to_string()]);
        assert_eq!(decls[0].name, "fill");
        assert_eq!(decls[0].value, "green");
    }

    #[test]
    fn parses_important() {
        let rules = parse_stylesheet("#a { fill: green !important; }");
        assert!(style_rule(&rules[0]).1[0].important);
    }

    #[test]
    fn parses_combinator() {
        let rules = parse_stylesheet("svg > rect { fill: green }");
        let (selectors, _) = style_rule(&rules[0]);
        assert_eq!(selectors[0].compounds.len(), 2);
        assert_eq!(selectors[0].combinators.len(), 1);
        assert!(matches!(selectors[0].combinators[0], Combinator::Child));
    }

    #[test]
    fn parses_at_import() {
        let rules = parse_stylesheet("@import \"green.css\"; .x { fill: red }");
        assert_eq!(rules.len(), 2);
        match &rules[0] {
            ParsedRule::Import(url) => assert_eq!(url, "green.css"),
            _ => panic!("expected @import"),
        }
        let (_, decls) = style_rule(&rules[1]);
        assert_eq!(decls[0].value, "red");
    }

    #[test]
    fn parses_at_import_url_form() {
        let rules = parse_stylesheet("@import url(theme.css)\n.x { fill: red }");
        match &rules[0] {
            ParsedRule::Import(url) => assert_eq!(url, "theme.css"),
            _ => panic!("expected @import"),
        }
    }

    #[test]
    fn rejects_keyword_without_word_boundary() {
        // `@importurl(...)` is not `@import` — must not parse.
        let rules = parse_stylesheet("@importurl(theme.css); .x { fill: red }");
        // The ill-formed at-rule is skipped; the style rule survives.
        assert!(matches!(rules[0], ParsedRule::Style { .. }));
    }

    #[test]
    fn drops_late_at_imports() {
        // Per CSS Cascade §6.4, `@import` after a style rule is invalid.
        let rules = parse_stylesheet(".a { fill: green } @import \"late.css\"; .b { fill: red }");
        // Two style rules, no imports.
        assert_eq!(rules.len(), 2);
        assert!(matches!(rules[0], ParsedRule::Style { .. }));
        assert!(matches!(rules[1], ParsedRule::Style { .. }));
    }

    #[test]
    fn ignores_at_import_in_comment() {
        let urls = scan_imports("/* @import \"hidden.css\"; */ @import \"real.css\";");
        assert_eq!(urls, vec!["real.css".to_string()]);
    }

    #[test]
    fn scan_imports_skips_keyword_lookalikes() {
        let urls = scan_imports("@importurl(nope.css); @import \"yes.css\";");
        assert_eq!(urls, vec!["yes.css".to_string()]);
    }

    /// `CssLoader` impl serving a fixed map of `(url, body)` pairs.
    #[derive(Default)]
    struct MapLoader(std::collections::HashMap<String, String>);
    impl crate::htmlcss::svg::CssLoader for MapLoader {
        fn get(&self, path: &str) -> Option<&str> {
            self.0.get(path).map(|s| s.as_str())
        }
    }

    #[test]
    fn collect_rules_breaks_self_cycle() {
        let mut loader = MapLoader::default();
        // a.css imports itself.
        loader
            .0
            .insert("a.css".into(), "@import \"a.css\"; .x { fill: red }".into());
        let mut rules = Vec::new();
        let mut order = 0u32;
        let mut seen = FxHashSet::default();
        collect_rules(
            "@import \"a.css\";",
            &loader,
            &mut rules,
            &mut order,
            &mut seen,
        );
        // The single style rule from a.css is collected exactly once.
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].decls[0].value, "red");
    }

    #[test]
    fn collect_rules_breaks_two_step_cycle() {
        let mut loader = MapLoader::default();
        loader.0.insert("a.css".into(), "@import \"b.css\";".into());
        loader.0.insert(
            "b.css".into(),
            "@import \"a.css\"; .y { fill: blue }".into(),
        );
        let mut rules = Vec::new();
        let mut order = 0u32;
        let mut seen = FxHashSet::default();
        collect_rules(
            "@import \"a.css\";",
            &loader,
            &mut rules,
            &mut order,
            &mut seen,
        );
        // Cycle is broken at b.css → a.css; b.css's own rules survive.
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].decls[0].value, "blue");
    }

    #[test]
    fn collect_rules_caps_recursion_depth() {
        // Build a chain n0 → n1 → … that's 64 deep, more than
        // MAX_IMPORT_DEPTH. Each chains via a *distinct* key so the
        // `seen` set never short-circuits — depth is the only
        // termination signal.
        let mut loader = MapLoader::default();
        for i in 0..64 {
            let body = if i == 63 {
                ".deep { fill: deep }".to_string()
            } else {
                format!("@import \"n{}.css\";", i + 1)
            };
            loader.0.insert(format!("n{i}.css"), body);
        }
        let mut rules = Vec::new();
        let mut order = 0u32;
        let mut seen = FxHashSet::default();
        collect_rules(
            "@import \"n0.css\";",
            &loader,
            &mut rules,
            &mut order,
            &mut seen,
        );
        // Depth cap fires before reaching the deepest rule, so the
        // bottom-of-chain `.deep` rule is *not* collected. Termination
        // is the property under test, not exact rule count.
        assert!(rules.iter().all(|r| r.decls[0].value != "deep"));
    }

    #[test]
    fn specificity_ordering() {
        let id_sel = parse_selector("#a").unwrap().specificity();
        let class_sel = parse_selector(".a").unwrap().specificity();
        let type_sel = parse_selector("a").unwrap().specificity();
        assert!(id_sel > class_sel);
        assert!(class_sel > type_sel);
    }
}
