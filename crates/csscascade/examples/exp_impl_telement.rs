//! Experimental Stylo DOM adapter playground.
//!
//! This example is the working area for a fresh csscascade DOM/tree implementation.
//! Ultimately it should: read arbitrary HTML, run Stylo’s cascade to produce computed
//! styles for every element, and emit a flattened HTML snapshot with those styles
//! inlined (all without a browser runtime). The current code focuses on the new DOM
//! arena and trait wiring; style resolution/inlining will be layered on next.

use std::{env, fs, path::PathBuf, sync::OnceLock};

const TRACE_ALLOWED_PREFIXES: &[&str] = &[
    "main:",
    "demo_dom:",
    "demo_dom_builder:",
    "bootstrap_dom:",
    "cascade:",
    "doc_shared_lock",
    "style_detail:",
];

pub(crate) fn trace_should_log(msg: &str) -> bool {
    static TRACE_VERBOSE: OnceLock<bool> = OnceLock::new();
    if *TRACE_VERBOSE.get_or_init(|| std::env::var("TRACE_DOM_VERBOSE").is_ok()) {
        return true;
    }
    TRACE_ALLOWED_PREFIXES
        .iter()
        .any(|prefix| msg.starts_with(prefix))
}

macro_rules! trace_dom {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        if $crate::trace_should_log(&msg) {
            eprintln!("[exp_impl_telement] {}", msg);
        }
    }};
}

use demo_dom::{DemoDom, DemoNodeData};
use style::thread_state::{self, ThreadState};
use stylo_dom::bootstrap_dom;

mod cascade {
    use super::demo_dom::{DemoDom, DemoNodeData};
    use super::stylo_dom::{self, HtmlDocument, HtmlElement};
    use euclid::{Scale, Size2D};
    use markup5ever::interface::tree_builder::QuirksMode as HtmlQuirksMode;
    use style::context::{
        RegisteredSpeculativePainter, RegisteredSpeculativePainters, SharedStyleContext,
        StyleContext, StyleSystemOptions, ThreadLocalStyleContext,
    };
    use style::data::ElementStyles;
    use style::dom::TElement;
    use style::font_metrics::FontMetrics;
    use style::media_queries::{MediaList, MediaType};
    use style::properties::ComputedValues;
    use style::properties::style_structs::Font;
    use style::queries::values::PrefersColorScheme;
    use style::servo::animation::DocumentAnimationSet;
    use style::servo::media_queries::{Device, FontMetricsProvider};
    use style::servo::selector_parser::SnapshotMap;
    use style::servo_arc::Arc as ServoArc;
    use style::shared_lock::{SharedRwLock, SharedRwLockReadGuard, StylesheetGuards};
    use style::stylesheets::{
        AllowImportRules, DocumentStyleSheet, Origin, Stylesheet, UrlExtraData,
    };
    use style::stylist::{RuleInclusion, Stylist};
    use style::traversal::resolve_style;
    use style::traversal_flags::TraversalFlags;
    use style::values::computed::font::GenericFontFamily;
    use style::values::computed::{CSSPixelLength, Length};
    use style::values::specified::font::QueryFontMetricsFlags;
    use style_traits::{CSSPixel, DevicePixel};
    use stylo_atoms::Atom;
    use url::Url;

    const FALLBACK_AUTHOR_CSS: &str = r#"
html, body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  margin: 0;
  padding: 1rem;
}
body {
  color: #111;
  background: #fff;
}
    "#;
    const LOG_STYLE_DETAILS: bool = true;

    pub struct CascadeDriver {
        stylist: Stylist,
        stylesheet_lock: SharedRwLock,
        snapshot_map: SnapshotMap,
        animations: DocumentAnimationSet,
        thread_local: Option<ThreadLocalStyleContext<HtmlElement>>,
    }

    impl CascadeDriver {
        pub fn new(dom: &DemoDom) -> Self {
            trace_dom!("cascade: building Stylist seed");
            let style_quirks = translate_quirks_mode(dom.quirks_mode());
            let stylesheet_lock = stylo_dom::doc_shared_lock().clone();
            let device = build_device(style_quirks);
            let mut stylist = Stylist::new(device, style_quirks);
            let css_blocks = collect_author_styles(dom);
            {
                let guard = stylesheet_lock.read();
                for (idx, css) in css_blocks.iter().enumerate() {
                    trace_dom!(
                        "cascade: loading stylesheet block #{} ({} bytes)",
                        idx,
                        css.len()
                    );
                    let sheet = build_document_stylesheet(css, &stylesheet_lock, style_quirks);
                    stylist.append_stylesheet(sheet, &guard);
                }
            }

            CascadeDriver {
                stylist,
                stylesheet_lock,
                snapshot_map: SnapshotMap::new(),
                animations: DocumentAnimationSet::default(),
                thread_local: Some(ThreadLocalStyleContext::new()),
            }
        }

        pub fn flush(&mut self, document: HtmlDocument) {
            let guard = self.stylesheet_lock.read();
            let guards = StylesheetGuards::same(&guard);
            trace_dom!("cascade: flushing stylist");
            let _ = self.stylist.flush::<HtmlElement>(
                &guards,
                document.root_element(),
                Some(&self.snapshot_map),
            );
        }

        pub fn style_document(&mut self, document: HtmlDocument) -> usize {
            let guard = self.stylesheet_lock.read();
            let mut thread_local = self
                .thread_local
                .take()
                .expect("thread-local context should be available");
            let styled = {
                let shared_context = self.shared_style_context(TraversalFlags::empty(), &guard);
                Self::style_subtree(document, &shared_context, &mut thread_local)
            };
            let expected = document.element_count();
            trace_dom!("cascade: styled {} of {} elements", styled, expected);
            assert_eq!(
                styled, expected,
                "styled element count ({}) did not match DOM element count ({})",
                styled, expected
            );
            self.thread_local = Some(thread_local);
            styled
        }

        fn shared_style_context<'a>(
            &'a self,
            traversal_flags: TraversalFlags,
            guard: &'a SharedRwLockReadGuard<'a>,
        ) -> SharedStyleContext<'a> {
            SharedStyleContext {
                stylist: &self.stylist,
                visited_styles_enabled: true,
                options: StyleSystemOptions::default(),
                guards: StylesheetGuards::same(guard),
                current_time_for_animations: 0.0,
                traversal_flags,
                snapshot_map: &self.snapshot_map,
                animations: self.animations.clone(),
                registered_speculative_painters: &NOOP_PAINTERS,
            }
        }

        fn style_subtree(
            document: HtmlDocument,
            shared: &SharedStyleContext<'_>,
            thread_local: &mut ThreadLocalStyleContext<HtmlElement>,
        ) -> usize {
            let mut styled = 0;
            let mut stack = Vec::new();
            if let Some(root) = document.root_element() {
                stack.push(root);
            }
            while let Some(element) = stack.pop() {
                Self::style_element(element, shared, thread_local);
                styled += 1;
                let mut child = element.first_element_child();
                while let Some(next_child) = child {
                    stack.push(next_child);
                    child = next_child.next_element_sibling();
                }
            }
            styled
        }

        fn style_element(
            element: HtmlElement,
            shared: &SharedStyleContext<'_>,
            thread_local: &mut ThreadLocalStyleContext<HtmlElement>,
        ) {
            trace_dom!("cascade: resolve_style on {:?}", element);
            let mut ctx = StyleContext {
                shared,
                thread_local,
            };
            let styles = resolve_style(&mut ctx, element, RuleInclusion::All, None, None);
            Self::log_style_details(element, &styles);
            unsafe {
                let mut data = element.ensure_data();
                data.styles = styles;
                data.clear_restyle_flags_and_damage();
            }
        }

        fn log_style_details(element: HtmlElement, styles: &ElementStyles) {
            if !LOG_STYLE_DETAILS {
                return;
            }
            let primary = styles.primary();
            let display = primary.get_box().clone_display();
            let font_size_px = primary.get_font().clone_font_size().computed_size().px();
            trace_dom!(
                "style_detail: <{}> display={:?} font_size={:.2}px",
                element.local_name_string(),
                display,
                font_size_px
            );
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

    fn build_device(quirks: style::context::QuirksMode) -> Device {
        let media_type = MediaType::screen();
        let viewport: Size2D<f32, CSSPixel> = Size2D::new(1280.0, 720.0);
        let dpr: Scale<f32, CSSPixel, DevicePixel> = Scale::new(1.0);
        let font_provider: Box<dyn FontMetricsProvider> = Box::new(SimpleFontProvider);
        let font = Font::initial_values();
        let defaults = ComputedValues::initial_values_with_font_override(font);
        let color_scheme = PrefersColorScheme::Light;
        Device::new(
            media_type,
            quirks,
            viewport,
            dpr,
            font_provider,
            defaults,
            color_scheme,
        )
    }

    fn build_document_stylesheet(
        css: &str,
        shared_lock: &SharedRwLock,
        quirks: style::context::QuirksMode,
    ) -> DocumentStyleSheet {
        let media = MediaList::empty();
        let media = ServoArc::new(shared_lock.wrap(media));
        let url = Url::parse("https://grida.local/demo.css").expect("static URL must parse");
        let url_data = UrlExtraData::from(url);
        let stylesheet = Stylesheet::from_str(
            css,
            url_data,
            Origin::Author,
            media,
            shared_lock.clone(),
            None,
            None,
            quirks,
            AllowImportRules::Yes,
        );
        DocumentStyleSheet(ServoArc::new(stylesheet))
    }

    fn collect_author_styles(dom: &DemoDom) -> Vec<String> {
        let mut styles = Vec::new();
        for node_id in dom.all_node_ids() {
            let node = dom.node(node_id);
            if let DemoNodeData::Element(element) = &node.data {
                if element.name.ns != markup5ever::ns!(html) {
                    continue;
                }
                if !element.name.local.as_ref().eq_ignore_ascii_case("style") {
                    continue;
                }
                let mut buffer = String::new();
                for child in &node.children {
                    if let DemoNodeData::Text(text) = &dom.node(*child).data {
                        buffer.push_str(text);
                    }
                }
                let trimmed = buffer.trim();
                if !trimmed.is_empty() {
                    styles.push(trimmed.to_string());
                }
            }
        }
        if styles.is_empty() {
            trace_dom!("cascade: no inline <style> blocks, using fallback author CSS");
            styles.push(FALLBACK_AUTHOR_CSS.trim().to_string());
        }
        styles
    }

    fn translate_quirks_mode(mode: HtmlQuirksMode) -> style::context::QuirksMode {
        match mode {
            HtmlQuirksMode::NoQuirks => style::context::QuirksMode::NoQuirks,
            HtmlQuirksMode::LimitedQuirks => style::context::QuirksMode::LimitedQuirks,
            HtmlQuirksMode::Quirks => style::context::QuirksMode::Quirks,
        }
    }

    struct NoopSpeculativePainters;

    impl RegisteredSpeculativePainters for NoopSpeculativePainters {
        fn get(&self, _name: &Atom) -> Option<&dyn RegisteredSpeculativePainter> {
            None
        }
    }

    static NOOP_PAINTERS: NoopSpeculativePainters = NoopSpeculativePainters;
}

mod demo_dom {
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
        values::AtomIdent,
    };
    use stylo_atoms::Atom as WeakAtom;
    use tendril::StrTendril;

    #[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
    pub struct NodeId(pub(crate) usize);

    impl NodeId {
        pub(crate) fn idx(self) -> usize {
            self.0
        }
    }

    #[derive(Debug)]
    pub struct DemoNode {
        pub parent: Option<NodeId>,
        pub children: Vec<NodeId>,
        pub data: DemoNodeData,
    }

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

    #[derive(Debug)]
    pub struct DemoElementData {
        pub name: QualName,
        pub attrs: Vec<Attribute>,
        pub template_contents: Option<NodeId>,
        pub mathml_annotation_xml_integration_point: bool,
        pub id_attr: Option<WeakAtom>,
        pub class_list: Vec<AtomIdent>,
        pub attr_local_names: Vec<StyleLocalName>,
        pub style_local_name: StyleLocalName,
        pub style_namespace: StyleNamespace,
    }

    #[derive(Debug)]
    pub struct DemoDom {
        nodes: Vec<DemoNode>,
        document: NodeId,
        quirks_mode: QuirksMode,
        pub errors: Vec<String>,
        element_data: Vec<AtomicRefCell<Option<ElementData>>>,
    }

    unsafe impl Sync for DemoDom {}
    unsafe impl Send for DemoDom {}

    impl DemoDom {
        pub fn parse_from_bytes(bytes: &[u8]) -> io::Result<Self> {
            trace_dom!("demo_dom: parsing {} bytes", bytes.len());
            let mut reader = Cursor::new(bytes);
            let dom = parse_document(DemoDomBuilder::new(), ParseOpts::default())
                .from_utf8()
                .read_from(&mut reader)?;
            trace_dom!("demo_dom: parsed {} nodes", dom.nodes.len());
            Ok(dom)
        }

        pub fn document_id(&self) -> NodeId {
            self.document
        }

        pub fn document_children(&self) -> &[NodeId] {
            trace_dom!("demo_dom: document_children");
            &self.nodes[self.document.idx()].children
        }

        pub fn quirks_mode(&self) -> QuirksMode {
            self.quirks_mode
        }

        pub fn node(&self, id: NodeId) -> &DemoNode {
            trace_dom!("dom_access: node {:?}", id);
            &self.nodes[id.idx()]
        }

        pub fn element_data_slot(&self, id: NodeId) -> &AtomicRefCell<Option<ElementData>> {
            &self.element_data[id.idx()]
        }

        pub fn all_node_ids(&self) -> impl Iterator<Item = NodeId> + '_ {
            (0..self.nodes.len()).map(NodeId)
        }
    }

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
            trace_dom!("demo_dom_builder: new arena");
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
            {
                let nodes = self.nodes.borrow();
                nodes[parent.idx()].children.borrow_mut().push(child);
            }
        }

        fn last_child(&self, parent: NodeId) -> Option<NodeId> {
            let nodes = self.nodes.borrow();
            nodes[parent.idx()].children.borrow().last().copied()
        }

        fn append_text_after(&self, sibling: NodeId, text: &str) -> bool {
            let nodes = self.nodes.borrow();
            if let NodeDataTemp::Text { contents } = &nodes[sibling.idx()].data {
                contents.borrow_mut().push_slice(text);
                return true;
            }
            false
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
                        NodeDataTemp::Text { contents } => {
                            DemoNodeData::Text(contents.into_inner())
                        }
                        NodeDataTemp::Comment { contents } => DemoNodeData::Comment(contents),
                        NodeDataTemp::Element {
                            name,
                            attrs,
                            template_contents,
                            mathml_annotation_xml_integration_point,
                        } => {
                            let attrs_vec = attrs.into_inner();
                            let (id_attr, class_list, attr_local_names) =
                                derive_attr_metadata(&attrs_vec);
                            let style_local_name = style_local_name_from(&name.local);
                            let style_namespace = style_namespace_from(&name.ns);
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
                mathml_annotation_xml_integration_point: flags
                    .mathml_annotation_xml_integration_point,
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

    fn derive_attr_metadata(
        attrs: &[Attribute],
    ) -> (Option<WeakAtom>, Vec<AtomIdent>, Vec<StyleLocalName>) {
        let mut id_attr = None;
        let mut class_list = Vec::new();
        let mut attr_local_names = Vec::with_capacity(attrs.len());

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
            }
        }

        (id_attr, class_list, attr_local_names)
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
}

mod stylo_dom {
    use std::{borrow::Borrow, sync::OnceLock};

    use atomic_refcell::{AtomicRef, AtomicRefCell, AtomicRefMut};
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
    use style::selector_parser::{
        AttrValue as SelectorAttrValue, Lang, PseudoElement, SelectorImpl,
    };
    use style::servo_arc::{Arc, ArcBorrow};
    use style::shared_lock::{Locked, SharedRwLock};
    use style::stylist::CascadeData;
    use style::values::AtomIdent;
    use style::values::computed::Au;
    use style::values::computed::Display;
    use stylo_atoms::Atom as WeakAtom;
    use stylo_dom::ElementState;

    use crate::demo_dom::{DemoDom, DemoElementData, DemoNode, DemoNodeData, NodeId};

    type Impl = SelectorImpl;

    static DEMO_DOM: OnceLock<DemoDom> = OnceLock::new();
    static STYLE_LOCK: OnceLock<SharedRwLock> = OnceLock::new();

    pub fn bootstrap_dom(dom: DemoDom) -> HtmlDocument {
        trace_dom!("bootstrap_dom: installing DemoDom");
        let document = dom.document_id();
        DEMO_DOM
            .set(dom)
            .expect("bootstrap_dom should only be called once");
        HtmlDocument(document)
    }

    pub(super) fn doc_shared_lock() -> &'static SharedRwLock {
        trace_dom!("doc_shared_lock");
        STYLE_LOCK.get_or_init(SharedRwLock::new)
    }

    fn dom() -> &'static DemoDom {
        trace_dom!("dom(): fetch global DemoDom");
        DEMO_DOM.get().expect("bootstrap_dom must run first")
    }

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

    impl HtmlDocument {
        pub fn root_element(&self) -> Option<HtmlElement> {
            trace_dom!("HtmlDocument::root_element {:?}", self);
            dom().document_children().iter().find_map(|child| {
                matches!(dom().node(*child).data, DemoNodeData::Element(_))
                    .then_some(HtmlElement(*child))
            })
        }

        fn node(self) -> HtmlNode {
            HtmlNode(self.0)
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

    impl HtmlElement {
        pub fn local_name_string(&self) -> String {
            trace_dom!("HtmlElement::local_name_string {:?}", self);
            self.element_data().name.local.to_string()
        }

        pub fn first_element_child(self) -> Option<HtmlElement> {
            trace_dom!("HtmlElement::first_element_child {:?}", self);
            self.node().first_element_child()
        }

        pub fn next_element_sibling(self) -> Option<HtmlElement> {
            trace_dom!("HtmlElement::next_element_sibling {:?}", self);
            self.node().next_element_sibling()
        }

        fn element_data(&self) -> &DemoElementData {
            trace_dom!("HtmlElement::element_data {:?}", self);
            match &dom().node(self.0).data {
                DemoNodeData::Element(data) => data,
                _ => panic!("HtmlElement must wrap an element node"),
            }
        }

        fn node(self) -> HtmlNode {
            trace_dom!("HtmlElement::node {:?}", self);
            HtmlNode(self.0)
        }

        fn data_slot(&self) -> &'static AtomicRefCell<Option<ElementData>> {
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
                .map_or(false, |(attr, _)| operation.eval_str(attr.value.as_ref()))
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
            self.element_data().class_list.iter().any(|class| {
                case_sensitivity.eq(atom_ident_str(class).as_bytes(), needle.as_bytes())
            })
        }

        fn id_string(&self) -> Option<&str> {
            self.element_data()
                .id_attr
                .as_ref()
                .map(|atom| atom.as_ref())
        }
    }

    impl HtmlNode {
        fn node(self) -> &'static DemoNode {
            trace_dom!("HtmlNode::node {:?}", self);
            dom().node(self.0)
        }

        fn parent(self) -> Option<HtmlNode> {
            trace_dom!("HtmlNode::parent {:?}", self);
            self.node().parent.map(HtmlNode)
        }

        fn to_element(self) -> Option<HtmlElement> {
            trace_dom!("HtmlNode::to_element {:?}", self);
            matches!(self.node().data, DemoNodeData::Element(_)).then_some(HtmlElement(self.0))
        }

        fn first_element_child(self) -> Option<HtmlElement> {
            trace_dom!("HtmlNode::first_element_child {:?}", self);
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
            trace_dom!("HtmlNode::prev_element_sibling {:?}", self);
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
            trace_dom!("HtmlNode::next_element_sibling {:?}", self);
            let mut next = self.next_sibling();
            while let Some(node) = next {
                if let Some(element) = node.to_element() {
                    return Some(element);
                }
                next = node.next_sibling();
            }
            None
        }
    }

    impl ::style::dom::NodeInfo for HtmlNode {
        fn is_element(&self) -> bool {
            trace_dom!("NodeInfo::is_element {:?}", self);
            matches!(self.node().data, DemoNodeData::Element(_))
        }

        fn is_text_node(&self) -> bool {
            trace_dom!("NodeInfo::is_text_node {:?}", self);
            matches!(self.node().data, DemoNodeData::Text(_))
        }
    }

    impl ::style::dom::TNode for HtmlNode {
        type ConcreteElement = HtmlElement;
        type ConcreteDocument = HtmlDocument;
        type ConcreteShadowRoot = HtmlShadowRoot;

        fn parent_node(&self) -> Option<Self> {
            trace_dom!("TNode::parent_node {:?}", self);
            self.parent()
        }

        fn first_child(&self) -> Option<Self> {
            trace_dom!("TNode::first_child {:?}", self);
            self.node().children.first().copied().map(HtmlNode)
        }

        fn last_child(&self) -> Option<Self> {
            trace_dom!("TNode::last_child {:?}", self);
            self.node().children.last().copied().map(HtmlNode)
        }

        fn prev_sibling(&self) -> Option<Self> {
            trace_dom!("TNode::prev_sibling {:?}", self);
            sibling_pair(self.0).0
        }

        fn next_sibling(&self) -> Option<Self> {
            trace_dom!("TNode::next_sibling {:?}", self);
            sibling_pair(self.0).1
        }

        fn owner_doc(&self) -> Self::ConcreteDocument {
            trace_dom!("TNode::owner_doc {:?}", self);
            HtmlDocument(dom().document_id())
        }

        fn is_in_document(&self) -> bool {
            trace_dom!("TNode::is_in_document {:?}", self);
            true
        }

        fn traversal_parent(&self) -> Option<Self::ConcreteElement> {
            trace_dom!("TNode::traversal_parent {:?}", self);
            self.parent()?.to_element()
        }

        fn opaque(&self) -> OpaqueNode {
            trace_dom!("TNode::opaque {:?}", self);
            OpaqueNode(self.0.idx())
        }

        fn debug_id(self) -> usize {
            trace_dom!("TNode::debug_id {:?}", self);
            self.0.idx()
        }

        fn as_element(&self) -> Option<Self::ConcreteElement> {
            trace_dom!("TNode::as_element {:?}", self);
            self.to_element()
        }

        fn as_document(&self) -> Option<Self::ConcreteDocument> {
            trace_dom!("TNode::as_document {:?}", self);
            matches!(self.node().data, DemoNodeData::Document).then_some(HtmlDocument(self.0))
        }

        fn as_shadow_root(&self) -> Option<Self::ConcreteShadowRoot> {
            trace_dom!("TNode::as_shadow_root {:?}", self);
            None
        }
    }

    impl ::style::dom::TDocument for HtmlDocument {
        type ConcreteNode = HtmlNode;

        fn as_node(&self) -> Self::ConcreteNode {
            trace_dom!("TDocument::as_node {:?}", self);
            HtmlNode(self.0)
        }

        fn is_html_document(&self) -> bool {
            trace_dom!("TDocument::is_html_document {:?}", self);
            true
        }

        fn quirks_mode(&self) -> style::context::QuirksMode {
            trace_dom!("TDocument::quirks_mode {:?}", self);
            style::context::QuirksMode::NoQuirks
        }

        fn shared_lock(&self) -> &SharedRwLock {
            trace_dom!("TDocument::shared_lock {:?}", self);
            doc_shared_lock()
        }
    }

    impl ::style::dom::TShadowRoot for HtmlShadowRoot {
        type ConcreteNode = HtmlNode;

        fn as_node(&self) -> Self::ConcreteNode {
            trace_dom!("TShadowRoot::as_node {:?}", self);
            self.host.as_node()
        }

        fn host(&self) -> <Self::ConcreteNode as TNode>::ConcreteElement {
            trace_dom!("TShadowRoot::host {:?}", self);
            self.host
        }

        fn style_data<'a>(&self) -> Option<&'a CascadeData>
        where
            Self: 'a,
        {
            trace_dom!("TShadowRoot::style_data {:?}", self);
            None
        }
    }

    impl ::style::dom::TElement for HtmlElement {
        type ConcreteNode = HtmlNode;
        type TraversalChildrenIterator = std::vec::IntoIter<Self::ConcreteNode>;

        fn as_node(&self) -> Self::ConcreteNode {
            trace_dom!("TElement::as_node {:?}", self);
            HtmlNode(self.0)
        }

        fn traversal_children(&self) -> LayoutIterator<Self::TraversalChildrenIterator> {
            trace_dom!(
                "TElement::traversal_children {:?} ({} children)",
                self,
                dom().node(self.0).children.len()
            );
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
            trace_dom!("TElement::is_html_element {:?}", self);
            self.element_data().name.ns == ns!(html)
        }

        fn is_mathml_element(&self) -> bool {
            trace_dom!("TElement::is_mathml_element {:?}", self);
            self.element_data().name.ns == ns!(mathml)
        }

        fn is_svg_element(&self) -> bool {
            trace_dom!("TElement::is_svg_element {:?}", self);
            self.element_data().name.ns == ns!(svg)
        }

        fn style_attribute(&self) -> Option<ArcBorrow<'_, Locked<PropertyDeclarationBlock>>> {
            trace_dom!("TElement::style_attribute {:?}", self);
            None
        }

        fn animation_rule(
            &self,
            _context: &SharedStyleContext,
        ) -> Option<Arc<Locked<PropertyDeclarationBlock>>> {
            trace_dom!("TElement::animation_rule {:?}", self);
            None
        }

        fn transition_rule(
            &self,
            _context: &SharedStyleContext,
        ) -> Option<Arc<Locked<PropertyDeclarationBlock>>> {
            trace_dom!("TElement::transition_rule {:?}", self);
            None
        }

        fn state(&self) -> ElementState {
            trace_dom!("TElement::state {:?}", self);
            ElementState::empty()
        }

        fn has_part_attr(&self) -> bool {
            trace_dom!("TElement::has_part_attr {:?}", self);
            false
        }

        fn exports_any_part(&self) -> bool {
            trace_dom!("TElement::exports_any_part {:?}", self);
            false
        }

        fn id(&self) -> Option<&WeakAtom> {
            trace_dom!("TElement::id {:?}", self);
            self.element_data().id_attr.as_ref()
        }

        fn each_class<F>(&self, mut callback: F)
        where
            F: FnMut(&AtomIdent),
        {
            trace_dom!("TElement::each_class {:?}", self);
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
            trace_dom!("TElement::each_attr_name {:?}", self);
            for attr_name in &self.element_data().attr_local_names {
                callback(attr_name);
            }
        }

        fn has_dirty_descendants(&self) -> bool {
            trace_dom!("TElement::has_dirty_descendants {:?}", self);
            false
        }

        fn has_snapshot(&self) -> bool {
            trace_dom!("TElement::has_snapshot {:?}", self);
            false
        }

        fn handled_snapshot(&self) -> bool {
            trace_dom!("TElement::handled_snapshot {:?}", self);
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
            trace_dom!("TElement::ensure_data {:?}", self);
            let slot = self.data_slot();
            let mut cell = slot.borrow_mut();
            if cell.is_none() {
                *cell = Some(ElementData::default());
            }
            AtomicRefMut::map(cell, |opt| opt.as_mut().unwrap())
        }

        unsafe fn clear_data(&self) {
            trace_dom!("TElement::clear_data {:?}", self);
            let slot = self.data_slot();
            *slot.borrow_mut() = None;
        }

        fn has_data(&self) -> bool {
            trace_dom!("TElement::has_data {:?}", self);
            self.data_slot().borrow().is_some()
        }

        fn borrow_data(&self) -> Option<AtomicRef<'_, style::data::ElementData>> {
            trace_dom!("TElement::borrow_data {:?}", self);
            let slot = self.data_slot();
            let cell = slot.borrow();
            if cell.is_some() {
                Some(AtomicRef::map(cell, |opt| opt.as_ref().unwrap()))
            } else {
                None
            }
        }

        fn mutate_data(&self) -> Option<AtomicRefMut<'_, style::data::ElementData>> {
            trace_dom!("TElement::mutate_data {:?}", self);
            let slot = self.data_slot();
            let cell = slot.borrow_mut();
            if cell.is_some() {
                Some(AtomicRefMut::map(cell, |opt| opt.as_mut().unwrap()))
            } else {
                None
            }
        }

        fn skip_item_display_fixup(&self) -> bool {
            trace_dom!("TElement::skip_item_display_fixup {:?}", self);
            false
        }

        fn may_have_animations(&self) -> bool {
            trace_dom!("TElement::may_have_animations {:?}", self);
            false
        }

        fn has_animations(&self, _context: &SharedStyleContext) -> bool {
            trace_dom!("TElement::has_animations {:?}", self);
            false
        }

        fn has_css_animations(
            &self,
            _context: &SharedStyleContext,
            _pseudo_element: Option<PseudoElement>,
        ) -> bool {
            trace_dom!("TElement::has_css_animations {:?}", self);
            false
        }

        fn has_css_transitions(
            &self,
            _context: &SharedStyleContext,
            _pseudo_element: Option<PseudoElement>,
        ) -> bool {
            trace_dom!("TElement::has_css_transitions {:?}", self);
            false
        }

        fn shadow_root(&self) -> Option<<Self::ConcreteNode as TNode>::ConcreteShadowRoot> {
            trace_dom!("TElement::shadow_root {:?}", self);
            None
        }

        fn containing_shadow(&self) -> Option<<Self::ConcreteNode as TNode>::ConcreteShadowRoot> {
            trace_dom!("TElement::containing_shadow {:?}", self);
            None
        }

        fn lang_attr(&self) -> Option<SelectorAttrValue> {
            trace_dom!("TElement::lang_attr {:?}", self);
            self.lang_attribute_value().map(SelectorAttrValue::from)
        }

        fn match_element_lang(
            &self,
            _override_lang: Option<Option<SelectorAttrValue>>,
            _value: &Lang,
        ) -> bool {
            trace_dom!("TElement::match_element_lang {:?}", self);
            false
        }

        fn is_html_document_body_element(&self) -> bool {
            trace_dom!("TElement::is_html_document_body_element {:?}", self);
            false
        }

        fn synthesize_presentational_hints_for_legacy_attributes<V>(
            &self,
            _visited_handling: VisitedHandlingMode,
            _hints: &mut V,
        ) where
            V: Push<ApplicableDeclarationBlock>,
        {
            trace_dom!("TElement::synthesize_presentational_hints {:?}", self);
        }

        fn synthesize_view_transition_dynamic_rules<V>(&self, _rules: &mut V)
        where
            V: Push<ApplicableDeclarationBlock>,
        {
            trace_dom!("TElement::synthesize_view_transition_rules {:?}", self);
        }

        fn local_name(&self) -> &<Impl as SelectorsParser>::BorrowedLocalName {
            self.element_data().style_local_name.borrow()
        }

        fn namespace(&self) -> &<Impl as SelectorsParser>::BorrowedNamespaceUrl {
            self.element_data().style_namespace.borrow()
        }

        fn query_container_size(&self, _display: &Display) -> Size2D<Option<Au>> {
            trace_dom!("TElement::query_container_size {:?}", self);
            Size2D::new(None, None)
        }

        fn has_selector_flags(&self, _flags: ElementSelectorFlags) -> bool {
            trace_dom!("TElement::has_selector_flags {:?}", self);
            false
        }

        fn relative_selector_search_direction(&self) -> ElementSelectorFlags {
            trace_dom!("TElement::relative_selector_search_direction {:?}", self);
            ElementSelectorFlags::empty()
        }
    }

    impl ::selectors::Element for HtmlElement {
        type Impl = Impl;

        fn opaque(&self) -> OpaqueElement {
            trace_dom!("selectors::Element::opaque {:?}", self);
            OpaqueElement::new(dom().node(self.0))
        }

        fn parent_element(&self) -> Option<Self> {
            trace_dom!("selectors::Element::parent_element {:?}", self);
            self.as_node().parent_node()?.to_element()
        }

        fn parent_node_is_shadow_root(&self) -> bool {
            trace_dom!("selectors::Element::parent_node_is_shadow_root {:?}", self);
            false
        }

        fn containing_shadow_host(&self) -> Option<Self> {
            trace_dom!("selectors::Element::containing_shadow_host {:?}", self);
            None
        }

        fn is_pseudo_element(&self) -> bool {
            trace_dom!("selectors::Element::is_pseudo_element {:?}", self);
            false
        }

        fn pseudo_element_originating_element(&self) -> Option<Self> {
            trace_dom!(
                "selectors::Element::pseudo_element_originating_element {:?}",
                self
            );
            None
        }

        fn prev_sibling_element(&self) -> Option<Self> {
            trace_dom!("selectors::Element::prev_sibling_element {:?}", self);
            self.as_node().prev_element_sibling()
        }

        fn next_sibling_element(&self) -> Option<Self> {
            trace_dom!("selectors::Element::next_sibling_element {:?}", self);
            self.as_node().next_element_sibling()
        }

        fn first_element_child(&self) -> Option<Self> {
            trace_dom!("selectors::Element::first_element_child {:?}", self);
            self.as_node().first_element_child()
        }

        fn has_local_name(&self, _name: &<Impl as SelectorsParser>::BorrowedLocalName) -> bool {
            trace_dom!("selectors::Element::has_local_name {:?}", self);
            self.element_data().name.local.as_ref() == _name.as_ref()
        }

        fn has_namespace(&self, _ns: &<Impl as SelectorsParser>::BorrowedNamespaceUrl) -> bool {
            trace_dom!("selectors::Element::has_namespace {:?}", self);
            self.element_data().name.ns.as_ref() == _ns.as_ref()
        }

        fn is_same_type(&self, other: &Self) -> bool {
            trace_dom!("selectors::Element::is_same_type {:?} {:?}", self, other);
            self.element_data().name == other.element_data().name
        }

        fn attr_matches(
            &self,
            ns: &NamespaceConstraint<&<Impl as SelectorsParser>::NamespaceUrl>,
            local_name: &<Impl as SelectorsParser>::LocalName,
            operation: &AttrSelectorOperation<&<Impl as SelectorsParser>::AttrValue>,
        ) -> bool {
            trace_dom!("selectors::Element::attr_matches {:?}", self);
            self.attr_matches_impl(ns, local_name, operation)
        }

        fn match_non_ts_pseudo_class(
            &self,
            _pc: &<Impl as SelectorsParser>::NonTSPseudoClass,
            _context: &mut MatchingContext<Self::Impl>,
        ) -> bool {
            trace_dom!("selectors::Element::match_non_ts_pseudo_class {:?}", self);
            false
        }

        fn match_pseudo_element(
            &self,
            _pe: &<Impl as SelectorsParser>::PseudoElement,
            _context: &mut MatchingContext<Self::Impl>,
        ) -> bool {
            trace_dom!("selectors::Element::match_pseudo_element {:?}", self);
            false
        }

        fn is_link(&self) -> bool {
            trace_dom!("selectors::Element::is_link {:?}", self);
            false
        }

        fn has_id(
            &self,
            id: &<Impl as SelectorsParser>::Identifier,
            case_sensitivity: CaseSensitivity,
        ) -> bool {
            trace_dom!("selectors::Element::has_id {:?}", self);
            let Some(current) = self.id_string() else {
                return false;
            };
            case_sensitivity.eq(current.as_bytes(), atom_ident_str(id).as_bytes())
        }

        fn is_part(&self, _name: &AtomIdent) -> bool {
            trace_dom!("selectors::Element::is_part {:?}", self);
            false
        }

        fn imported_part(
            &self,
            _name: &<Impl as SelectorsParser>::Identifier,
        ) -> Option<<Impl as SelectorsParser>::Identifier> {
            trace_dom!("selectors::Element::imported_part {:?}", self);
            None
        }

        fn has_class(
            &self,
            name: &<Impl as SelectorsParser>::Identifier,
            case_sensitivity: CaseSensitivity,
        ) -> bool {
            trace_dom!("selectors::Element::has_class {:?}", self);
            self.has_class_token(name, case_sensitivity)
        }

        fn is_html_element_in_html_document(&self) -> bool {
            trace_dom!(
                "selectors::Element::is_html_element_in_html_document {:?}",
                self
            );
            self.is_html_element()
        }

        fn is_html_slot_element(&self) -> bool {
            trace_dom!("selectors::Element::is_html_slot_element {:?}", self);
            false
        }

        fn is_empty(&self) -> bool {
            trace_dom!("selectors::Element::is_empty {:?}", self);
            self.as_node().first_child().is_none()
        }

        fn is_root(&self) -> bool {
            trace_dom!("selectors::Element::is_root {:?}", self);
            self.as_node().parent_node().is_none()
        }

        fn apply_selector_flags(&self, _flags: ElementSelectorFlags) {}

        fn add_element_unique_hashes(&self, _filter: &mut BloomFilter) -> bool {
            trace_dom!("selectors::Element::add_element_unique_hashes {:?}", self);
            false
        }

        fn has_custom_state(&self, _name: &<Impl as SelectorsParser>::Identifier) -> bool {
            trace_dom!("selectors::Element::has_custom_state {:?}", self);
            false
        }
    }

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
        atom.as_ref().as_ref()
    }

    fn sibling_pair(id: NodeId) -> (Option<HtmlNode>, Option<HtmlNode>) {
        trace_dom!("sibling_pair {:?}", id);
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
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    thread_state::initialize(ThreadState::LAYOUT);
    let (html, origin) = load_html_input()?;
    if let Some(path) = &origin {
        println!("> parsing HTML from {}", path.display());
        trace_dom!("main: parsing HTML from {}", path.display());
    } else {
        println!("> parsing built-in HTML sample");
        trace_dom!("main: using built-in HTML sample");
    }

    let demo_dom = DemoDom::parse_from_bytes(html.as_bytes())?;
    let element_count = demo_dom
        .document_children()
        .iter()
        .filter(|node_id| matches!(demo_dom.node(**node_id).data, DemoNodeData::Element(_)))
        .count();
    trace_dom!("main: top-level element count {}", element_count);

    let mut cascade_driver = cascade::CascadeDriver::new(&demo_dom);
    let document = bootstrap_dom(demo_dom);
    cascade_driver.flush(document);
    let styled_total = cascade_driver.style_document(document);
    if let Some(root) = document.root_element() {
        println!("root element tag = {}", root.local_name_string());
        trace_dom!("main: root element {:?}", root);
    } else {
        eprintln!("parsed document has no element children");
        trace_dom!("main: missing root element");
    }

    println!("top-level element count: {element_count}");
    println!("resolve_style() applied to {styled_total} elements");

    Ok(())
}

fn load_html_input() -> Result<(String, Option<PathBuf>), std::io::Error> {
    if let Some(path) = env::args().nth(1) {
        let buf = fs::read_to_string(&path)?;
        Ok((buf, Some(PathBuf::from(path))))
    } else {
        Ok((
            r#"
<!doctype html>
<html>
  <head>
    <style>
      body { font-family: sans-serif; }
      #demo { color: hotpink; }
    </style>
  </head>
  <body>
    <div id="demo" class="sample">Hello <strong>Stylo</strong></div>
  </body>
</html>
"#
            .trim()
            .to_string(),
            None,
        ))
    }
}
