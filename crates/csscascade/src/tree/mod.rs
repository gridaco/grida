//! Minimal style-resolved tree representation.
//!
//! This is a proof-of-concept module that models how csscascade will expose
//! style-resolved DOM snapshots to downstream layout / rendering engines.
//! The structures are intentionally small and focus on ergonomics rather than
//! completeness; they can evolve as more use-cases appear.

use crate::rcdom::{Handle, Node, NodeData, RcDom, SerializableHandle};
use euclid::{Scale, Size2D};
use html5ever::driver::ParseOpts;
use html5ever::parse_document;
use html5ever::serialize::{SerializeOpts, TraversalScope, serialize};
use html5ever::tendril::TendrilSink;
use html5ever::tree_builder::TreeBuilderOpts;
use markup5ever::{Attribute as HtmlAttribute, LocalName, QualName, ns};
use std::cell::RefCell;
use std::error::Error as StdError;
use std::fmt::{self, Write as FmtWrite};
use std::io::Cursor;
use std::mem;
use std::rc::Rc;
use std::sync::{Arc, OnceLock};
use style::context::QuirksMode;
use style::font_metrics::FontMetrics;
use style::media_queries::MediaType;
use style::properties::style_structs::Font;
use style::properties::{self, LonghandId};
use style::queries::values::PrefersColorScheme;
use style::servo::media_queries::{Device, FontMetricsProvider};
use style::servo_arc::Arc as ServoArc;
use style::shared_lock::SharedRwLock;
use style::stylist::Stylist;
use style::values::computed::CSSPixelLength;
use style::values::computed::Length;
use style::values::computed::font::GenericFontFamily;
use style::values::specified::font::QueryFontMetricsFlags;
use tendril::StrTendril;

/// Options that control how a [`Tree`] is serialized back to HTML.
#[derive(Debug, Clone)]
pub enum WriteOptions {
    /// Output the DOM as parsed, without mutating styles.
    Html { include_root: bool },
    /// Serialize with every computed property inlined into the `style` attribute.
    ComputedValues { include_root: bool },
}

impl WriteOptions {
    fn include_root(&self) -> bool {
        match self {
            WriteOptions::Html { include_root } => *include_root,
            WriteOptions::ComputedValues { include_root } => *include_root,
        }
    }

    fn inline_styles(&self) -> bool {
        matches!(self, WriteOptions::ComputedValues { .. })
    }
}

impl Default for WriteOptions {
    fn default() -> Self {
        Self::Html { include_root: true }
    }
}

/// A style-resolved tree with a shared root node.
#[derive(Debug, Clone)]
pub struct Tree {
    root: Arc<StyledNode>,
    #[allow(dead_code)]
    runtime: Arc<StyleRuntime>,
}

impl Tree {
    /// Creates a tree from the supplied root node.
    fn new(root: StyledNode, runtime: Arc<StyleRuntime>) -> Self {
        Self {
            root: Arc::new(root),
            runtime,
        }
    }

    /// Returns a shared reference to the root node.
    pub fn root(&self) -> &Arc<StyledNode> {
        &self.root
    }
    /// Parse HTML (or fragment) string directly into a tree.
    ///
    /// NOTE: The current implementation only mirrors the DOM structure with stub
    /// styles; full cascade integration will replace this once the Stylo bridge is wired.
    pub fn from_str(input: &str) -> Result<Self, TreeError> {
        let runtime = StyleRuntime::new()?;
        let opts = default_parse_opts();
        let mut reader = Cursor::new(input.as_bytes());
        let dom = parse_document(RcDom::default(), opts)
            .from_utf8()
            .read_from(&mut reader)
            .map_err(TreeError::HtmlParse)?;
        Self::from_rcdom_with_runtime(&dom, runtime)
    }

    /// Build a tree from an existing rcdom DOM snapshot.
    ///
    /// As with `from_str`, this currently mirrors the DOM into our minimal tree
    /// without running the CSS cascade yet.
    pub fn from_rcdom(dom: &RcDom) -> Result<Self, TreeError> {
        let runtime = StyleRuntime::new()?;
        Self::from_rcdom_with_runtime(dom, runtime)
    }

    fn from_rcdom_with_runtime(dom: &RcDom, runtime: Arc<StyleRuntime>) -> Result<Self, TreeError> {
        let mut next_id = 0;
        let document_children = dom.document.children.borrow();
        for child in document_children.iter() {
            if let Some(node) = convert_handle(child, &mut next_id, &runtime) {
                return Ok(Tree::new(node, runtime));
            }
        }
        Err(TreeError::NoRenderableNodes)
    }

    /// Serialize the tree back to HTML using html5ever's serializer.
    pub fn to_string(&self, options: &WriteOptions) -> Result<String, TreeError> {
        let handle = styled_node_to_dom(&self.root, options);
        let serializable: SerializableHandle = handle.into();
        let mut buffer = Vec::new();
        let mut serialize_opts = SerializeOpts::default();
        serialize_opts.traversal_scope = if options.include_root() {
            TraversalScope::IncludeNode
        } else {
            TraversalScope::ChildrenOnly(None)
        };
        serialize(&mut buffer, &serializable, serialize_opts).map_err(TreeError::Serialize)?;
        String::from_utf8(buffer).map_err(TreeError::Utf8)
    }
}

/// Placeholder error type for tree construction failures.
#[derive(Debug)]
pub enum TreeError {
    HtmlParse(std::io::Error),
    NoRenderableNodes,
    StyloUnavailable(String),
    Serialize(std::io::Error),
    Utf8(std::string::FromUtf8Error),
}

impl fmt::Display for TreeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TreeError::HtmlParse(err) => write!(f, "HTML parse error: {err}"),
            TreeError::NoRenderableNodes => write!(f, "no renderable nodes in DOM"),
            TreeError::StyloUnavailable(msg) => write!(f, "stylo unavailable: {msg}"),
            TreeError::Serialize(err) => write!(f, "serialize error: {err}"),
            TreeError::Utf8(err) => write!(f, "utf8 error: {err}"),
        }
    }
}

impl StdError for TreeError {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        match self {
            TreeError::HtmlParse(err) => Some(err),
            TreeError::Serialize(err) => Some(err),
            TreeError::Utf8(err) => Some(err),
            _ => None,
        }
    }
}

/// A style-resolved node.
#[derive(Debug)]
pub struct StyledNode {
    pub node_id: NodeId,
    pub tag: NodeKind,
    pub attributes: Vec<Attribute>,
    pub children: Vec<StyledNode>,
    runtime: Arc<StyleRuntime>,
    style_cache: OnceLock<ServoArc<style::properties::ComputedValues>>,
}

impl StyledNode {
    /// Creates a new node builder for the provided tag.
    fn builder(tag: impl Into<NodeKind>, runtime: Arc<StyleRuntime>) -> StyledNodeBuilder {
        StyledNodeBuilder::new(tag.into(), runtime)
    }

    pub fn get_style(&self) -> ServoArc<style::properties::ComputedValues> {
        self.style_cache
            .get_or_init(|| self.runtime.compute_for(self))
            .clone()
    }
}

/// A thin, type-safe wrapper around node identifiers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NodeId(u64);

impl NodeId {
    pub fn new(raw: u64) -> Self {
        Self(raw)
    }
}

impl Default for NodeId {
    fn default() -> Self {
        Self(0)
    }
}

/// Describes what kind of content a node holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NodeKind {
    Element(String),
    Text(String),
}

impl From<&str> for NodeKind {
    fn from(value: &str) -> Self {
        Self::Element(value.to_string())
    }
}

impl From<String> for NodeKind {
    fn from(value: String) -> Self {
        Self::Element(value)
    }
}

/// Simple name/value pair for attributes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Attribute {
    pub name: String,
    pub value: String,
}

impl Attribute {
    pub fn new(name: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            value: value.into(),
        }
    }
}

/// Builder for `StyledNode`.
pub(crate) struct StyledNodeBuilder {
    node_id: NodeId,
    tag: NodeKind,
    attributes: Vec<Attribute>,
    children: Vec<StyledNode>,
    runtime: Arc<StyleRuntime>,
}

impl StyledNodeBuilder {
    fn new(tag: NodeKind, runtime: Arc<StyleRuntime>) -> Self {
        Self {
            node_id: NodeId::default(),
            tag,
            attributes: Vec::new(),
            children: Vec::new(),
            runtime,
        }
    }

    pub fn node_id(mut self, id: NodeId) -> Self {
        self.node_id = id;
        self
    }

    pub fn attribute(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.attributes.push(Attribute::new(name, value));
        self
    }

    pub fn child(mut self, child: StyledNode) -> Self {
        self.children.push(child);
        self
    }

    pub fn build(self) -> StyledNode {
        StyledNode {
            node_id: self.node_id,
            tag: self.tag,
            attributes: self.attributes,
            children: self.children,
            runtime: self.runtime.clone(),
            style_cache: OnceLock::new(),
        }
    }
}

/// Generates a tiny sample tree for demonstration / testing.
pub fn sample_tree() -> Tree {
    let runtime = StyleRuntime::new().expect("stylo runtime init failed");
    let heading_text =
        StyledNode::builder(NodeKind::Text("Hello, csscascade!".into()), runtime.clone())
            .node_id(NodeId::new(2))
            .build();

    let heading = StyledNode::builder("h1", runtime.clone())
        .node_id(NodeId::new(1))
        .attribute("class", "title")
        .child(heading_text)
        .build();

    let paragraph_text = StyledNode::builder(
        NodeKind::Text("This tree was built without HTML parsing.".into()),
        runtime.clone(),
    )
    .node_id(NodeId::new(4))
    .build();

    let paragraph = StyledNode::builder("p", runtime.clone())
        .node_id(NodeId::new(3))
        .child(paragraph_text)
        .build();

    let root = StyledNode::builder("div", runtime.clone())
        .node_id(NodeId::new(0))
        .attribute("id", "app")
        .child(heading)
        .child(paragraph)
        .build();

    Tree::new(root, runtime)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_tree_contains_expected_content() {
        let tree = sample_tree();
        let root = tree.root();
        assert_eq!(root.tag, NodeKind::Element("div".into()));
        assert_eq!(root.children.len(), 2);
        assert_eq!(root.children[0].tag, NodeKind::Element("h1".into()));
        assert_eq!(
            root.children[1].children[0].tag,
            NodeKind::Text("This tree was built without HTML parsing.".into())
        );
    }
}

fn default_parse_opts() -> ParseOpts {
    ParseOpts {
        tree_builder: TreeBuilderOpts {
            drop_doctype: false,
            ..Default::default()
        },
        ..Default::default()
    }
}

fn convert_handle(
    handle: &Handle,
    next_id: &mut u64,
    runtime: &Arc<StyleRuntime>,
) -> Option<StyledNode> {
    match &handle.data {
        NodeData::Element { name, attrs, .. } => {
            let tag_name = name.local.to_string();
            let kind = NodeKind::Element(tag_name);
            let mut builder =
                StyledNode::builder(kind, runtime.clone()).node_id(next_node_id(next_id));

            let attrs_ref = attrs.borrow();
            for attr in attrs_ref.iter() {
                builder = builder.attribute(attr.name.local.to_string(), attr.value.to_string());
            }

            let children = handle
                .children
                .borrow()
                .iter()
                .filter_map(|child| convert_handle(child, next_id, runtime))
                .collect::<Vec<_>>();

            for child in children {
                builder = builder.child(child);
            }

            Some(builder.build())
        }
        NodeData::Text { contents } => {
            let text = contents.borrow();
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                let kind = NodeKind::Text(trimmed.to_string());
                Some(
                    StyledNode::builder(kind, runtime.clone())
                        .node_id(next_node_id(next_id))
                        .build(),
                )
            }
        }
        _ => None,
    }
}

fn next_node_id(counter: &mut u64) -> NodeId {
    let id = *counter;
    *counter += 1;
    NodeId::new(id)
}

fn styled_node_to_dom(node: &StyledNode, options: &WriteOptions) -> Handle {
    match &node.tag {
        NodeKind::Element(name) => {
            let qual = QualName::new(None, ns!(html), LocalName::from(name.as_str()));
            let mut attrs_vec: Vec<HtmlAttribute> = node
                .attributes
                .iter()
                .map(|attr| HtmlAttribute {
                    name: QualName::new(None, ns!(), LocalName::from(attr.name.as_str())),
                    value: StrTendril::from(attr.value.as_str()),
                })
                .collect();

            if options.inline_styles() {
                if let Some(serialized) = serialize_all_properties(&node.get_style()) {
                    attrs_vec.retain(|attr| attr.name.local.as_ref() != "style");
                    attrs_vec.push(HtmlAttribute {
                        name: QualName::new(None, ns!(), LocalName::from("style")),
                        value: StrTendril::from(serialized.as_str()),
                    });
                }
            }
            let handle = Node::new(NodeData::Element {
                name: qual,
                attrs: RefCell::new(attrs_vec),
                template_contents: RefCell::new(None),
                mathml_annotation_xml_integration_point: false,
            });
            for child in &node.children {
                let child_handle = styled_node_to_dom(child, options);
                append_child(&handle, child_handle);
            }
            handle
        }
        NodeKind::Text(text) => Node::new(NodeData::Text {
            contents: RefCell::new(StrTendril::from(text.as_str())),
        }),
    }
}

fn append_child(parent: &Handle, child: Handle) {
    child.parent.set(Some(Rc::downgrade(parent)));
    parent.children.borrow_mut().push(child);
}

fn serialize_all_properties(style: &style::properties::ComputedValues) -> Option<String> {
    let mut decls = String::new();
    let mut needs_separator = false;
    for id in all_longhand_ids() {
        let mut buf = String::new();
        if style
            .computed_or_resolved_value(id, None, &mut buf)
            .is_err()
        {
            continue;
        }
        let serialized = buf.trim();
        if serialized.is_empty() {
            continue;
        }
        if needs_separator {
            decls.push_str("; ");
        }
        if FmtWrite::write_fmt(&mut decls, format_args!("{}: {}", id.name(), serialized)).is_err() {
            continue;
        }
        needs_separator = true;
    }
    if decls.is_empty() { None } else { Some(decls) }
}

fn all_longhand_ids() -> impl Iterator<Item = LonghandId> {
    (0..properties::property_counts::LONGHANDS as u16).map(|idx| unsafe { mem::transmute(idx) })
}

struct StyleRuntime {
    #[allow(dead_code)]
    stylist: Stylist,
    #[allow(dead_code)]
    shared_lock: SharedRwLock,
    default_values: ServoArc<style::properties::ComputedValues>,
}

impl StyleRuntime {
    fn new() -> Result<Arc<Self>, TreeError> {
        let quirks_mode = QuirksMode::NoQuirks;
        let media_type = MediaType::screen();
        let viewport_typed = Size2D::new(800.0f32, 600.0f32);
        let dpr_typed = Scale::new(1.0f32);
        let font_provider = Box::new(SimpleFontProvider);
        let default_font = Font::initial_values();
        let initial_values =
            style::properties::ComputedValues::initial_values_with_font_override(default_font);
        let shared_lock = SharedRwLock::new();
        let color_scheme = PrefersColorScheme::Light;

        let device = Device::new(
            media_type,
            quirks_mode,
            viewport_typed,
            dpr_typed,
            font_provider,
            initial_values.clone(),
            color_scheme,
        );

        let stylist = Stylist::new(device, quirks_mode);

        Ok(Arc::new(Self {
            stylist,
            shared_lock,
            default_values: initial_values,
        }))
    }

    fn compute_for(&self, _node: &StyledNode) -> ServoArc<style::properties::ComputedValues> {
        // TODO: integrate with actual Stylist lookups per element.
        self.default_values.clone()
    }
}

impl fmt::Debug for StyleRuntime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("StyleRuntime").finish_non_exhaustive()
    }
}

#[derive(Debug)]
struct SimpleFontProvider;

impl FontMetricsProvider for SimpleFontProvider {
    fn query_font_metrics(
        &self,
        _vertical: bool,
        _font: &Font,
        base_size: CSSPixelLength,
        _flags: QueryFontMetricsFlags,
    ) -> FontMetrics {
        let px = base_size.px();
        FontMetrics {
            ascent: Length::new(px * 0.8),
            x_height: Some(Length::new(px * 0.5)),
            cap_height: Some(Length::new(px * 0.7)),
            zero_advance_measure: Some(Length::new(px * 0.5)),
            ic_width: Some(Length::new(px)),
            script_percent_scale_down: None,
            script_script_percent_scale_down: None,
        }
    }

    fn base_size_for_generic(&self, _generic: GenericFontFamily) -> Length {
        Length::new(16.0)
    }
}
