//! Fully resolved style tree printer.
//!
//! Parses HTML, runs the real Stylo cascade, and prints every element with its
//! key computed CSS properties.  This is the PoC that proves the cascade
//! pipeline actually works end-to-end.
//!
//! Usage:
//!   cargo run --example resolve_and_print
//!   cargo run --example resolve_and_print -- fixtures/test-html/L0/hello.html

use std::{env, fs, mem, path::PathBuf};

use csscascade::adapter::{self, HtmlDocument, HtmlElement};
use csscascade::cascade::CascadeDriver;
use csscascade::dom::{DemoDom, DemoNodeData};

use style::dom::TElement;
use style::properties::{self, LonghandId};
use style::thread_state::{self, ThreadState};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    thread_state::initialize(ThreadState::LAYOUT);

    let (html, origin) = load_html_input()?;
    if let Some(path) = &origin {
        eprintln!("parsing: {}", path.display());
    }

    // 1. Parse HTML into arena DOM
    let dom = DemoDom::parse_from_bytes(html.as_bytes())?;

    // 2. Build cascade driver (collects <style> blocks)
    let mut driver = CascadeDriver::new(&dom);

    // 3. Install DOM into global slot and get document handle
    let document = adapter::bootstrap_dom(dom);

    // 4. Flush stylist + resolve all styles
    driver.flush(document);
    let styled_count = driver.style_document(document);
    eprintln!("resolved {} elements\n", styled_count);

    // 5. Print the resolved tree
    if let Some(root) = document.root_element() {
        print_element(root, &document, 0);
    }

    Ok(())
}

/// Recursively print an element with ALL computed style properties.
fn print_element(element: HtmlElement, document: &HtmlDocument, depth: usize) {
    let indent = "  ".repeat(depth);
    let tag = element.local_name_string();
    let dom = adapter::dom();

    let data = element.borrow_data();
    if let Some(data) = &data {
        let style = data.styles.primary();
        println!("{indent}<{tag}>");
        // Print every resolved longhand property
        for id in all_longhand_ids() {
            let mut buf = String::new();
            if style
                .computed_or_resolved_value(id, None, &mut buf)
                .is_err()
            {
                continue;
            }
            let val = buf.trim();
            if val.is_empty() {
                continue;
            }
            println!("{indent}  {}: {}", id.name(), val);
        }
    } else {
        println!("{indent}<{tag}> (no computed style)");
    }

    // Print text children inline
    let node = dom.node(element.node_id());
    for child_id in &node.children {
        let child_node = dom.node(*child_id);
        if let DemoNodeData::Text(text) = &child_node.data {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                let child_indent = "  ".repeat(depth + 1);
                println!("{child_indent}\"{}\"", truncate(trimmed, 80));
            }
        }
    }

    // Recurse into child elements
    let mut child = element.first_element_child();
    while let Some(c) = child {
        print_element(c, document, depth + 1);
        child = c.next_element_sibling();
    }
}

/// Truncate a string for display.
fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max { s } else { &s[..max] }
}

/// Iterate over every CSS longhand property ID.
fn all_longhand_ids() -> impl Iterator<Item = LonghandId> {
    (0..properties::property_counts::LONGHANDS as u16).map(|idx| unsafe { mem::transmute(idx) })
}

fn load_html_input() -> Result<(String, Option<PathBuf>), std::io::Error> {
    if let Some(path) = env::args().nth(1) {
        let buf = fs::read_to_string(&path)?;
        Ok((buf, Some(PathBuf::from(path))))
    } else {
        Ok((
            r#"<!doctype html>
<html>
  <head>
    <style>
      body {
        font-family: sans-serif;
        color: #222;
        background: #f5f5f5;
        margin: 16px;
        padding: 8px;
      }
      h1 {
        font-size: 32px;
        color: hotpink;
        margin-bottom: 8px;
      }
      .card {
        background: white;
        padding: 16px;
        border-radius: 8px;
        display: flex;
        gap: 12px;
      }
      .card p {
        font-size: 14px;
        color: #555;
      }
      .hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <h1 id="title">Hello csscascade</h1>
    <div class="card">
      <p>This paragraph should be 14px #555.</p>
      <p class="hidden">This is hidden.</p>
    </div>
    <footer>
      <small>Footer text inherits body font.</small>
    </footer>
  </body>
</html>"#
                .to_string(),
            None,
        ))
    }
}
