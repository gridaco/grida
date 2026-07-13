//! Pure retained-source boundary for linked Grida XML programs.
//!
//! [`crate::grida_xml`] remains the exact Draft 0 `&str -> Document`
//! contract. This sibling owns source identity, dependency resolution,
//! Version 1 component linking, Version 2 typed scalar specialization, Version
//! 3 named static slot projection, Version 4 durable authored addresses, and
//! lowering back to that ordinary Draft 0 contract. It performs no filesystem
//! or resource I/O.

// Source errors are cold-path values that intentionally retain structured
// resolution, specialization, and projection provenance. Boxing every result
// would make the public boundary less direct to save only a small stack slot.
#![allow(clippy::result_large_err)]

use crate::grida_xml;
use crate::model::{Color, Document, NodeId, NodeKey, Payload, ShapeDesc};
use quick_xml::events::attributes::Attributes;
use quick_xml::events::{BytesDecl, BytesStart, Event};
use quick_xml::Reader;
use std::collections::{btree_map, BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::sync::Arc;

/// One host-defined immutable source snapshot.
///
/// `identity` and `base` are opaque to the language. The provider promises
/// that they are canonical within one link operation; the linker verifies
/// that repeated identities never change bytes or base.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceSnapshot {
    source: Arc<str>,
    identity: Arc<str>,
    base: Arc<str>,
}

impl SourceSnapshot {
    pub fn new(
        identity: impl Into<Arc<str>>,
        base: impl Into<Arc<str>>,
        source: impl Into<Arc<str>>,
    ) -> Self {
        Self {
            source: source.into(),
            identity: identity.into(),
            base: base.into(),
        }
    }

    pub fn source(&self) -> &str {
        &self.source
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    pub fn base(&self) -> &str {
        &self.base
    }
}

/// Host-owned dependency resolution. The language supplies only the decoded
/// authored location and the immutable snapshot containing that reference.
pub trait SourceProvider {
    fn resolve(
        &mut self,
        containing: &SourceSnapshot,
        location: &str,
    ) -> Result<SourceSnapshot, String>;
}

impl<F> SourceProvider for F
where
    F: FnMut(&SourceSnapshot, &str) -> Result<SourceSnapshot, String>,
{
    fn resolve(
        &mut self,
        containing: &SourceSnapshot,
        location: &str,
    ) -> Result<SourceSnapshot, String> {
        self(containing, location)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceVersion {
    Draft0,
    Draft1,
    Version2,
    Version3,
    Version4,
}

impl SourceVersion {
    pub fn as_str(self) -> &'static str {
        match self {
            SourceVersion::Draft0 => "0",
            SourceVersion::Draft1 => "1",
            SourceVersion::Version2 => "2",
            SourceVersion::Version3 => "3",
            SourceVersion::Version4 => "4",
        }
    }
}

fn has_scalar_specialization(version: SourceVersion) -> bool {
    matches!(
        version,
        SourceVersion::Version2 | SourceVersion::Version3 | SourceVersion::Version4
    )
}

fn has_static_slots(version: SourceVersion) -> bool {
    matches!(version, SourceVersion::Version3 | SourceVersion::Version4)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SourceSpan {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorPhase {
    Parse,
    Resolve,
    Link,
    Projection,
    Specialize,
    Materialize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthoredUseSite {
    pub source: String,
    pub span: SourceSpan,
    pub href: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceError {
    pub phase: ErrorPhase,
    pub source: String,
    /// Immediate local source location when the failing syntax owns one.
    pub span: Option<SourceSpan>,
    pub component: Option<String>,
    pub use_chain: Vec<UseSite>,
    /// The immediate authored edge when resolution failed before a canonical
    /// target identity could be formed.
    pub authored_use: Option<Box<AuthoredUseSite>>,
    /// Concrete value sources and lexical binding sinks present in the
    /// failing specialization or projected subtree. The Draft 0 parser
    /// currently exposes string-only errors, so this set is complete but not
    /// necessarily a minimal causal subset.
    pub specialization_sites: Vec<SpecializationErrorSite>,
    /// The innermost named projection edge implicated by a failure in
    /// caller-authored assigned content. `None` for definition-owned and
    /// ordinary source failures.
    pub slot_projection: Option<Box<SlotProjectionErrorSite>>,
    pub message: String,
}

impl SourceError {
    fn parse(source: &str, message: impl Into<String>) -> Self {
        Self {
            phase: ErrorPhase::Parse,
            source: source.into(),
            span: None,
            component: None,
            use_chain: vec![],
            authored_use: None,
            specialization_sites: vec![],
            slot_projection: None,
            message: message.into(),
        }
    }

    fn parse_at(source: &str, span: SourceSpan, message: impl Into<String>) -> Self {
        let mut error = Self::parse(source, message);
        error.span = Some(span);
        error
    }

    fn at_phase(
        phase: ErrorPhase,
        source: &str,
        component: Option<&str>,
        use_chain: &[UseSite],
        message: impl Into<String>,
    ) -> Self {
        Self {
            phase,
            source: source.into(),
            span: None,
            component: component.map(str::to_owned),
            use_chain: use_chain.to_vec(),
            authored_use: None,
            specialization_sites: vec![],
            slot_projection: None,
            message: message.into(),
        }
    }

    fn with_authored_use(mut self, authored_use: AuthoredUseSite) -> Self {
        self.authored_use = Some(Box::new(authored_use));
        self
    }

    fn with_specialization_sites(mut self, sites: Vec<SpecializationErrorSite>) -> Self {
        self.specialization_sites = sites;
        self
    }

    fn with_slot_projection(mut self, site: SlotProjectionErrorSite) -> Self {
        // Nested projections decorate the error from the inside out. Keep the
        // first (innermost) edge; the complete use chain still records every
        // enclosing component edge.
        if self.slot_projection.is_none() {
            self.slot_projection = Some(Box::new(site));
        }
        self
    }
}

impl std::fmt::Display for SourceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "grida_xml_source {:?} in {}", self.phase, self.source)?;
        if let Some(span) = self.span {
            write!(f, ":{}", span.start)?;
        }
        if let Some(component) = &self.component {
            write!(f, "#{component}")?;
        }
        if !self.use_chain.is_empty() {
            write!(f, " via")?;
            for site in &self.use_chain {
                write!(f, " {}:{} -> {}", site.source, site.span.start, site.href)?;
            }
        }
        if let Some(site) = &self.authored_use {
            write!(
                f,
                " at {}:{} -> {}",
                site.source, site.span.start, site.href
            )?;
        }
        if let Some(site) = &self.slot_projection {
            write!(
                f,
                " through slot {}#{}:{} at {}:{} received by {}:{} and assigned from {}:{}",
                site.definition.source,
                site.definition.component.id,
                site.definition.name,
                site.definition.source,
                site.definition.span.start,
                site.receiving_use.source,
                site.receiving_use.span.start,
                site.assignment.source,
                site.assignment.span.start,
            )?;
        }
        write!(f, ": {}", self.message)
    }
}

impl std::error::Error for SourceError {}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct ComponentIdentity {
    pub source: String,
    pub id: String,
}

impl std::fmt::Display for ComponentIdentity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}#{}", self.source, self.id)
    }
}

/// Lexical owner of one Version 4 render member or component occurrence.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum AuthoredOwner {
    Scene { source: String },
    Component(ComponentIdentity),
}

/// A component definition's render root is already named by its export and
/// therefore uses a structural identity. Every other Version 4 render member
/// carries an authored lowercase-kebab id.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum AuthoredMemberId {
    ComponentRoot,
    Id(String),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct AuthoredMember {
    pub owner: AuthoredOwner,
    pub id: AuthoredMemberId,
}

/// One durable authored `<use>` occurrence in an outer-to-inner path.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct AuthoredUseOccurrence {
    pub owner: AuthoredOwner,
    pub id: String,
}

/// Canonical address of one materialized ordinary node.
///
/// Source spans, names, element positions, and arena slots are deliberately
/// absent. `use_path` is ordered outermost to innermost.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct MaterializedNodeAddress {
    pub member: AuthoredMember,
    pub use_path: Vec<AuthoredUseOccurrence>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AddressLookupError {
    UnknownAddress { address: MaterializedNodeAddress },
    StaleAddress { address: MaterializedNodeAddress },
    UnknownNode { node: NodeKey },
    NodeHasNoDurableAddress { node: NodeKey },
}

impl std::fmt::Display for AddressLookupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AddressLookupError::UnknownAddress { address } => {
                write!(f, "unknown materialized address {address:?}")
            }
            AddressLookupError::StaleAddress { address } => {
                write!(
                    f,
                    "materialized address no longer names a live node: {address:?}"
                )
            }
            AddressLookupError::UnknownNode { node } => {
                write!(
                    f,
                    "node key is not live in this materialized program: {node:?}"
                )
            }
            AddressLookupError::NodeHasNoDurableAddress { node } => {
                write!(f, "node has no durable Version 4 address: {node:?}")
            }
        }
    }
}

impl std::error::Error for AddressLookupError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UseSite {
    pub source: String,
    pub span: SourceSpan,
    pub href: String,
    pub target: ComponentIdentity,
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeProvenance {
    pub source: String,
    pub span: SourceSpan,
    pub component: Option<ComponentIdentity>,
    pub use_chain: Vec<UseSite>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceManifestEntry {
    /// Opaque key written into the materialized model's `ResourceRef::Rid`.
    pub runtime_rid: String,
    pub source: String,
    pub base: String,
    pub authored: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScalarType {
    String,
    Boolean,
    Number,
    Color,
    Enum,
    Resource,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArgumentSite {
    pub source: String,
    pub span: SourceSpan,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValueOrigin {
    pub source: String,
    pub span: SourceSpan,
    /// The XML-decoded literal at its ultimate declaration/default or argument
    /// site, before Version 2–4 brace escapes are collapsed.
    pub authored: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValueSelection {
    CalleeDefault,
    Supplied { argument: ArgumentSite },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BindingTargetKind {
    Attribute { name: String },
    Text { segment: usize },
    Argument { use_href: String, argument: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BindingTarget {
    pub source: String,
    pub span: SourceSpan,
    pub element: String,
    pub kind: BindingTargetKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MaterializedBindingOccurrence {
    pub target: BindingTarget,
    /// Slot in the initial materialization snapshot. This provenance record
    /// is not a live runtime handle; after document mutation, compile through
    /// the Version 4 address map rather than reusing this bare slot.
    pub node: NodeId,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpecializationErrorSite {
    pub prop: String,
    pub selection: ValueSelection,
    pub ultimate_origin: ValueOrigin,
    pub binding: BindingTarget,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PropValueProvenance {
    pub name: String,
    pub scalar_type: ScalarType,
    pub value: String,
    pub selection: ValueSelection,
    pub ultimate_origin: ValueOrigin,
    /// Argument sites crossed from the ultimate literal to this component.
    pub forwarding: Vec<ArgumentSite>,
    /// Lexical scalar sinks belonging to this specialization.
    pub binding_targets: Vec<BindingTarget>,
    /// Concrete ordinary nodes produced for those lexical sinks.
    pub materialized_occurrences: Vec<MaterializedBindingOccurrence>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpecializationProvenance {
    pub component: ComponentIdentity,
    pub use_chain: Vec<UseSite>,
    pub props: Vec<PropValueProvenance>,
}

/// The one authored declaration that fixes a projected slot's painter and
/// coordinate-space position.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlotDefinitionSite {
    pub source: String,
    pub component: ComponentIdentity,
    pub span: SourceSpan,
    pub name: String,
}

/// One caller-authored direct render root assigned to a named slot.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlotAssignmentSite {
    pub source: String,
    pub component: Option<ComponentIdentity>,
    pub span: SourceSpan,
    pub name: String,
}

/// Structured source context for a failure reached through one named slot
/// projection. `receiving_use` identifies the exact component instance that
/// owns the projection; transitive failure edges remain in
/// `SourceError::use_chain`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlotProjectionErrorSite {
    pub definition: SlotDefinitionSite,
    pub receiving_use: UseSite,
    pub assignment: SlotAssignmentSite,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MaterializedSlotAssignment {
    pub site: SlotAssignmentSite,
    /// Slot in the initial materialization snapshot; see
    /// [`MaterializedBindingOccurrence::node`].
    pub node: NodeId,
}

/// One declared slot projected for one concrete component use. Empty
/// `assignments` is an observable empty projection, not an omitted record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlotProjectionProvenance {
    pub definition: SlotDefinitionSite,
    pub use_chain: Vec<UseSite>,
    pub assignments: Vec<MaterializedSlotAssignment>,
}

/// A parsed source unit retained exactly as supplied by its snapshot.
/// Structural details stay private until a second non-linker consumer earns a
/// stable public syntax-tree contract.
#[derive(Debug, Clone)]
pub struct SourceUnit {
    snapshot: SourceSnapshot,
    version: SourceVersion,
    components: Vec<ComponentSource>,
    scene: Option<Element>,
}

impl SourceUnit {
    pub fn snapshot(&self) -> &SourceSnapshot {
        &self.snapshot
    }

    pub fn version(&self) -> SourceVersion {
        self.version
    }

    pub fn component_ids(&self) -> impl ExactSizeIterator<Item = &str> {
        self.components
            .iter()
            .map(|component| component.id.as_str())
    }

    pub fn has_scene(&self) -> bool {
        self.scene.is_some()
    }

    fn component(&self, id: &str) -> Option<&ComponentSource> {
        self.components.iter().find(|component| component.id == id)
    }
}

#[derive(Debug, Clone)]
pub struct SourceProgram {
    entry: String,
    units: BTreeMap<String, SourceUnit>,
}

impl SourceProgram {
    pub fn entry(&self) -> &str {
        &self.entry
    }

    pub fn unit(&self, identity: &str) -> Option<&SourceUnit> {
        self.units.get(identity)
    }

    pub fn units(&self) -> impl ExactSizeIterator<Item = &SourceUnit> {
        self.units.values()
    }
}

#[derive(Debug)]
pub struct MaterializedProgram {
    pub document: Document,
    pub program: SourceProgram,
    /// Initial-materialization source snapshots keyed by arena slot. These
    /// records support diagnostics for that lowering pass; they are not live
    /// identities after mutation. Version 4 live lookup uses the private
    /// generation-stamped address maps exposed by [`Self::addresses`],
    /// [`Self::node_for_address`], and [`Self::address_for_node`].
    pub provenance: BTreeMap<NodeId, NodeProvenance>,
    pub resources: Vec<ResourceManifestEntry>,
    pub specializations: Vec<SpecializationProvenance>,
    pub slot_projections: Vec<SlotProjectionProvenance>,
    addresses_by_node: BTreeMap<NodeKey, MaterializedNodeAddress>,
    nodes_by_address: BTreeMap<MaterializedNodeAddress, NodeKey>,
}

/// Live durable addresses remaining in a materialized program.
///
/// `MaterializedProgram::document` is intentionally mutable. Removing or
/// replacing a materialized node leaves its retained source address stale;
/// this iterator omits that entry while [`MaterializedProgram::node_for_address`]
/// continues to report the precise stale-address failure for direct lookup.
pub struct LiveAddresses<'a> {
    document: &'a Document,
    inner: btree_map::Iter<'a, MaterializedNodeAddress, NodeKey>,
}

impl<'a> Iterator for LiveAddresses<'a> {
    type Item = (&'a MaterializedNodeAddress, NodeKey);

    fn next(&mut self) -> Option<Self::Item> {
        self.inner
            .by_ref()
            .find(|(_, node)| self.document.contains_key(**node))
            .map(|(address, node)| (address, *node))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let len = self.len();
        (len, Some(len))
    }
}

impl ExactSizeIterator for LiveAddresses<'_> {
    fn len(&self) -> usize {
        self.inner
            .clone()
            .filter(|(_, node)| self.document.contains_key(**node))
            .count()
    }
}

impl std::iter::FusedIterator for LiveAddresses<'_> {}

impl MaterializedProgram {
    /// Enumerate only addresses whose generation-stamped node remains live.
    pub fn addresses(&self) -> LiveAddresses<'_> {
        LiveAddresses {
            document: &self.document,
            inner: self.nodes_by_address.iter(),
        }
    }

    pub fn node_for_address(
        &self,
        address: &MaterializedNodeAddress,
    ) -> Result<NodeKey, AddressLookupError> {
        let node = self.nodes_by_address.get(address).copied().ok_or_else(|| {
            AddressLookupError::UnknownAddress {
                address: address.clone(),
            }
        })?;
        if !self.document.contains_key(node) {
            return Err(AddressLookupError::StaleAddress {
                address: address.clone(),
            });
        }
        Ok(node)
    }

    pub fn address_for_node(
        &self,
        node: NodeKey,
    ) -> Result<&MaterializedNodeAddress, AddressLookupError> {
        if !self.document.contains_key(node) {
            return Err(AddressLookupError::UnknownNode { node });
        }
        self.addresses_by_node
            .get(&node)
            .ok_or(AddressLookupError::NodeHasNoDurableAddress { node })
    }
}

#[derive(Debug, Clone)]
struct ComponentSource {
    id: String,
    element: Element,
    props: Vec<PropDeclaration>,
    slots: Vec<SlotDeclaration>,
}

impl ComponentSource {
    fn slot(&self, name: &str) -> Option<&SlotDeclaration> {
        self.slots.iter().find(|slot| slot.name == name)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SlotDeclaration {
    name: String,
    span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PropDeclaration {
    name: String,
    scalar_type: ScalarType,
    values: Vec<String>,
    default: Option<TypedLiteral>,
    span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TypedLiteral {
    value: String,
    origin: ValueOrigin,
}

#[derive(Debug, Clone)]
struct EffectiveValue {
    scalar_type: ScalarType,
    enum_values: Vec<String>,
    value: String,
    selection: ValueSelection,
    ultimate_origin: ValueOrigin,
    forwarding: Vec<ArgumentSite>,
}

type PropEnvironment = BTreeMap<String, EffectiveValue>;

#[derive(Debug, Clone)]
struct Attribute {
    name: String,
    value: String,
}

#[derive(Debug, Clone)]
enum Content {
    Element(Element),
    Text(String),
}

#[derive(Debug, Clone)]
struct Element {
    name: String,
    attributes: Vec<Attribute>,
    children: Vec<Content>,
    span: SourceSpan,
}

impl Element {
    fn attribute(&self, name: &str) -> Option<&str> {
        self.attributes
            .iter()
            .find(|attribute| attribute.name == name)
            .map(|attribute| attribute.value.as_str())
    }

    fn element_children(&self) -> impl Iterator<Item = &Element> {
        self.children.iter().filter_map(|child| match child {
            Content::Element(element) => Some(element),
            Content::Text(_) => None,
        })
    }

    fn has_non_whitespace_text(&self) -> bool {
        self.children.iter().any(|child| match child {
            Content::Text(text) => !text.trim().is_empty(),
            Content::Element(_) => false,
        })
    }
}

fn xml_name(raw: &[u8]) -> String {
    String::from_utf8_lossy(raw).into_owned()
}

fn attributes(el: &BytesStart<'_>) -> Result<Vec<Attribute>, String> {
    let tag = xml_name(el.name().as_ref());
    let mut result = Vec::new();
    let mut seen = BTreeSet::new();
    for attribute in el.attributes() {
        let attribute = attribute.map_err(|error| format!("attribute on <{tag}>: {error}"))?;
        let name = xml_name(attribute.key.as_ref());
        if !seen.insert(name.clone()) {
            return Err(format!("duplicate `{name}` on <{tag}>"));
        }
        let value = attribute
            .unescape_value()
            .map_err(|error| format!("attribute `{name}` on <{tag}>: {error}"))?
            .into_owned();
        result.push(Attribute { name, value });
    }
    Ok(result)
}

fn validate_declaration(declaration: &BytesDecl<'_>) -> Result<(), String> {
    let raw = std::str::from_utf8(declaration.as_ref())
        .map_err(|_| "XML declaration must be UTF-8".to_string())?;
    let mut fields = vec![];
    for attribute in Attributes::new(raw, 3) {
        let attribute = attribute.map_err(|error| format!("XML declaration: {error}"))?;
        fields.push((
            xml_name(attribute.key.as_ref()),
            attribute
                .unescape_value()
                .map_err(|error| format!("XML declaration: {error}"))?
                .into_owned(),
        ));
    }
    let valid = match fields.as_slice() {
        [(version_key, version)] => version_key == "version" && version == "1.0",
        [(version_key, version), (encoding_key, encoding)] => {
            version_key == "version"
                && version == "1.0"
                && encoding_key == "encoding"
                && encoding.eq_ignore_ascii_case("UTF-8")
        }
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err("XML declaration must be version=\"1.0\" with optional encoding=\"UTF-8\" only".into())
    }
}

fn parse_xml(source: &str) -> Result<Element, String> {
    let mut reader = Reader::from_str(source);
    reader.config_mut().trim_text(false);
    let mut stack: Vec<Element> = vec![];
    let mut root: Option<Element> = None;
    let mut declaration_seen = false;
    let mut content_before_declaration = false;

    loop {
        let start = reader.buffer_position() as usize;
        let event = reader
            .read_event()
            .map_err(|error| format!("xml: {error}"))?;
        let end = reader.buffer_position() as usize;
        match event {
            Event::Eof => break,
            Event::Start(el) => {
                let element = Element {
                    name: xml_name(el.name().as_ref()),
                    attributes: attributes(&el)?,
                    children: vec![],
                    span: SourceSpan { start, end },
                };
                stack.push(element);
                content_before_declaration = true;
            }
            Event::Empty(el) => {
                let element = Element {
                    name: xml_name(el.name().as_ref()),
                    attributes: attributes(&el)?,
                    children: vec![],
                    span: SourceSpan { start, end },
                };
                attach_element(&mut stack, &mut root, element)?;
                content_before_declaration = true;
            }
            Event::End(el) => {
                let name = xml_name(el.name().as_ref());
                let mut element = stack.pop().ok_or_else(|| format!("unbalanced </{name}>"))?;
                if element.name != name {
                    return Err(format!("mismatched </{name}> for <{}>", element.name));
                }
                element.span.end = end;
                attach_element(&mut stack, &mut root, element)?;
            }
            Event::Text(text) => {
                let value = text
                    .unescape()
                    .map_err(|error| format!("text: {error}"))?
                    .into_owned();
                let nonempty_before_declaration = !declaration_seen && !value.is_empty();
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(Content::Text(value));
                } else if !value.trim().is_empty() {
                    return Err("character content is not allowed outside <grida>".into());
                }
                if nonempty_before_declaration {
                    content_before_declaration = true;
                }
            }
            Event::Decl(declaration) => {
                if declaration_seen {
                    return Err("duplicate XML declaration".into());
                }
                if content_before_declaration || root.is_some() || !stack.is_empty() {
                    return Err("XML declaration must be the first document event".into());
                }
                validate_declaration(&declaration)?;
                declaration_seen = true;
            }
            Event::Comment(_) => {
                if !declaration_seen {
                    content_before_declaration = true;
                }
            }
            Event::CData(_) => {
                return Err("CDATA is not supported; use escaped text content".into())
            }
            Event::PI(_) | Event::DocType(_) => {
                return Err("processing instructions and doctypes are not supported".into())
            }
        }
    }
    if !stack.is_empty() {
        return Err("unclosed elements".into());
    }
    root.ok_or_else(|| "empty document".into())
}

fn attach_element(
    stack: &mut [Element],
    root: &mut Option<Element>,
    element: Element,
) -> Result<(), String> {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(Content::Element(element));
        return Ok(());
    }
    if root.replace(element).is_some() {
        return Err("multiple document elements".into());
    }
    Ok(())
}

fn valid_component_id(value: &str) -> bool {
    let mut segments = value.split('-');
    let Some(first) = segments.next() else {
        return false;
    };
    if first.is_empty()
        || !first.as_bytes()[0].is_ascii_lowercase()
        || !first
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    {
        return false;
    }
    segments.all(|segment| {
        !segment.is_empty()
            && segment
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    })
}

fn validate_version4_ids(
    source: &str,
    owner: &str,
    root: &Element,
    component_root: bool,
) -> Result<(), SourceError> {
    fn visit(
        source: &str,
        owner: &str,
        element: &Element,
        skip_current: bool,
        seen: &mut BTreeSet<String>,
    ) -> Result<(), SourceError> {
        let requires_id =
            !skip_current && (is_render_element(&element.name) || element.name == "use");
        if requires_id {
            let id = element.attribute("id").ok_or_else(|| {
                SourceError::parse_at(
                    source,
                    element.span,
                    format!(
                        "Version 4 <{}> requires a durable lowercase-kebab `id` in {owner}",
                        element.name
                    ),
                )
            })?;
            if !valid_component_id(id) {
                return Err(SourceError::parse_at(
                    source,
                    element.span,
                    format!(
                        "Version 4 id `{id}` on <{}> must be lowercase kebab-case",
                        element.name
                    ),
                ));
            }
            if !seen.insert(id.to_owned()) {
                return Err(SourceError::parse_at(
                    source,
                    element.span,
                    format!("duplicate Version 4 member/use id `{id}` in {owner}"),
                ));
            }
        }
        for child in element.element_children() {
            visit(source, owner, child, false, seen)?;
        }
        Ok(())
    }

    visit(source, owner, root, component_root, &mut BTreeSet::new())
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum BindingSegment {
    Literal(String),
    Binding(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum AttributeExpression {
    Literal(String),
    Binding(String),
}

fn scan_bindings(value: &str) -> Result<Vec<BindingSegment>, String> {
    let characters = value.chars().collect::<Vec<_>>();
    let mut segments = vec![];
    let mut literal = String::new();
    let mut index = 0;
    while index < characters.len() {
        match characters[index] {
            '{' if characters.get(index + 1) == Some(&'{') => {
                literal.push('{');
                index += 2;
            }
            '}' if characters.get(index + 1) == Some(&'}') => {
                literal.push('}');
                index += 2;
            }
            '{' => {
                if !literal.is_empty() {
                    segments.push(BindingSegment::Literal(std::mem::take(&mut literal)));
                }
                let start = index + 1;
                let Some(relative_end) = characters[start..]
                    .iter()
                    .position(|character| *character == '}')
                else {
                    return Err(
                        "unescaped `{`; write `{{` for a literal brace or `{prop-name}` for a binding"
                            .into(),
                    );
                };
                let end = start + relative_end;
                if characters[start..end].contains(&'{') {
                    return Err("nested `{` is not valid inside a prop binding".into());
                }
                let name = characters[start..end].iter().collect::<String>();
                if !valid_component_id(&name) {
                    return Err(format!(
                        "binding `{name}` must contain one lowercase kebab-case prop name"
                    ));
                }
                segments.push(BindingSegment::Binding(name));
                index = end + 1;
            }
            '}' => {
                return Err("unescaped `}`; write `}}` for a literal brace".into());
            }
            character => {
                literal.push(character);
                index += 1;
            }
        }
    }
    if !literal.is_empty() || segments.is_empty() {
        segments.push(BindingSegment::Literal(literal));
    }
    Ok(segments)
}

fn scan_attribute(value: &str) -> Result<AttributeExpression, String> {
    let segments = scan_bindings(value)?;
    if let [BindingSegment::Binding(name)] = segments.as_slice() {
        return Ok(AttributeExpression::Binding(name.clone()));
    }
    if segments
        .iter()
        .any(|segment| matches!(segment, BindingSegment::Binding(_)))
    {
        return Err(
            "attribute bindings must replace the complete value; interpolation is invalid".into(),
        );
    }
    Ok(AttributeExpression::Literal(
        segments
            .into_iter()
            .map(|segment| match segment {
                BindingSegment::Literal(value) => value,
                BindingSegment::Binding(_) => unreachable!(),
            })
            .collect(),
    ))
}

fn scalar_type(value: &str) -> Option<ScalarType> {
    match value {
        "string" => Some(ScalarType::String),
        "boolean" => Some(ScalarType::Boolean),
        "number" => Some(ScalarType::Number),
        "color" => Some(ScalarType::Color),
        "enum" => Some(ScalarType::Enum),
        "resource" => Some(ScalarType::Resource),
        _ => None,
    }
}

fn validate_typed_value(
    declaration: &PropDeclaration,
    value: &str,
    source: &str,
    span: SourceSpan,
) -> Result<TypedLiteral, String> {
    match declaration.scalar_type {
        ScalarType::String => {}
        ScalarType::Boolean if !matches!(value, "true" | "false") => {
            return Err(format!(
                "value `{value}` for boolean prop `{}` must be exactly `true` or `false`",
                declaration.name
            ));
        }
        ScalarType::Boolean => {}
        ScalarType::Number => {
            let number = value.trim().parse::<f64>().map_err(|_| {
                format!(
                    "value `{value}` for number prop `{}` is not a number",
                    declaration.name
                )
            })?;
            if !number.is_finite() {
                return Err(format!(
                    "value `{value}` for number prop `{}` must be finite",
                    declaration.name
                ));
            }
        }
        ScalarType::Color if Color::from_grida_hex(value).is_none() => {
            return Err(format!(
                "value `{value}` is not a valid color for prop `{}`",
                declaration.name
            ));
        }
        ScalarType::Color => {}
        ScalarType::Enum if !declaration.values.iter().any(|member| member == value) => {
            return Err(format!(
                "value `{value}` is not a member of enum prop `{}`; expected one of {}",
                declaration.name,
                declaration.values.join(", ")
            ));
        }
        ScalarType::Enum => {}
        ScalarType::Resource if value.trim().is_empty() => {
            return Err(format!(
                "resource prop `{}` requires a non-empty identifier",
                declaration.name
            ));
        }
        ScalarType::Resource => {}
    }
    Ok(TypedLiteral {
        value: value.into(),
        origin: ValueOrigin {
            source: source.into(),
            span,
            authored: value.into(),
        },
    })
}

fn parse_prop(source: &str, element: &Element) -> Result<PropDeclaration, SourceError> {
    if element.has_non_whitespace_text() || element.element_children().next().is_some() {
        return Err(SourceError::parse(source, "<prop> must be empty"));
    }
    let mut attributes = element
        .attributes
        .iter()
        .map(|attribute| (attribute.name.as_str(), attribute.value.as_str()))
        .collect::<BTreeMap<_, _>>();
    let name = attributes
        .remove("name")
        .ok_or_else(|| SourceError::parse(source, "<prop> requires `name`"))?;
    if !valid_component_id(name) {
        return Err(SourceError::parse(
            source,
            format!("prop name `{name}` must be lowercase kebab-case"),
        ));
    }
    if matches!(
        name,
        "id" | "href" | "name" | "x" | "y" | "flow" | "grow" | "align" | "hidden"
    ) {
        return Err(SourceError::parse(
            source,
            format!("prop name `{name}` is reserved by the use instance boundary"),
        ));
    }
    let type_name = attributes
        .remove("type")
        .ok_or_else(|| SourceError::parse(source, "<prop> requires `type`"))?;
    let scalar_type = scalar_type(type_name).ok_or_else(|| {
        SourceError::parse(
            source,
            format!("unknown prop type `{type_name}` for `{name}`"),
        )
    })?;
    let values = match (scalar_type, attributes.remove("values")) {
        (ScalarType::Enum, Some(values)) => {
            let members = values
                .split_whitespace()
                .map(str::to_owned)
                .collect::<Vec<_>>();
            if members.is_empty() {
                return Err(SourceError::parse(
                    source,
                    format!("enum prop `{name}` requires a non-empty values attribute"),
                ));
            }
            let mut unique = BTreeSet::new();
            for member in &members {
                if !valid_component_id(member) {
                    return Err(SourceError::parse(
                        source,
                        format!(
                            "enum member `{member}` for prop `{name}` must be lowercase kebab-case"
                        ),
                    ));
                }
                if !unique.insert(member.clone()) {
                    return Err(SourceError::parse(
                        source,
                        format!("duplicate enum member `{member}` for prop `{name}`"),
                    ));
                }
            }
            members
        }
        (ScalarType::Enum, None) => {
            return Err(SourceError::parse(
                source,
                format!("enum prop `{name}` requires a non-empty values attribute"),
            ));
        }
        (_, Some(_)) => {
            return Err(SourceError::parse(
                source,
                format!("`values` is valid only on enum prop `{name}`"),
            ));
        }
        (_, None) => vec![],
    };
    let default_source = attributes.remove("default").map(str::to_owned);
    if let Some(attribute) = attributes.keys().next() {
        return Err(SourceError::parse(
            source,
            format!("unknown attribute `{attribute}` on <prop>"),
        ));
    }
    let mut declaration = PropDeclaration {
        name: name.into(),
        scalar_type,
        values,
        default: None,
        span: element.span,
    };
    declaration.default = default_source
        .as_deref()
        .map(|value| validate_typed_value(&declaration, value, source, element.span))
        .transpose()
        .map_err(|message| SourceError::parse(source, message))?;
    Ok(declaration)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SinkCategory {
    String,
    Boolean,
    Number,
    Color,
    Keyword,
    Resource,
    NumberOrKeyword,
}

fn sink_category(tag: &str, attribute: &str) -> Option<SinkCategory> {
    let tag = if tag == "component" { "container" } else { tag };
    let render = matches!(
        tag,
        "container" | "rect" | "ellipse" | "line" | "path" | "text" | "group" | "lens"
    );
    match (tag, attribute) {
        (_, "name") if render || tag == "use" => Some(SinkCategory::String),
        (_, "flip-x" | "flip-y" | "hidden") if render => Some(SinkCategory::Boolean),
        ("use", "hidden") | ("container", "clips" | "wrap") => Some(SinkCategory::Boolean),
        ("solid" | "gradient" | "image", "visible") => Some(SinkCategory::Boolean),
        (_, "x" | "y") if render || tag == "use" => Some(SinkCategory::NumberOrKeyword),
        (_, "width" | "height") if render => Some(SinkCategory::NumberOrKeyword),
        ("stroke", "width") => Some(SinkCategory::Number),
        (_, "min-width" | "max-width" | "min-height" | "max-height" | "rotation" | "opacity")
            if render =>
        {
            Some(SinkCategory::Number)
        }
        ("container" | "rect", "corner-radius" | "corner-smoothing") => Some(SinkCategory::Number),
        ("use", "grow") => Some(SinkCategory::Number),
        (_, "grow") if render => Some(SinkCategory::Number),
        ("container", "gap" | "padding") => Some(SinkCategory::Number),
        ("text" | "tspan", "font-size" | "font-weight") => Some(SinkCategory::Number),
        ("solid" | "gradient" | "image" | "stop", "opacity") => Some(SinkCategory::Number),
        ("stop", "offset") | ("stroke", "miter-limit") => Some(SinkCategory::Number),
        (_, "fill") if render || tag == "tspan" => Some(SinkCategory::Color),
        ("solid" | "stop", "color") => Some(SinkCategory::Color),
        ("image", "src") => Some(SinkCategory::Resource),
        (_, "flow" | "align") if render || tag == "use" => Some(SinkCategory::Keyword),
        ("container", "layout" | "direction" | "main" | "cross") => Some(SinkCategory::Keyword),
        ("text" | "tspan", "font-style") | ("path", "fill-rule") => Some(SinkCategory::Keyword),
        ("gradient", "kind" | "tile-mode") | ("image", "fit") => Some(SinkCategory::Keyword),
        ("solid" | "gradient" | "image", "blend-mode") => Some(SinkCategory::Keyword),
        ("stroke", "align" | "cap" | "join") => Some(SinkCategory::Keyword),
        _ => None,
    }
}

fn keyword_valid(tag: &str, attribute: &str, value: &str) -> bool {
    let tag = if tag == "component" { "container" } else { tag };
    match (tag, attribute) {
        (_, "width" | "height") => value == "auto",
        (_, "x" | "y") => value == "center",
        (_, "flow") => matches!(value, "absolute" | "in"),
        ("stroke", "align") => matches!(value, "inside" | "center" | "outside"),
        (_, "align") => matches!(value, "start" | "center" | "end" | "stretch"),
        ("container", "layout") => matches!(value, "none" | "flex"),
        ("container", "direction") => matches!(value, "row" | "column"),
        ("container", "main") => matches!(
            value,
            "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly"
        ),
        ("container", "cross") => matches!(value, "start" | "center" | "end" | "stretch"),
        ("text" | "tspan", "font-style") => matches!(value, "normal" | "italic"),
        ("path", "fill-rule") => matches!(value, "nonzero" | "evenodd"),
        ("gradient", "kind") => matches!(value, "linear" | "radial" | "sweep" | "diamond"),
        ("image", "fit") => matches!(value, "contain" | "cover" | "fill" | "none"),
        ("gradient", "tile-mode") => matches!(value, "clamp" | "repeated" | "mirror" | "decal"),
        ("stroke", "cap") => matches!(value, "butt" | "round" | "square"),
        ("stroke", "join") => matches!(value, "miter" | "round" | "bevel"),
        ("solid" | "gradient" | "image", "blend-mode") => matches!(
            value,
            "normal"
                | "multiply"
                | "screen"
                | "overlay"
                | "darken"
                | "lighten"
                | "color-dodge"
                | "color-burn"
                | "hard-light"
                | "soft-light"
                | "difference"
                | "exclusion"
                | "hue"
                | "saturation"
                | "color"
                | "luminosity"
        ),
        _ => false,
    }
}

fn validate_binding_target(
    declaration: &PropDeclaration,
    tag: &str,
    attribute: &str,
) -> Result<(), String> {
    let Some(category) = sink_category(tag, attribute) else {
        return Err(format!(
            "prop `{}` cannot bind to non-scalar or unknown {} on <{}>",
            declaration.name, attribute, tag
        ));
    };
    let compatible = matches!(
        (declaration.scalar_type, category),
        (ScalarType::String, SinkCategory::String)
            | (ScalarType::Boolean, SinkCategory::Boolean)
            | (
                ScalarType::Number,
                SinkCategory::Number | SinkCategory::NumberOrKeyword
            )
            | (ScalarType::Color, SinkCategory::Color)
            | (
                ScalarType::Enum,
                SinkCategory::Keyword | SinkCategory::NumberOrKeyword
            )
            | (ScalarType::Resource, SinkCategory::Resource)
    );
    if !compatible {
        return Err(format!(
            "prop `{}` has type {:?} and cannot bind to {} on <{}>",
            declaration.name, declaration.scalar_type, attribute, tag
        ));
    }
    if declaration.scalar_type == ScalarType::Enum {
        if let Some(member) = declaration
            .values
            .iter()
            .find(|member| !keyword_valid(tag, attribute, member))
        {
            return Err(format!(
                "enum prop `{}` member `{member}` is not accepted by {} on <{}>",
                declaration.name, attribute, tag
            ));
        }
    }
    if let Some(default) = &declaration.default {
        validate_concrete_binding_value(declaration, tag, attribute, &default.value)
            .map_err(|message| format!("default for prop `{}` {message}", declaration.name))?;
    }
    Ok(())
}

fn validate_concrete_binding_value(
    declaration: &PropDeclaration,
    tag: &str,
    attribute: &str,
    value: &str,
) -> Result<(), String> {
    if declaration.scalar_type != ScalarType::Number {
        return Ok(());
    }
    let number = value
        .trim()
        .parse::<f32>()
        .ok()
        .filter(|value| value.is_finite())
        .ok_or_else(|| format!("does not fit the finite numeric target {attribute} on <{tag}>"))?;
    let invalid = |requirement: &str| {
        Err(format!(
            "value `{value}` is invalid for {attribute} on <{tag}>: {requirement}"
        ))
    };
    match (tag, attribute) {
        (_, "opacity") if !(0.0..=1.0).contains(&number) => {
            invalid("opacity must be between 0 and 1 inclusive")
        }
        ("container" | "rect" | "component", "corner-smoothing")
            if !(0.0..=1.0).contains(&number) =>
        {
            invalid("corner-smoothing must be between 0 and 1 inclusive")
        }
        ("stop", "offset") if !(0.0..=1.0).contains(&number) => {
            invalid("offset must be between 0 and 1 inclusive")
        }
        (_, "width" | "height" | "min-width" | "max-width" | "min-height" | "max-height")
        | ("container" | "rect" | "component", "corner-radius")
        | (_, "grow")
        | ("container" | "component", "gap" | "padding")
        | ("stroke", "width")
            if number < 0.0 =>
        {
            invalid("the value must be non-negative")
        }
        ("text" | "tspan", "font-size") | ("stroke", "miter-limit") if number <= 0.0 => {
            invalid("the value must be greater than zero")
        }
        ("text" | "tspan", "font-weight")
            if value
                .trim()
                .parse::<u32>()
                .ok()
                .filter(|value| (1..=1000).contains(value))
                .is_none() =>
        {
            invalid("font-weight must be an integer from 1 through 1000")
        }
        _ => Ok(()),
    }
}

/// Parse one immutable source unit without resolving any dependency.
pub fn parse_source(snapshot: SourceSnapshot) -> Result<SourceUnit, SourceError> {
    if snapshot.identity().is_empty() {
        return Err(SourceError::parse(
            "<unknown>",
            "canonical source identity must not be empty",
        ));
    }
    if snapshot.base().is_empty() {
        return Err(SourceError::parse(
            snapshot.identity(),
            "canonical source base must not be empty",
        ));
    }
    let root = parse_xml(snapshot.source())
        .map_err(|message| SourceError::parse(snapshot.identity(), message))?;
    if root.name != "grida" {
        return Err(SourceError::parse(
            snapshot.identity(),
            format!("document element must be <grida>, found <{}>", root.name),
        ));
    }
    if root.attributes.len() != 1 || root.attributes[0].name != "version" {
        return Err(SourceError::parse(
            snapshot.identity(),
            "<grida> requires exactly one `version` attribute",
        ));
    }
    let version = match root.attributes[0].value.as_str() {
        "0" => SourceVersion::Draft0,
        "1" => SourceVersion::Draft1,
        "2" => SourceVersion::Version2,
        "3" => SourceVersion::Version3,
        "4" => SourceVersion::Version4,
        version => {
            return Err(SourceError::parse(
                snapshot.identity(),
                format!("unsupported <grida> version `{version}`"),
            ))
        }
    };

    if version == SourceVersion::Draft0 {
        grida_xml::parse(snapshot.source())
            .map_err(|error| SourceError::parse(snapshot.identity(), error.to_string()))?;
        let scene = root.element_children().next().cloned();
        return Ok(SourceUnit {
            snapshot,
            version,
            components: vec![],
            scene,
        });
    }

    let mut components = vec![];
    let mut ids = BTreeSet::new();
    let mut scene = None;
    for child in &root.children {
        match child {
            Content::Text(text) if text.trim().is_empty() => {}
            Content::Text(_) => {
                return Err(SourceError::parse(
                    snapshot.identity(),
                    "character content is not allowed directly in <grida>",
                ))
            }
            Content::Element(element) if element.name == "component" => {
                if scene.is_some() {
                    return Err(SourceError::parse(
                        snapshot.identity(),
                        "<component> definitions must precede the scene root",
                    ));
                }
                let id = element.attribute("id").ok_or_else(|| {
                    SourceError::parse(snapshot.identity(), "<component> requires `id`")
                })?;
                if !valid_component_id(id) {
                    return Err(SourceError::parse(
                        snapshot.identity(),
                        format!("component id `{id}` must be lowercase kebab-case"),
                    ));
                }
                if !ids.insert(id.to_owned()) {
                    return Err(SourceError::parse(
                        snapshot.identity(),
                        format!("duplicate component `{id}` in the same source unit"),
                    ));
                }
                if version == SourceVersion::Version4 {
                    validate_version4_ids(
                        snapshot.identity(),
                        &format!("component {}#{id}", snapshot.identity()),
                        element,
                        true,
                    )?;
                }
                components.push(parse_component(snapshot.identity(), version, element)?);
            }
            Content::Element(element) if element.name == "container" => {
                if scene.replace(element.clone()).is_some() {
                    return Err(SourceError::parse(
                        snapshot.identity(),
                        "a source unit may contain at most one scene root",
                    ));
                }
                if version == SourceVersion::Version4 {
                    validate_version4_ids(
                        snapshot.identity(),
                        &format!("scene {}", snapshot.identity()),
                        element,
                        false,
                    )?;
                }
                validate_render_tree(snapshot.identity(), version, element, false, false)?;
            }
            Content::Element(element) => {
                return Err(SourceError::parse(
                    snapshot.identity(),
                    format!(
                        "Version {} <grida> may contain only leading <component> definitions and one optional <container>, found <{}>",
                        version.as_str(), element.name
                    ),
                ))
            }
        }
    }
    if components.is_empty() && scene.is_none() {
        return Err(SourceError::parse(
            snapshot.identity(),
            format!(
                "Version {} source exports and renders nothing",
                version.as_str()
            ),
        ));
    }

    let unit = SourceUnit {
        snapshot,
        version,
        components,
        scene,
    };
    validate_unit_as_draft0_templates(&unit)?;
    Ok(unit)
}

fn parse_component(
    source: &str,
    version: SourceVersion,
    component: &Element,
) -> Result<ComponentSource, SourceError> {
    let allowed = [
        "id",
        "name",
        "width",
        "height",
        "min-width",
        "max-width",
        "min-height",
        "max-height",
        "aspect-ratio",
        "corner-radius",
        "corner-smoothing",
        "rotation",
        "flip-x",
        "flip-y",
        "opacity",
        "hidden",
        "layout",
        "direction",
        "wrap",
        "main",
        "cross",
        "gap",
        "padding",
        "clips",
        "fill",
    ];
    for attribute in &component.attributes {
        if matches!(
            attribute.name.as_str(),
            "x" | "y" | "flow" | "grow" | "align"
        ) {
            return Err(SourceError::parse(
                source,
                format!(
                    "<component> cannot declare {}; place the instance with {} on <use>",
                    attribute.name, attribute.name
                ),
            ));
        }
        if !allowed.contains(&attribute.name.as_str()) {
            return Err(SourceError::parse(
                source,
                format!("unknown attribute `{}` on <component>", attribute.name),
            ));
        }
    }
    let id = component
        .attribute("id")
        .expect("caller validates component id")
        .to_owned();
    let mut props = vec![];
    let mut prop_names = BTreeSet::new();
    let mut body_started = false;
    for child in &component.children {
        match child {
            Content::Text(text) if text.trim().is_empty() => {}
            Content::Element(element) if element.name == "prop" => {
                if !has_scalar_specialization(version) {
                    return Err(SourceError::parse(
                        source,
                        "<prop> requires Grida XML Version 2, 3, or 4",
                    ));
                }
                if body_started {
                    return Err(SourceError::parse(
                        source,
                        "<prop> declarations must precede fill, stroke, and render children",
                    ));
                }
                let declaration = parse_prop(source, element)?;
                if !prop_names.insert(declaration.name.clone()) {
                    return Err(SourceError::parse(
                        source,
                        format!("duplicate prop `{}` in component `{id}`", declaration.name),
                    ));
                }
                props.push(declaration);
            }
            _ => body_started = true,
        }
    }
    validate_render_children(source, version, component, true)?;
    let slots = collect_slot_declarations(source, component)?;
    if has_scalar_specialization(version) {
        validate_component_bindings(source, component, &props)?;
    }
    Ok(ComponentSource {
        id,
        element: component.clone(),
        props,
        slots,
    })
}

fn validate_render_tree(
    source: &str,
    version: SourceVersion,
    element: &Element,
    inside_component: bool,
    assignment_root: bool,
) -> Result<(), SourceError> {
    if element.name == "component" {
        return Err(SourceError::parse(
            source,
            "<component> is valid only as a leading direct child of <grida>",
        ));
    }
    validate_slot_assignment_attribute(source, version, element, assignment_root)?;
    validate_render_children(source, version, element, inside_component)
}

fn accepts_render_children(element: &str) -> bool {
    matches!(
        element,
        "component" | "container" | "rect" | "ellipse" | "line" | "path" | "group" | "lens"
    )
}

fn validate_slot_declaration(
    source: &str,
    version: SourceVersion,
    parent: &Element,
    element: &Element,
    inside_component: bool,
) -> Result<(), SourceError> {
    if !has_static_slots(version) {
        return Err(SourceError::parse(
            source,
            "<slot> requires Grida XML Version 3 or 4",
        ));
    }
    if !inside_component {
        return Err(SourceError::parse(
            source,
            format!(
                "<slot> is valid only in a Version {} component render body",
                version.as_str()
            ),
        ));
    }
    if !accepts_render_children(&parent.name) {
        return Err(SourceError::parse(
            source,
            format!("<slot> is not valid inside <{}>", parent.name),
        ));
    }
    if element.has_non_whitespace_text() || element.element_children().next().is_some() {
        return Err(SourceError::parse(source, "<slot> must be empty"));
    }
    if element.attributes.len() != 1 || element.attribute("name").is_none() {
        return Err(SourceError::parse(source, "<slot> requires exactly `name`"));
    }
    let name = element.attribute("name").expect("checked");
    if !valid_component_id(name) {
        return Err(SourceError::parse(
            source,
            format!("slot name `{name}` must be lowercase kebab-case"),
        ));
    }
    Ok(())
}

fn validate_slot_assignment_attribute(
    source: &str,
    version: SourceVersion,
    element: &Element,
    assignment_root: bool,
) -> Result<(), SourceError> {
    let slot = element.attribute("slot");
    if !assignment_root {
        if slot.is_some() {
            return Err(SourceError::parse(
                source,
                format!(
                    "`slot` is valid only on a direct Version {} <use> render assignment",
                    if version == SourceVersion::Version4 {
                        "4"
                    } else {
                        "3"
                    }
                ),
            ));
        }
        return Ok(());
    }
    if !has_static_slots(version) {
        return Err(SourceError::parse(
            source,
            "render slot assignments require Grida XML Version 3 or 4",
        ));
    }
    let name = slot.ok_or_else(|| {
        SourceError::parse(
            source,
            format!(
                "each direct Version {} <use> render assignment requires `slot`",
                version.as_str()
            ),
        )
    })?;
    if !valid_component_id(name) {
        return Err(SourceError::parse(
            source,
            format!("slot assignment name `{name}` must be lowercase kebab-case"),
        ));
    }
    Ok(())
}

fn collect_slot_declarations(
    source: &str,
    component: &Element,
) -> Result<Vec<SlotDeclaration>, SourceError> {
    let mut slots = vec![];
    let mut seen = BTreeSet::new();
    fn collect(
        source: &str,
        component_id: &str,
        element: &Element,
        seen: &mut BTreeSet<String>,
        slots: &mut Vec<SlotDeclaration>,
    ) -> Result<(), SourceError> {
        for child in element.element_children() {
            if child.name == "slot" {
                let name = child.attribute("name").expect("slot validated").to_owned();
                if !seen.insert(name.clone()) {
                    return Err(SourceError::parse(
                        source,
                        format!("duplicate slot `{name}` in component `{component_id}`"),
                    ));
                }
                slots.push(SlotDeclaration {
                    name,
                    span: child.span,
                });
            } else {
                collect(source, component_id, child, seen, slots)?;
            }
        }
        Ok(())
    }
    collect(
        source,
        component.attribute("id").expect("component id validated"),
        component,
        &mut seen,
        &mut slots,
    )?;
    Ok(slots)
}

fn validate_render_children(
    source: &str,
    version: SourceVersion,
    element: &Element,
    inside_component: bool,
) -> Result<(), SourceError> {
    for child in element.element_children() {
        if child.name == "component" {
            return Err(SourceError::parse(
                source,
                "<component> cannot be nested in a render tree",
            ));
        }
        if child.name == "prop" && element.name == "component" && has_scalar_specialization(version)
        {
            continue;
        }
        if child.name == "slot" {
            validate_slot_declaration(source, version, element, child, inside_component)?;
            continue;
        }
        if child.name == "prop" || child.name == "arg" {
            return Err(SourceError::parse(
                source,
                format!("<{}> is not valid in this source position", child.name),
            ));
        }
        if child.name == "use" {
            if matches!(
                element.name.as_str(),
                "text" | "tspan" | "fill" | "stroke" | "gradient" | "solid" | "image" | "stop"
            ) {
                return Err(SourceError::parse(
                    source,
                    format!("<use> is not valid inside <{}>", element.name),
                ));
            }
            validate_use(source, version, child, inside_component, false)?;
        } else {
            validate_render_tree(source, version, child, inside_component, false)?;
        }
    }
    Ok(())
}

fn validate_use(
    source: &str,
    version: SourceVersion,
    element: &Element,
    inside_component: bool,
    assignment_root: bool,
) -> Result<(), SourceError> {
    validate_slot_assignment_attribute(source, version, element, assignment_root)?;
    let allowed = ["href", "name", "x", "y", "flow", "grow", "align", "hidden"];
    for attribute in &element.attributes {
        if attribute.name == "slot" && assignment_root {
            continue;
        }
        if attribute.name == "id" && version == SourceVersion::Version4 {
            continue;
        }
        if !allowed.contains(&attribute.name.as_str()) {
            return Err(SourceError::parse(
                source,
                format!("unknown attribute `{}` on <use>", attribute.name),
            ));
        }
    }
    let href = element
        .attribute("href")
        .ok_or_else(|| SourceError::parse(source, "<use> requires `href`"))?;
    parse_href(href).map_err(|message| SourceError::parse(source, message))?;
    match version {
        SourceVersion::Draft1 => {
            if !element.children.is_empty() {
                return Err(SourceError::parse(
                    source,
                    "static Version 1 <use> cannot contain character data or child elements",
                ));
            }
        }
        SourceVersion::Version2 => {
            let mut names = BTreeSet::new();
            for child in &element.children {
                match child {
                    Content::Text(text) if text.trim().is_empty() => {}
                    Content::Text(_) => {
                        return Err(SourceError::parse(
                            source,
                            "Version 2 <use> accepts only direct <arg> children",
                        ));
                    }
                    Content::Element(argument) if argument.name == "arg" => {
                        validate_arg(source, argument)?;
                        let name = argument.attribute("name").expect("arg name validated");
                        if !names.insert(name.to_owned()) {
                            return Err(SourceError::parse(
                                source,
                                format!("duplicate argument `{name}` on one <use>"),
                            ));
                        }
                        if !inside_component {
                            match scan_attribute(
                                argument.attribute("value").expect("arg value validated"),
                            )
                            .map_err(|message| SourceError::parse(source, message))?
                            {
                                AttributeExpression::Binding(name) => {
                                    return Err(SourceError::parse(
                                        source,
                                        format!(
                                            "`{{{name}}}` in top-level arg value cannot forward without an enclosing component scope"
                                        ),
                                    ));
                                }
                                AttributeExpression::Literal(_) => {}
                            }
                        }
                    }
                    Content::Element(_) => {
                        return Err(SourceError::parse(
                            source,
                            "Version 2 <use> accepts only direct <arg> children; render-valued inputs are not specified",
                        ));
                    }
                }
            }
        }
        SourceVersion::Version3 | SourceVersion::Version4 => {
            let mut names = BTreeSet::new();
            let mut assignments_started = false;
            for child in &element.children {
                match child {
                    Content::Text(text) if text.trim().is_empty() => {}
                    Content::Text(_) => {
                        return Err(SourceError::parse(
                            source,
                            format!(
                                "Version {} <use> accepts leading <arg> children followed by direct render assignments",
                                version.as_str()
                            ),
                        ));
                    }
                    Content::Element(argument)
                        if argument.name == "arg" && !assignments_started =>
                    {
                        validate_arg(source, argument)?;
                        let name = argument.attribute("name").expect("arg name validated");
                        if !names.insert(name.to_owned()) {
                            return Err(SourceError::parse(
                                source,
                                format!("duplicate argument `{name}` on one <use>"),
                            ));
                        }
                        if !inside_component {
                            match scan_attribute(
                                argument.attribute("value").expect("arg value validated"),
                            )
                            .map_err(|message| SourceError::parse(source, message))?
                            {
                                AttributeExpression::Binding(name) => {
                                    return Err(SourceError::parse(
                                        source,
                                        format!(
                                            "`{{{name}}}` in top-level arg value cannot forward without an enclosing component scope"
                                        ),
                                    ));
                                }
                                AttributeExpression::Literal(_) => {}
                            }
                        }
                    }
                    Content::Element(argument) if argument.name == "arg" => {
                        return Err(SourceError::parse(
                            source,
                            format!(
                                "Version {} <arg> children must precede every render assignment",
                                version.as_str()
                            ),
                        ));
                    }
                    Content::Element(assignment) => {
                        assignments_started = true;
                        if assignment.name == "use" {
                            validate_use(source, version, assignment, inside_component, true)?;
                        } else if is_render_element(&assignment.name) {
                            validate_render_tree(
                                source,
                                version,
                                assignment,
                                inside_component,
                                true,
                            )?;
                        } else {
                            return Err(SourceError::parse(
                                source,
                                format!(
                                    "Version {} <use> render assignments must be direct render roots, found <{}>",
                                    version.as_str(), assignment.name
                                ),
                            ));
                        }
                    }
                }
            }
        }
        SourceVersion::Draft0 => unreachable!("Draft 0 parser rejects use"),
    }
    for axis in ["x", "y"] {
        if let Some(value) = element.attribute(axis) {
            let value = if has_scalar_specialization(version) && inside_component {
                match scan_attribute(value)
                    .map_err(|message| SourceError::parse(source, message))?
                {
                    AttributeExpression::Binding(_) => continue,
                    AttributeExpression::Literal(value) => value,
                }
            } else {
                value.to_owned()
            };
            validate_use_axis(&value, axis)
                .map_err(|message| SourceError::parse(source, message))?;
        }
    }
    validate_literal_use_relationships(source, version, inside_component, element)?;
    Ok(())
}

fn validate_arg(source: &str, element: &Element) -> Result<(), SourceError> {
    if element.has_non_whitespace_text() || element.element_children().next().is_some() {
        return Err(SourceError::parse(source, "<arg> must be empty"));
    }
    if element.attributes.len() != 2
        || element.attribute("name").is_none()
        || element.attribute("value").is_none()
    {
        return Err(SourceError::parse(
            source,
            "<arg> requires exactly `name` and `value`",
        ));
    }
    let name = element.attribute("name").expect("checked");
    if !valid_component_id(name) {
        return Err(SourceError::parse(
            source,
            format!("argument name `{name}` must be lowercase kebab-case"),
        ));
    }
    Ok(())
}

fn validate_literal_use_relationships(
    source: &str,
    version: SourceVersion,
    inside_component: bool,
    element: &Element,
) -> Result<(), SourceError> {
    let literal = |attribute: &str| -> Result<Option<String>, SourceError> {
        let Some(value) = element.attribute(attribute) else {
            return Ok(None);
        };
        if has_scalar_specialization(version) && inside_component {
            return match scan_attribute(value)
                .map_err(|message| SourceError::parse(source, message))?
            {
                AttributeExpression::Binding(_) => Ok(None),
                AttributeExpression::Literal(value) => Ok(Some(value)),
            };
        }
        Ok(Some(value.into()))
    };
    if let Some(value) = literal("flow")? {
        if !matches!(value.as_str(), "absolute" | "in") {
            return Err(SourceError::parse(
                source,
                format!("bad flow `{value}` on <use>"),
            ));
        }
    }
    if let Some(value) = literal("grow")? {
        let number = value
            .trim()
            .parse::<f32>()
            .ok()
            .filter(|value| value.is_finite() && *value >= 0.0);
        if number.is_none() {
            return Err(SourceError::parse(
                source,
                format!("grow on <use> must be a non-negative finite number, found `{value}`"),
            ));
        }
    }
    if let Some(value) = literal("align")? {
        if !matches!(value.as_str(), "start" | "center" | "end" | "stretch") {
            return Err(SourceError::parse(
                source,
                format!("bad align `{value}` on <use>"),
            ));
        }
    }
    if let Some(value) = literal("hidden")? {
        if !matches!(value.as_str(), "true" | "false") {
            return Err(SourceError::parse(
                source,
                format!("hidden on <use> must be exactly `true` or `false`, found `{value}`"),
            ));
        }
    }
    Ok(())
}

fn validate_use_axis(value: &str, axis: &str) -> Result<(), String> {
    let parts: Vec<_> = value.split_whitespace().collect();
    let number = |value: &str| value.parse::<f32>().ok().filter(|value| value.is_finite());
    let valid = match parts.as_slice() {
        [value] => *value == "center" || number(value).is_some(),
        ["start" | "end" | "center", value] => number(value).is_some(),
        ["span", ..] => {
            return Err(format!(
                "{axis}=\"{value}\" is invalid on <use>; component definitions own authored size"
            ))
        }
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(format!("bad {axis} binding `{value}` on <use>"))
    }
}

fn validate_component_bindings(
    source: &str,
    component: &Element,
    props: &[PropDeclaration],
) -> Result<(), SourceError> {
    let declarations = props
        .iter()
        .map(|declaration| (declaration.name.as_str(), declaration))
        .collect::<BTreeMap<_, _>>();
    let mut consumed = BTreeSet::new();
    validate_binding_element(source, component, &declarations, &mut consumed)?;
    if let Some(unused) = props
        .iter()
        .find(|declaration| !consumed.contains(&declaration.name))
    {
        return Err(SourceError::parse(
            source,
            format!(
                "prop `{}` in component `{}` has no binding or forwarding site",
                unused.name,
                component.attribute("id").expect("component id validated")
            ),
        ));
    }
    Ok(())
}

fn declared_binding<'a>(
    source: &str,
    declarations: &'a BTreeMap<&str, &'a PropDeclaration>,
    name: &str,
) -> Result<&'a PropDeclaration, SourceError> {
    declarations.get(name).copied().ok_or_else(|| {
        SourceError::parse(
            source,
            format!(
                "binding `{name}` is not declared; available: {}",
                declarations.keys().copied().collect::<Vec<_>>().join(", ")
            ),
        )
    })
}

fn validate_binding_element(
    source: &str,
    element: &Element,
    declarations: &BTreeMap<&str, &PropDeclaration>,
    consumed: &mut BTreeSet<String>,
) -> Result<(), SourceError> {
    if matches!(element.name.as_str(), "prop" | "slot") {
        return Ok(());
    }
    if element.name == "use" {
        for attribute in &element.attributes {
            if matches!(attribute.name.as_str(), "href" | "slot") {
                continue;
            }
            if let AttributeExpression::Binding(name) = scan_attribute(&attribute.value)
                .map_err(|message| SourceError::parse(source, message))?
            {
                let declaration = declared_binding(source, declarations, &name)?;
                validate_binding_target(declaration, "use", &attribute.name)
                    .map_err(|message| SourceError::parse(source, message))?;
                consumed.insert(name);
            }
        }
        for argument in element
            .element_children()
            .filter(|element| element.name == "arg")
        {
            let value = argument.attribute("value").expect("argument validated");
            if let AttributeExpression::Binding(name) =
                scan_attribute(value).map_err(|message| SourceError::parse(source, message))?
            {
                declared_binding(source, declarations, &name)?;
                consumed.insert(name);
            }
        }
        for assignment in element
            .element_children()
            .filter(|element| element.name != "arg")
        {
            validate_binding_element(source, assignment, declarations, consumed)?;
        }
        return Ok(());
    }

    for attribute in &element.attributes {
        if attribute.name == "slot" {
            continue;
        }
        if element.name == "component" && attribute.name == "id" {
            continue;
        }
        if sink_category(&element.name, &attribute.name).is_some() {
            if let AttributeExpression::Binding(name) = scan_attribute(&attribute.value)
                .map_err(|message| SourceError::parse(source, message))?
            {
                let declaration = declared_binding(source, declarations, &name)?;
                validate_binding_target(declaration, &element.name, &attribute.name)
                    .map_err(|message| SourceError::parse(source, message))?;
                consumed.insert(name);
            }
        } else if attribute.value.starts_with('{') && attribute.value.ends_with('}') {
            if let Ok(AttributeExpression::Binding(name)) = scan_attribute(&attribute.value) {
                let declaration = declared_binding(source, declarations, &name)?;
                validate_binding_target(declaration, &element.name, &attribute.name)
                    .map_err(|message| SourceError::parse(source, message))?;
            }
        }
    }

    if matches!(element.name.as_str(), "text" | "tspan") {
        for child in &element.children {
            if let Content::Text(text) = child {
                for segment in
                    scan_bindings(text).map_err(|message| SourceError::parse(source, message))?
                {
                    if let BindingSegment::Binding(name) = segment {
                        let declaration = declared_binding(source, declarations, &name)?;
                        if declaration.scalar_type != ScalarType::String {
                            return Err(SourceError::parse(
                                source,
                                format!(
                                    "prop `{name}` has type {:?} and cannot bind to text content",
                                    declaration.scalar_type
                                ),
                            ));
                        }
                        consumed.insert(name);
                    }
                }
            }
        }
    }
    for child in element.element_children() {
        validate_binding_element(source, child, declarations, consumed)?;
    }
    Ok(())
}

fn parse_href(href: &str) -> Result<(&str, &str), String> {
    if href.chars().any(char::is_whitespace) || href.contains('\\') {
        return Err(format!(
            "component reference `{href}` must not contain whitespace or backslashes"
        ));
    }
    let mut parts = href.split('#');
    let location = parts.next().unwrap_or_default();
    let id = parts
        .next()
        .ok_or_else(|| format!("component reference requires an ID fragment; found `{href}`"))?;
    if parts.next().is_some() {
        return Err(format!(
            "component reference `{href}` contains more than one literal `#`"
        ));
    }
    if !valid_component_id(id) {
        return Err(format!(
            "component fragment `{id}` must be lowercase kebab-case"
        ));
    }
    Ok((location, id))
}

fn validate_unit_as_draft0_templates(unit: &SourceUnit) -> Result<(), SourceError> {
    if let Some(scene) = &unit.scene {
        validate_template(
            unit.snapshot.identity(),
            template_element(
                scene,
                false,
                unit.version == SourceVersion::Version4,
                &BTreeMap::new(),
            ),
        )?;
        validate_assignment_templates(
            unit.snapshot.identity(),
            unit.version,
            scene,
            &BTreeMap::new(),
        )?;
    }
    for component in &unit.components {
        validate_component_templates(unit, component)?;
    }
    Ok(())
}

fn validate_assignment_templates(
    source: &str,
    version: SourceVersion,
    element: &Element,
    witnesses: &BTreeMap<String, String>,
) -> Result<(), SourceError> {
    if element.name == "use" && has_static_slots(version) {
        for assignment in element
            .element_children()
            .filter(|element| element.name != "arg")
        {
            let mut projected = template_element(
                assignment,
                false,
                version == SourceVersion::Version4,
                witnesses,
            );
            projected.attributes.retain(|attribute| {
                !matches!(attribute.name.as_str(), "slot" | "flow" | "grow" | "align")
            });
            validate_template(
                source,
                Element {
                    name: "container".into(),
                    attributes: vec![],
                    children: vec![Content::Element(projected)],
                    span: assignment.span,
                },
            )?;
        }
    }
    for child in element.element_children() {
        if !matches!(child.name.as_str(), "prop" | "slot" | "arg") {
            validate_assignment_templates(source, version, child, witnesses)?;
        }
    }
    Ok(())
}

fn validate_template(source: &str, root: Element) -> Result<(), SourceError> {
    let mut xml = String::from("<grida version=\"0\">");
    write_element(&root, &mut xml);
    xml.push_str("</grida>");
    grida_xml::parse(&xml)
        .map(|_| ())
        .map_err(|error| SourceError::parse(source, error.to_string()))
}

const MAX_TEMPLATE_VALIDATION_STATES: usize = 4096;

fn prop_validation_witnesses(declaration: &PropDeclaration, component: &Element) -> Vec<String> {
    match declaration.scalar_type {
        ScalarType::String => vec!["x".into()],
        ScalarType::Boolean => vec!["false".into()],
        ScalarType::Number => {
            fn collect_numbers(element: &Element, out: &mut Vec<f64>) {
                for attribute in &element.attributes {
                    out.extend(
                        attribute
                            .value
                            .split(|character: char| {
                                character.is_whitespace() || matches!(character, ',' | '/')
                            })
                            .filter_map(|token| token.parse::<f64>().ok())
                            .filter(|value| value.is_finite()),
                    );
                }
                for child in element.element_children() {
                    collect_numbers(child, out);
                }
            }

            let mut numbers = vec![0.0, 1.0];
            collect_numbers(component, &mut numbers);
            numbers.sort_by(f64::total_cmp);
            numbers.dedup();
            let midpoints = numbers
                .windows(2)
                .map(|pair| pair[0] + (pair[1] - pair[0]) / 2.0)
                .filter(|value| value.is_finite())
                .collect::<Vec<_>>();
            numbers.extend(midpoints);
            numbers.sort_by(f64::total_cmp);
            numbers.dedup();
            numbers.into_iter().map(|value| value.to_string()).collect()
        }
        ScalarType::Color => vec!["#000000".into()],
        ScalarType::Resource => vec!["__resource__".into()],
        ScalarType::Enum => {
            let mut values = declaration.values.clone();
            values.sort_unstable();
            values
        }
    }
}

fn validate_component_templates(
    unit: &SourceUnit,
    component: &ComponentSource,
) -> Result<(), SourceError> {
    fn search(
        unit: &SourceUnit,
        component: &ComponentSource,
        index: usize,
        witnesses: &mut BTreeMap<String, String>,
        first_error: &mut Option<SourceError>,
        states: &mut usize,
        limit_exceeded: &mut bool,
    ) -> bool {
        if *limit_exceeded {
            return false;
        }
        if index == component.props.len() {
            if *states == MAX_TEMPLATE_VALIDATION_STATES {
                *limit_exceeded = true;
                return false;
            }
            *states += 1;
            let result = validate_template(
                unit.snapshot.identity(),
                template_element(
                    &component.element,
                    true,
                    unit.version == SourceVersion::Version4,
                    witnesses,
                ),
            )
            .and_then(|_| {
                validate_assignment_templates(
                    unit.snapshot.identity(),
                    unit.version,
                    &component.element,
                    witnesses,
                )
            });
            match result {
                Ok(()) => return true,
                Err(error) if first_error.is_none() => *first_error = Some(error),
                Err(_) => {}
            }
            return false;
        }

        let declaration = &component.props[index];
        for value in prop_validation_witnesses(declaration, &component.element) {
            witnesses.insert(declaration.name.clone(), value);
            if search(
                unit,
                component,
                index + 1,
                witnesses,
                first_error,
                states,
                limit_exceeded,
            ) {
                return true;
            }
            if *limit_exceeded {
                return false;
            }
        }
        witnesses.remove(&declaration.name);
        false
    }

    let mut witnesses = BTreeMap::new();
    let mut first_error = None;
    let mut states = 0;
    let mut limit_exceeded = false;
    if search(
        unit,
        component,
        0,
        &mut witnesses,
        &mut first_error,
        &mut states,
        &mut limit_exceeded,
    ) {
        Ok(())
    } else if limit_exceeded {
        Err(SourceError::parse(
            unit.snapshot.identity(),
            format!(
                "component `{}` exceeds the {MAX_TEMPLATE_VALIDATION_STATES}-state source-validation limit",
                component.id
            ),
        ))
    } else {
        Err(first_error.expect("every prop declaration has a validation witness"))
    }
}

fn template_scalar_value(attribute: &Attribute, witnesses: &BTreeMap<String, String>) -> String {
    match scan_attribute(&attribute.value)
        .expect("Version 2–4 bindings validated before template lowering")
    {
        AttributeExpression::Literal(value) => value,
        AttributeExpression::Binding(name) => witnesses
            .get(&name)
            .expect("component bindings reference witnessed props")
            .clone(),
    }
}

fn template_text(value: &str, witnesses: &BTreeMap<String, String>) -> String {
    scan_bindings(value)
        .expect("Version 2–4 text bindings validated before template lowering")
        .into_iter()
        .map(|segment| match segment {
            BindingSegment::Literal(value) => value,
            BindingSegment::Binding(name) => witnesses
                .get(&name)
                .expect("text bindings reference witnessed props")
                .clone(),
        })
        .collect()
}

fn template_element(
    element: &Element,
    component_root: bool,
    strip_durable_ids: bool,
    witnesses: &BTreeMap<String, String>,
) -> Element {
    if element.name == "use" {
        // Relationship applicability belongs to linked materialization. A
        // source template proves only that this position accepts one boxed
        // render child; literal domains were checked above.
        return Element {
            name: "container".into(),
            attributes: vec![],
            children: vec![],
            span: element.span,
        };
    }
    if element.name == "slot" {
        // A slot has no ordinary scene representation, but it does occupy a
        // render-child position in its definition. Keep that position visible
        // to Draft 0 template validation so a later fill/stroke is rejected
        // whether the concrete projection is empty or populated.
        return Element {
            name: "container".into(),
            attributes: vec![],
            children: vec![],
            span: element.span,
        };
    }
    let name = if component_root {
        "container".into()
    } else {
        element.name.clone()
    };
    let attributes = element
        .attributes
        .iter()
        .filter(|attribute| {
            attribute.name != "slot"
                && (!component_root || attribute.name != "id")
                && (!strip_durable_ids
                    || attribute.name != "id"
                    || !is_render_element(&element.name))
        })
        .map(|attribute| Attribute {
            name: attribute.name.clone(),
            value: if witnesses.is_empty()
                || sink_category(&element.name, &attribute.name).is_none()
            {
                attribute.value.clone()
            } else {
                template_scalar_value(attribute, witnesses)
            },
        })
        .collect();
    let children = element
        .children
        .iter()
        .filter_map(|child| match child {
            Content::Element(element) if element.name == "prop" => None,
            Content::Text(text)
                if !witnesses.is_empty() && matches!(element.name.as_str(), "text" | "tspan") =>
            {
                Some(Content::Text(template_text(text, witnesses)))
            }
            Content::Text(text) => Some(Content::Text(text.clone())),
            Content::Element(element) => Some(Content::Element(template_element(
                element,
                false,
                strip_durable_ids,
                witnesses,
            ))),
        })
        .collect();
    Element {
        name,
        attributes,
        children,
        span: element.span,
    }
}

#[derive(Debug, Clone)]
struct ExpandedElement {
    name: String,
    attributes: Vec<Attribute>,
    children: Vec<ExpandedContent>,
    provenance: NodeProvenance,
    address: Option<MaterializedNodeAddress>,
    bindings: Vec<ExpandedBinding>,
    slot_assignments: Vec<ExpandedSlotAssignment>,
}

#[derive(Debug, Clone)]
enum ExpandedContent {
    Element(Box<ExpandedElement>),
    Text(String),
}

#[derive(Debug, Clone)]
struct ExpandedBinding {
    specialization: usize,
    prop: String,
    target: BindingTarget,
    materialized: bool,
}

#[derive(Debug, Clone)]
struct ExpandedSlotAssignment {
    projection: usize,
    assignment: usize,
}

#[derive(Debug, Clone)]
struct ExpansionContext {
    source: String,
    version: SourceVersion,
    component: Option<ComponentIdentity>,
    environment: Option<PropEnvironment>,
    specialization: Option<usize>,
    slots: Option<Arc<SlotInstantiation>>,
}

#[derive(Debug, Clone)]
struct SlotInstantiation {
    component: ComponentIdentity,
    use_chain: Vec<UseSite>,
    assignments: BTreeMap<String, Vec<SlotAssignmentSource>>,
}

#[derive(Debug, Clone)]
struct SlotAssignmentSource {
    element: Element,
    context: ExpansionContext,
}

#[derive(Debug)]
struct PendingSlotProjection {
    definition: SlotDefinitionSite,
    use_chain: Vec<UseSite>,
    assignments: Vec<PendingSlotAssignment>,
}

#[derive(Debug)]
struct PendingSlotAssignment {
    site: SlotAssignmentSite,
    node: Option<NodeId>,
}

struct MaterializedScalar {
    value: String,
    origin: ValueOrigin,
    binding: Option<String>,
}

fn slot_projection_error_site(
    marker: &ExpandedSlotAssignment,
    projections: &[PendingSlotProjection],
) -> SlotProjectionErrorSite {
    let projection = projections
        .get(marker.projection)
        .expect("expanded slot marker references a retained projection");
    let assignment = projection
        .assignments
        .get(marker.assignment)
        .expect("expanded slot marker references a retained assignment");
    SlotProjectionErrorSite {
        definition: projection.definition.clone(),
        receiving_use: projection
            .use_chain
            .last()
            .expect("a slot projection belongs to one concrete component use")
            .clone(),
        assignment: assignment.site.clone(),
    }
}

fn validate_expanded_relationships(
    root: &ExpandedElement,
    projections: &[PendingSlotProjection],
    specializations: &[SpecializationProvenance],
) -> Result<(), SourceError> {
    fn attribute<'a>(element: &'a ExpandedElement, name: &str) -> Option<&'a str> {
        element
            .attributes
            .iter()
            .find(|attribute| attribute.name == name)
            .map(|attribute| attribute.value.as_str())
    }

    fn fail(
        element: &ExpandedElement,
        projection: Option<&ExpandedSlotAssignment>,
        projections: &[PendingSlotProjection],
        specializations: &[SpecializationProvenance],
        message: impl Into<String>,
    ) -> SourceError {
        let message = message.into();
        let specialization_sites = projected_specialization_sites(element, specializations);
        let error = SourceError::at_phase(
            if projection.is_some() {
                ErrorPhase::Projection
            } else if !specialization_sites.is_empty() {
                ErrorPhase::Specialize
            } else {
                ErrorPhase::Materialize
            },
            &element.provenance.source,
            element
                .provenance
                .component
                .as_ref()
                .map(|component| component.id.as_str()),
            &element.provenance.use_chain,
            message,
        );
        let error = if let Some(marker) = projection {
            error.with_slot_projection(slot_projection_error_site(marker, projections))
        } else {
            error
        };
        error.with_specialization_sites(specialization_sites)
    }

    fn visit<'a>(
        parent: &'a ExpandedElement,
        projections: &[PendingSlotProjection],
        specializations: &[SpecializationProvenance],
        inherited_projection: Option<&'a ExpandedSlotAssignment>,
    ) -> Result<(), SourceError> {
        let parent_is_flex = attribute(parent, "layout") == Some("flex");
        for child in expanded_render_children(parent) {
            // A directly projected root owns its relationship to this parent.
            // Descendants inherit that projection until a nested projection
            // provides the more specific edge.
            let projection = child.slot_assignments.last().or(inherited_projection);
            let flow = attribute(child, "flow");
            if flow.is_some() && !parent_is_flex {
                return Err(fail(
                    child,
                    projection,
                    projections,
                    specializations,
                    "flow is only valid on a child of a flex container",
                ));
            }
            let in_flow = parent_is_flex && flow != Some("absolute");
            if parent_is_flex
                && in_flow
                && (attribute(child, "x").is_some() || attribute(child, "y").is_some())
            {
                return Err(fail(
                    child,
                    projection,
                    projections,
                    specializations,
                    format!(
                        "x/y are not valid on in-flow <{}> under a flex container",
                        child.name
                    ),
                ));
            }
            if (!parent_is_flex || !in_flow)
                && (attribute(child, "grow").is_some() || attribute(child, "align").is_some())
            {
                return Err(fail(
                    child,
                    projection,
                    projections,
                    specializations,
                    format!(
                        "grow/align on <{}> require an in-flow child of a flex container",
                        child.name
                    ),
                ));
            }
            visit(child, projections, specializations, projection)?;

            // Source-local validation cannot know an assignment root's linked
            // parent, while callee specialization must not claim caller-owned
            // projected content. Once the full projection exists, validate
            // each direct assigned subtree through the ordinary Draft 0
            // contract before specialization and retain its exact slot edge.
            if let Some(marker) = child.slot_assignments.last() {
                let mut xml = if parent_is_flex {
                    String::from("<grida version=\"0\"><container layout=\"flex\">")
                } else {
                    String::from("<grida version=\"0\"><container>")
                };
                write_expanded_element(child, &mut xml);
                xml.push_str("</container></grida>");
                grida_xml::parse(&xml).map_err(|error| {
                    let specialization_sites =
                        projected_specialization_sites(child, specializations);
                    SourceError::at_phase(
                        if specialization_sites.is_empty() {
                            ErrorPhase::Materialize
                        } else {
                            ErrorPhase::Specialize
                        },
                        &child.provenance.source,
                        child
                            .provenance
                            .component
                            .as_ref()
                            .map(|component| component.id.as_str()),
                        &child.provenance.use_chain,
                        error.to_string(),
                    )
                    .with_slot_projection(slot_projection_error_site(marker, projections))
                    .with_specialization_sites(specialization_sites)
                })?;
            }
        }
        Ok(())
    }

    visit(
        root,
        projections,
        specializations,
        root.slot_assignments.last(),
    )
}

fn specialization_error_site(
    binding: &ExpandedBinding,
    specializations: &[SpecializationProvenance],
) -> Option<SpecializationErrorSite> {
    let prop = specializations
        .get(binding.specialization)?
        .props
        .iter()
        .find(|prop| prop.name == binding.prop)?;
    Some(SpecializationErrorSite {
        prop: prop.name.clone(),
        selection: prop.selection.clone(),
        ultimate_origin: prop.ultimate_origin.clone(),
        binding: binding.target.clone(),
    })
}

fn projected_specialization_sites(
    element: &ExpandedElement,
    specializations: &[SpecializationProvenance],
) -> Vec<SpecializationErrorSite> {
    fn collect<'a>(element: &'a ExpandedElement, out: &mut Vec<&'a ExpandedBinding>) {
        out.extend(&element.bindings);
        for child in &element.children {
            if let ExpandedContent::Element(child) = child {
                collect(child, out);
            }
        }
    }

    let mut bindings = vec![];
    collect(element, &mut bindings);
    bindings
        .into_iter()
        .filter_map(|binding| specialization_error_site(binding, specializations))
        .collect()
}

fn visit_expanded_bindings<'a>(
    element: &'a ExpandedElement,
    specialization: usize,
    out: &mut Vec<&'a ExpandedBinding>,
) {
    out.extend(
        element
            .bindings
            .iter()
            .filter(|binding| binding.specialization == specialization),
    );
    for child in &element.children {
        if let ExpandedContent::Element(child) = child {
            visit_expanded_bindings(child, specialization, out);
        }
    }
}

fn binding_target_label(target: &BindingTarget) -> String {
    match &target.kind {
        BindingTargetKind::Attribute { name } => {
            format!("{name} on <{}>", target.element)
        }
        BindingTargetKind::Text { segment } => {
            format!("text segment {segment} in <{}>", target.element)
        }
        BindingTargetKind::Argument { use_href, argument } => {
            format!("argument `{argument}` on <use href=\"{use_href}\">")
        }
    }
}

fn validate_forwarding(source: &EffectiveValue, target: &PropDeclaration) -> Result<(), String> {
    if source.scalar_type != target.scalar_type {
        return Err(format!(
            "cannot forward {:?} value to {:?} prop `{}`",
            source.scalar_type, target.scalar_type, target.name
        ));
    }
    if source.scalar_type == ScalarType::Enum {
        if let Some(member) = source
            .enum_values
            .iter()
            .find(|member| !target.values.contains(member))
        {
            return Err(format!(
                "enum prop cannot forward to `{}`; source member `{member}` is not accepted by the target",
                target.name
            ));
        }
    }
    Ok(())
}

struct Linker<'a, P> {
    provider: &'a mut P,
    entry: String,
    units: BTreeMap<String, SourceUnit>,
    resolutions: BTreeMap<(String, String), String>,
    component_stack: Vec<ComponentIdentity>,
    use_chain: Vec<UseSite>,
    durable_use_path: Vec<Option<AuthoredUseOccurrence>>,
    resources: Vec<ResourceManifestEntry>,
    resource_keys: BTreeMap<(String, String), String>,
    specializations: Vec<SpecializationProvenance>,
    slot_projections: Vec<PendingSlotProjection>,
}

impl<'a, P: SourceProvider> Linker<'a, P> {
    fn new(entry: SourceUnit, provider: &'a mut P) -> Self {
        let identity = entry.snapshot.identity().to_owned();
        let mut units = BTreeMap::new();
        units.insert(identity.clone(), entry);
        Self {
            provider,
            entry: identity,
            units,
            resolutions: BTreeMap::new(),
            component_stack: vec![],
            use_chain: vec![],
            durable_use_path: vec![],
            resources: vec![],
            resource_keys: BTreeMap::new(),
            specializations: vec![],
            slot_projections: vec![],
        }
    }

    fn materialize(mut self) -> Result<MaterializedProgram, SourceError> {
        let entry = self.units.get(&self.entry).expect("entry inserted");
        let scene = entry.scene.clone().ok_or_else(|| {
            SourceError::at_phase(
                ErrorPhase::Link,
                &self.entry,
                None,
                &[],
                "render entry has no scene root",
            )
        })?;
        let version = entry.version;
        let root = self.expand_element(
            &ExpansionContext {
                source: self.entry.clone(),
                version,
                component: None,
                environment: None,
                specialization: None,
                slots: None,
            },
            &scene,
        )?;
        validate_expanded_relationships(&root, &self.slot_projections, &self.specializations)?;

        let mut xml = String::from("<grida version=\"0\">");
        write_expanded_element(&root, &mut xml);
        xml.push_str("</grida>");
        let document = grida_xml::parse(&xml).map_err(|error| {
            SourceError::at_phase(
                ErrorPhase::Materialize,
                &self.entry,
                None,
                &self.use_chain,
                error.to_string(),
            )
        })?;

        let authored_roots = &document.get(document.root).children;
        if authored_roots.len() != 1 {
            return Err(SourceError::at_phase(
                ErrorPhase::Materialize,
                &self.entry,
                None,
                &[],
                "ordinary document did not retain exactly one authored render root",
            ));
        }
        let mut provenance = BTreeMap::new();
        let mut addresses_by_node = BTreeMap::new();
        let mut nodes_by_address = BTreeMap::new();
        attach_node_provenance(
            &root,
            &document,
            authored_roots[0],
            &mut provenance,
            &mut addresses_by_node,
            &mut nodes_by_address,
            &mut self.specializations,
            &mut self.slot_projections,
        )
        .map_err(|message| {
            SourceError::at_phase(ErrorPhase::Materialize, &self.entry, None, &[], message)
        })?;
        if provenance.len() + 1 != document.len() {
            return Err(SourceError::at_phase(
                ErrorPhase::Materialize,
                &self.entry,
                None,
                &[],
                "materialized source contains nodes unreachable through the provenance tree",
            ));
        }
        if version == SourceVersion::Version4 && addresses_by_node.len() + 1 != document.len() {
            return Err(SourceError::at_phase(
                ErrorPhase::Materialize,
                &self.entry,
                None,
                &[],
                "Version 4 materialization requires one durable address for every ordinary node except the implicit document root",
            ));
        }
        let slot_projections = self
            .slot_projections
            .into_iter()
            .map(|projection| {
                let assignments = projection
                    .assignments
                    .into_iter()
                    .map(|assignment| {
                        assignment
                            .node
                            .map(|node| MaterializedSlotAssignment {
                                site: assignment.site,
                                node,
                            })
                            .ok_or_else(|| {
                                SourceError::at_phase(
                                    ErrorPhase::Materialize,
                                    &self.entry,
                                    Some(&projection.definition.component.id),
                                    &projection.use_chain,
                                    format!(
                                        "slot `{}` assignment did not produce one ordinary root",
                                        projection.definition.name
                                    ),
                                )
                            })
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(SlotProjectionProvenance {
                    definition: projection.definition,
                    use_chain: projection.use_chain,
                    assignments,
                })
            })
            .collect::<Result<Vec<_>, SourceError>>()?;
        Ok(MaterializedProgram {
            document,
            program: SourceProgram {
                entry: self.entry,
                units: self.units,
            },
            provenance,
            resources: self.resources,
            specializations: self.specializations,
            slot_projections,
            addresses_by_node,
            nodes_by_address,
        })
    }

    fn durable_address(
        &self,
        context: &ExpansionContext,
        element: &Element,
    ) -> Option<MaterializedNodeAddress> {
        if context.version != SourceVersion::Version4
            || !(is_render_element(&element.name) || element.name == "component")
        {
            return None;
        }
        let owner = context
            .component
            .clone()
            .map(AuthoredOwner::Component)
            .unwrap_or_else(|| AuthoredOwner::Scene {
                source: context.source.clone(),
            });
        let id = if element.name == "component" {
            AuthoredMemberId::ComponentRoot
        } else {
            AuthoredMemberId::Id(
                element
                    .attribute("id")
                    .expect("Version 4 render ids validated")
                    .to_owned(),
            )
        };
        let use_path = self
            .durable_use_path
            .iter()
            .cloned()
            .collect::<Option<Vec<_>>>()?;
        Some(MaterializedNodeAddress {
            member: AuthoredMember { owner, id },
            use_path,
        })
    }

    fn expand_element(
        &mut self,
        context: &ExpansionContext,
        element: &Element,
    ) -> Result<ExpandedElement, SourceError> {
        debug_assert_ne!(element.name, "use");
        let provenance = NodeProvenance {
            source: context.source.clone(),
            span: element.span,
            component: context.component.clone(),
            use_chain: self.use_chain.clone(),
        };
        let address = self.durable_address(context, element);
        let mut attributes = Vec::with_capacity(element.attributes.len());
        let mut bindings = vec![];
        for attribute in &element.attributes {
            if attribute.name == "slot" {
                continue;
            }
            if attribute.name == "id"
                && context.version == SourceVersion::Version4
                && (is_render_element(&element.name) || element.name == "component")
            {
                continue;
            }
            let mut scalar = self.materialize_attribute(
                &context.source,
                context.version,
                element,
                attribute,
                context.environment.as_ref(),
            )?;
            if element.name == "image" && attribute.name == "src" {
                scalar.value = self.resource_rid(&scalar.origin.source, &scalar.value)?;
            }
            if let (Some(specialization), Some(prop)) = (context.specialization, scalar.binding) {
                bindings.push(ExpandedBinding {
                    specialization,
                    prop,
                    target: BindingTarget {
                        source: context.source.clone(),
                        span: element.span,
                        element: element.name.clone(),
                        kind: BindingTargetKind::Attribute {
                            name: attribute.name.clone(),
                        },
                    },
                    materialized: true,
                });
            }
            attributes.push(Attribute {
                name: attribute.name.clone(),
                value: scalar.value,
            });
        }
        let mut children = vec![];
        for child in &element.children {
            match child {
                Content::Text(text) => {
                    let (text, text_bindings) = self.materialize_text(
                        &context.source,
                        context.version,
                        element,
                        text,
                        context.environment.as_ref(),
                    )?;
                    if let Some(specialization) = context.specialization {
                        bindings.extend(text_bindings.into_iter().map(|(segment, prop)| {
                            ExpandedBinding {
                                specialization,
                                prop,
                                target: BindingTarget {
                                    source: context.source.clone(),
                                    span: element.span,
                                    element: element.name.clone(),
                                    kind: BindingTargetKind::Text { segment },
                                },
                                materialized: true,
                            }
                        }));
                    }
                    children.push(ExpandedContent::Text(text));
                }
                Content::Element(child) if child.name == "prop" => {}
                Content::Element(child) if child.name == "slot" => {
                    children.extend(
                        self.expand_slot(context, child)?
                            .into_iter()
                            .map(Box::new)
                            .map(ExpandedContent::Element),
                    );
                }
                Content::Element(child) if child.name == "use" => {
                    children.push(ExpandedContent::Element(Box::new(
                        self.expand_use(context, child)?,
                    )));
                }
                Content::Element(child) => children.push(ExpandedContent::Element(Box::new(
                    self.expand_element(context, child)?,
                ))),
            }
        }
        Ok(ExpandedElement {
            name: element.name.clone(),
            attributes,
            children,
            provenance,
            address,
            bindings,
            slot_assignments: vec![],
        })
    }

    fn expand_slot(
        &mut self,
        context: &ExpansionContext,
        slot: &Element,
    ) -> Result<Vec<ExpandedElement>, SourceError> {
        let name = slot.attribute("name").expect("slot declaration validated");
        let instantiation = context.slots.as_ref().ok_or_else(|| {
            SourceError::at_phase(
                ErrorPhase::Link,
                &context.source,
                context
                    .component
                    .as_ref()
                    .map(|component| component.id.as_str()),
                &self.use_chain,
                format!(
                    "slot `{name}` has no containing Version {} component use",
                    context.version.as_str()
                ),
            )
        })?;
        if context.component.as_ref() != Some(&instantiation.component) {
            return Err(SourceError::at_phase(
                ErrorPhase::Link,
                &context.source,
                context
                    .component
                    .as_ref()
                    .map(|component| component.id.as_str()),
                &self.use_chain,
                format!("slot `{name}` escaped its declaring component instance"),
            ));
        }
        let assignments = instantiation
            .assignments
            .get(name)
            .cloned()
            .unwrap_or_default();
        let projection = self.slot_projections.len();
        self.slot_projections.push(PendingSlotProjection {
            definition: SlotDefinitionSite {
                source: context.source.clone(),
                component: instantiation.component.clone(),
                span: slot.span,
                name: name.into(),
            },
            use_chain: instantiation.use_chain.clone(),
            assignments: assignments
                .iter()
                .map(|assignment| PendingSlotAssignment {
                    site: SlotAssignmentSite {
                        source: assignment.context.source.clone(),
                        component: assignment.context.component.clone(),
                        span: assignment.element.span,
                        name: name.into(),
                    },
                    node: None,
                })
                .collect(),
        });

        let owner = instantiation.component.clone();
        let mut expanded = Vec::with_capacity(assignments.len());
        for (assignment_index, assignment) in assignments.into_iter().enumerate() {
            let marker = ExpandedSlotAssignment {
                projection,
                assignment: assignment_index,
            };
            let error_site = slot_projection_error_site(&marker, &self.slot_projections);
            if self.component_stack.last() != Some(&owner) {
                return Err(SourceError::at_phase(
                    ErrorPhase::Link,
                    &context.source,
                    Some(&owner.id),
                    &self.use_chain,
                    format!("slot `{name}` projection lost its caller/callee expansion boundary"),
                ));
            }
            // Assigned render roots are caller-owned source. Remove only the
            // active slot-owning callee while expanding them: caller lexical
            // components remain cycle guards, and the callee's use stays in
            // `use_chain` for provenance and diagnostics.
            let current_callee = self.component_stack.pop().expect("checked");
            let result = if assignment.element.name == "use" {
                self.expand_use(&assignment.context, &assignment.element)
            } else {
                self.expand_element(&assignment.context, &assignment.element)
            };
            self.component_stack.push(current_callee);
            let mut root = result.map_err(|error| error.with_slot_projection(error_site))?;
            root.slot_assignments.push(marker);
            expanded.push(root);
        }
        Ok(expanded)
    }

    fn expand_use(
        &mut self,
        caller: &ExpansionContext,
        use_element: &Element,
    ) -> Result<ExpandedElement, SourceError> {
        let source = caller.source.as_str();
        let caller_version = caller.version;
        let outer_environment = caller.environment.as_ref();
        let href = use_element
            .attribute("href")
            .expect("source validation requires href");
        let (location, component_id) = parse_href(href).expect("source validation checks href");
        let authored_use = AuthoredUseSite {
            source: source.into(),
            span: use_element.span,
            href: href.into(),
            name: use_element.attribute("name").map(str::to_owned),
        };
        let target_source = self
            .resolve_source(source, location)
            .map_err(|error| error.with_authored_use(authored_use.clone()))?;
        let target_version = self
            .units
            .get(&target_source)
            .expect("resolved unit inserted")
            .version;
        let compatible = matches!(
            (caller_version, target_version),
            (SourceVersion::Draft1, SourceVersion::Draft1)
                | (
                    SourceVersion::Version2,
                    SourceVersion::Draft1 | SourceVersion::Version2
                )
                | (
                    SourceVersion::Version3,
                    SourceVersion::Draft1 | SourceVersion::Version2 | SourceVersion::Version3
                )
                | (SourceVersion::Version4, SourceVersion::Version4)
        );
        if !compatible {
            return Err(SourceError::at_phase(
                ErrorPhase::Link,
                source,
                None,
                &self.use_chain,
                format!(
                    "Version {} source cannot link Version {} component source",
                    caller_version.as_str(),
                    target_version.as_str()
                ),
            )
            .with_authored_use(authored_use));
        }
        let target = ComponentIdentity {
            source: target_source.clone(),
            id: component_id.into(),
        };
        let name = use_element
            .attribute("name")
            .map(|value| {
                self.materialize_use_value(
                    source,
                    caller_version,
                    "name",
                    value,
                    use_element.span,
                    outer_environment,
                )
                .map(|value| value.value)
            })
            .transpose()?;
        let site = UseSite {
            source: source.into(),
            span: use_element.span,
            href: href.into(),
            target: target.clone(),
            name,
        };
        let durable_use =
            (caller_version == SourceVersion::Version4).then(|| AuthoredUseOccurrence {
                owner: caller
                    .component
                    .clone()
                    .map(AuthoredOwner::Component)
                    .unwrap_or_else(|| AuthoredOwner::Scene {
                        source: caller.source.clone(),
                    }),
                id: use_element
                    .attribute("id")
                    .expect("Version 4 use ids validated")
                    .to_owned(),
            });
        let mut current_chain = self.use_chain.clone();
        current_chain.push(site.clone());
        if let Some(index) = self.component_stack.iter().position(|item| item == &target) {
            let mut cycle = self.component_stack[index..]
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>();
            cycle.push(target.to_string());
            return Err(SourceError::at_phase(
                ErrorPhase::Link,
                source,
                Some(component_id),
                &current_chain,
                format!("component cycle: {}", cycle.join(" -> ")),
            ));
        }
        let definition = self
            .units
            .get(&target_source)
            .and_then(|unit| unit.component(component_id))
            .cloned()
            .ok_or_else(|| {
                let available = self
                    .units
                    .get(&target_source)
                    .expect("target source loaded")
                    .component_ids()
                    .collect::<Vec<_>>()
                    .join(", ");
                SourceError::at_phase(
                    ErrorPhase::Link,
                    source,
                    Some(component_id),
                    &current_chain,
                    format!(
                        "component `{component_id}` is not defined in {target_source}; available: {available}"
                    ),
                )
            })?;
        let assignment_elements = use_element
            .element_children()
            .filter(|element| element.name != "arg")
            .cloned()
            .collect::<Vec<_>>();
        if !assignment_elements.is_empty() && !has_static_slots(target_version) {
            let required_target = if caller_version == SourceVersion::Version4 {
                "Version 4"
            } else {
                "Version 3"
            };
            return Err(SourceError::at_phase(
                ErrorPhase::Link,
                source,
                Some(component_id),
                &current_chain,
                format!(
                    "render slot assignments require a {required_target} target; `{component_id}` is Version {}",
                    target_version.as_str()
                ),
            ));
        }
        let mut slot_assignments: BTreeMap<String, Vec<SlotAssignmentSource>> = BTreeMap::new();
        for assignment in assignment_elements {
            let name = assignment
                .attribute("slot")
                .expect("slot assignment source validated");
            if definition.slot(name).is_none() {
                return Err(SourceError::at_phase(
                    ErrorPhase::Link,
                    source,
                    Some(component_id),
                    &current_chain,
                    format!(
                        "unknown slot assignment `{name}` for component `{component_id}`; available: {}",
                        definition
                            .slots
                            .iter()
                            .map(|slot| slot.name.as_str())
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                ));
            }
            slot_assignments
                .entry(name.into())
                .or_default()
                .push(SlotAssignmentSource {
                    element: assignment,
                    context: caller.clone(),
                });
        }
        let slots = has_static_slots(target_version).then(|| {
            Arc::new(SlotInstantiation {
                component: target.clone(),
                use_chain: current_chain.clone(),
                assignments: slot_assignments,
            })
        });
        self.component_stack.push(target.clone());
        self.use_chain.push(site);
        self.durable_use_path.push(durable_use);
        let environment = self.specialize_component(
            source,
            caller_version,
            outer_environment,
            use_element,
            target_version,
            &definition,
            &target,
        );
        let result = environment.and_then(|(environment, specialization)| {
            self.expand_component(
                caller,
                &target_source,
                target_version,
                &definition,
                use_element,
                target,
                &environment,
                specialization,
                slots,
            )
        });
        self.durable_use_path.pop();
        self.use_chain.pop();
        self.component_stack.pop();
        result
    }

    fn expand_component(
        &mut self,
        caller: &ExpansionContext,
        definition_source: &str,
        definition_version: SourceVersion,
        definition: &ComponentSource,
        use_element: &Element,
        identity: ComponentIdentity,
        environment: &PropEnvironment,
        specialization: Option<usize>,
        slots: Option<Arc<SlotInstantiation>>,
    ) -> Result<ExpandedElement, SourceError> {
        let caller_source = caller.source.as_str();
        let caller_version = caller.version;
        let outer_environment = caller.environment.as_ref();
        let outer_specialization = caller.specialization;
        let mut root = self.expand_element(
            &ExpansionContext {
                source: definition_source.into(),
                version: definition_version,
                component: Some(identity.clone()),
                environment: has_scalar_specialization(definition_version)
                    .then(|| environment.clone()),
                specialization,
                slots,
            },
            &definition.element,
        )?;
        root.name = "container".into();
        root.attributes.retain(|attribute| attribute.name != "id");
        if let Some(outer_specialization) = outer_specialization {
            let href = use_element
                .attribute("href")
                .expect("source validation requires href");
            for argument in use_element
                .element_children()
                .filter(|element| element.name == "arg")
            {
                let value = argument.attribute("value").expect("argument validated");
                if let AttributeExpression::Binding(prop) = scan_attribute(value)
                    .expect("Version 2–4 argument bindings validated before expansion")
                {
                    root.bindings.push(ExpandedBinding {
                        specialization: outer_specialization,
                        prop,
                        target: BindingTarget {
                            source: caller_source.into(),
                            span: argument.span,
                            element: "arg".into(),
                            kind: BindingTargetKind::Argument {
                                use_href: href.into(),
                                argument: argument
                                    .attribute("name")
                                    .expect("argument validated")
                                    .into(),
                            },
                        },
                        materialized: false,
                    });
                }
            }
        }
        if let Some(value) = use_element.attribute("name") {
            let scalar = self.materialize_use_value(
                caller_source,
                caller_version,
                "name",
                value,
                use_element.span,
                outer_environment,
            )?;
            if let (Some(specialization), Some(prop)) = (outer_specialization, scalar.binding) {
                root.bindings.push(ExpandedBinding {
                    specialization,
                    prop,
                    target: BindingTarget {
                        source: caller_source.into(),
                        span: use_element.span,
                        element: "use".into(),
                        kind: BindingTargetKind::Attribute {
                            name: "name".into(),
                        },
                    },
                    materialized: false,
                });
            }
        }
        for name in ["x", "y", "flow", "grow", "align"] {
            if let Some(value) = use_element.attribute(name) {
                let scalar = self.materialize_use_value(
                    caller_source,
                    caller_version,
                    name,
                    value,
                    use_element.span,
                    outer_environment,
                )?;
                if let (Some(specialization), Some(prop)) = (outer_specialization, scalar.binding) {
                    root.bindings.push(ExpandedBinding {
                        specialization,
                        prop,
                        target: BindingTarget {
                            source: caller_source.into(),
                            span: use_element.span,
                            element: "use".into(),
                            kind: BindingTargetKind::Attribute { name: name.into() },
                        },
                        materialized: true,
                    });
                }
                root.attributes.retain(|attribute| attribute.name != name);
                root.attributes.push(Attribute {
                    name: name.into(),
                    value: scalar.value,
                });
            }
        }
        let use_hidden = use_element
            .attribute("hidden")
            .map(|value| {
                self.materialize_use_value(
                    caller_source,
                    caller_version,
                    "hidden",
                    value,
                    use_element.span,
                    outer_environment,
                )
            })
            .transpose()?;
        if let (Some(specialization), Some(prop)) = (
            outer_specialization,
            use_hidden.as_ref().and_then(|value| value.binding.clone()),
        ) {
            root.bindings.push(ExpandedBinding {
                specialization,
                prop,
                target: BindingTarget {
                    source: caller_source.into(),
                    span: use_element.span,
                    element: "use".into(),
                    kind: BindingTargetKind::Attribute {
                        name: "hidden".into(),
                    },
                },
                materialized: true,
            });
        }
        let use_hidden = use_hidden.is_some_and(|value| value.value == "true");
        let definition_hidden = root
            .attributes
            .iter()
            .find(|attribute| attribute.name == "hidden")
            .is_some_and(|attribute| attribute.value == "true");
        root.attributes
            .retain(|attribute| attribute.name != "hidden");
        if use_hidden || definition_hidden {
            root.attributes.push(Attribute {
                name: "hidden".into(),
                value: "true".into(),
            });
        }
        // Relationship applicability depends on the linked slot parent, not
        // on either source unit in isolation. Keep those failures in the
        // materialization phase before scalar-specialization validation can
        // accidentally relabel them.
        validate_expanded_relationships(&root, &self.slot_projections, &self.specializations)?;
        if has_scalar_specialization(definition_version) {
            self.validate_specialized_component(
                &root,
                &identity,
                specialization.expect("scalar specialization recorded"),
            )?;
        }
        Ok(root)
    }

    fn validate_specialized_component(
        &self,
        root: &ExpandedElement,
        identity: &ComponentIdentity,
        specialization: usize,
    ) -> Result<(), SourceError> {
        let mut bindings = vec![];
        visit_expanded_bindings(root, specialization, &mut bindings);
        let sites = bindings
            .into_iter()
            .filter_map(|binding| specialization_error_site(binding, &self.specializations))
            .collect::<Vec<_>>();
        let mut root = root.clone();
        root.attributes.retain(|attribute| {
            !matches!(
                attribute.name.as_str(),
                "x" | "y" | "flow" | "grow" | "align"
            )
        });
        let mut xml = String::from("<grida version=\"0\">");
        write_expanded_element(&root, &mut xml);
        xml.push_str("</grida>");
        grida_xml::parse(&xml).map(|_| ()).map_err(|error| {
            let context = sites
                .iter()
                .map(|site| {
                    let selection = match &site.selection {
                        ValueSelection::CalleeDefault => format!(
                            "default at {}:{}",
                            site.ultimate_origin.source, site.ultimate_origin.span.start
                        ),
                        ValueSelection::Supplied { argument } => {
                            format!("argument at {}:{}", argument.source, argument.span.start)
                        }
                    };
                    format!(
                        "prop `{}` from {selection}, bound at {}:{} ({})",
                        site.prop,
                        site.binding.source,
                        site.binding.span.start,
                        binding_target_label(&site.binding)
                    )
                })
                .collect::<Vec<_>>()
                .join("; ");
            let message = if context.is_empty() {
                error.to_string()
            } else {
                format!("{error}; {context}")
            };
            SourceError::at_phase(
                ErrorPhase::Specialize,
                &identity.source,
                Some(&identity.id),
                &self.use_chain,
                message,
            )
            .with_specialization_sites(sites)
        })
    }

    fn materialize_attribute(
        &self,
        source: &str,
        version: SourceVersion,
        element: &Element,
        attribute: &Attribute,
        environment: Option<&PropEnvironment>,
    ) -> Result<MaterializedScalar, SourceError> {
        let literal_origin = || ValueOrigin {
            source: source.into(),
            span: element.span,
            authored: attribute.value.clone(),
        };
        if !has_scalar_specialization(version)
            || environment.is_none()
            || sink_category(&element.name, &attribute.name).is_none()
        {
            return Ok(MaterializedScalar {
                value: attribute.value.clone(),
                origin: literal_origin(),
                binding: None,
            });
        }
        match scan_attribute(&attribute.value).map_err(|message| {
            SourceError::at_phase(
                ErrorPhase::Specialize,
                source,
                self.component_stack
                    .last()
                    .map(|component| component.id.as_str()),
                &self.use_chain,
                message,
            )
        })? {
            AttributeExpression::Literal(value) => Ok(MaterializedScalar {
                value,
                origin: literal_origin(),
                binding: None,
            }),
            AttributeExpression::Binding(name) => {
                let value = environment
                    .expect("checked")
                    .get(&name)
                    .expect("source validation checks declared binding");
                Ok(MaterializedScalar {
                    value: value.value.clone(),
                    origin: value.ultimate_origin.clone(),
                    binding: Some(name),
                })
            }
        }
    }

    fn materialize_text(
        &self,
        source: &str,
        version: SourceVersion,
        element: &Element,
        text: &str,
        environment: Option<&PropEnvironment>,
    ) -> Result<(String, Vec<(usize, String)>), SourceError> {
        if !has_scalar_specialization(version)
            || environment.is_none()
            || !matches!(element.name.as_str(), "text" | "tspan")
        {
            return Ok((text.into(), vec![]));
        }
        let segments = scan_bindings(text).map_err(|message| {
            SourceError::at_phase(
                ErrorPhase::Specialize,
                source,
                self.component_stack
                    .last()
                    .map(|component| component.id.as_str()),
                &self.use_chain,
                message,
            )
        })?;
        let mut materialized = String::new();
        let mut bindings = vec![];
        for (segment_index, segment) in segments.into_iter().enumerate() {
            match segment {
                BindingSegment::Literal(value) => materialized.push_str(&value),
                BindingSegment::Binding(name) => {
                    materialized.push_str(
                        &environment
                            .expect("checked")
                            .get(&name)
                            .expect("source validation checks declared text binding")
                            .value,
                    );
                    bindings.push((segment_index, name));
                }
            }
        }
        Ok((materialized, bindings))
    }

    fn materialize_use_value(
        &self,
        source: &str,
        version: SourceVersion,
        attribute: &str,
        value: &str,
        span: SourceSpan,
        environment: Option<&PropEnvironment>,
    ) -> Result<MaterializedScalar, SourceError> {
        let origin = || ValueOrigin {
            source: source.into(),
            span,
            authored: value.into(),
        };
        if !has_scalar_specialization(version) || environment.is_none() {
            return Ok(MaterializedScalar {
                value: value.into(),
                origin: origin(),
                binding: None,
            });
        }
        match scan_attribute(value).map_err(|message| {
            SourceError::at_phase(
                ErrorPhase::Specialize,
                source,
                self.component_stack
                    .last()
                    .map(|component| component.id.as_str()),
                &self.use_chain,
                message,
            )
        })? {
            AttributeExpression::Literal(value) => Ok(MaterializedScalar {
                value,
                origin: origin(),
                binding: None,
            }),
            AttributeExpression::Binding(name) => {
                let effective = environment
                    .expect("checked")
                    .get(&name)
                    .expect("source validation checks use binding");
                let declaration = PropDeclaration {
                    name,
                    scalar_type: effective.scalar_type,
                    values: effective.enum_values.clone(),
                    default: None,
                    span,
                };
                validate_binding_target(&declaration, "use", attribute).map_err(|message| {
                    SourceError::at_phase(
                        ErrorPhase::Specialize,
                        source,
                        self.component_stack
                            .last()
                            .map(|component| component.id.as_str()),
                        &self.use_chain,
                        message,
                    )
                })?;
                Ok(MaterializedScalar {
                    value: effective.value.clone(),
                    origin: effective.ultimate_origin.clone(),
                    binding: Some(declaration.name),
                })
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn specialize_component(
        &mut self,
        caller_source: &str,
        caller_version: SourceVersion,
        outer_environment: Option<&PropEnvironment>,
        use_element: &Element,
        definition_version: SourceVersion,
        definition: &ComponentSource,
        identity: &ComponentIdentity,
    ) -> Result<(PropEnvironment, Option<usize>), SourceError> {
        let arguments = use_element
            .element_children()
            .filter(|element| element.name == "arg")
            .collect::<Vec<_>>();
        if definition_version == SourceVersion::Draft1 {
            if !arguments.is_empty() {
                return Err(SourceError::at_phase(
                    ErrorPhase::Specialize,
                    caller_source,
                    Some(&identity.id),
                    &self.use_chain,
                    "Version 1 components have an empty interface and cannot receive arguments",
                ));
            }
            return Ok((BTreeMap::new(), None));
        }
        debug_assert!(has_scalar_specialization(definition_version));
        if !has_scalar_specialization(caller_version) {
            return Err(SourceError::at_phase(
                ErrorPhase::Link,
                caller_source,
                Some(&identity.id),
                &self.use_chain,
                format!(
                    "Version {} source cannot reference a Version {} scalar component",
                    caller_version.as_str(),
                    definition_version.as_str()
                ),
            ));
        }

        let declarations = definition
            .props
            .iter()
            .map(|declaration| (declaration.name.as_str(), declaration))
            .collect::<BTreeMap<_, _>>();
        let mut supplied = BTreeMap::new();
        for argument in arguments {
            let name = argument.attribute("name").expect("argument validated");
            if !declarations.contains_key(name) {
                return Err(SourceError::at_phase(
                    ErrorPhase::Specialize,
                    caller_source,
                    Some(&identity.id),
                    &self.use_chain,
                    format!(
                        "unknown argument `{name}` for component `{}`; available: {}",
                        identity.id,
                        declarations.keys().copied().collect::<Vec<_>>().join(", ")
                    ),
                ));
            }
            supplied.insert(name, argument);
        }

        let mut environment = BTreeMap::new();
        for declaration in &definition.props {
            let effective = if let Some(argument) = supplied.get(declaration.name.as_str()) {
                let argument_site = ArgumentSite {
                    source: caller_source.into(),
                    span: argument.span,
                    name: declaration.name.clone(),
                };
                let raw = argument.attribute("value").expect("argument validated");
                match scan_attribute(raw).map_err(|message| {
                    SourceError::at_phase(
                        ErrorPhase::Specialize,
                        caller_source,
                        Some(&identity.id),
                        &self.use_chain,
                        message,
                    )
                })? {
                    AttributeExpression::Literal(value) => {
                        let mut literal =
                            validate_typed_value(declaration, &value, caller_source, argument.span)
                                .map_err(|message| {
                                    SourceError::at_phase(
                                        ErrorPhase::Specialize,
                                        caller_source,
                                        Some(&identity.id),
                                        &self.use_chain,
                                        message,
                                    )
                                })?;
                        literal.origin.authored = raw.into();
                        EffectiveValue {
                            scalar_type: declaration.scalar_type,
                            enum_values: declaration.values.clone(),
                            value: literal.value,
                            selection: ValueSelection::Supplied {
                                argument: argument_site,
                            },
                            ultimate_origin: literal.origin,
                            forwarding: vec![],
                        }
                    }
                    AttributeExpression::Binding(name) => {
                        let outer = outer_environment
                            .and_then(|environment| environment.get(&name))
                            .ok_or_else(|| {
                                SourceError::at_phase(
                                    ErrorPhase::Specialize,
                                    caller_source,
                                    Some(&identity.id),
                                    &self.use_chain,
                                    format!(
                                        "argument `{}` forwards undeclared outer prop `{name}`",
                                        declaration.name
                                    ),
                                )
                            })?;
                        validate_forwarding(outer, declaration).map_err(|message| {
                            SourceError::at_phase(
                                ErrorPhase::Specialize,
                                caller_source,
                                Some(&identity.id),
                                &self.use_chain,
                                message,
                            )
                        })?;
                        let mut forwarding = outer.forwarding.clone();
                        forwarding.push(argument_site.clone());
                        EffectiveValue {
                            scalar_type: declaration.scalar_type,
                            enum_values: declaration.values.clone(),
                            value: outer.value.clone(),
                            selection: ValueSelection::Supplied {
                                argument: argument_site,
                            },
                            ultimate_origin: outer.ultimate_origin.clone(),
                            forwarding,
                        }
                    }
                }
            } else if let Some(default) = &declaration.default {
                EffectiveValue {
                    scalar_type: declaration.scalar_type,
                    enum_values: declaration.values.clone(),
                    value: default.value.clone(),
                    selection: ValueSelection::CalleeDefault,
                    ultimate_origin: default.origin.clone(),
                    forwarding: vec![],
                }
            } else {
                return Err(SourceError::at_phase(
                    ErrorPhase::Specialize,
                    caller_source,
                    Some(&identity.id),
                    &self.use_chain,
                    format!(
                        "argument `{}` is required by component `{}`",
                        declaration.name, identity.id
                    ),
                ));
            };
            environment.insert(declaration.name.clone(), effective);
        }

        let specialization = self.specializations.len();
        self.specializations.push(SpecializationProvenance {
            component: identity.clone(),
            use_chain: self.use_chain.clone(),
            props: definition
                .props
                .iter()
                .map(|declaration| {
                    let value = environment.get(&declaration.name).expect("inserted");
                    PropValueProvenance {
                        name: declaration.name.clone(),
                        scalar_type: declaration.scalar_type,
                        value: value.value.clone(),
                        selection: value.selection.clone(),
                        ultimate_origin: value.ultimate_origin.clone(),
                        forwarding: value.forwarding.clone(),
                        binding_targets: vec![],
                        materialized_occurrences: vec![],
                    }
                })
                .collect(),
        });
        Ok((environment, Some(specialization)))
    }

    fn resolve_source(
        &mut self,
        containing_id: &str,
        location: &str,
    ) -> Result<String, SourceError> {
        if location.is_empty() {
            return Ok(containing_id.into());
        }
        let cache_key = (containing_id.to_owned(), location.to_owned());
        if let Some(identity) = self.resolutions.get(&cache_key) {
            return Ok(identity.clone());
        }
        let containing = self
            .units
            .get(containing_id)
            .expect("containing source loaded")
            .snapshot
            .clone();
        let snapshot = self
            .provider
            .resolve(&containing, location)
            .map_err(|message| {
                SourceError::at_phase(
                    ErrorPhase::Resolve,
                    containing_id,
                    None,
                    &self.use_chain,
                    format!("could not resolve `{location}`: {message}"),
                )
            })?;
        if snapshot.identity().is_empty() || snapshot.base().is_empty() {
            let missing = if snapshot.identity().is_empty() {
                "canonical source identity"
            } else {
                "canonical source base"
            };
            return Err(SourceError::at_phase(
                ErrorPhase::Resolve,
                containing_id,
                None,
                &self.use_chain,
                format!("resolved `{location}` without a non-empty {missing}"),
            ));
        }
        let identity = snapshot.identity().to_owned();
        if let Some(existing) = self.units.get(&identity) {
            if existing.snapshot != snapshot {
                return Err(SourceError::at_phase(
                    ErrorPhase::Resolve,
                    containing_id,
                    None,
                    &self.use_chain,
                    format!(
                        "canonical source identity `{identity}` returned inconsistent bytes or base"
                    ),
                ));
            }
        } else {
            let unit = parse_source(snapshot).map_err(|mut error| {
                if error.message.starts_with("unsupported <grida> version") {
                    error.phase = ErrorPhase::Resolve;
                }
                if error.use_chain.is_empty() {
                    error.use_chain = self.use_chain.clone();
                }
                error
            })?;
            self.units.insert(identity.clone(), unit);
        }
        self.resolutions.insert(cache_key, identity.clone());
        Ok(identity)
    }

    fn resource_rid(&mut self, source: &str, authored: &str) -> Result<String, SourceError> {
        let key = (source.to_owned(), authored.to_owned());
        if let Some(runtime_rid) = self.resource_keys.get(&key) {
            return Ok(runtime_rid.clone());
        }
        let base = self
            .units
            .get(source)
            .ok_or_else(|| {
                SourceError::at_phase(
                    ErrorPhase::Materialize,
                    source,
                    None,
                    &self.use_chain,
                    "resource origin is not a loaded source unit",
                )
            })?
            .snapshot
            .base()
            .to_owned();
        let runtime_rid = format!("grida-xml-resource-{}", self.resources.len());
        self.resources.push(ResourceManifestEntry {
            runtime_rid: runtime_rid.clone(),
            source: source.into(),
            base,
            authored: authored.into(),
        });
        self.resource_keys.insert(key, runtime_rid.clone());
        Ok(runtime_rid)
    }
}

/// Link and materialize one render entry through a host-supplied pure source
/// provider. Draft 0 input is accepted as a one-unit program. Version 1/2/3/4
/// input resolves only the closure reachable from the entry scene. Version 4
/// links only Version 4 sources and requires every ordinary materialized node
/// except the implicit document root to have one durable address.
pub fn materialize<P: SourceProvider>(
    entry: SourceSnapshot,
    provider: &mut P,
) -> Result<MaterializedProgram, SourceError> {
    let entry = parse_source(entry)?;
    Linker::new(entry, provider).materialize()
}

fn is_render_element(name: &str) -> bool {
    matches!(
        name,
        "container" | "rect" | "ellipse" | "line" | "path" | "text" | "group" | "lens"
    )
}

fn payload_source_tag(payload: &Payload) -> &'static str {
    match payload {
        Payload::Frame { .. } => "container",
        Payload::Shape {
            desc: ShapeDesc::Rect,
        } => "rect",
        Payload::Shape {
            desc: ShapeDesc::Ellipse,
        } => "ellipse",
        Payload::Shape {
            desc: ShapeDesc::Line,
        } => "line",
        Payload::Shape {
            desc: ShapeDesc::Path(_),
        } => "path",
        Payload::Text { .. } | Payload::AttributedText { .. } => "text",
        Payload::Group => "group",
        Payload::Lens { .. } => "lens",
    }
}

fn expanded_render_children(element: &ExpandedElement) -> Vec<&ExpandedElement> {
    element
        .children
        .iter()
        .filter_map(|child| match child {
            ExpandedContent::Element(child) if is_render_element(&child.name) => {
                Some(child.as_ref())
            }
            ExpandedContent::Element(_) | ExpandedContent::Text(_) => None,
        })
        .collect()
}

fn local_expanded_bindings<'a>(element: &'a ExpandedElement, out: &mut Vec<&'a ExpandedBinding>) {
    out.extend(&element.bindings);
    for child in &element.children {
        if let ExpandedContent::Element(child) = child {
            if !is_render_element(&child.name) {
                local_expanded_bindings(child, out);
            }
        }
    }
}

fn attach_node_provenance(
    element: &ExpandedElement,
    document: &Document,
    node_id: NodeId,
    out: &mut BTreeMap<NodeId, NodeProvenance>,
    addresses_by_node: &mut BTreeMap<NodeKey, MaterializedNodeAddress>,
    nodes_by_address: &mut BTreeMap<MaterializedNodeAddress, NodeKey>,
    specializations: &mut [SpecializationProvenance],
    slot_projections: &mut [PendingSlotProjection],
) -> Result<(), String> {
    if !is_render_element(&element.name) {
        return Err(format!(
            "provenance root <{}> is not a render element",
            element.name
        ));
    }
    let node = document
        .get_opt(node_id)
        .ok_or_else(|| format!("materialized node {node_id} is not live"))?;
    let actual = payload_source_tag(&node.payload);
    if element.name != actual {
        return Err(format!(
            "provenance/source kind <{}> was parsed as <{actual}> at node {node_id}",
            element.name
        ));
    }
    if out.insert(node_id, element.provenance.clone()).is_some() {
        return Err(format!(
            "materialized node {node_id} received duplicate provenance"
        ));
    }
    if let Some(address) = &element.address {
        let key = document
            .key_of(node_id)
            .ok_or_else(|| format!("materialized node {node_id} is not live"))?;
        if addresses_by_node.insert(key, address.clone()).is_some() {
            return Err(format!(
                "materialized node {node_id} received more than one durable address"
            ));
        }
        if let Some(previous) = nodes_by_address.insert(address.clone(), key) {
            return Err(format!(
                "durable address {address:?} is ambiguous between nodes {} and {node_id}",
                previous.id()
            ));
        }
    }
    for marker in &element.slot_assignments {
        let projection = slot_projections
            .get_mut(marker.projection)
            .ok_or_else(|| "slot assignment references an unknown projection".to_string())?;
        let assignment = projection
            .assignments
            .get_mut(marker.assignment)
            .ok_or_else(|| "slot assignment references an unknown assignment".to_string())?;
        if assignment.node.replace(node_id).is_some() {
            return Err(format!(
                "slot `{}` assignment received more than one ordinary root",
                projection.definition.name
            ));
        }
    }
    let mut bindings = vec![];
    local_expanded_bindings(element, &mut bindings);
    for binding in bindings {
        let specialization = specializations
            .get_mut(binding.specialization)
            .ok_or_else(|| "binding references an unknown specialization".to_string())?;
        let prop = specialization
            .props
            .iter_mut()
            .find(|prop| prop.name == binding.prop)
            .ok_or_else(|| {
                format!(
                    "binding references unknown prop `{}` in specialization {}",
                    binding.prop, binding.specialization
                )
            })?;
        if !prop.binding_targets.contains(&binding.target) {
            prop.binding_targets.push(binding.target.clone());
        }
        if binding.materialized {
            prop.materialized_occurrences
                .push(MaterializedBindingOccurrence {
                    target: binding.target.clone(),
                    node: node_id,
                });
        }
    }
    let children = expanded_render_children(element);
    if children.len() != node.children.len() {
        return Err(format!(
            "provenance child count {} disagrees with parsed node {node_id} child count {}",
            children.len(),
            node.children.len()
        ));
    }
    for (child, &child_id) in children.into_iter().zip(&node.children) {
        attach_node_provenance(
            child,
            document,
            child_id,
            out,
            addresses_by_node,
            nodes_by_address,
            specializations,
            slot_projections,
        )?;
    }
    Ok(())
}

fn escape_attribute(value: &str, out: &mut String) {
    for character in value.chars() {
        match character {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '"' => out.push_str("&quot;"),
            '\t' => out.push_str("&#9;"),
            '\n' => out.push_str("&#10;"),
            '\r' => out.push_str("&#13;"),
            _ => out.push(character),
        }
    }
}

fn escape_text(value: &str, out: &mut String) {
    for character in value.chars() {
        match character {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(character),
        }
    }
}

fn write_start(name: &str, attributes: &[Attribute], out: &mut String) {
    let _ = write!(out, "<{name}");
    for attribute in attributes {
        let _ = write!(out, " {}=\"", attribute.name);
        escape_attribute(&attribute.value, out);
        out.push('"');
    }
}

fn write_element(element: &Element, out: &mut String) {
    write_start(&element.name, &element.attributes, out);
    if element.children.is_empty() {
        out.push_str("/>");
        return;
    }
    out.push('>');
    for child in &element.children {
        match child {
            Content::Element(child) => write_element(child, out),
            Content::Text(text) => escape_text(text, out),
        }
    }
    let _ = write!(out, "</{}>", element.name);
}

fn write_expanded_element(element: &ExpandedElement, out: &mut String) {
    write_start(&element.name, &element.attributes, out);
    if element.children.is_empty() {
        out.push_str("/>");
        return;
    }
    out.push('>');
    for child in &element.children {
        match child {
            ExpandedContent::Element(child) => write_expanded_element(child, out),
            ExpandedContent::Text(text) => escape_text(text, out),
        }
    }
    let _ = write!(out, "</{}>", element.name);
}
