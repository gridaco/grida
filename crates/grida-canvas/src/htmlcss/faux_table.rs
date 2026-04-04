//! Faux-table layout — CSS table emulation via Taffy flex.
//!
//! Taffy 0.9 does not implement the CSS table layout algorithm. This module
//! provides style overrides that make table elements *look* correct by
//! mapping them to equivalent flexbox styles:
//!
//! | CSS display        | Faux flex equivalent                              |
//! |--------------------|---------------------------------------------------|
//! | `table`            | `flex`, `direction: column`, `width: 100%`        |
//! | `table-row-group`  | `flex`, `direction: column` (transparent wrapper) |
//! | `table-row`        | `flex`, `direction: row`                          |
//! | `table-cell`       | `flex`, `flex-grow: 1`, `flex-basis: 0`           |
//!
//! ## Limitations
//!
//! - All columns are **equal width** — no content-aware column sizing.
//! - No `colspan` / `rowspan` support.
//! - No `border-collapse` (each cell draws its own borders).
//! - `<caption>` is treated as a block element (no special positioning).
//!
//! ## Why this exists
//!
//! GFM markdown tables (via `pulldown-cmark`) produce `<table>` HTML that
//! needs to render correctly in the `htmlcss` pipeline. This faux-table
//! approach covers the common case until Taffy gains native table support,
//! at which point this module should be removed.

use super::types;

/// Apply faux-table overrides to a Taffy style based on the element's CSS
/// display type. Returns `true` if overrides were applied (caller should
/// skip the normal display/flex mapping).
pub fn apply_faux_table_style(display: types::Display, style: &mut taffy::Style) -> bool {
    match display {
        // <table> → flex column container, full width
        types::Display::Table => {
            style.display = taffy::Display::Flex;
            style.flex_direction = taffy::FlexDirection::Column;
            style.size.width = taffy::Dimension::percent(1.0);
            true
        }
        // <thead>, <tbody>, <tfoot> → transparent flex column wrapper
        // Note: these arrive as Block from the `_ =>` catch-all in collect.rs
        // because Stylo's `table-row-group` / `table-header-group` /
        // `table-footer-group` aren't in our Display enum. They are handled
        // by tag name in `apply_faux_table_style_by_tag()` below.

        // <tr> → flex row (cells side by side)
        types::Display::TableRow => {
            style.display = taffy::Display::Flex;
            style.flex_direction = taffy::FlexDirection::Row;
            true
        }
        // <td>, <th> → equal-width flex child
        types::Display::TableCell => {
            style.display = taffy::Display::Flex;
            style.flex_grow = 1.0;
            style.flex_shrink = 1.0;
            style.flex_basis = taffy::Dimension::length(0.0);
            true
        }
        _ => false,
    }
}

/// Apply faux-table overrides for elements that Stylo resolves to
/// non-table display types but are structurally part of a table.
///
/// `<thead>`, `<tbody>`, `<tfoot>` have `display: table-header-group` etc.
/// in CSS, but our `Display` enum doesn't have those variants — they fall
/// to `Block`. We detect them by tag name as a fallback.
pub fn apply_faux_table_style_by_tag(tag: &str, style: &mut taffy::Style) -> bool {
    match tag {
        "thead" | "tbody" | "tfoot" => {
            style.display = taffy::Display::Flex;
            style.flex_direction = taffy::FlexDirection::Column;
            true
        }
        _ => false,
    }
}
