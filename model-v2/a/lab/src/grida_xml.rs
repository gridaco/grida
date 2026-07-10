//! Draft 0 `.grida.xml` source contract.
//!
//! The format envelope is structural and never becomes a paint node. Parsing
//! preserves the model's implicit viewport-spanning document root and attaches
//! the envelope's exactly-one authored node beneath it as the render root.
//! Files use one vocabulary: `<container width="…" height="…">` with direct
//! `<rect>`, `<ellipse>`, and `<line>` primitive tags. `<shape>` and `kind` are
//! not aliases. Historical `<frame w="…" h="…">` and `<shape kind="…">`
//! input belong exclusively to [`crate::textir`].

use crate::model::{DocBuilder, Document, NodeId};
use crate::textir;
use std::collections::BTreeSet;
use std::fmt::Write as _;

pub const VERSION: &str = "0";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError(pub String);

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "grida_xml: {}", self.0)
    }
}

impl std::error::Error for ParseError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PrintError {
    /// Omitting the implicit root is lossless only while it remains the exact
    /// viewport-spanning, non-authored root defined by the model.
    NonCanonicalDocumentRoot,
    /// Draft 0 has one render entry point, neither zero nor a forest.
    RenderRootCount { found: usize },
    /// The authored render root is always a container/frame payload.
    RenderRootMustBeContainer { found: &'static str },
    /// The child list and the arena's parent column disagree.
    InvalidRenderRootParent,
    /// The model value cannot be represented by strict Draft 0 source without
    /// losing or contradicting state.
    InvalidDocument(String),
}

impl std::fmt::Display for PrintError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PrintError::NonCanonicalDocumentRoot => {
                write!(
                    f,
                    "grida_xml: document root is not the canonical viewport root"
                )
            }
            PrintError::RenderRootCount { found } => write!(
                f,
                "grida_xml: expected exactly one render root, found {found}"
            ),
            PrintError::RenderRootMustBeContainer { found } => write!(
                f,
                "grida_xml: render root must be a container, found {found}"
            ),
            PrintError::InvalidRenderRootParent => {
                write!(
                    f,
                    "grida_xml: render root is not parented by the document root"
                )
            }
            PrintError::InvalidDocument(message) => {
                write!(f, "grida_xml: document is not representable: {message}")
            }
        }
    }
}

impl std::error::Error for PrintError {}

/// Parse a complete Draft 0 document. This is a pure string-to-model boundary;
/// hosts own paths, files, resources, and rasterization.
pub fn parse(input: &str) -> Result<Document, ParseError> {
    textir::parse_grida_xml(input).map_err(|error| ParseError(error.0))
}

/// Compare source semantics, not arena allocation. Node ids, empty/tombstoned
/// slots, and generations are storage artifacts; every live node must still be
/// reachable exactly once through an ordered child edge whose parent column
/// agrees.
fn semantic_document_eq(a: &Document, b: &Document) -> bool {
    if a.parent_of(a.root).is_some() || b.parent_of(b.root).is_some() {
        return false;
    }
    let mut a_seen = BTreeSet::new();
    let mut b_seen = BTreeSet::new();
    semantic_node_eq(a, a.root, &mut a_seen, b, b.root, &mut b_seen)
        && a_seen.len() == a.len()
        && b_seen.len() == b.len()
}

fn semantic_node_eq(
    a: &Document,
    a_id: NodeId,
    a_seen: &mut BTreeSet<NodeId>,
    b: &Document,
    b_id: NodeId,
    b_seen: &mut BTreeSet<NodeId>,
) -> bool {
    if !a_seen.insert(a_id) || !b_seen.insert(b_id) {
        return false;
    }
    let (Some(a_node), Some(b_node)) = (a.get_opt(a_id), b.get_opt(b_id)) else {
        return false;
    };
    let canonical_strokes = |node: &crate::model::Node| {
        node.strokes
            .iter()
            .filter(|stroke| {
                !(stroke.paints.is_empty() && stroke.geometry_is_default_for(&node.payload))
            })
            .cloned()
            .map(|mut stroke| {
                if let Some(values) = &mut stroke.dash_array {
                    if values.len() % 2 == 1 {
                        let repeated = values.clone();
                        values.extend(repeated);
                    }
                }
                stroke
            })
            .collect::<Vec<_>>()
    };
    if a_node.header != b_node.header
        || a_node.payload != b_node.payload
        || a_node.fills != b_node.fills
        || canonical_strokes(a_node) != canonical_strokes(b_node)
        || a_node.children.len() != b_node.children.len()
    {
        return false;
    }
    a_node
        .children
        .iter()
        .zip(&b_node.children)
        .all(|(&a_child, &b_child)| {
            a.parent_of(a_child) == Some(a_id)
                && b.parent_of(b_child) == Some(b_id)
                && semantic_node_eq(a, a_child, a_seen, b, b_child, b_seen)
        })
}

/// Print a normalized Draft 0 document.
///
/// Unlike the historical text-IR printer, this can fail: the envelope's one
/// render-root rule and the implicit viewport root make silently serializing a
/// forest or a mutated document root lossy.
pub fn print(doc: &Document) -> Result<String, PrintError> {
    if !semantic_document_eq(doc, doc) {
        return Err(PrintError::InvalidDocument(
            "scene tree contains a dead, duplicate, cyclic, unreachable, or mis-parented node"
                .into(),
        ));
    }

    let expected_doc = DocBuilder::new().build();
    let expected = expected_doc.get(expected_doc.root);
    let root = doc
        .get_opt(doc.root)
        .ok_or_else(|| PrintError::InvalidDocument("document root is not live".into()))?;

    let canonical_root = root.header == expected.header
        && root.payload == expected.payload
        && root.fills == expected.fills
        && root.strokes == expected.strokes
        && doc.parent_of(doc.root).is_none();
    if !canonical_root {
        return Err(PrintError::NonCanonicalDocumentRoot);
    }
    if root.children.len() != 1 {
        return Err(PrintError::RenderRootCount {
            found: root.children.len(),
        });
    }

    let render_root = root.children[0];
    if doc.parent_of(render_root) != Some(doc.root) {
        return Err(PrintError::InvalidRenderRootParent);
    }
    let render_root_node = doc
        .get_opt(render_root)
        .ok_or_else(|| PrintError::InvalidDocument("render root is not live".into()))?;
    if !matches!(
        render_root_node.payload,
        crate::model::Payload::Frame { .. }
    ) {
        return Err(PrintError::RenderRootMustBeContainer {
            found: render_root_node.payload.kind_name(),
        });
    }

    let mut out = String::new();
    let _ = writeln!(out, "<grida version=\"{VERSION}\">");
    textir::print_grida_xml_render_root(doc, render_root, 1, &mut out)
        .map_err(PrintError::InvalidDocument)?;
    let _ = writeln!(out, "</grida>");
    let reparsed = parse(&out).map_err(|error| PrintError::InvalidDocument(error.0))?;
    if !semantic_document_eq(doc, &reparsed) {
        return Err(PrintError::InvalidDocument(
            "canonical source does not round-trip semantically".into(),
        ));
    }
    Ok(out)
}
