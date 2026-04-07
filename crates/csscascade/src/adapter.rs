//! Stylo DOM adapter layer.
//!
//! Implements the [`TNode`], [`TElement`], [`TDocument`], and [`selectors::Element`]
//! traits for our arena DOM so that Stylo's cascade engine can match selectors
//! and resolve styles against it.
//!
//! # Limitations (PoC)
//!
//! The DOM is stored in a process-global slot via [`bootstrap_dom`]. Each call
//! replaces the previous document (the old one is leaked). This means only one
//! document is live at a time, but multiple documents can be processed
//! sequentially within the same process.

use std::borrow::Borrow;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicPtr, Ordering};

use atomic_refcell::{AtomicRef, AtomicRefMut};
use euclid::default::Size2D;
use markup5ever::{Attribute, Namespace as HtmlNamespace, ns};
use selectors::attr::{AttrSelectorOperation, CaseSensitivity, NamespaceConstraint};
use selectors::bloom::BloomFilter;
use selectors::matching::{ElementSelectorFlags, MatchingContext, VisitedHandlingMode};
use selectors::parser::SelectorImpl as SelectorsParser;
use selectors::{OpaqueElement, sink::Push};
use style::Namespace as StyleNamespace;
use style::applicable_declarations::ApplicableDeclarationBlock;
use style::context::SharedStyleContext;
use style::data::ElementData;
use style::dom::{LayoutIterator, OpaqueNode, TElement, TNode};
use style::properties::PropertyDeclarationBlock;
use style::selector_parser::{AttrValue as SelectorAttrValue, Lang, PseudoElement, SelectorImpl};
use style::servo_arc::{Arc, ArcBorrow};
use style::shared_lock::{Locked, SharedRwLock};
use style::stylist::CascadeData;
use style::values::AtomIdent;
use style::values::computed::Au;
use style::values::computed::Display;
use stylo_dom::ElementState;

use crate::dom::{DemoDom, DemoElementData, DemoNode, DemoNodeData, NodeId};

type Impl = SelectorImpl;

// ---------------------------------------------------------------------------
// Global DOM storage
// ---------------------------------------------------------------------------

static DEMO_DOM: AtomicPtr<DemoDom> = AtomicPtr::new(std::ptr::null_mut());
static STYLE_LOCK: OnceLock<SharedRwLock> = OnceLock::new();

/// Install a parsed [`DemoDom`] into the global slot and return a
/// [`HtmlDocument`] handle.
///
/// Each call replaces the previous document. The old document is intentionally
/// leaked (its `&'static` references remain valid through existing handles).
/// This is acceptable for a dev/import tool; a future iteration will use
/// `Arc`-based context to avoid the leak.
pub fn bootstrap_dom(dom: DemoDom) -> HtmlDocument {
    let document = dom.document_id();
    let ptr = Box::into_raw(Box::new(dom));
    // Swap in the new DOM; the old one (if any) is deliberately leaked so
    // that any outstanding `&'static DemoDom` references stay valid.
    DEMO_DOM.store(ptr, Ordering::Release);
    HtmlDocument(document)
}

/// Returns the process-global [`SharedRwLock`] used for stylesheet data.
pub fn doc_shared_lock() -> &'static SharedRwLock {
    STYLE_LOCK.get_or_init(SharedRwLock::new)
}

/// Returns a reference to the global [`DemoDom`].
///
/// # Panics
///
/// Panics if [`bootstrap_dom`] has not been called yet.
pub fn dom() -> &'static DemoDom {
    let ptr = DEMO_DOM.load(Ordering::Acquire);
    assert!(!ptr.is_null(), "bootstrap_dom must run first");
    // SAFETY: The pointer was created via Box::into_raw in bootstrap_dom
    // and is never deallocated (intentional leak for &'static lifetime).
    unsafe { &*ptr }
}

// ---------------------------------------------------------------------------
// Wrapper types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct HtmlNode(NodeId);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct HtmlElement(NodeId);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct HtmlDocument(NodeId);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct HtmlShadowRoot {
    host: HtmlElement,
}

// ---------------------------------------------------------------------------
// HtmlDocument
// ---------------------------------------------------------------------------

impl HtmlDocument {
    pub fn root_element(&self) -> Option<HtmlElement> {
        dom().document_children().iter().find_map(|child| {
            matches!(dom().node(*child).data, DemoNodeData::Element(_))
                .then_some(HtmlElement(*child))
        })
    }

    pub fn element_count(&self) -> usize {
        let mut count = 0;
        let mut stack = Vec::new();
        if let Some(root) = self.root_element() {
            stack.push(root);
        }
        while let Some(element) = stack.pop() {
            count += 1;
            let mut child = element.first_element_child();
            while let Some(next_child) = child {
                stack.push(next_child);
                child = next_child.next_element_sibling();
            }
        }
        count
    }
}

// ---------------------------------------------------------------------------
// HtmlElement helpers
// ---------------------------------------------------------------------------

impl HtmlElement {
    /// Wrap a DOM [`NodeId`] as an [`HtmlElement`].
    ///
    /// # Safety (logical)
    /// The caller must ensure the node is actually an element node.
    /// Calling methods on a non-element HtmlElement will panic.
    pub fn from_node_id(id: NodeId) -> Self {
        Self(id)
    }

    /// Returns the underlying DOM [`NodeId`].
    pub fn node_id(&self) -> NodeId {
        self.0
    }

    pub fn local_name_string(&self) -> String {
        self.element_data().name.local.to_string()
    }

    pub fn first_element_child(self) -> Option<HtmlElement> {
        self.node().first_element_child()
    }

    pub fn next_element_sibling(self) -> Option<HtmlElement> {
        self.node().next_element_sibling()
    }

    fn element_data(&self) -> &DemoElementData {
        match &dom().node(self.0).data {
            DemoNodeData::Element(data) => data,
            _ => panic!("HtmlElement must wrap an element node"),
        }
    }

    fn node(self) -> HtmlNode {
        HtmlNode(self.0)
    }

    fn data_slot(&self) -> &'static atomic_refcell::AtomicRefCell<Option<ElementData>> {
        dom().element_data_slot(self.0)
    }

    fn attr_iter(&self) -> impl Iterator<Item = (&Attribute, &style::LocalName)> + '_ {
        let data = self.element_data();
        data.attrs.iter().zip(data.attr_local_names.iter())
    }

    fn attr_matches_impl(
        &self,
        ns: &NamespaceConstraint<&StyleNamespace>,
        local_name: &style::LocalName,
        operation: &AttrSelectorOperation<&SelectorAttrValue>,
    ) -> bool {
        self.attr_iter()
            .filter(|(attr, _)| namespace_matches(ns, &attr.name.ns))
            .find(|(_, stored)| *stored == local_name)
            .is_some_and(|(attr, _)| operation.eval_str(attr.value.as_ref()))
    }

    fn lang_attribute_value(&self) -> Option<&str> {
        self.element_data().attrs.iter().find_map(|attr| {
            if !attr.name.local.as_ref().eq_ignore_ascii_case("lang") {
                return None;
            }
            let ns = &attr.name.ns;
            if *ns == markup5ever::ns!() || *ns == markup5ever::ns!(xml) {
                Some(attr.value.as_ref())
            } else {
                None
            }
        })
    }

    fn has_class_token(&self, name: &AtomIdent, case_sensitivity: CaseSensitivity) -> bool {
        let needle = atom_ident_str(name);
        self.element_data()
            .class_list
            .iter()
            .any(|class| case_sensitivity.eq(atom_ident_str(class).as_bytes(), needle.as_bytes()))
    }

    fn id_string(&self) -> Option<&str> {
        self.element_data()
            .id_attr
            .as_ref()
            .map(|atom| atom.as_ref())
    }
}

// ---------------------------------------------------------------------------
// HtmlNode helpers
// ---------------------------------------------------------------------------

impl HtmlNode {
    fn node(self) -> &'static DemoNode {
        dom().node(self.0)
    }

    fn parent(self) -> Option<HtmlNode> {
        self.node().parent.map(HtmlNode)
    }

    fn to_element(self) -> Option<HtmlElement> {
        matches!(self.node().data, DemoNodeData::Element(_)).then_some(HtmlElement(self.0))
    }

    fn first_element_child(self) -> Option<HtmlElement> {
        let mut child = self.first_child();
        while let Some(node) = child {
            if let Some(element) = node.to_element() {
                return Some(element);
            }
            child = node.next_sibling();
        }
        None
    }

    fn prev_element_sibling(self) -> Option<HtmlElement> {
        let mut prev = self.prev_sibling();
        while let Some(node) = prev {
            if let Some(element) = node.to_element() {
                return Some(element);
            }
            prev = node.prev_sibling();
        }
        None
    }

    fn next_element_sibling(self) -> Option<HtmlElement> {
        let mut next = self.next_sibling();
        while let Some(node) = next {
            if let Some(element) = node.to_element() {
                return Some(element);
            }
            next = node.next_sibling();
        }
        None
    }

    fn first_child(self) -> Option<HtmlNode> {
        self.node().children.first().copied().map(HtmlNode)
    }

    fn prev_sibling(self) -> Option<HtmlNode> {
        sibling_pair(self.0).0
    }

    fn next_sibling(self) -> Option<HtmlNode> {
        sibling_pair(self.0).1
    }
}

// ---------------------------------------------------------------------------
// style::dom::NodeInfo
// ---------------------------------------------------------------------------

impl ::style::dom::NodeInfo for HtmlNode {
    fn is_element(&self) -> bool {
        matches!(self.node().data, DemoNodeData::Element(_))
    }

    fn is_text_node(&self) -> bool {
        matches!(self.node().data, DemoNodeData::Text(_))
    }
}

// ---------------------------------------------------------------------------
// style::dom::TNode
// ---------------------------------------------------------------------------

impl ::style::dom::TNode for HtmlNode {
    type ConcreteElement = HtmlElement;
    type ConcreteDocument = HtmlDocument;
    type ConcreteShadowRoot = HtmlShadowRoot;

    fn parent_node(&self) -> Option<Self> {
        self.parent()
    }

    fn first_child(&self) -> Option<Self> {
        self.node().children.first().copied().map(HtmlNode)
    }

    fn last_child(&self) -> Option<Self> {
        self.node().children.last().copied().map(HtmlNode)
    }

    fn prev_sibling(&self) -> Option<Self> {
        sibling_pair(self.0).0
    }

    fn next_sibling(&self) -> Option<Self> {
        sibling_pair(self.0).1
    }

    fn owner_doc(&self) -> Self::ConcreteDocument {
        HtmlDocument(dom().document_id())
    }

    fn is_in_document(&self) -> bool {
        true
    }

    fn traversal_parent(&self) -> Option<Self::ConcreteElement> {
        self.parent()?.to_element()
    }

    fn opaque(&self) -> OpaqueNode {
        OpaqueNode(self.0.idx())
    }

    fn debug_id(self) -> usize {
        self.0.idx()
    }

    fn as_element(&self) -> Option<Self::ConcreteElement> {
        self.to_element()
    }

    fn as_document(&self) -> Option<Self::ConcreteDocument> {
        matches!(self.node().data, DemoNodeData::Document).then_some(HtmlDocument(self.0))
    }

    fn as_shadow_root(&self) -> Option<Self::ConcreteShadowRoot> {
        None
    }
}

// ---------------------------------------------------------------------------
// style::dom::TDocument
// ---------------------------------------------------------------------------

impl ::style::dom::TDocument for HtmlDocument {
    type ConcreteNode = HtmlNode;

    fn as_node(&self) -> Self::ConcreteNode {
        HtmlNode(self.0)
    }

    fn is_html_document(&self) -> bool {
        true
    }

    fn quirks_mode(&self) -> style::context::QuirksMode {
        style::context::QuirksMode::NoQuirks
    }

    fn shared_lock(&self) -> &SharedRwLock {
        doc_shared_lock()
    }
}

// ---------------------------------------------------------------------------
// style::dom::TShadowRoot
// ---------------------------------------------------------------------------

impl ::style::dom::TShadowRoot for HtmlShadowRoot {
    type ConcreteNode = HtmlNode;

    fn as_node(&self) -> Self::ConcreteNode {
        self.host.as_node()
    }

    fn host(&self) -> <Self::ConcreteNode as TNode>::ConcreteElement {
        self.host
    }

    fn style_data<'a>(&self) -> Option<&'a CascadeData>
    where
        Self: 'a,
    {
        None
    }
}

// ---------------------------------------------------------------------------
// style::dom::TElement
// ---------------------------------------------------------------------------

impl ::style::dom::TElement for HtmlElement {
    type ConcreteNode = HtmlNode;
    type TraversalChildrenIterator = std::vec::IntoIter<Self::ConcreteNode>;

    fn as_node(&self) -> Self::ConcreteNode {
        HtmlNode(self.0)
    }

    fn traversal_children(&self) -> LayoutIterator<Self::TraversalChildrenIterator> {
        let nodes: Vec<_> = self
            .node()
            .node()
            .children
            .iter()
            .map(|child| HtmlNode(*child))
            .collect();
        LayoutIterator(nodes.into_iter())
    }

    fn is_html_element(&self) -> bool {
        self.element_data().name.ns == ns!(html)
    }

    fn is_mathml_element(&self) -> bool {
        self.element_data().name.ns == ns!(mathml)
    }

    fn is_svg_element(&self) -> bool {
        self.element_data().name.ns == ns!(svg)
    }

    fn style_attribute(&self) -> Option<ArcBorrow<'_, Locked<PropertyDeclarationBlock>>> {
        self.element_data()
            .style_attribute
            .as_ref()
            .map(|arc| arc.borrow_arc())
    }

    fn animation_rule(
        &self,
        _context: &SharedStyleContext,
    ) -> Option<Arc<Locked<PropertyDeclarationBlock>>> {
        None
    }

    fn transition_rule(
        &self,
        _context: &SharedStyleContext,
    ) -> Option<Arc<Locked<PropertyDeclarationBlock>>> {
        None
    }

    fn state(&self) -> ElementState {
        ElementState::empty()
    }

    fn has_part_attr(&self) -> bool {
        false
    }

    fn exports_any_part(&self) -> bool {
        false
    }

    fn id(&self) -> Option<&stylo_atoms::Atom> {
        self.element_data().id_attr.as_ref()
    }

    fn each_class<F>(&self, mut callback: F)
    where
        F: FnMut(&AtomIdent),
    {
        for class_atom in &self.element_data().class_list {
            callback(class_atom);
        }
    }

    fn each_custom_state<F>(&self, _callback: F)
    where
        F: FnMut(&AtomIdent),
    {
    }

    fn each_attr_name<F>(&self, mut callback: F)
    where
        F: FnMut(&style::LocalName),
    {
        for attr_name in &self.element_data().attr_local_names {
            callback(attr_name);
        }
    }

    fn has_dirty_descendants(&self) -> bool {
        false
    }

    fn has_snapshot(&self) -> bool {
        false
    }

    fn handled_snapshot(&self) -> bool {
        false
    }

    unsafe fn set_handled_snapshot(&self) {}
    unsafe fn set_dirty_descendants(&self) {}
    unsafe fn unset_dirty_descendants(&self) {}

    fn store_children_to_process(&self, _n: isize) {}

    fn did_process_child(&self) -> isize {
        0
    }

    unsafe fn ensure_data(&self) -> AtomicRefMut<'_, style::data::ElementData> {
        let slot = self.data_slot();
        let mut cell = slot.borrow_mut();
        if cell.is_none() {
            *cell = Some(ElementData::default());
        }
        AtomicRefMut::map(cell, |opt| opt.as_mut().unwrap())
    }

    unsafe fn clear_data(&self) {
        let slot = self.data_slot();
        *slot.borrow_mut() = None;
    }

    fn has_data(&self) -> bool {
        self.data_slot().borrow().is_some()
    }

    fn borrow_data(&self) -> Option<AtomicRef<'_, style::data::ElementData>> {
        let slot = self.data_slot();
        let cell = slot.borrow();
        if cell.is_some() {
            Some(AtomicRef::map(cell, |opt| opt.as_ref().unwrap()))
        } else {
            None
        }
    }

    fn mutate_data(&self) -> Option<AtomicRefMut<'_, style::data::ElementData>> {
        let slot = self.data_slot();
        let cell = slot.borrow_mut();
        if cell.is_some() {
            Some(AtomicRefMut::map(cell, |opt| opt.as_mut().unwrap()))
        } else {
            None
        }
    }

    fn skip_item_display_fixup(&self) -> bool {
        false
    }

    fn may_have_animations(&self) -> bool {
        false
    }

    fn has_animations(&self, _context: &SharedStyleContext) -> bool {
        false
    }

    fn has_css_animations(
        &self,
        _context: &SharedStyleContext,
        _pseudo_element: Option<PseudoElement>,
    ) -> bool {
        false
    }

    fn has_css_transitions(
        &self,
        _context: &SharedStyleContext,
        _pseudo_element: Option<PseudoElement>,
    ) -> bool {
        false
    }

    fn shadow_root(&self) -> Option<<Self::ConcreteNode as TNode>::ConcreteShadowRoot> {
        None
    }

    fn containing_shadow(&self) -> Option<<Self::ConcreteNode as TNode>::ConcreteShadowRoot> {
        None
    }

    fn lang_attr(&self) -> Option<SelectorAttrValue> {
        self.lang_attribute_value().map(SelectorAttrValue::from)
    }

    fn match_element_lang(
        &self,
        _override_lang: Option<Option<SelectorAttrValue>>,
        _value: &Lang,
    ) -> bool {
        false
    }

    fn is_html_document_body_element(&self) -> bool {
        false
    }

    fn synthesize_presentational_hints_for_legacy_attributes<V>(
        &self,
        _visited_handling: VisitedHandlingMode,
        _hints: &mut V,
    ) where
        V: Push<ApplicableDeclarationBlock>,
    {
    }

    fn synthesize_view_transition_dynamic_rules<V>(&self, _rules: &mut V)
    where
        V: Push<ApplicableDeclarationBlock>,
    {
    }

    fn local_name(&self) -> &<Impl as SelectorsParser>::BorrowedLocalName {
        self.element_data().style_local_name.borrow()
    }

    fn namespace(&self) -> &<Impl as SelectorsParser>::BorrowedNamespaceUrl {
        self.element_data().style_namespace.borrow()
    }

    fn query_container_size(&self, _display: &Display) -> Size2D<Option<Au>> {
        Size2D::new(None, None)
    }

    fn has_selector_flags(&self, _flags: ElementSelectorFlags) -> bool {
        false
    }

    fn relative_selector_search_direction(&self) -> ElementSelectorFlags {
        ElementSelectorFlags::empty()
    }
}

// ---------------------------------------------------------------------------
// selectors::Element
// ---------------------------------------------------------------------------

impl ::selectors::Element for HtmlElement {
    type Impl = Impl;

    fn opaque(&self) -> OpaqueElement {
        OpaqueElement::new(dom().node(self.0))
    }

    fn parent_element(&self) -> Option<Self> {
        self.as_node().parent_node()?.to_element()
    }

    fn parent_node_is_shadow_root(&self) -> bool {
        false
    }

    fn containing_shadow_host(&self) -> Option<Self> {
        None
    }

    fn is_pseudo_element(&self) -> bool {
        false
    }

    fn pseudo_element_originating_element(&self) -> Option<Self> {
        None
    }

    fn prev_sibling_element(&self) -> Option<Self> {
        self.as_node().prev_element_sibling()
    }

    fn next_sibling_element(&self) -> Option<Self> {
        self.as_node().next_element_sibling()
    }

    fn first_element_child(&self) -> Option<Self> {
        self.as_node().first_element_child()
    }

    fn has_local_name(&self, name: &<Impl as SelectorsParser>::BorrowedLocalName) -> bool {
        self.element_data().name.local.as_ref() == name.as_ref()
    }

    fn has_namespace(&self, ns: &<Impl as SelectorsParser>::BorrowedNamespaceUrl) -> bool {
        self.element_data().name.ns.as_ref() == ns.as_ref()
    }

    fn is_same_type(&self, other: &Self) -> bool {
        self.element_data().name == other.element_data().name
    }

    fn attr_matches(
        &self,
        ns: &NamespaceConstraint<&<Impl as SelectorsParser>::NamespaceUrl>,
        local_name: &<Impl as SelectorsParser>::LocalName,
        operation: &AttrSelectorOperation<&<Impl as SelectorsParser>::AttrValue>,
    ) -> bool {
        self.attr_matches_impl(ns, local_name, operation)
    }

    fn match_non_ts_pseudo_class(
        &self,
        _pc: &<Impl as SelectorsParser>::NonTSPseudoClass,
        _context: &mut MatchingContext<Self::Impl>,
    ) -> bool {
        false
    }

    fn match_pseudo_element(
        &self,
        _pe: &<Impl as SelectorsParser>::PseudoElement,
        _context: &mut MatchingContext<Self::Impl>,
    ) -> bool {
        false
    }

    fn is_link(&self) -> bool {
        false
    }

    fn has_id(
        &self,
        id: &<Impl as SelectorsParser>::Identifier,
        case_sensitivity: CaseSensitivity,
    ) -> bool {
        let Some(current) = self.id_string() else {
            return false;
        };
        case_sensitivity.eq(current.as_bytes(), atom_ident_str(id).as_bytes())
    }

    fn is_part(&self, _name: &AtomIdent) -> bool {
        false
    }

    fn imported_part(
        &self,
        _name: &<Impl as SelectorsParser>::Identifier,
    ) -> Option<<Impl as SelectorsParser>::Identifier> {
        None
    }

    fn has_class(
        &self,
        name: &<Impl as SelectorsParser>::Identifier,
        case_sensitivity: CaseSensitivity,
    ) -> bool {
        self.has_class_token(name, case_sensitivity)
    }

    fn is_html_element_in_html_document(&self) -> bool {
        self.is_html_element()
    }

    fn is_html_slot_element(&self) -> bool {
        false
    }

    fn is_empty(&self) -> bool {
        self.as_node().first_child().is_none()
    }

    fn is_root(&self) -> bool {
        self.as_node().parent_node().is_none()
    }

    fn apply_selector_flags(&self, _flags: ElementSelectorFlags) {}

    fn add_element_unique_hashes(&self, _filter: &mut BloomFilter) -> bool {
        false
    }

    fn has_custom_state(&self, _name: &<Impl as SelectorsParser>::Identifier) -> bool {
        false
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn namespace_matches(
    constraint: &NamespaceConstraint<&StyleNamespace>,
    attr_ns: &HtmlNamespace,
) -> bool {
    match constraint {
        NamespaceConstraint::Any => true,
        NamespaceConstraint::Specific(ns) => {
            let selector_ns_atom = ns.as_ref();
            let selector_ns: &str = selector_ns_atom;
            let dom_ns: &str = attr_ns;
            selector_ns == dom_ns
        }
    }
}

fn atom_ident_str(atom: &AtomIdent) -> &str {
    atom.as_ref()
}

fn sibling_pair(id: NodeId) -> (Option<HtmlNode>, Option<HtmlNode>) {
    let node = dom().node(id);
    let Some(parent) = node.parent else {
        return (None, None);
    };

    let siblings = &dom().node(parent).children;
    let idx = siblings
        .iter()
        .position(|child| *child == id)
        .expect("parent missing child");

    let prev = idx.checked_sub(1).map(|i| HtmlNode(siblings[i]));
    let next = siblings.get(idx + 1).copied().map(HtmlNode);

    (prev, next)
}
