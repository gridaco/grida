//! Arena-based DOM representation for csscascade.
//!
//! Provides [`DemoDom`] — a flat, arena-allocated DOM tree built by html5ever's
//! [`TreeSink`] trait.  Every node lives in a `Vec<DemoNode>` and is addressed
//! by a lightweight [`NodeId`] index.  After parsing, the DOM is frozen and
//! handed off to the Stylo adapter layer ([`crate::adapter`]).

use std::{
    borrow::Cow,
    cell::{Cell, RefCell},
    io::{self, Cursor},
};

use atomic_refcell::AtomicRefCell;
use html5ever::tendril::TendrilSink;
use html5ever::{driver::ParseOpts, parse_document};
use markup5ever::interface::tree_builder::{
    ElemName as ElemNameTrait, ElementFlags, NodeOrText, QuirksMode, TreeSink,
};
use markup5ever::{Attribute, LocalName, Namespace, QualName};
use style::{
    LocalName as StyleLocalName, Namespace as StyleNamespace, data::ElementData,
    properties::PropertyDeclarationBlock, shared_lock::Locked, values::AtomIdent,
};
use style::context::QuirksMode as StyleQuirksMode;
use style::properties::parse_style_attribute;
use style::servo_arc::Arc;
use style::stylesheets::{CssRuleType, UrlExtraData};
use stylo_atoms::Atom as WeakAtom;
use url::Url;
use tendril::StrTendril;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Index into the DOM arena.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct NodeId(pub(crate) usize);

impl NodeId {
    pub(crate) fn idx(self) -> usize {
        self.0
    }
}

/// A single DOM node.
#[derive(Debug)]
pub struct DemoNode {
    pub parent: Option<NodeId>,
    pub children: Vec<NodeId>,
    pub data: DemoNodeData,
}

/// Payload carried by a [`DemoNode`].
#[derive(Debug)]
pub enum DemoNodeData {
    Document,
    Doctype {
        name: StrTendril,
        public_id: StrTendril,
        system_id: StrTendril,
    },
    Text(StrTendril),
    Comment(StrTendril),
    Element(DemoElementData),
    ProcessingInstruction {
        target: StrTendril,
        contents: StrTendril,
    },
}

/// Extra metadata kept for element nodes.
#[derive(Debug)]
pub struct DemoElementData {
    pub name: QualName,
    pub attrs: Vec<Attribute>,
    pub template_contents: Option<NodeId>,
    pub mathml_annotation_xml_integration_point: bool,
    /// Pre-extracted `id` attribute value (if any).
    pub id_attr: Option<WeakAtom>,
    /// Pre-split class tokens.
    pub class_list: Vec<AtomIdent>,
    /// Style-compatible local names for each attribute.
    pub attr_local_names: Vec<StyleLocalName>,
    pub style_local_name: StyleLocalName,
    pub style_namespace: StyleNamespace,
    /// Parsed inline `style` attribute, if present.
    pub style_attribute: Option<Arc<Locked<PropertyDeclarationBlock>>>,
}

/// The frozen, arena-allocated DOM tree.
#[derive(Debug)]
pub struct DemoDom {
    nodes: Vec<DemoNode>,
    document: NodeId,
    quirks_mode: QuirksMode,
    pub errors: Vec<String>,
    /// Per-node slot for Stylo [`ElementData`] (only meaningful for elements).
    pub(crate) element_data: Vec<AtomicRefCell<Option<ElementData>>>,
}

// SAFETY: The DOM is frozen after parsing; no mutable aliasing across threads.
unsafe impl Sync for DemoDom {}
unsafe impl Send for DemoDom {}

impl DemoDom {
    /// Parse a complete HTML document from raw bytes.
    pub fn parse_from_bytes(bytes: &[u8]) -> io::Result<Self> {
        let mut reader = Cursor::new(bytes);
        let dom = parse_document(DemoDomBuilder::new(), ParseOpts::default())
            .from_utf8()
            .read_from(&mut reader)?;
        Ok(dom)
    }

    pub fn document_id(&self) -> NodeId {
        self.document
    }

    pub fn document_children(&self) -> &[NodeId] {
        &self.nodes[self.document.idx()].children
    }

    pub fn quirks_mode(&self) -> QuirksMode {
        self.quirks_mode
    }

    pub fn node(&self, id: NodeId) -> &DemoNode {
        &self.nodes[id.idx()]
    }

    pub(crate) fn element_data_slot(&self, id: NodeId) -> &AtomicRefCell<Option<ElementData>> {
        &self.element_data[id.idx()]
    }

    pub fn all_node_ids(&self) -> impl Iterator<Item = NodeId> + '_ {
        (0..self.nodes.len()).map(NodeId)
    }
}

// ---------------------------------------------------------------------------
// TreeSink builder (internal)
// ---------------------------------------------------------------------------

struct DemoDomBuilder {
    nodes: RefCell<Vec<NodeTemp>>,
    document: NodeId,
    errors: RefCell<Vec<Cow<'static, str>>>,
    quirks_mode: Cell<QuirksMode>,
}

#[derive(Debug)]
struct NodeTemp {
    parent: Cell<Option<NodeId>>,
    children: RefCell<Vec<NodeId>>,
    data: NodeDataTemp,
}

impl NodeTemp {
    fn new(data: NodeDataTemp) -> Self {
        Self {
            parent: Cell::new(None),
            children: RefCell::new(Vec::new()),
            data,
        }
    }
}

#[derive(Debug)]
enum NodeDataTemp {
    Document,
    Doctype {
        name: StrTendril,
        public_id: StrTendril,
        system_id: StrTendril,
    },
    Text {
        contents: RefCell<StrTendril>,
    },
    Comment {
        contents: StrTendril,
    },
    Element {
        name: QualName,
        attrs: RefCell<Vec<Attribute>>,
        template_contents: RefCell<Option<NodeId>>,
        mathml_annotation_xml_integration_point: bool,
    },
    ProcessingInstruction {
        target: StrTendril,
        contents: StrTendril,
    },
}

#[derive(Debug, Clone)]
struct OwnedElemName(QualName);

impl ElemNameTrait for OwnedElemName {
    fn ns(&self) -> &Namespace {
        &self.0.ns
    }
    fn local_name(&self) -> &LocalName {
        &self.0.local
    }
}

impl DemoDomBuilder {
    fn new() -> Self {
        let mut nodes = Vec::new();
        nodes.push(NodeTemp::new(NodeDataTemp::Document));
        Self {
            nodes: RefCell::new(nodes),
            document: NodeId(0),
            errors: RefCell::new(Vec::new()),
            quirks_mode: Cell::new(QuirksMode::NoQuirks),
        }
    }

    fn new_node(&self, data: NodeDataTemp) -> NodeId {
        let mut nodes = self.nodes.borrow_mut();
        let id = NodeId(nodes.len());
        nodes.push(NodeTemp::new(data));
        id
    }

    fn node_parent(&self, id: NodeId) -> Option<NodeId> {
        let nodes = self.nodes.borrow();
        nodes[id.idx()].parent.get()
    }

    fn set_parent(&self, id: NodeId, parent: Option<NodeId>) {
        let nodes = self.nodes.borrow();
        nodes[id.idx()].parent.set(parent);
    }

    fn append_child(&self, parent: NodeId, child: NodeId) {
        self.set_parent(child, Some(parent));
        let nodes = self.nodes.borrow();
        nodes[parent.idx()].children.borrow_mut().push(child);
    }

    fn last_child(&self, parent: NodeId) -> Option<NodeId> {
        let nodes = self.nodes.borrow();
        nodes[parent.idx()].children.borrow().last().copied()
    }

    fn append_to_existing_text(&self, node: NodeId, text: &str) -> bool {
        let nodes = self.nodes.borrow();
        if let NodeDataTemp::Text { contents } = &nodes[node.idx()].data {
            contents.borrow_mut().push_slice(text);
            return true;
        }
        false
    }

    fn remove_from_parent(&self, target: NodeId) {
        if let Some((parent, index)) = self.get_parent_and_index(target) {
            self.set_parent(target, None);
            let nodes = self.nodes.borrow();
            nodes[parent.idx()].children.borrow_mut().remove(index);
        }
    }

    fn get_parent_and_index(&self, target: NodeId) -> Option<(NodeId, usize)> {
        let nodes = self.nodes.borrow();
        let parent = nodes[target.idx()].parent.get()?;
        let idx = nodes[parent.idx()]
            .children
            .borrow()
            .iter()
            .position(|&child| child == target)
            .expect("parent missing child");
        Some((parent, idx))
    }

    fn insert_child_at(&self, parent: NodeId, index: usize, child: NodeId) {
        self.remove_from_parent(child);
        self.set_parent(child, Some(parent));
        let nodes = self.nodes.borrow();
        nodes[parent.idx()]
            .children
            .borrow_mut()
            .insert(index, child);
    }

    fn create_text_node(&self, text: StrTendril) -> NodeId {
        self.new_node(NodeDataTemp::Text {
            contents: RefCell::new(text),
        })
    }

    fn node_used_for_template(&self, handle: NodeId) -> NodeId {
        let nodes = self.nodes.borrow();
        if let NodeDataTemp::Element {
            template_contents, ..
        } = &nodes[handle.idx()].data
        {
            template_contents
                .borrow()
                .as_ref()
                .copied()
                .expect("missing template contents")
        } else {
            panic!("not a template element");
        }
    }

    fn add_attrs_if_missing_impl(&self, target: NodeId, attrs: Vec<Attribute>) {
        let nodes = self.nodes.borrow();
        let NodeDataTemp::Element {
            attrs: existing, ..
        } = &nodes[target.idx()].data
        else {
            panic!("not an element");
        };
        let mut existing = existing.borrow_mut();
        let existing_names: Vec<_> = existing.iter().map(|attr| attr.name.clone()).collect();
        for attr in attrs {
            if existing_names.iter().any(|name| *name == attr.name) {
                continue;
            }
            existing.push(attr);
        }
    }
}

impl TreeSink for DemoDomBuilder {
    type Handle = NodeId;
    type Output = DemoDom;

    type ElemName<'a>
        = OwnedElemName
    where
        Self: 'a;

    fn finish(self) -> Self::Output {
        let quirks = self.quirks_mode.get();
        let document = self.document;
        let errors = self
            .errors
            .into_inner()
            .into_iter()
            .map(|e| e.into_owned())
            .collect();
        let nodes: Vec<DemoNode> = self
            .nodes
            .into_inner()
            .into_iter()
            .map(|node| DemoNode {
                parent: node.parent.get(),
                children: node.children.into_inner(),
                data: match node.data {
                    NodeDataTemp::Document => DemoNodeData::Document,
                    NodeDataTemp::Doctype {
                        name,
                        public_id,
                        system_id,
                    } => DemoNodeData::Doctype {
                        name,
                        public_id,
                        system_id,
                    },
                    NodeDataTemp::Text { contents } => DemoNodeData::Text(contents.into_inner()),
                    NodeDataTemp::Comment { contents } => DemoNodeData::Comment(contents),
                    NodeDataTemp::Element {
                        name,
                        attrs,
                        template_contents,
                        mathml_annotation_xml_integration_point,
                    } => {
                        let attrs_vec = attrs.into_inner();
                        let (id_attr, class_list, attr_local_names, style_value) =
                            derive_attr_metadata(&attrs_vec);
                        let style_local_name = style_local_name_from(&name.local);
                        let style_namespace = style_namespace_from(&name.ns);

                        let style_attribute = style_value.map(|css_text| {
                            let url = Url::parse("about:blank").unwrap();
                            let url_data = UrlExtraData::from(url);
                            let block = parse_style_attribute(
                                &css_text,
                                &url_data,
                                None,
                                StyleQuirksMode::NoQuirks,
                                CssRuleType::Style,
                            );
                            use crate::adapter::doc_shared_lock;
                            let locked = doc_shared_lock().wrap(block);
                            Arc::new(locked)
                        });

                        DemoNodeData::Element(DemoElementData {
                            name,
                            attrs: attrs_vec,
                            template_contents: template_contents.into_inner(),
                            mathml_annotation_xml_integration_point,
                            id_attr,
                            class_list,
                            attr_local_names,
                            style_local_name,
                            style_namespace,
                            style_attribute,
                        })
                    }
                    NodeDataTemp::ProcessingInstruction { target, contents } => {
                        DemoNodeData::ProcessingInstruction { target, contents }
                    }
                },
            })
            .collect();

        let element_data = nodes.iter().map(|_| AtomicRefCell::new(None)).collect();

        DemoDom {
            nodes,
            document,
            quirks_mode: quirks,
            errors,
            element_data,
        }
    }

    fn parse_error(&self, msg: Cow<'static, str>) {
        self.errors.borrow_mut().push(msg);
    }

    fn get_document(&self) -> Self::Handle {
        self.document
    }

    fn elem_name<'a>(&'a self, target: &'a Self::Handle) -> Self::ElemName<'a> {
        let nodes = self.nodes.borrow();
        match &nodes[target.idx()].data {
            NodeDataTemp::Element { name, .. } => OwnedElemName(name.clone()),
            _ => panic!("not an element"),
        }
    }

    fn create_element(
        &self,
        name: QualName,
        attrs: Vec<Attribute>,
        flags: ElementFlags,
    ) -> Self::Handle {
        let template_contents = if flags.template {
            Some(self.new_node(NodeDataTemp::Document))
        } else {
            None
        };
        self.new_node(NodeDataTemp::Element {
            name,
            attrs: RefCell::new(attrs),
            template_contents: RefCell::new(template_contents),
            mathml_annotation_xml_integration_point: flags.mathml_annotation_xml_integration_point,
        })
    }

    fn create_comment(&self, text: StrTendril) -> Self::Handle {
        self.new_node(NodeDataTemp::Comment { contents: text })
    }

    fn create_pi(&self, target: StrTendril, data: StrTendril) -> Self::Handle {
        self.new_node(NodeDataTemp::ProcessingInstruction {
            target,
            contents: data,
        })
    }

    fn append(&self, parent: &Self::Handle, child: NodeOrText<Self::Handle>) {
        if let NodeOrText::AppendText(ref text) = child {
            if let Some(last) = self.last_child(*parent) {
                if self.append_to_existing_text(last, text) {
                    return;
                }
            }
        }

        let new_child = match child {
            NodeOrText::AppendText(text) => self.create_text_node(text),
            NodeOrText::AppendNode(node) => {
                self.remove_from_parent(node);
                node
            }
        };

        self.append_child(*parent, new_child);
    }

    fn append_based_on_parent_node(
        &self,
        element: &Self::Handle,
        prev_element: &Self::Handle,
        child: NodeOrText<Self::Handle>,
    ) {
        if self.node_parent(*element).is_some() {
            self.append_before_sibling(element, child);
        } else {
            self.append(prev_element, child);
        }
    }

    fn append_doctype_to_document(
        &self,
        name: StrTendril,
        public_id: StrTendril,
        system_id: StrTendril,
    ) {
        let node = self.new_node(NodeDataTemp::Doctype {
            name,
            public_id,
            system_id,
        });
        self.append_child(self.document, node);
    }

    fn mark_script_already_started(&self, _node: &Self::Handle) {}

    fn pop(&self, _node: &Self::Handle) {}

    fn get_template_contents(&self, target: &Self::Handle) -> Self::Handle {
        self.node_used_for_template(*target)
    }

    fn same_node(&self, x: &Self::Handle, y: &Self::Handle) -> bool {
        x == y
    }

    fn set_quirks_mode(&self, mode: QuirksMode) {
        self.quirks_mode.set(mode);
    }

    fn append_before_sibling(&self, sibling: &Self::Handle, child: NodeOrText<Self::Handle>) {
        let (parent, index) = self
            .get_parent_and_index(*sibling)
            .expect("sibling missing parent");

        let new_child = match (child, index) {
            (NodeOrText::AppendText(text), 0) => self.create_text_node(text),
            (NodeOrText::AppendText(text), i) => {
                let nodes = self.nodes.borrow();
                let prev = nodes[parent.idx()].children.borrow()[i - 1];
                drop(nodes);
                if self.append_to_existing_text(prev, &text) {
                    return;
                }
                self.create_text_node(text)
            }
            (NodeOrText::AppendNode(node), _) => {
                self.remove_from_parent(node);
                node
            }
        };

        self.insert_child_at(parent, index, new_child);
    }

    fn add_attrs_if_missing(&self, target: &Self::Handle, attrs: Vec<Attribute>) {
        self.add_attrs_if_missing_impl(*target, attrs);
    }

    fn associate_with_form(
        &self,
        _target: &Self::Handle,
        _form: &Self::Handle,
        _nodes: (&Self::Handle, Option<&Self::Handle>),
    ) {
    }

    fn remove_from_parent(&self, target: &Self::Handle) {
        self.remove_from_parent(*target);
    }

    fn reparent_children(&self, node: &Self::Handle, new_parent: &Self::Handle) {
        loop {
            let next_child = {
                let nodes = self.nodes.borrow();
                nodes[node.idx()].children.borrow().first().copied()
            };
            let Some(child) = next_child else {
                break;
            };
            self.remove_from_parent(child);
            self.append_child(*new_parent, child);
        }
    }

    fn is_mathml_annotation_xml_integration_point(&self, handle: &Self::Handle) -> bool {
        let nodes = self.nodes.borrow();
        if let NodeDataTemp::Element {
            mathml_annotation_xml_integration_point,
            ..
        } = &nodes[handle.idx()].data
        {
            *mathml_annotation_xml_integration_point
        } else {
            false
        }
    }

    fn set_current_line(&self, _line_number: u64) {}

    fn allow_declarative_shadow_roots(&self, _intended_parent: &Self::Handle) -> bool {
        true
    }

    fn attach_declarative_shadow(
        &self,
        _location: &Self::Handle,
        _template: &Self::Handle,
        _attrs: &[Attribute],
    ) -> bool {
        false
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn derive_attr_metadata(
    attrs: &[Attribute],
) -> (
    Option<WeakAtom>,
    Vec<AtomIdent>,
    Vec<StyleLocalName>,
    Option<String>,
) {
    let mut id_attr = None;
    let mut class_list = Vec::new();
    let mut attr_local_names = Vec::with_capacity(attrs.len());
    let mut style_value = None;

    for attr in attrs {
        attr_local_names.push(StyleLocalName::from(attr.name.local.as_ref()));
        if !is_htmlish_namespace(&attr.name.ns) {
            continue;
        }

        let local = attr.name.local.as_ref();
        if id_attr.is_none() && local.eq_ignore_ascii_case("id") {
            id_attr = Some(WeakAtom::from(attr.value.as_ref()));
        } else if local.eq_ignore_ascii_case("class") {
            class_list = parse_class_list(attr.value.as_ref());
        } else if local.eq_ignore_ascii_case("style") {
            style_value = Some(attr.value.to_string());
        }
    }

    (id_attr, class_list, attr_local_names, style_value)
}

fn parse_class_list(value: &str) -> Vec<AtomIdent> {
    value
        .split_ascii_whitespace()
        .filter(|token| !token.is_empty())
        .map(AtomIdent::from)
        .collect()
}

fn is_htmlish_namespace(ns: &Namespace) -> bool {
    *ns == markup5ever::ns!(html) || *ns == markup5ever::ns!()
}

fn style_local_name_from(local: &LocalName) -> StyleLocalName {
    StyleLocalName::from(local.as_ref())
}

fn style_namespace_from(ns: &Namespace) -> StyleNamespace {
    StyleNamespace::from(ns.as_ref())
}
