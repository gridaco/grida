//! Version 3 named static slot projection producer contract.

use anchor_lab::grida_xml;
use anchor_lab::grida_xml_source::{
    self, BindingTargetKind, ErrorPhase, SourceProvider, SourceSnapshot, SourceVersion,
};
use anchor_lab::model::{AxisBinding, Document, NodeId, Paint};
use std::collections::BTreeMap;

fn snapshot(identity: &str, base: &str, source: &str) -> SourceSnapshot {
    SourceSnapshot::new(identity, base, source)
}

#[derive(Default)]
struct MemoryProvider {
    sources: BTreeMap<(String, String), SourceSnapshot>,
    requests: Vec<(String, String)>,
}

impl MemoryProvider {
    fn insert(&mut self, from: &str, location: &str, source: SourceSnapshot) {
        self.sources
            .insert((from.to_owned(), location.to_owned()), source);
    }
}

impl SourceProvider for MemoryProvider {
    fn resolve(
        &mut self,
        containing: &SourceSnapshot,
        location: &str,
    ) -> Result<SourceSnapshot, String> {
        self.requests
            .push((containing.identity().to_owned(), location.to_owned()));
        self.sources
            .get(&(containing.identity().to_owned(), location.to_owned()))
            .cloned()
            .ok_or_else(|| "not found".into())
    }
}

fn authored_scene(output: &grida_xml_source::MaterializedProgram) -> NodeId {
    output.document.get(output.document.root).children[0]
}

fn solid_color(document: &Document, node: NodeId) -> u32 {
    let Paint::Solid(solid) = &document.get(node).fills[0] else {
        panic!("expected a solid fill")
    };
    solid.color.0
}

#[test]
fn version3_alone_accepts_unique_named_empty_slots_in_component_render_positions() {
    let source = r##"
<grida version="3">
  <component id="card" width="40" height="30">
    <container name="media-frame"><slot name="media"/></container>
  </component>
  <container/>
</grida>
"##;
    let unit = grida_xml_source::parse_source(snapshot("entry", "memory:/", source)).unwrap();
    assert_eq!(unit.version(), SourceVersion::Version3);
    assert_eq!(unit.component_ids().collect::<Vec<_>>(), ["card"]);

    for version in ["0", "1", "2"] {
        let source = format!(
            r##"<grida version="{version}"><container><slot name="media"/></container></grida>"##
        );
        let error =
            grida_xml_source::parse_source(snapshot("old", "memory:/", &source)).unwrap_err();
        assert_eq!(error.phase, ErrorPhase::Parse, "{error}");
    }

    let outside = r##"<grida version="3"><container><slot name="media"/></container></grida>"##;
    let error =
        grida_xml_source::parse_source(snapshot("outside", "memory:/", outside)).unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Parse);
    assert!(error.message.contains("only in a Version 3 component"));

    let leaf = r##"<grida version="3"><component id="x"><text><slot name="media"/></text></component></grida>"##;
    let error = grida_xml_source::parse_source(snapshot("leaf", "memory:/", leaf)).unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Parse);
    assert!(error.message.contains("not valid inside <text>"));
}

#[test]
fn malformed_duplicate_and_misplaced_slot_syntax_has_focused_parse_diagnostics() {
    let cases = [
        (
            r##"<grida version="3"><component id="x"><slot/></component></grida>"##,
            "requires exactly `name`",
        ),
        (
            r##"<grida version="3"><component id="x"><slot name="Bad"/></component></grida>"##,
            "lowercase kebab-case",
        ),
        (
            r##"<grida version="3"><component id="x"><slot name="body" extra="x"/></component></grida>"##,
            "requires exactly `name`",
        ),
        (
            r##"<grida version="3"><component id="x"><slot name="body">text</slot></component></grida>"##,
            "must be empty",
        ),
        (
            r##"<grida version="3"><component id="x"><slot name="body"/><container><slot name="body"/></container></component></grida>"##,
            "duplicate slot `body`",
        ),
        (
            r##"<grida version="3"><component id="x"/><container><rect slot="body"/></container></grida>"##,
            "valid only on a direct Version 3 <use>",
        ),
        (
            r##"<grida version="3"><component id="x"><slot name="body"/></component><container><use href="#x"><rect/></use></container></grida>"##,
            "requires `slot`",
        ),
        (
            r##"<grida version="3"><component id="x"><slot name="body"/></component><container><use href="#x"><fill slot="body"/></use></container></grida>"##,
            "must be direct render roots",
        ),
        (
            r##"<grida version="3"><component id="x"><prop name="label" type="string" default="x"/><text>{label}</text><slot name="body"/></component><container><use href="#x"><rect slot="body"/><arg name="label" value="late"/></use></container></grida>"##,
            "must precede every render assignment",
        ),
    ];

    for (source, expected) in cases {
        let error =
            grida_xml_source::parse_source(snapshot("bad", "memory:/", source)).unwrap_err();
        assert_eq!(error.phase, ErrorPhase::Parse, "{error}");
        assert!(error.message.contains(expected), "{error}");
    }
}

#[test]
fn slot_markers_start_render_content_for_property_ordering_regardless_of_projection() {
    let late_properties = [
        r##"<fill><solid color="#112233"/></fill>"##,
        r##"<stroke><solid color="#445566"/></stroke>"##,
    ];
    let assignments = ["", r##"<rect slot="body" width="4" height="4"/>"##];

    for late_property in late_properties {
        for assignment in assignments {
            let source = format!(
                r##"
<grida version="3">
  <component id="card" width="10" height="10">
    <slot name="body"/>
    {late_property}
  </component>
  <container><use href="#card">{assignment}</use></container>
</grida>
"##
            );
            let error =
                grida_xml_source::parse_source(snapshot("late", "memory:/", &source)).unwrap_err();
            assert_eq!(error.phase, ErrorPhase::Parse, "{error}");
            assert!(
                error
                    .message
                    .contains("must appear before content or scene children"),
                "{error}"
            );
        }
    }
}

#[test]
fn leading_paint_properties_remain_valid_before_slots_for_empty_and_populated_uses() {
    let source = r##"
<grida version="3">
  <component id="card" width="10" height="10">
    <fill><solid color="#112233"/></fill>
    <stroke><solid color="#445566"/></stroke>
    <slot name="body"/>
  </component>
  <container width="30" height="10">
    <use href="#card"/>
    <use href="#card" x="20">
      <rect slot="body" width="4" height="4"/>
    </use>
  </container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output =
        grida_xml_source::materialize(snapshot("ordered", "memory:/", source), &mut provider)
            .unwrap();
    let instances = &output.document.get(authored_scene(&output)).children;
    assert_eq!(instances.len(), 2);
    assert!(output.document.get(instances[0]).children.is_empty());
    assert_eq!(output.document.get(instances[1]).children.len(), 1);
}

#[test]
fn zero_one_and_many_assignments_project_at_the_marker_in_caller_order() {
    let source = r##"
<grida version="3">
  <component id="card" width="40" height="30">
    <rect name="before" width="2" height="2"/>
    <container name="media-frame"><slot name="media"/></container>
    <rect name="after" width="3" height="3"/>
  </component>
  <container width="100" height="60">
    <use href="#card" name="empty"/>
    <use href="#card" name="filled" x="50">
      <ellipse slot="media" name="first" width="8" height="8"/>
      <rect slot="media" name="second" width="9" height="9"/>
    </use>
  </container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/", source), &mut provider)
            .unwrap();
    let scene = authored_scene(&output);
    let cards = &output.document.get(scene).children;
    assert_eq!(cards.len(), 2);
    for &card in cards {
        assert_eq!(output.document.get(card).children.len(), 3);
    }
    let empty_frame = output.document.get(cards[0]).children[1];
    let filled_frame = output.document.get(cards[1]).children[1];
    assert!(output.document.get(empty_frame).children.is_empty());
    let assigned = &output.document.get(filled_frame).children;
    assert_eq!(assigned.len(), 2);
    assert_eq!(
        output.document.get(assigned[0]).header.name.as_deref(),
        Some("first")
    );
    assert_eq!(
        output.document.get(assigned[1]).header.name.as_deref(),
        Some("second")
    );

    let printed = grida_xml::print(&output.document).unwrap();
    assert!(!printed.contains("<slot"));
    assert!(!printed.contains(" slot="));

    assert_eq!(output.slot_projections.len(), 2);
    let empty = &output.slot_projections[0];
    let filled = &output.slot_projections[1];
    assert_eq!(empty.definition.name, "media");
    assert_eq!(empty.definition.component.id, "card");
    assert_eq!(
        empty.use_chain.last().unwrap().name.as_deref(),
        Some("empty")
    );
    assert!(empty.assignments.is_empty());
    assert_eq!(
        filled.use_chain.last().unwrap().name.as_deref(),
        Some("filled")
    );
    assert_eq!(
        filled
            .assignments
            .iter()
            .map(|assignment| assignment.node)
            .collect::<Vec<_>>()
            .as_slice(),
        assigned.as_slice()
    );
    assert!(filled
        .assignments
        .iter()
        .all(|assignment| assignment.site.source == "entry"
            && assignment.site.component.is_none()
            && assignment.site.name == "media"));
    assert_eq!(output.provenance[&assigned[0]].source, "entry");
    assert_eq!(output.provenance[&assigned[0]].use_chain.len(), 1);
}

#[test]
fn assignment_root_span_bindings_keep_their_size_evidence() {
    let source = r##"
<grida version="3">
  <component id="surface" width="100" height="20"><slot name="body"/></component>
  <container width="100" height="20">
    <use href="#surface">
      <rect slot="body" x="span 0 0" y="span 0 0" fill="#112233"/>
      <line slot="body" x="span 0 0" y="10"><stroke width="1"><solid color="#FFFFFF"/></stroke></line>
    </use>
  </container>
</grida>
"##;
    let output = grida_xml_source::materialize(
        snapshot("entry", "memory:/", source),
        &mut MemoryProvider::default(),
    )
    .expect("span bindings supply projected primitive extents");
    let scene = authored_scene(&output);
    let instance = output.document.get(scene).children[0];
    let [rect, line] = output.document.get(instance).children.as_slice() else {
        panic!("expected projected rect and line")
    };
    assert_eq!(
        output.document.get(*rect).header.x,
        AxisBinding::Span {
            start: 0.0,
            end: 0.0
        }
    );
    assert_eq!(
        output.document.get(*rect).header.y,
        AxisBinding::Span {
            start: 0.0,
            end: 0.0
        }
    );
    assert!(matches!(
        output.document.get(*line).header.x,
        AxisBinding::Span { .. }
    ));
}

#[test]
fn unknown_assignments_are_link_errors_and_only_version3_targets_receive_them() {
    let unknown = r##"
<grida version="3">
  <component id="card"><slot name="body"/></component>
  <container><use href="#card"><rect slot="missing" width="1" height="1"/></use></container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let error =
        grida_xml_source::materialize(snapshot("entry", "memory:/", unknown), &mut provider)
            .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Link);
    assert!(error.message.contains("unknown slot assignment `missing`"));
    assert!(error.message.contains("available: body"));

    let entry = r##"<grida version="3"><container><use href="./v2.grida.xml#card"><rect slot="body" width="1" height="1"/></use></container></grida>"##;
    let v2 = r##"<grida version="2"><component id="card"/></grida>"##;
    let mut provider = MemoryProvider::default();
    provider.insert("entry", "./v2.grida.xml", snapshot("v2", "memory:/v2/", v2));
    let error =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", entry), &mut provider)
            .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Link);
    assert!(error.message.contains("require a Version 3 target"));
}

#[test]
fn assigned_roots_observe_the_linked_slot_parents_relationship_rules() {
    let source = r##"
<grida version="3">
  <component id="row" layout="flex" direction="row"><slot name="item"/></component>
  <container>
    <use href="#row"><rect slot="item" width="10" height="10" flow="in" x="5"/></use>
  </container>
</grida>
"##;
    grida_xml_source::parse_source(snapshot("entry", "memory:/", source))
        .expect("the assignment root has no parent relationship until linking");
    let mut provider = MemoryProvider::default();
    let error = grida_xml_source::materialize(snapshot("entry", "memory:/", source), &mut provider)
        .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Projection);
    assert!(error
        .message
        .contains("x/y are not valid on in-flow <rect>"));
    assert_eq!(error.source, "entry");
    assert_eq!(
        error.component, None,
        "the assigned root is caller-authored"
    );
    assert_eq!(error.use_chain.len(), 1);
    assert_eq!(error.use_chain[0].target.id, "row");
    let projection = error
        .slot_projection
        .as_ref()
        .expect("projected relationship error retains both authored sites");
    assert_eq!(projection.definition.source, "entry");
    assert_eq!(projection.definition.component.id, "row");
    assert_eq!(projection.definition.name, "item");
    assert!(projection.definition.span.end > projection.definition.span.start);
    assert_eq!(projection.receiving_use.target.id, "row");
    assert_eq!(projection.receiving_use, error.use_chain[0]);
    assert_eq!(projection.assignment.source, "entry");
    assert_eq!(projection.assignment.component, None);
    assert_eq!(projection.assignment.name, "item");
    assert!(projection.assignment.span.end > projection.assignment.span.start);
}

#[test]
fn caller_scalar_errors_inside_slots_keep_caller_and_projection_ownership() {
    let source = r##"
<grida version="3">
  <component id="shell" width="10" height="10"><slot name="body"/></component>
  <component id="outer" width="10" height="10">
    <prop name="alpha" type="number"/>
    <prop name="smooth" type="number"/>
    <use href="#shell" name="inner-shell">
      <rect slot="body" width="10" height="10" opacity="{alpha}" corner-radius="2" corner-smoothing="{smooth}" fill="#112233"/>
    </use>
  </component>
  <container width="10" height="10">
    <use href="#outer" name="outer-instance"><arg name="alpha" value="2"/><arg name="smooth" value="0"/></use>
  </container>
</grida>
"##;
    let error = grida_xml_source::materialize(
        snapshot("entry", "memory:/", source),
        &mut MemoryProvider::default(),
    )
    .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Specialize);
    assert_eq!(error.source, "entry");
    assert_eq!(error.component.as_deref(), Some("outer"));
    assert!(error.message.contains("opacity must be between 0 and 1"));
    assert_eq!(error.specialization_sites.len(), 2);
    let specialization = error
        .specialization_sites
        .iter()
        .find(|site| site.prop == "alpha")
        .expect("the failing opacity binding remains among the candidates");
    assert_eq!(specialization.prop, "alpha");
    assert_eq!(specialization.ultimate_origin.authored, "2");
    assert_eq!(specialization.binding.element, "rect");
    assert_eq!(
        specialization.binding.kind,
        BindingTargetKind::Attribute {
            name: "opacity".into()
        }
    );
    assert!(error.specialization_sites.iter().any(|site| {
        site.prop == "smooth"
            && site.binding.kind
                == BindingTargetKind::Attribute {
                    name: "corner-smoothing".into(),
                }
    }));
    let projection = error
        .slot_projection
        .as_ref()
        .expect("caller-owned scalar failure retains the receiving slot edge");
    assert_eq!(projection.definition.component.id, "shell");
    assert_eq!(projection.definition.name, "body");
    assert_eq!(
        projection.receiving_use.name.as_deref(),
        Some("inner-shell")
    );
    assert_eq!(
        projection.assignment.component.as_ref().unwrap().id,
        "outer"
    );
}

#[test]
fn bound_flow_projection_errors_keep_the_causal_scalar_site() {
    let source = r##"
<grida version="3">
  <component id="row" width="10" height="10" layout="flex"><slot name="item"/></component>
  <component id="outer" width="10" height="10">
    <prop name="mode" type="enum" values="absolute in"/>
    <use href="#row" name="inner-row">
      <rect slot="item" x="1" width="4" height="4" flow="{mode}" fill="#112233"/>
    </use>
  </component>
  <container width="10" height="10">
    <use href="#outer" name="outer-instance"><arg name="mode" value="in"/></use>
  </container>
</grida>
"##;
    let error = grida_xml_source::materialize(
        snapshot("entry", "memory:/", source),
        &mut MemoryProvider::default(),
    )
    .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Projection);
    assert!(error.message.contains("x/y are not valid on in-flow"));
    assert_eq!(error.specialization_sites.len(), 1);
    let site = &error.specialization_sites[0];
    assert_eq!(site.prop, "mode");
    assert_eq!(
        site.binding.kind,
        BindingTargetKind::Attribute {
            name: "flow".into()
        }
    );
    let projection = error.slot_projection.as_ref().unwrap();
    assert_eq!(projection.definition.component.id, "row");
    assert_eq!(projection.definition.name, "item");
    assert_eq!(
        projection.assignment.component.as_ref().unwrap().id,
        "outer"
    );
}

#[test]
fn caller_authored_resources_keep_the_caller_base_across_files() {
    let entry = r##"
<grida version="3"><container><use href="./library.grida.xml#card">
  <rect slot="media" width="10" height="10"><fill><image src="./texture.png"/></fill></rect>
</use></container></grida>
"##;
    let library = r##"
<grida version="3"><component id="card">
  <rect width="10" height="10"><fill><image src="./texture.png"/></fill></rect>
  <slot name="media"/>
</component></grida>
"##;
    let mut provider = MemoryProvider::default();
    provider.insert(
        "entry",
        "./library.grida.xml",
        snapshot("library", "memory:/library/", library),
    );
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", entry), &mut provider)
            .unwrap();
    assert_eq!(output.resources.len(), 2);
    let definition_resource = output
        .resources
        .iter()
        .find(|resource| resource.source == "library")
        .unwrap();
    let assignment_resource = output
        .resources
        .iter()
        .find(|resource| resource.source == "entry")
        .unwrap();
    assert_eq!(definition_resource.base, "memory:/library/");
    assert_eq!(assignment_resource.base, "memory:/entry/");
    assert_eq!(definition_resource.authored, "./texture.png");
    assert_eq!(assignment_resource.authored, "./texture.png");
    assert_ne!(
        definition_resource.runtime_rid,
        assignment_resource.runtime_rid
    );
}

#[test]
fn assigned_content_uses_the_caller_prop_environment_not_the_callees_same_name() {
    let source = r##"
<grida version="3">
  <component id="shell" fill="{tone}">
    <prop name="tone" type="color"/>
    <slot name="body"/>
  </component>
  <component id="wrapper">
    <prop name="tone" type="color"/>
    <use href="#shell">
      <arg name="tone" value="#111111"/>
      <rect slot="body" width="10" height="10" fill="{tone}"/>
    </use>
  </component>
  <container><use href="#wrapper"><arg name="tone" value="#22cc44"/></use></container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/", source), &mut provider)
            .unwrap();
    let wrapper = output.document.get(authored_scene(&output)).children[0];
    let shell = output.document.get(wrapper).children[0];
    let assigned = output.document.get(shell).children[0];
    assert_eq!(solid_color(&output.document, shell), 0xFF11_1111);
    assert_eq!(solid_color(&output.document, assigned), 0xFF22_CC44);

    let wrapper_specialization = output
        .specializations
        .iter()
        .find(|specialization| specialization.component.id == "wrapper")
        .unwrap();
    let tone = wrapper_specialization
        .props
        .iter()
        .find(|prop| prop.name == "tone")
        .unwrap();
    assert_eq!(tone.materialized_occurrences.len(), 1);
    assert_eq!(tone.materialized_occurrences[0].node, assigned);
    assert_eq!(
        output.provenance[&assigned].component.as_ref().unwrap().id,
        "wrapper"
    );
}

#[test]
fn nested_uses_in_assignments_resolve_from_the_callers_source() {
    let entry = r##"
<grida version="3"><container><use href="./shell.grida.xml#shell">
  <use slot="body" href="./parts.grida.xml#badge"/>
</use></container></grida>
"##;
    let shell =
        r##"<grida version="3"><component id="shell"><slot name="body"/></component></grida>"##;
    let parts = r##"<grida version="1"><component id="badge" width="8" height="8"/></grida>"##;
    let mut provider = MemoryProvider::default();
    provider.insert(
        "entry",
        "./shell.grida.xml",
        snapshot("shell", "memory:/shell/", shell),
    );
    provider.insert(
        "entry",
        "./parts.grida.xml",
        snapshot("parts", "memory:/parts/", parts),
    );
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", entry), &mut provider)
            .unwrap();
    assert_eq!(
        provider.requests,
        [
            ("entry".into(), "./shell.grida.xml".into()),
            ("entry".into(), "./parts.grida.xml".into()),
        ]
    );
    let shell_node = output.document.get(authored_scene(&output)).children[0];
    let badge = output.document.get(shell_node).children[0];
    assert_eq!(output.provenance[&badge].source, "parts");
    assert_eq!(output.provenance[&badge].use_chain.len(), 2);
    assert_eq!(output.slot_projections[0].assignments[0].node, badge);
}

#[test]
fn slots_nested_in_caller_assignment_trees_keep_the_callers_slot_instance() {
    let source = r##"
<grida version="3">
  <component id="inner"><slot name="inner-body"/></component>
  <component id="outer">
    <use href="#inner">
      <container slot="inner-body"><slot name="outer-body"/></container>
    </use>
  </component>
  <container><use href="#outer">
    <rect slot="outer-body" name="leaf" width="5" height="6"/>
  </use></container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/", source), &mut provider)
            .unwrap();
    let outer = output.document.get(authored_scene(&output)).children[0];
    let inner = output.document.get(outer).children[0];
    let assignment_container = output.document.get(inner).children[0];
    let leaf = output.document.get(assignment_container).children[0];
    assert_eq!(
        output.document.get(leaf).header.name.as_deref(),
        Some("leaf")
    );

    assert_eq!(output.slot_projections.len(), 2);
    let inner_projection = output
        .slot_projections
        .iter()
        .find(|projection| projection.definition.name == "inner-body")
        .unwrap();
    let outer_projection = output
        .slot_projections
        .iter()
        .find(|projection| projection.definition.name == "outer-body")
        .unwrap();
    assert_eq!(inner_projection.assignments[0].node, assignment_container);
    assert_eq!(outer_projection.assignments[0].node, leaf);
    assert_eq!(outer_projection.definition.component.id, "outer");
    assert_eq!(outer_projection.use_chain.len(), 1);
    assert_eq!(outer_projection.use_chain[0].target.id, "outer");
}

#[test]
fn nested_projection_errors_identify_the_exact_receiving_use() {
    let source = r##"
<grida version="3">
  <component id="inner">
    <slot name="inner-body"/>
  </component>
  <component id="outer">
    <use href="#inner" name="inner-instance">
      <container slot="inner-body" name="bridge">
        <slot name="outer-body"/>
      </container>
    </use>
  </component>
  <container>
    <use href="#outer" name="outer-instance">
      <rect slot="outer-body" width="4" height="4" grow="1"/>
    </use>
  </container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let error =
        grida_xml_source::materialize(snapshot("nested", "memory:/", source), &mut provider)
            .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Projection);
    assert!(error.message.contains("grow/align on <rect>"), "{error}");
    assert_eq!(error.use_chain.len(), 2);
    assert_eq!(error.use_chain[0].name.as_deref(), Some("outer-instance"));
    assert_eq!(error.use_chain[1].name.as_deref(), Some("inner-instance"));

    let projection = error
        .slot_projection
        .as_ref()
        .expect("nested projected failure retains its precise projection edge");
    assert_eq!(projection.definition.component.id, "outer");
    assert_eq!(projection.definition.name, "outer-body");
    assert_eq!(projection.receiving_use.target.id, "outer");
    assert_eq!(
        projection.receiving_use.name.as_deref(),
        Some("outer-instance")
    );
    assert_eq!(projection.receiving_use, error.use_chain[0]);
    assert_ne!(projection.receiving_use, *error.use_chain.last().unwrap());
    assert_eq!(projection.assignment.component, None);
}

#[test]
fn projected_content_drops_only_the_current_callee_from_cycle_detection() {
    let finite = r##"
<grida version="3">
  <component id="card"><slot name="body"/></component>
  <container><use href="#card"><use slot="body" href="#card"/></use></container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output =
        grida_xml_source::materialize(snapshot("finite", "memory:/", finite), &mut provider)
            .expect("a caller-owned nested use of the current callee is a finite second instance");
    let outer = output.document.get(authored_scene(&output)).children[0];
    let inner = output.document.get(outer).children[0];
    assert!(output.document.get(inner).children.is_empty());
    assert_eq!(output.slot_projections.len(), 2);
    assert_eq!(output.slot_projections[0].assignments[0].node, inner);
    assert!(output.slot_projections[1].assignments.is_empty());

    let cycle = r##"
<grida version="3">
  <component id="card"><slot name="body"/></component>
  <component id="outer">
    <use href="#card"><use slot="body" href="#outer"/></use>
  </component>
  <container><use href="#outer"/></container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let error = grida_xml_source::materialize(snapshot("cycle", "memory:/", cycle), &mut provider)
        .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Link);
    assert!(
        error.message.contains("cycle#outer -> cycle#outer"),
        "{error}"
    );
    assert_eq!(error.use_chain.len(), 3);
    assert_eq!(error.use_chain[0].target.id, "outer");
    assert_eq!(error.use_chain[1].target.id, "card");
    assert_eq!(error.use_chain[2].target.id, "outer");
    let projection = error
        .slot_projection
        .as_ref()
        .expect("projected cycle retains the edge that closes it");
    assert_eq!(projection.definition.source, "cycle");
    assert_eq!(projection.definition.component.id, "card");
    assert_eq!(projection.definition.name, "body");
    assert!(projection.definition.span.end > projection.definition.span.start);
    assert_eq!(projection.receiving_use.target.id, "card");
    assert_eq!(projection.receiving_use, error.use_chain[1]);
    assert_eq!(projection.assignment.source, "cycle");
    assert_eq!(
        projection.assignment.component.as_ref().unwrap().id,
        "outer"
    );
    assert_eq!(projection.assignment.name, "body");
    assert!(projection.assignment.span.end > projection.assignment.span.start);
}

#[test]
fn version3_links_versions_one_two_and_three_without_backporting_version3() {
    let entry = r##"
<grida version="3"><container>
  <use href="./v1.grida.xml#static"/>
  <use href="./v2.grida.xml#scalar"><arg name="label" value="V2"/></use>
  <use href="./v3.grida.xml#slotted"><rect slot="body" width="4" height="4"/></use>
</container></grida>
"##;
    let v1 = r##"<grida version="1"><component id="static" width="10" height="10"/></grida>"##;
    let v2 = r##"<grida version="2"><component id="scalar" name="{label}"><prop name="label" type="string"/></component></grida>"##;
    let v3 =
        r##"<grida version="3"><component id="slotted"><slot name="body"/></component></grida>"##;
    let mut provider = MemoryProvider::default();
    provider.insert("entry", "./v1.grida.xml", snapshot("v1", "memory:/v1/", v1));
    provider.insert("entry", "./v2.grida.xml", snapshot("v2", "memory:/v2/", v2));
    provider.insert("entry", "./v3.grida.xml", snapshot("v3", "memory:/v3/", v3));
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", entry), &mut provider)
            .unwrap();
    assert_eq!(
        output.document.get(authored_scene(&output)).children.len(),
        3
    );
    assert_eq!(output.slot_projections.len(), 1);
    assert_eq!(output.specializations.len(), 2);

    for old_version in ["1", "2"] {
        let old_entry = format!(
            r##"<grida version="{old_version}"><container><use href="./v3.grida.xml#slotted"/></container></grida>"##
        );
        let mut provider = MemoryProvider::default();
        provider.insert("old", "./v3.grida.xml", snapshot("v3", "memory:/v3/", v3));
        let error = grida_xml_source::materialize(
            snapshot("old", "memory:/old/", &old_entry),
            &mut provider,
        )
        .unwrap_err();
        assert_eq!(error.phase, ErrorPhase::Link);
        assert!(error.message.contains(&format!(
            "Version {old_version} source cannot link Version 3"
        )));
    }
}
